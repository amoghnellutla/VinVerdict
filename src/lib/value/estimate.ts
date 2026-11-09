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
 *   - A reported accident takes ~10–30% off, even after a good repair.
 */

import type { AccidentStatus, SellerType, TitleStatus, Usage } from "@/lib/listing/parse";
import type { CompEstimate } from "./comps";

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
};

// Asking-to-selling gaps. Sold comps and MarketCheck Price are already final
// listed prices, so only a little haggle comes off; live asking prices more.
const SOLD_HAGGLE = 0.02;
const ASKING_GAP = 0.06;
const ACCIDENT = -0.15;
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
  if (car.titleStatus !== "clean" && car.titleStatus !== "unknown") adjustments.push({ label: `${car.titleStatus[0].toUpperCase()}${car.titleStatus.slice(1)} title`, pct: BRANDED });
  if (car.accident === "reported") adjustments.push({ label: "Reported accident", pct: ACCIDENT });
  if (car.usage === "rental" || car.usage === "fleet") adjustments.push({ label: car.usage === "rental" ? "Former rental" : "Former fleet car", pct: FLEET });
  if (car.sellerType === "private") adjustments.push({ label: "Private seller (no dealer markup)", pct: PRIVATE });
  const factor = adjustments.reduce((f, a) => f * (1 + a.pct), 1);

  const fair = round100(base * factor);
  const low = round100(base * factor * (1 - half));
  const high = round100(base * factor * (1 + half));

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
    for (const a of adjustments) if (a.pct < 0 && !a.label.startsWith("Private")) reasons.push(`${a.label}: worth about ${Math.round(-a.pct * 100)}% less than a clean one`);
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

  return { fair, low, high, sources, adjustments, pctUnder, label, offer, confidence, confidenceWhy };
}

export const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
