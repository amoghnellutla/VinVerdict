/**
 * "Is the price fair?" Pure and browser-safe, so seller-checklist answers
 * (e.g. "yes, it had an accident") update the value instantly.
 *
 * Three independent estimates, each shown with its source:
 *   1. MarketCheck Price: a model trained on recently *sold* dealer cars,
 *      for this VIN, miles and ZIP. Doesn't know accident history.
 *   2. Recently sold nearby: comps from the last 90 days, read at this car's miles.
 *   3. For sale now nearby: asking prices, lowered by the usual asking-to-selling gap.
 * Their weighted middle is the dealer-retail value for a clean car; then the
 * car's own history and the seller type adjust it.
 *
 * Research behind the numbers (PLAN.md §5, sources linked in the UI):
 *   - Used cars sell ~4–11% under first asking price; popular models ~7%.
 *   - Private sellers price ~10–20% below dealers.
 *   - A past accident lowers value about 3–12% (CarGurus study, 2012; it
 *     varies by model and the study doesn't split by severity). So damage is
 *     priced as that range, not one number, and severe (structural/airbag)
 *     damage isn't priced at all: only an in-person appraisal can.
 */

import type { Damage } from "@/lib/history-report";
import type { AccidentStatus, SellerType, TitleStatus, Usage } from "@/lib/listing/parse";
import { estimateFromComps, type Comp, type CompEstimate, type CompTarget } from "./comps";

export type DealLabel = "great" | "good" | "fair" | "high" | "over";

export const DEAL_TEXT: Record<DealLabel, string> = {
  great: "Great deal",
  good: "Good deal",
  fair: "Fair price",
  high: "Priced high",
  over: "Overpriced",
};

/** Raw data from the price check (server), before this car's history is applied. */
export type PriceSources = {
  /** MarketCheck Price for this VIN/miles/ZIP (dealer retail, clean history). */
  predicted: number | null;
  sold: CompEstimate | null;
  active: CompEstimate | null;
  zip: string;
  /** Median days similar cars took to sell nearby (from the sold comps). */
  marketDays?: number | null;
  /** The comps themselves and what they were read at, so the page can re-price instantly. */
  comps?: { sold: Comp[]; active: Comp[]; target: CompTarget };
};

export type ValueInput = {
  price: number | null;
  miles: number | null;
  sellerType: SellerType;
  accident: AccidentStatus;
  titleStatus: TitleStatus;
  usage: Usage;
  /** Days the listing has been up, if known (live listing / MarketCheck). */
  daysOnMarket?: number | null;
  /** Very high miles for its age (from the scam rules). */
  highMiles?: boolean;
  /** The seller already lowered the price (listing history). */
  priceCut?: { from: number; to: number } | null;
  /** Damage level from the history report; "unknown" falls back to `accident`. */
  damage?: Damage;
};

export type ValueSource = { name: string; value: number; note: string };
export type Adjustment = { label: string; pct: number };

export type Valuation = {
  /** Most likely fair price for this car, from this kind of seller. */
  fair: number;
  low: number;
  high: number;
  sources: ValueSource[];
  adjustments: Adjustment[];
  /** (fair − price) ÷ fair. 0.1 = 10% under fair. null without a price. */
  pctUnder: number | null;
  label: DealLabel | null;
  offer: { open: number; max: number; reasons: string[] } | null;
  confidence: "high" | "medium" | "low";
  confidenceWhy: string;
  /** Priced as if it had no accidents, because its history isn't known. */
  assumesClean: boolean;
  /** Set when the car can't be priced honestly from listing data (severe damage). */
  unpriced: string | null;
};

// Asking-to-selling gaps. Sold comps and MarketCheck Price are already final
// listed prices, so only a little haggle comes off; live asking prices more.
const SOLD_HAGGLE = 0.02;
export const ASKING_GAP = 0.06;
// Accident: the CarGurus range (3–12% less), its middle as the most likely value.
const ACCIDENT_LOW = -0.12;
const ACCIDENT_HIGH = -0.03;
const ACCIDENT = (ACCIDENT_LOW + ACCIDENT_HIGH) / 2;
const BRANDED = -0.35;
const PRIVATE = -0.12;
const FLEET = -0.05;

const round100 = (n: number) => Math.round(n / 100) * 100;

