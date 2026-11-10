/**
 * Measures the scam warnings against labelled ads (cases.json plus the
 * corpus cases that carry a "scam" label), and compares them with a naive
 * keyword checker, so improvements are measured, not claimed.
 *
 * "Flagged" means VinVerdict's answer is "Stop: serious warning" because of
 * the listing or the payment (not because of the car's condition): that's
 * the answer a buyer acts on. Pure; runs offline in tests.
 */

import { decide } from "@/lib/decision";
import { EMPTY_REPORT } from "@/lib/history-report";
import { parseListing } from "@/lib/listing/parse";
import { buildVerdict } from "@/lib/verdict";

export type EvalCase = { id: string; origin: "real" | "synthetic"; scam: boolean; basis?: string; text: string };

const NOW = new Date("2026-11-09T12:00:00Z");

export function vinverdictFlags(text: string): { flagged: boolean; why: string[] } {
  const listing = parseListing(text);
  const result = buildVerdict({ text, listing, decoded: null }, {}, NOW);
  const d = decide({
    hits: result.hits, kind: listing.kind, hasVin: !!listing.vin, hasPrice: listing.price != null, decoded: false,
    recalls: null, report: EMPTY_REPORT, checklist: {}, listingStatesHistory: false, priced: false, price: null,
  });
  const why = d.findings.filter((f) => f.severity === "stop" && (f.area === "listing" || f.area === "deal")).map((f) => f.id);
  return { flagged: why.length > 0, why };
}

/** What a simple "scary word" filter would do: flag any ad that mentions a payment app, shipping, a deposit or being away. */
const KEYWORDS = /gift ?cards?|zelle|venmo|cash ?app|paypal|\bwire\b|western union|moneygram|bitcoin|crypto|deposit|\bship|deliver|escrow|deployed|overseas|abroad|out of the country|storage|ebay/i;
export function baselineFlags(text: string): boolean {
  return KEYWORDS.test(text);
}

export type Metrics = { cases: number; scams: number; legit: number; tp: number; fp: number; fn: number; tn: number; precision: number; recall: number; falseAlarmRate: number };

export function metrics(rows: { scam: boolean; flagged: boolean }[]): Metrics {
  const tp = rows.filter((r) => r.scam && r.flagged).length;
  const fp = rows.filter((r) => !r.scam && r.flagged).length;
  const fn = rows.filter((r) => r.scam && !r.flagged).length;
  const tn = rows.filter((r) => !r.scam && !r.flagged).length;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    cases: rows.length, scams: tp + fn, legit: fp + tn, tp, fp, fn, tn,
    precision: round(tp + fp ? tp / (tp + fp) : 0),
    recall: round(tp + fn ? tp / (tp + fn) : 0),
    falseAlarmRate: round(fp + tn ? fp / (fp + tn) : 0),
  };
}

export type Scorecard = {
  generated: string;
  definition: string;
  vinverdict: Metrics;
  baseline: Metrics;
  byOrigin: { real: Metrics; synthetic: Metrics };
  /** Ads never used to tune the rules (holdout.json): the honest number. */
  heldOut: Metrics;
  misses: { id: string; kind: "missed scam" | "false alarm"; why: string[] }[];
};

export function score(cases: EvalCase[], heldOut: EvalCase[], generated: string): Scorecard {
  const rows = cases.map((c) => ({ ...c, ...vinverdictFlags(c.text) }));
  const held = heldOut.map((c) => ({ ...c, ...vinverdictFlags(c.text) }));
  return {
    generated,
    definition: "Flagged = VinVerdict says 'Stop: serious warning' because of the listing or the payment. Baseline = flags any ad mentioning a payment app, shipping, a deposit, a wire, escrow or the seller being away.",
    vinverdict: metrics(rows),
    baseline: metrics(cases.map((c) => ({ scam: c.scam, flagged: baselineFlags(c.text) }))),
    byOrigin: { real: metrics(rows.filter((r) => r.origin === "real")), synthetic: metrics(rows.filter((r) => r.origin === "synthetic")) },
    heldOut: metrics(held),
    misses: [...rows, ...held]
      .filter((r) => r.scam !== r.flagged)
      .map((r) => ({ id: r.id, kind: r.scam ? "missed scam" as const : "false alarm" as const, why: r.why })),
  };
}
