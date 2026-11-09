/**
 * Turn an analysis plus the seller-checklist answers into the verdict shown
 * on the page. Pure and browser-safe, so answering a checklist question
 * updates the verdict instantly without another server call.
 */

import type { ParsedListing } from "@/lib/listing/parse";
import type { DecodedVin } from "@/lib/nhtsa/parse";
import { evaluateScamRules, type RuleHit, type ScamResult, type SellerChecklist } from "@/lib/scam/rules";

export type VerdictInput = {
  text: string;
  listing: ParsedListing;
  decoded: DecodedVin | null;
  valuePct?: number | null;
};

export function buildVerdict(a: VerdictInput, checklist: SellerChecklist, now?: Date): ScamResult {
  const result = evaluateScamRules({ text: a.text, listing: a.listing, decoded: a.decoded, valuePct: a.valuePct, checklist, now });
  if (a.listing.kind !== "vin") return result;

  // A bare VIN is a car lookup, not a listing: a missing price isn't a red
  // flag, just a reason to paste the full listing for the scam check.
  const hits: RuleHit[] = result.hits.filter((h) => h.id !== "no-price");
  hits.push({
    id: "vin-only",
    action: "info",
    title: "VIN only",
    reason: "This checks the car itself. Paste the full listing text too, for the price, title and scam checks.",
  });
  const hides = hits.some((h) => h.action === "hide");
  const flags = hits.filter((h) => h.action === "flag").length;
  return {
    hits,
    risk: hides ? 100 : Math.min(90, flags * 25),
    verdict: hides ? "hide" : flags ? "caution" : "clear",
  };
}
