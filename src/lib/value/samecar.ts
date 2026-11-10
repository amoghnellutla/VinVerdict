/**
 * "Is this the same car?" A pasted listing without a VIN (Facebook,
 * Craigslist) is often a car that a dealer also lists. The price check
 * already fetched the cars for sale nearby (with their VINs and photos), so
 * a match costs nothing extra. Pure and browser-safe.
 *
 * Accuracy: only a single, close match counts (same year, price and miles
 * within a small margin). Two or more close matches are ambiguous, so none
 * is shown. The page says it's a likely match to confirm, not a fact.
 */

import type { ParsedListing } from "@/lib/listing/parse";
import type { Comp } from "./comps";

export type SameCar = { comp: Comp; priceDiff: number; milesDiff: number };

export function findSameCar(listing: ParsedListing, year: number | null, comps: Comp[]): SameCar | null {
  const { price, miles } = listing;
  if (!price || miles === null || !year) return null;
  const priceTol = Math.max(300, price * 0.03);
  const close = comps
    .filter((c) => c.vin && c.year === year && (!listing.vin || c.vin !== listing.vin))
    .map((c) => ({ comp: c, priceDiff: Math.abs(c.price - price), milesDiff: Math.abs(c.miles - miles) }))
    .filter((m) => m.priceDiff <= priceTol && m.milesDiff <= 1_500);
  return close.length === 1 ? close[0] : null;
}
