/**
 * Turn an analysis plus the seller-checklist answers into the verdict shown
 * on the page. Pure and browser-safe, so answering a checklist question (or
 * a live-listing lookup finishing) updates the verdict instantly without
 * another server call.
 */

import { damaged, DAMAGE_LABEL, EMPTY_REPORT, type ReportAnswers } from "@/lib/history-report";
import { historyRuleHits, type HistorySummary } from "@/lib/history/summary";
import type { ParsedListing } from "@/lib/listing/parse";
import { liveRuleHits, mergeLive } from "@/lib/live/merge";
import type { LiveListing } from "@/lib/live/parse";
import type { DecodedVin } from "@/lib/nhtsa/parse";
import { evaluateScamRules, summarize, type RuleHit, type ScamResult, type SellerChecklist } from "@/lib/scam/rules";

export type VerdictInput = {
  text: string;
  listing: ParsedListing;
  decoded: DecodedVin | null;
  valuePct?: number | null;
  /** Live listing found for the same VIN (feature 2b), if looked up. */
  live?: LiveListing | null;
  /** Past listings of the same VIN (MarketCheck History), if looked up. */
  history?: HistorySummary | null;
  /** Other saved cars whose listing had the same phone number (PLAN.md §6). */
  phoneMatches?: { title: string }[];
  /** What the vehicle history report says, as recorded on the page. */
  report?: ReportAnswers;
  /** Warnings from proof the person attached (lib/evidence/combine.ts). */
  proofHits?: RuleHit[];
};

export function buildVerdict(a: VerdictInput, sellerAnswers: SellerChecklist, now?: Date): ScamResult {
  const live = a.live ?? null;
  const report = a.report ?? EMPTY_REPORT;
  const listing = mergeLive(a.listing, live);
  // The history report settles "any accident?" unless the seller already admitted one.
  const checklist: SellerChecklist = {
    ...sellerAnswers,
    anyAccidents: sellerAnswers.anyAccidents === true ? true : report.damage === "none" ? false : sellerAnswers.anyAccidents,
  };
  const result = evaluateScamRules({ text: a.text, listing, decoded: a.decoded, valuePct: a.valuePct, checklist, now });
  const extra = liveRuleHits(a.listing, live);

  let hits: RuleHit[] = result.hits;
  // An accident that only the live history shows gets its own hit with the source named.
  if (extra.some((h) => h.id === "live-accident") && a.listing.accident !== "reported" && checklist.anyAccidents !== true) {
    hits = hits.filter((h) => h.id !== "accident-reported");
  }
  hits = [...hits, ...extra];

  // A feed showing no accidents isn't a history report: say so instead of staying quiet.
  if (live?.accidentCount === 0) {
    hits = hits.map((h) => h.id === "accident-unknown"
      ? { ...h, reason: `${live.source}'s listing data shows no accidents, but listing feeds often miss damage that Carfax or AutoCheck show. Open the history report and record what it says.` }
      : h);
  }

  // What the history report says (recorded by the person checking).
  if (damaged(report.damage)) {
    // The report's own answer replaces the vaguer "an accident was mentioned / is in the feed".
    hits = hits.filter((h) => h.id !== "accident-reported" && h.id !== "accident-unknown" && h.id !== "live-accident");
    hits.push({
      id: "report-damage",
      action: "hide",
      title: `History report: ${DAMAGE_LABEL[report.damage].toLowerCase()}`,
      reason: `${report.damage === "severe" ? "Structural or airbag damage can weaken the car in a future crash. " : ""}If you still consider it, get the repair records and have a body shop inspect the repair, and pay less: the price check below accounts for it.`,
    });
  }
  if (report.title === "branded" && !hits.some((h) => h.id === "title-brand")) {
    hits.push({
      id: "report-title",
      action: "hide",
      title: "History report: branded title",
      reason: "A salvage, rebuilt, flood or junk brand means an insurer once wrote the car off or it had major damage. Hard to insure and resell.",
    });
  }
  if (report.commercial === true && !hits.some((h) => h.id === "fleet")) {
    hits.push({
      id: "report-commercial",
      action: "flag",
      title: "History report: rental, fleet or commercial use",
      reason: "Many drivers, often driven hard. Ask for maintenance records and get a pre-purchase inspection.",
    });
  }

  // Listing history: the stronger evidence wins over the single live listing.
  const past = historyRuleHits(a.listing, a.history ?? null, now);
  const has = (id: string) => past.some((h) => h.id === id) || hits.some((h) => h.id === id);
  if (has("history-miles-lower")) hits = hits.filter((h) => h.id !== "live-miles-lower");
  hits = [...hits, ...past.filter((h) => !(h.id === "history-dealer-recent" && (has("live-cloned") || has("live-dealer-too"))))];
  if (a.phoneMatches?.length && listing.sellerType !== "dealer") {
    const n = a.phoneMatches.length;
    hits.push({
      id: "same-phone",
      action: "flag",
      title: "Same phone number on other cars",
      reason: `This seller's number is also on ${n === 1 ? "another car" : `${n} other cars`} you checked (${a.phoneMatches.map((m) => m.title).slice(0, 3).join(", ")}). A "private" seller with several cars is often an unlicensed dealer (curbstoner). Ask how many cars they're selling, and check the title is in their name.`,
    });
  }

  hits = [...hits, ...(a.proofHits ?? [])];

  if (a.listing.kind === "vin") {
    // A bare VIN is a car lookup, not a listing: a missing price isn't a red
    // flag, just a reason to paste the full listing for the scam check.
    hits = hits
      .filter((h) => h.id !== "no-price")
      .map((h) =>
        h.id === "accident-unknown"
          ? {
              ...h,
              reason: live?.accidentCount === 0
                ? h.reason
                : live
                  ? `${live.source} has no accident data for this VIN. Open the history report (most dealer listings link a free one) and record what it says below.`
                  : "A VIN alone can't show accident history: Carfax and AutoCheck are paid, and no free government source has it. Get the history report and record what it says below.",
            }
          : h,
      );
    hits.push({
      id: "vin-only",
      action: "info",
      title: "VIN only",
      reason: live
        ? `Price, miles and history come from the live listing on ${live.source}. Paste the listing text too, for the seller and scam checks.`
        : "This checks the car itself. Press \"Check price & history\" below, or paste the full listing text, for the price, history and scam checks.",
    });
  }
  return summarize(hits);
}
