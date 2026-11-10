/**
 * Turn everything a person attached in "Check it yourself" into answers,
 * warnings and a per-check rating. Pure and browser-safe.
 *
 * Rules: proof for a different VIN is ignored (and said so); when two
 * reports disagree, the worse one counts and the disagreement is shown.
 */

import { DAMAGE_LABEL, type Damage, type ReportAnswers, type ReportTitle } from "@/lib/history-report";
import type { RuleHit } from "@/lib/scam/rules";
import { SOURCE_NAME, type FindingStatus, type ProofKind, type ProofRead } from "./parse";

export type Proof = { id: string; kind: ProofKind; read: ProofRead };

export type CheckRating = "clear" | "problem" | "check" | "read" | "none";

export type ProofSummary = {
  /** Answers settled by proof, with where each came from. */
  report: Partial<ReportAnswers>;
  from: Partial<Record<keyof ReportAnswers, string>>;
  hits: RuleHit[];
  rating: Record<ProofKind, CheckRating>;
  /** Proof for another car: left out. */
  otherVin: Proof[];
};

const SEVERITY: Damage[] = ["unknown", "none", "minor", "moderate", "severe"];
const KINDS: ProofKind[] = ["history", "nhtsa", "maker", "nicb", "nmvtis", "google"];

const rate = (statuses: FindingStatus[], any: boolean): CheckRating =>
  statuses.includes("bad") ? "problem" : statuses.includes("warn") ? "check" : statuses.includes("good") ? "clear" : any ? "read" : "none";

/** Proof that names a VIN must name this one (a screenshot without a VIN is trusted to be this car). */
export const forThisCar = (p: Proof, vin: string | null) => !vin || p.read.vins.length === 0 || p.read.vins.includes(vin);

export function summarizeProof(proofs: Proof[], vin: string | null, listingMiles: number | null): ProofSummary {
  const mine = proofs.filter((p) => forThisCar(p, vin));
  const report: Partial<ReportAnswers> = {};
  const from: ProofSummary["from"] = {};
  const hits: RuleHit[] = [];
  const name = (p: Proof) => SOURCE_NAME[p.read.source];

  // Damage: the worst report wins; say so if they disagree.
  const damages = mine.filter((p) => p.read.report.damage).map((p) => ({ d: p.read.report.damage!, who: name(p) }));
  if (damages.length) {
    const worst = damages.reduce((a, b) => (SEVERITY.indexOf(b.d) > SEVERITY.indexOf(a.d) ? b : a));
    report.damage = worst.d;
    from.damage = worst.who;
    const differ = damages.filter((x) => x.d !== worst.d);
    if (differ.length) {
      hits.push({
        id: "proof-reports-differ",
        action: "flag",
        title: "History reports disagree",
        reason: `${worst.who} shows ${DAMAGE_LABEL[worst.d].toLowerCase()}, but ${differ.map((x) => `${x.who} shows ${DAMAGE_LABEL[x.d].toLowerCase()}`).join(" and ")}. Reports only know what was reported to them, so the worse one counts.`,
      });
    }
  }
  const titles = mine.filter((p) => p.read.report.title).map((p) => ({ t: p.read.report.title as ReportTitle, who: name(p) }));
  const branded = titles.find((x) => x.t === "branded") ?? titles[0];
  if (branded) {
    report.title = branded.t;
    from.title = branded.who;
  }
  const uses = mine.filter((p) => p.read.report.commercial !== undefined && p.read.report.commercial !== null);
  if (uses.length) {
    const risky = uses.find((p) => p.read.report.commercial === true);
    report.commercial = !!risky;
    from.commercial = name(risky ?? uses[0]);
  }

  const has = (key: string, status: FindingStatus) => mine.some((p) => p.read.findings.some((f) => f.key === key && f.status === status));
  if (has("theft", "bad")) {
    hits.push({ id: "proof-stolen", action: "hide", title: "NICB: reported stolen", reason: "Your NICB VINCheck shows a theft record for this VIN. Don't buy it; you can report the listing to local police." });
  }
  if (has("total-loss", "bad")) {
    hits.push({ id: "proof-total-loss", action: "hide", title: "NICB: insurance total loss", reason: "An insurer wrote this car off (salvage record). Unless the title says salvage or rebuilt and the price reflects it, walk away." });
  }
  if (has("auction", "bad")) {
    hits.push({ id: "proof-auction", action: "hide", title: "Sold at a salvage auction", reason: "The VIN shows up on a salvage auction page, so it was damaged badly enough for an insurer or dealer to dump it. The seller should have told you." });
  }
  if (has("odometer", "bad")) {
    hits.push({ id: "proof-odometer", action: "hide", title: "History report: odometer problem", reason: "The report flags the odometer (rollback, not actual miles or a broken odometer). The real miles are unknown." });
  }
  const recalls = Math.max(-1, ...mine.map((p) => p.read.openRecalls ?? -1));
  if (recalls > 0) {
    hits.push({ id: "proof-open-recalls", action: "flag", title: `${recalls} open recall${recalls > 1 ? "s" : ""} on this car`, reason: "The recall lookup you attached shows repairs that haven't been done. They're free at the brand's dealer: ask the seller to get them done before you buy, or book them yourself." });
  }
  // A report's last odometer reading above the listing's miles means the miles went down.
  const odo = mine.map((p) => p.read.odometer).filter((o): o is NonNullable<typeof o> => !!o).sort((a, b) => b.miles - a.miles)[0];
  if (odo && listingMiles !== null && odo.miles - listingMiles >= 1_000) {
    hits.push({
      id: "proof-miles-lower",
      action: "flag",
      title: "Fewer miles than the history report",
      reason: `The report's last odometer reading is ${odo.miles.toLocaleString("en-US")}${odo.date ? ` (${odo.date})` : ""}, but the listing says ${listingMiles.toLocaleString("en-US")}. Miles never go down: check the dashboard yourself.`,
    });
  }

  const rating = Object.fromEntries(
    KINDS.map((k) => {
      const ps = mine.filter((p) => p.kind === k);
      return [k, rate(ps.flatMap((p) => p.read.findings.map((f) => f.status)), ps.length > 0)];
    }),
  ) as Record<ProofKind, CheckRating>;

  return { report, from, hits, rating, otherVin: proofs.filter((p) => !forThisCar(p, vin)) };
}

/** A small, saveable copy (no images, no raw text) for the owner's My cars. */
export type SavedProof = { source: string; findings: { label: string; status: FindingStatus }[] }[];

export function savedProof(proofs: Proof[], vin: string | null): SavedProof {
  return proofs
    .filter((p) => forThisCar(p, vin) && p.read.findings.length)
    .slice(0, 12)
    .map((p) => ({ source: SOURCE_NAME[p.read.source], findings: p.read.findings.slice(0, 12).map((f) => ({ label: f.label.slice(0, 160), status: f.status })) }));
}
