/**
 * What the buyer corrects on the result ("What we read from the ad": Fix, or picking one of the ad's two
 * prices). The browser sends these with the listing text; the server checks every value here before the
 * check runs again, because the request can be sent by anyone. Corrected facts are labelled "you entered",
 * never shown as the ad's words or a source's.
 */

import { KNOWN_MAKES, type FixField, type ParsedListing, type SellerType, type TitleStatus } from "./parse";

export type ListingFixes = Partial<{
  year: number;
  make: string;
  model: string;
  price: number;
  /** 0 removes a fee that was read wrong. */
  docFee: number;
  miles: number;
  exteriorColor: string;
  titleStatus: Exclude<TitleStatus, "unknown">;
  sellerType: Exclude<SellerType, "unknown">;
}>;

export const FIX_COLORS = ["black", "white", "silver", "gray", "blue", "red", "green", "brown", "beige", "gold", "orange", "yellow", "purple"] as const;
export const FIX_TITLES = ["clean", "salvage", "rebuilt", "flood", "lemon", "branded"] as const;
export const MAX_FIXES_CHARS = 1_000;

const int = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

/** The fixes from a request, keeping only valid values; null when there are none (or the field isn't JSON). */
export function parseFixes(raw: unknown): ListingFixes | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX_FIXES_CHARS) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const out: ListingFixes = {};
  const year = int(r.year, 1981, new Date().getFullYear() + 1);
  if (year !== undefined) out.year = year;
  if (typeof r.make === "string") {
    const make = KNOWN_MAKES.find((m) => m.toLowerCase() === (r.make as string).trim().toLowerCase());
    if (make) out.make = make;
  }
  if (typeof r.model === "string" && /^[A-Za-z0-9][A-Za-z0-9 .&/-]{0,39}$/.test(r.model.trim())) out.model = r.model.trim();
  const price = int(r.price, 500, 1_000_000);
  if (price !== undefined) out.price = price;
  const docFee = int(r.docFee, 0, 5_000);
  if (docFee !== undefined) out.docFee = docFee;
  const miles = int(r.miles, 0, 600_000);
  if (miles !== undefined) out.miles = miles;
  if (typeof r.exteriorColor === "string" && (FIX_COLORS as readonly string[]).includes(r.exteriorColor)) out.exteriorColor = r.exteriorColor;
  if (typeof r.titleStatus === "string" && (FIX_TITLES as readonly string[]).includes(r.titleStatus)) out.titleStatus = r.titleStatus as ListingFixes["titleStatus"];
  if (r.sellerType === "private" || r.sellerType === "dealer") out.sellerType = r.sellerType;
  return Object.keys(out).length ? out : null;
}

/** The listing with the buyer's fixes on top: fixed fields are no longer "not sure", and are marked as entered. */
export function applyFixes(l: ParsedListing, fixes: ListingFixes | null): ParsedListing {
  if (!fixes) return l;
  const fields = Object.keys(fixes) as FixField[];
  const next: ParsedListing = { ...l, ...fixes, ...(fixes.docFee === 0 ? { docFee: null } : {}) };
  // A new make clears a model read for the old one, and a model the ad was unsure of.
  const unsure = (l.unsure ?? []).filter((u) => !fields.includes(u.field) && !(u.field === "model" && fixes.make));
  if (fixes.make && !fixes.model && l.make !== fixes.make) next.model = null;
  if (unsure.length) next.unsure = unsure;
  else delete next.unsure;
  next.fixed = [...new Set([...(l.fixed ?? []), ...fields])];
  return next;
}
