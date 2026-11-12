/**
 * The buyer-facing decision, built on top of the rule engine (lib/verdict.ts).
 *
 * The rule engine says which warnings fired. This module says, for a member
 * of the public:
 *  - how serious each one is (stop / verify / note): a manual gearbox or a
 *    repaired accident isn't a scam, and a missing VIN means "not checked",
 *    not "suspicious";
 *  - where its evidence comes from (the ad's words, an official record,
 *    listing data, an estimate, a report or proof the buyer added);
 *  - which of four questions it answers: can I trust the listing, what
 *    shape is the car in, is the price right, and is it safe to pay;
 *  - what is still unknown in each, so "nothing found" never reads as
 *    "verified clean";
 *  - one next step: stop, verify, worth investigating, or not enough
 *    information. Never "safe".
 *
 * Pure and browser-safe: it reruns instantly when the buyer answers a
 * question or attaches a report.
 */

import type { Damage, ReportAnswers } from "@/lib/history-report";
import type { RuleHit, SellerChecklist } from "@/lib/scam/rules";
import type { DealLabel } from "@/lib/value/estimate";

export type Severity = "stop" | "verify" | "note";
export type Area = "listing" | "car" | "price" | "deal";
export type Evidence = "ad" | "ad-or-seller" | "messages" | "record" | "feed" | "report" | "proof" | "estimate" | "saved" | "unknown";
export type Level = "stop" | "verify" | "investigate" | "thin";
export type AreaStatus = "stop" | "verify" | "ok" | "unchecked";

/** How each area's status reads (the verdict card and the downloadable report). */
export const STATUS_WORD: Record<AreaStatus, string> = { stop: "Warning", verify: "Check", ok: "OK so far", unchecked: "Not checked" };

export const AREA_LABEL: Record<Area, string> = {
  listing: "Listing trust",
  car: "Car condition",
  price: "Price",
  deal: "Ready to pay",
};

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  ad: "In the ad",
  "ad-or-seller": "In the ad or the seller's answer",
  messages: "The seller's messages",
  record: "Official record",
  feed: "Listing data",
  report: "Your history report",
  proof: "Proof you attached",
  estimate: "Estimate",
  saved: "Your saved cars",
  unknown: "Not checked",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  stop: "Serious warning",
  verify: "Check this",
  note: "Good to know",
};

/** Known scam patterns and problems serious enough to stop before paying anything. */
const STOP = new Set([
  "pay-gift-card", "pay-wire", "pay-app-upfront", "deposit-first", "shipping-only", "seller-remote",
  "no-inspection", "title-brand", "report-title", "vin-invalid", "vin-mismatch", "too-good-plus-flags",
  "auction", "odometer-unknown", "story-title", "proof-stolen", "proof-total-loss", "proof-auction", "proof-odometer", "history-rollback", "live-cloned",
]);
/** Facts worth knowing that say nothing bad about the seller or the car. */
const NOTE = new Set(["manual", "far-away", "no-price", "vin-only", "high-miles", "live-ended", "accident-unknown", "miles-near-zero", "new-account"]);

