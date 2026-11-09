/**
 * Turn an analysis plus the seller-checklist answers into the verdict shown
 * on the page. Pure and browser-safe, so answering a checklist question (or
 * a live-listing lookup finishing) updates the verdict instantly without
 * another server call.
 */

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
};

export function buildVerdict(a: VerdictInput, checklist: SellerChecklist, now?: Date): ScamResult {
  const live = a.live ?? null;
  const listing = mergeLive(a.listing, live);
  const result = evaluateScamRules({ text: a.text, listing, decoded: a.decoded, valuePct: a.valuePct, checklist, now });
  const extra = liveRuleHits(a.listing, live);

  let hits: RuleHit[] = result.hits;
  // An accident that only the live history shows gets its own hit with the source named.
  if (extra.some((h) => h.id === "live-accident") && a.listing.accident !== "reported" && checklist.anyAccidents !== true) {
    hits = hits.filter((h) => h.id !== "accident-reported");
  }
  hits = [...hits, ...extra];

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

  if (a.listing.kind === "vin") {
    // A bare VIN is a car lookup, not a listing: a missing price isn't a red
    // flag, just a reason to paste the full listing for the scam check.
    hits = hits
      .filter((h) => h.id !== "no-price")
      .map((h) =>
        h.id === "accident-unknown"
          ? {
              ...h,
              reason: live
                ? `${live.source} has no accident data for this VIN. Check the history box on the listing (most dealer sites show one), then answer "any accident?" in the seller checklist below.`
                : "A VIN alone can't show accident history: Carfax and AutoCheck are paid, and no free government source has it. Press \"Check price & history\" below, check the history box on the listing, then answer \"any accident?\" in the seller checklist.",
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
