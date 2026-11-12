/**
 * What the person told VinVerdict, applied to the car the page shows. Pure. The result
 * page runs every section (verdict, price, costs, seller message, report) on the
 * merged car, so one message updates everything at once.
 *
 * Precedence: a fact the person states wins over the ad; a pasted listing only fills in
 * what the check didn't know; an auction record is kept apart (a wholesale sale isn't
 * an asking price). Each item can be undone.
 */

import type { Analysis } from "@/lib/analyze";
import type { AuctionRecord } from "@/lib/listing/auction";
import type { ParsedListing } from "@/lib/listing/parse";
import type { RuleHit } from "@/lib/scam/rules";
import type { Fact } from "./facts";

export type Told = {
  id: string;
  /** What the chip says ("Sold at auction for $9,100"). */
  label: string;
  facts?: Fact[];
  listing?: ParsedListing;
  auction?: AuctionRecord;
  /** The pasted text, so the scam and history rules read it too. */
  text?: string;
};

const FILL: (keyof ParsedListing)[] = ["vin", "year", "make", "model", "price", "docFee", "miles", "transmission", "titleStatus", "accident", "exteriorColor", "ownerCount", "sellerType", "usage", "zip", "distanceMiles"];
const empty = (v: unknown) => v === null || v === undefined || v === "unknown";

export function applyTold(a: Analysis, told: Told[]): Analysis {
  if (!told.length) return a;
  const listing: ParsedListing = { ...a.listing };
  const fill = listing as Record<string, unknown>;
  for (const t of told) {
    if (!t.listing) continue;
    for (const k of FILL) if (empty(fill[k]) && !empty(t.listing[k])) fill[k] = t.listing[k];
  }
  for (const t of told) {
    for (const f of t.facts ?? []) {
      if (f.kind === "price") listing.price = f.value;
      else if (f.kind === "miles") listing.miles = f.value;
      else if (f.kind === "zip") listing.zip = f.value;
      else if (f.kind === "seller") listing.sellerType = f.value;
      else if (f.kind === "owners") listing.ownerCount = f.value;
      else if (f.kind === "accident") listing.accident = f.value;
      else if (f.kind === "title") listing.titleStatus = f.value;
    }
    if (t.auction?.odometer && listing.miles === null) listing.miles = t.auction.odometer;
  }
  const extra = told.map((t) => t.text).filter((x): x is string => !!x);
  return { ...a, listing, text: extra.length ? `${a.text}\n\n${extra.join("\n\n")}` : a.text };
}

/** The auction sale, from the record(s) and the person's own words; null when none. */
export function toldAuction(told: Told[]): { record: AuctionRecord | null; soldPrice: number | null } | null {
  const record = [...told].reverse().find((t) => t.auction)?.auction ?? null;
  const said = [...told].reverse().flatMap((t) => t.facts ?? []).find((f) => f.kind === "auctionSold");
  const soldPrice = record?.soldPrice ?? (said?.kind === "auctionSold" ? said.value : null);
  return record || soldPrice ? { record, soldPrice } : null;
}

/** Findings from the auction record against the listing: fewer miles now than at the auction. */
export function auctionHits(auction: ReturnType<typeof toldAuction>, listingMiles: number | null): RuleHit[] {
  const odo = auction?.record?.odometer;
  if (!odo || listingMiles === null || listingMiles >= odo - Math.max(1_000, odo * 0.03)) return [];
  return [{
    id: "auction-miles-lower",
    action: "hide",
    title: "Fewer miles than at the auction",
    reason: `The auction record says ${odo.toLocaleString("en-US")} miles${auction?.record?.odometerActual ? " (declared actual)" : ""}, but this listing says ${listingMiles.toLocaleString("en-US")}. Miles never go down: odometer rollback, or the wrong car. Check the dashboard and the title yourself.`,
  }];
}