const AREA: Record<string, Area> = {
  // Can the listing be trusted?
  "pay-gift-card": "listing", "pay-wire": "listing", "pay-app-upfront": "listing", "pay-app": "listing",
  "deposit-first": "listing", "shipping-only": "listing", "seller-remote": "listing", rushed: "listing",
  "too-good": "listing", "too-good-plus-flags": "listing", "same-phone": "listing", "new-account": "listing", "no-vin": "listing",
  "no-price": "listing", "far-away": "listing", "vin-invalid": "listing", "vin-mismatch": "listing",
  "live-cloned": "listing", "live-dealer-too": "listing", "live-price-differs": "listing", "live-ended": "listing",
  "history-two-sellers": "listing", "vin-only": "listing",
  // What shape is the car in? (story-*: the seller's messages contradict the ad)
  "story-miles": "car", "story-title": "car", "story-accident": "car",
  "accident-reported": "car", "accident-unknown": "car", "live-accident": "car", "report-damage": "car",
  "report-commercial": "car", fleet: "car", "title-brand": "car", "report-title": "car", "title-washing": "car",
  auction: "car", "odometer-unknown": "car", "miles-near-zero": "car", "seller-problem": "car", "mileage-low": "car", "high-miles": "car", manual: "car", "vin-decode-warning": "car",
  "history-rollback": "car", "history-miles-lower": "car", "live-miles-lower": "car", "history-turnover": "car",
  "history-dealer-recent": "car", "proof-stolen": "car", "proof-total-loss": "car", "proof-auction": "car",
  "proof-odometer": "car", "proof-open-recalls": "car", "proof-miles-lower": "car", "proof-reports-differ": "car",
  // Is the price right?
  "history-price-cut": "price",
  // Is it safe to hand over money?
  curbstoning: "deal", lien: "deal", "no-inspection": "deal",
};

/** Rules that can fire from the ad's words or from the seller's answer to a checklist question. */
const AD_OR_SELLER = new Set(["curbstoning", "lien", "no-inspection", "accident-reported", "seller-remote"]);

/** Findings from the seller's messages are named "msg-<rule>": the same rule, different evidence. */
const baseId = (id: string) => id.replace(/^msg-/, "");

export function evidenceOf(id: string): Evidence {
  if (id.startsWith("msg-")) return "messages";
  if (id.startsWith("history-") || id.startsWith("live-")) return "feed";
  if (id.startsWith("report-")) return "report";
  if (id.startsWith("proof-")) return "proof";
  if (id === "too-good" || id === "too-good-plus-flags") return "estimate";
  if (id === "vin-invalid" || id === "vin-mismatch" || id === "vin-decode-warning") return "record";
  if (id === "same-phone") return "saved";
  if (id === "accident-unknown" || id === "no-vin" || id === "vin-only") return "unknown";
  if (AD_OR_SELLER.has(id)) return "ad-or-seller";
  return "ad";
}

export function severityOf(raw: string, damage: Damage = "unknown"): Severity {
  const id = baseId(raw);
  // A history report's damage: severe (structural, airbags) is a stop; a repaired minor or moderate one is a price and inspection question.
  if (id === "report-damage") return damage === "severe" ? "stop" : "verify";
  if (STOP.has(id)) return "stop";
  if (NOTE.has(id)) return "note";
  return "verify";
}

export function areaOf(id: string): Area {
  return AREA[baseId(id)] ?? "listing";
}

export type Finding = RuleHit & { severity: Severity; area: Area; evidence: Evidence };

export type AreaRow = {
  area: Area;
  status: AreaStatus;
  /** One line: the worst finding, or what was checked. */
  line: string;
  /** What hasn't been checked yet in this area. */
  unknown: string[];
};

export type Decision = {
  level: Level;
  title: string;
  text: string;
  areas: AreaRow[];
  findings: Finding[];
};

export type DecisionInput = {
  hits: RuleHit[];
  kind: "text" | "vin" | "url";
  hasVin: boolean;
  hasPrice: boolean;
  /** NHTSA decoded the VIN. */
  decoded: boolean;
  /** Model-year recalls on record (null: not loaded). */
  recalls: number | null;
  report: ReportAnswers;
  checklist: SellerChecklist;
  /** A dealer listing: the private-seller questions (title in their own name, meet locally) aren't asked. */
  dealer?: boolean;
  /** What the ad itself says about the title ("clean", "rebuilt"…), so "not checked" can say what's claimed. */
  adTitle?: string;
  /** The listing itself states its accident history (a dealer page's own claim). */
  listingStatesHistory: boolean;
  /** The price check has run. */
  priced: boolean;
  price: { label: DealLabel | null; low: number; high: number; confidence: "high" | "medium" | "low"; unpriced: string | null } | null;
};