export function dealLabel(pctUnder: number): DealLabel {
  if (pctUnder >= 0.15) return "great";
  if (pctUnder >= 0.07) return "good";
  if (pctUnder >= -0.05) return "fair";
  if (pctUnder >= -0.12) return "high";
  return "over";
}

export function valueCar(src: PriceSources, car: ValueInput): Valuation | null {
  const sources: ValueSource[] = [];
  const weighted: { v: number; w: number }[] = [];

  if (src.predicted && src.predicted > 0) {
    const v = src.predicted * (1 - SOLD_HAGGLE);
    sources.push({ name: "Sold-price model (MarketCheck)", value: Math.round(v), note: "Trained on dealer cars that sold in the last 3 months, for this VIN, miles and ZIP" });
    weighted.push({ v, w: 0.4 });
  }
  if (src.sold) {
    const v = src.sold.value * (1 - SOLD_HAGGLE);
    sources.push({ name: `Recently sold near ${src.zip}`, value: Math.round(v), note: `${src.sold.n} similar cars sold in the last 90 days, read at this car's miles${src.sold.extrapolated ? " (few sold with miles like this one)" : ""}` });
    weighted.push({ v, w: 0.4 * Math.min(1, src.sold.n / 15) * (src.sold.extrapolated ? 0.6 : 1) });
  }
  if (src.active) {
    const v = src.active.value * (1 - ASKING_GAP);
    sources.push({ name: `For sale now near ${src.zip}`, value: Math.round(v), note: `${src.active.n} similar cars listed now, minus the usual ${Math.round(ASKING_GAP * 100)}% between asking and selling price` });
    weighted.push({ v, w: 0.2 * Math.min(1, src.active.n / 10) * (src.active.extrapolated ? 0.6 : 1) });
  }
  const totalW = weighted.reduce((s, x) => s + x.w, 0);
  if (!weighted.length || totalW <= 0) return null;
  const base = weighted.reduce((s, x) => s + x.v * x.w, 0) / totalW;

  // Range: how far the sources disagree, or the comps' own spread, at least ±5%, at most ±15%.
  const vals = weighted.map((x) => x.v);
  const disagree = vals.length > 1 ? (Math.max(...vals) - Math.min(...vals)) / 2 / base : 0;
  const spreads = [src.sold, src.active].filter((e): e is CompEstimate => !!e).map((e) => (e.high - e.low) / 2 / e.value);
  const half = Math.min(0.15, Math.max(0.05, disagree, spreads.length ? Math.min(...spreads) : 0));

  // This car's history and seller.
  const adjustments: Adjustment[] = [];
  const damage: Damage = car.damage && car.damage !== "unknown" ? car.damage : car.accident === "reported" ? "moderate" : car.accident === "none" ? "none" : "unknown";
  const severe = damage === "severe";
  const hurt = damage === "minor" || damage === "moderate";
  if (car.titleStatus !== "clean" && car.titleStatus !== "unknown") adjustments.push({ label: `${car.titleStatus[0].toUpperCase()}${car.titleStatus.slice(1)} title`, pct: BRANDED });
  if (hurt) adjustments.push({ label: `Reported ${damage === "minor" ? "minor " : ""}damage`, pct: ACCIDENT });
  if (car.usage === "rental" || car.usage === "fleet") adjustments.push({ label: car.usage === "rental" ? "Former rental" : "Former fleet car", pct: FLEET });
  if (car.sellerType === "private") adjustments.push({ label: "Private seller (no dealer markup)", pct: PRIVATE });
  const factor = adjustments.reduce((f, a) => f * (1 + a.pct), 1);
  // Damage widens the range to the whole 3–12% instead of pretending to know where in it this car sits.
  const lowF = hurt ? (factor / (1 + ACCIDENT)) * (1 + ACCIDENT_LOW) : factor;
  const highF = hurt ? (factor / (1 + ACCIDENT)) * (1 + ACCIDENT_HIGH) : factor;

  const fair = round100(base * factor);
  const low = round100(base * lowF * (1 - half));
  const high = round100(base * highF * (1 + half));
  const assumesClean = damage === "unknown" && (car.titleStatus === "unknown" || car.titleStatus === "clean");

  if (severe) {
    // No honest single number: show the clean-history value as a ceiling.
    return {
      fair, low, high, sources, adjustments, pctUnder: null, label: null, offer: null,
      confidence: "low", confidenceWhy: "severe damage can't be priced from listing data",
      assumesClean: false,
      unpriced: `Severe damage: worth less than ${fmt(round100(base * factor * (1 + ACCIDENT_LOW)))}, often far less. Accidents in general take 3–12% off; structural or airbag damage usually more, and only an in-person appraisal can say how much.`,
    };
  }

  const pctUnder = car.price ? (fair - car.price) / fair : null;
  const label = pctUnder === null ? null : dealLabel(pctUnder);

  // Confidence: agreement, number of comps, and whether the miles were a stretch.
  const soldN = src.sold?.n ?? 0;
  const stretch = !!(src.sold?.extrapolated || (!src.sold && src.active?.extrapolated));
  let confidence: Valuation["confidence"] = "medium";
  let confidenceWhy = `${sources.length} source${sources.length > 1 ? "s" : ""} agree within ${Math.round(disagree * 200)}%`;
  if (sources.length >= 2 && disagree <= 0.08 && soldN >= 10 && !stretch) confidence = "high";
  else if (sources.length === 1 || soldN + (src.active?.n ?? 0) < 5 || disagree > 0.15 || stretch) {
    confidence = "low";
    confidenceWhy = sources.length === 1 ? "only one source answered"
      : stretch ? "few comparable cars have miles like this one"
        : disagree > 0.15 ? `the sources disagree by ${Math.round(disagree * 200)}%`
          : "few comparable cars nearby";
  }

  // Suggested offer: start under the fair range, more room when it has sat unsold or has issues.
  let offer: Valuation["offer"] = null;
  if (car.price) {
    const reasons: string[] = [];
    let room = 0.03;
    for (const a of adjustments) {
      if (a.pct >= 0 || a.label.startsWith("Private")) continue;
      reasons.push(a.label.startsWith("Reported") ? `${a.label}: cars with a past accident sell for about 3–12% less than clean ones` : `${a.label}: worth about ${Math.round(-a.pct * 100)}% less than a clean one`);
    }
    const typical = src.marketDays ?? null;
    if (car.daysOnMarket && car.daysOnMarket >= Math.max(45, (typical ?? 30) * 1.5)) {
      room += car.daysOnMarket >= 90 ? 0.04 : 0.02;
      reasons.push(typical
        ? `Listed for ${car.daysOnMarket} days, while similar cars nearby sell in about ${typical}: it isn't moving at this price`
        : `Listed for ${car.daysOnMarket} days: sellers usually cut the price after 30–45`);
    }
    if (car.priceCut && car.priceCut.from > car.price) {
      room += 0.01;
      reasons.push(`The price has already dropped from ${fmt(car.priceCut.from)}: the seller wants it gone`);
    }
    if (car.highMiles) {
      room += 0.02;
      reasons.push("Very high miles for its age");
    }
    if (car.price > high) reasons.push(`The asking price is above the fair range (${fmt(low)}–${fmt(high)})`);
    else if (car.price < low) reasons.push("It's already under the fair range: don't push too hard, and find out why it's cheap");
    const anchor = Math.min(car.price, fair);
    const open = round100(Math.max(anchor * (1 - room), low * 0.9));
    const max = round100(Math.min(car.price, high));
    offer = { open: Math.min(open, max), max, reasons };
  }

  return { fair, low, high, sources, adjustments, pctUnder, label, offer, confidence, confidenceWhy, assumesClean, unpriced: null };
}

/**
 * Re-read the comps at new details (miles, trim) in the browser, so editing
 * them re-prices the car instantly with no new lookup. MarketCheck's model
 * was priced for the original miles, so it drops out once they change a lot.
 */
export function revalue(src: PriceSources, t: CompTarget): PriceSources {
  if (!src.comps) return src;
  const c = src.comps;
  if (t.miles === c.target.miles && (t.trim ?? null) === (c.target.trim ?? null)) return src;
  const milesMoved = t.miles !== null && c.target.miles !== null ? Math.abs(t.miles - c.target.miles) > 2_000 : t.miles !== c.target.miles;
  return {
    ...src,
    predicted: milesMoved ? null : src.predicted,
    sold: c.sold.length ? estimateFromComps(c.sold, t) : src.sold,
    active: c.active.length ? estimateFromComps(c.active, t) : src.active,
  };
}

export const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
