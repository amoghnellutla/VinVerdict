/**
 * Combine what was pasted with the live listing found for the same VIN.
 * Pure and browser-safe, so the verdict updates instantly when the lookup
 * finishes.
 *
 * The pasted text wins for facts it states (that's the listing being
 * checked); the live listing fills gaps. Accidents are the exception: a
 * history report showing an accident beats a seller who doesn't mention one.
 *
 * Feeds only ever add bad news. Their "0 accidents", owner count, "personal
 * use" and clean-title flags are not history reports and can be stale (see
 * lib/history-report.ts), so they never fill in good news.
 */

import type { ParsedListing } from "@/lib/listing/parse";
import type { RuleHit } from "@/lib/scam/rules";
import type { LiveListing } from "./parse";

const BASIC_COLORS = ["black", "white", "silver", "gray", "grey", "blue", "red", "green", "brown", "beige", "gold", "tan", "orange", "yellow", "purple", "maroon", "burgundy", "charcoal", "pearl"];
const PRICE_DIFF_PCT = 0.1;
const CLONE_PRICE_PCT = 0.15;
const MILES_ROLLBACK = 1_000;

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const basicColor = (s: string | null) => {
  const w = (s ?? "").toLowerCase().match(new RegExp(`\\b(${BASIC_COLORS.join("|")})\\b`))?.[1] ?? null;
  return w === "grey" ? "gray" : w;
};

export function mergeLive(l: ParsedListing, live: LiveListing | null): ParsedListing {
  if (!live) return l;
  const accident = live.accidentCount !== null && live.accidentCount > 0 ? "reported" : l.accident;
  const riskyUse = live.usage === "fleet" || live.usage === "rental";
  return {
    ...l,
    year: l.year ?? live.year,
    make: l.make ?? live.make,
    model: l.model ?? live.model,
    price: l.price ?? live.price,
    miles: l.miles ?? live.miles,
    exteriorColor: l.exteriorColor ?? basicColor(live.exteriorColor),
    ownerCount: l.ownerCount,
    sellerType: l.sellerType !== "unknown" ? l.sellerType : live.sellerType,
    usage: l.usage !== "unknown" ? l.usage : riskyUse ? live.usage : "unknown",
    zip: l.zip ?? live.zip,
    titleStatus: l.titleStatus,
    accident,
  };
}

/** Extra checks that only exist when the pasted listing can be compared with a live one. */
export function liveRuleHits(pasted: ParsedListing, live: LiveListing | null): RuleHit[] {
  if (!live) return [];
  const hits: RuleHit[] = [];
  const where = [live.sellerName, [live.city, live.state].filter(Boolean).join(", ")].filter(Boolean).join(" in ") || live.source;
  const active = !live.removedAt;

  if (live.accidentCount !== null && live.accidentCount > 0) {
    hits.push({
      id: "live-accident",
      action: "hide",
      title: `History shows ${live.accidentCount} accident${live.accidentCount > 1 ? "s" : ""}`,
      reason: `${live.source}'s history data for this VIN reports ${live.accidentCount === 1 ? "an accident" : `${live.accidentCount} accidents`}${pasted.accident === "none" ? ", even though the listing says none" : ""}. Get the full history report to see how bad it was, have the repair inspected, and expect to pay less.`,
    });
  }

  // Is the pasted listing a private copy of a dealer's car?
  const pastedPrivate = pasted.sellerType === "private" && pasted.kind !== "vin";
  const cheaper = pasted.price !== null && live.price !== null ? (live.price - pasted.price) / live.price : null;
  if (pastedPrivate && live.sellerType === "dealer" && active && cheaper !== null && cheaper >= CLONE_PRICE_PCT) {
    hits.push({
      id: "live-cloned",
      action: "hide",
      title: "Looks like a copied dealer listing",
      reason: `This VIN is for sale at ${where} for ${money(live.price!)}. A private "seller" asking ${money(pasted.price!)} for the same car is a known scam: they copy a real dealer's photos and VIN. Call the dealer using the number on their own website.`,
    });
  } else if (pastedPrivate && live.sellerType === "dealer" && active) {
    hits.push({
      id: "live-dealer-too",
      action: "flag",
      title: "Same VIN is listed by a dealer",
      reason: `${where} is also listing this car. Ask the seller why: it may be a recent trade-in, or a copied listing.`,
    });
  } else if (pasted.kind !== "vin" && cheaper !== null && Math.abs(cheaper) >= PRICE_DIFF_PCT) {
    hits.push({
      id: "live-price-differs",
      action: "flag",
      title: "Same VIN listed at a different price",
      reason: `The pasted listing asks ${money(pasted.price!)}; ${live.source} shows ${money(live.price!)} at ${where}. Ask which price is real and get it in writing.`,
    });
  }

  if (pasted.kind !== "vin" && pasted.miles !== null && live.miles !== null && live.miles - pasted.miles >= MILES_ROLLBACK) {
    hits.push({
      id: "live-miles-lower",
      action: "flag",
      title: "Fewer miles than another listing",
      reason: `The pasted listing says ${pasted.miles.toLocaleString("en-US")} miles, but ${live.source} has ${live.miles.toLocaleString("en-US")} for this VIN${live.removedAt ? " on an earlier listing" : ""}. Miles never go down: possible odometer rollback or a typo. Check the dashboard yourself.`,
    });
  }

  if (live.removedAt) {
    hits.push({
      id: "live-ended",
      action: "info",
      title: "Earlier listing has ended",
      reason: `${live.source}'s last listing for this VIN (${where}) ended ${live.removedAt.slice(0, 10)}. If someone is selling it now, ask where the car has been since.`,
    });
  }
  return hits;
}