const ORDER: Severity[] = ["stop", "verify", "note"];
const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function decide(d: DecisionInput): Decision {
  const findings: Finding[] = d.hits
    .map((h) => ({ ...h, severity: severityOf(h.id, d.report.damage), area: areaOf(h.id), evidence: evidenceOf(h.id) }))
    .sort((x, y) => ORDER.indexOf(x.severity) - ORDER.indexOf(y.severity));
  const inArea = (a: Area) => findings.filter((f) => f.area === a && f.severity !== "note");
  const worst = (a: Area): Finding | undefined => inArea(a)[0];

  // ----- Listing trust -----
  const listingUnknown: string[] = [];
  if (!d.hasVin) listingUnknown.push("The VIN: ask the seller for it before going further");
  listingUnknown.push("That the seller has the car and can sell it: see both in person");
  const lw = worst("listing");
  const listing: AreaRow = {
    area: "listing",
    status: lw ? lw.severity as AreaStatus : d.kind === "vin" ? "unchecked" : "ok",
    line: lw ? lw.title : d.kind === "vin" ? "Not checked: paste the ad for the seller and scam checks" : "No scam warning signs in the ad",
    unknown: listingUnknown,
  };

  // ----- Car condition -----
  const carUnknown: string[] = [];
  const historyKnown = d.report.damage !== "unknown" || d.listingStatesHistory;
  // When the ad already says something, the "not checked" line says what it claims, so it can't read as if it was missed.
  if (d.report.damage === "unknown") {
    const adAccident = findings.some((f) => baseId(f.id) === "accident-reported");
    carUnknown.push(
      adAccident
        ? "Accident details: not checked (the ad reports an accident; the history report says what was damaged)"
        : d.listingStatesHistory
          ? "Accident history: only the listing's own claim; open the history report to confirm"
          : "Accident history: not checked (open a history report)",
    );
  }
  if (d.report.title === "unknown") {
    const adBrand = findings.find((f) => baseId(f.id) === "title-brand");
    carUnknown.push(
      adBrand
        ? `Title records: not checked (the ad says ${adBrand.title.toLowerCase()}; NMVTIS confirms it)`
        : d.adTitle === "clean"
          ? "Title records: not checked (the ad says clean; NMVTIS confirms it)"
          : "Title brands (salvage, flood, rebuilt): not checked",
    );
  }
  if (d.recalls) carUnknown.push(`Recalls: ${d.recalls} on record for the model year; whether this car is affected and repaired isn't checked`);
  if (!d.decoded) carUnknown.push("The car itself: no VIN decoded yet");
  carUnknown.push("A mechanic's inspection");
  const cw = worst("car");
  const clean = d.report.damage === "none" && d.report.title === "clean";
  const car: AreaRow = {
    area: "car",
    status: cw ? cw.severity as AreaStatus : historyKnown || d.decoded ? "ok" : "unchecked",
    line: cw
      ? cw.title
      : clean
        ? "Your history report: no damage, clean title"
        : d.decoded
          ? "No problems found in the records checked"
          : "Not checked yet",
    unknown: carUnknown,
  };

  // ----- Price -----
  const priceFindings = inArea("price");
  const tooGood = findings.find((f) => f.id === "too-good" || f.id === "too-good-plus-flags");
  const p = d.price;
  let price: AreaRow;
  if (!d.hasPrice && d.kind !== "vin") {
    price = { area: "price", status: "unchecked", line: "No asking price in the ad", unknown: [] };
  } else if (p?.unpriced) {
    price = { area: "price", status: "verify", line: "Can't be priced from listing data: needs an in-person appraisal", unknown: [] };
  } else if (p?.label) {
    const range = `${fmt(p.low)}–${fmt(p.high)}`;
    const line = tooGood
      ? `Far below the estimated ${range}: a price this low needs a reason`
      : p.label === "great" || p.label === "good"
        ? `Below the estimated ${range}`
        : p.label === "fair"
          ? `Within the estimated ${range}`
          : `Above the estimated ${range}: room to negotiate`;
    price = {
      area: "price",
      // Overpriced isn't a risk, but it is something to act on: negotiate or walk.
      status: tooGood || p.label === "high" || p.label === "over" ? "verify" : "ok",
      line,
      unknown: [
        "The estimate uses advertised prices, not what buyers paid",
        ...(p.confidence === "low" ? ["Few similar cars nearby: treat the range as rough"] : []),
      ],
    };
  } else if (d.priced) {
    price = { area: "price", status: "unchecked", line: "Not enough similar cars nearby to price it", unknown: [] };
  } else {
    price = { area: "price", status: "unchecked", line: "Not priced yet: run the price check below", unknown: [] };
  }
  if (priceFindings.length && price.status === "ok") price = { ...price, unknown: [...price.unknown, ...priceFindings.map((f) => f.title)] };

  // ----- Ready to pay -----
  const c = d.checklist;
  const ask: string[] = [];
  // A dealer clears any loan on the car and handles the title itself, so only the inspection is asked.
  const asked = d.dealer ? 1 : 4;
  if (!d.dealer && c.titleInSellerName == null) ask.push("Is the title in the seller's name?");
  if (!d.dealer && c.lienOnTitle == null) ask.push("Is there a loan (lien) on it?");
  if (c.allowsInspection == null) ask.push("Will they allow a mechanic's inspection?");
  if (!d.dealer && c.meetsInPersonLocally == null) ask.push("Can you meet in person, locally?");
  const dw = worst("deal");
  const payWarning = findings.find((f) => baseId(f.id).startsWith("pay-") && f.severity === "stop");
  const deal: AreaRow = {
    area: "deal",
    status: payWarning ? "stop" : dw ? dw.severity as AreaStatus : ask.length === 0 ? "ok" : "unchecked",
    line: payWarning
      ? `${payWarning.title}: pay only in person, after seeing the car and title`
      : dw
        ? dw.title
        : ask.length === 0
          ? d.dealer
            ? "Dealer says: inspection allowed"
            : "Seller says: title in their name, no lien, inspection allowed, meets locally"
          : `${asked - ask.length} of ${asked} seller question${asked === 1 ? "" : "s"} answered`,
    unknown: ask.length
      ? ["Ask the seller: " + ask.join(" ")]
      : [d.dealer ? "Get the out-the-door price and the buyer's order in writing before you pay" : "Check the title and the seller's ID match, in person"],
  };

  const areas = [listing, car, price, deal];
  const stops = findings.filter((f) => f.severity === "stop");
  const verifies = findings.filter((f) => f.severity === "verify");

  let level: Level;
  let title: string;
  let text: string;
  if (stops.length) {
    level = "stop";
    title = "Stop: serious warning";
    const scamStops = stops.filter((f) => f.area === "listing" || f.area === "deal");
    text = scamStops.length && scamStops.every((f) => f.evidence === "messages")
      ? "The seller's messages show a known scam pattern. Don't send any money or deposit. See the warnings below."
      : scamStops.length
      ? "This ad shows a known scam pattern. Don't send any money or deposit. See the warnings below."
      : "There's a serious problem with the car itself. See the warnings below before going any further.";
  } else if (d.kind !== "vin" && !d.hasVin && !d.hasPrice) {
    // Checked before "verify": a missing VIN and price aren't warnings, just nothing to go on.
    level = "thin";
    title = "Not enough information";
    text = "Without a VIN or a price there's little to check. Ask the seller for the VIN and paste the full ad.";
  } else if (verifies.length || tooGood) {
    level = "verify";
    title = "Verify before going further";
    text = "No deal-breaker, but check the points below with the seller and in person before you pay anything.";
  } else {
    level = "investigate";
    title = "Worth investigating";
    text = d.kind === "vin"
      ? "A VIN shows the car, not the deal. Nothing wrong found in the records checked; paste the ad too for the seller and scam checks."
      : "Nothing wrong found in what was checked. That isn't the same as checked clean: see what's still unknown below.";
  }
  return { level, title, text, areas, findings };
}
