/** Small display helpers shared by pages. */

import type { Unsure, UnsureField } from "@/lib/listing/parse";

export const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
/** The dealer's own fee the ad adds on top of its price (Autotrader: "Listing Price $21,298 / Dealer Fee + $799 / Total Price $22,097"), or 0. */
export const dealerFee = (l: { docFee?: number | null; sellerType: string }) => (l.sellerType === "dealer" && l.docFee && l.docFee > 0 ? l.docFee : 0);

/** The price the way the ad totals it: "$22,097 ($21,298 + $799 dealer fee)", or just "$21,298" with no fee. Null with no price. */
export function priceWithFee(l: { price: number | null; docFee?: number | null; sellerType: string }): string | null {
  return l.price == null ? null : usdWithFee(l.price, dealerFee(l));
}

/** A saved price and its dealer fee: "$22,097 ($21,298 + $799 dealer fee)", "$21,298", or "—". */
export const usdWithFee = (price: number | null | undefined, fee?: number | null) =>
  price == null ? "—" : fee && fee > 0 ? `${usd(price + fee)} (${usd(price)} + ${usd(fee)} dealer fee)` : usd(price);

export const mi = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-US")} mi`);

/**
 * What the ad says for a fact it gives two answers for ("$15,990 or $14,990"), or null when it doesn't.
 * Shown instead of a guess wherever that fact appears.
 */
export function adSays(l: { unsure?: Unsure[] }, field: UnsureField): string | null {
  const u = l.unsure?.find((x) => x.field === field);
  if (!u || !u.values.length) return null;
  const vals = u.values.map((v) => (typeof v === "number" ? (field === "price" ? usd(v) : field === "miles" ? mi(v) : String(v)) : v));
  return vals.length === 1 ? vals[0] : `${vals.slice(0, -1).join(", ")} or ${vals[vals.length - 1]}`;
}

/** "Not sure: the ad shows $15,990 or $14,990", or null. */
export const notSure = (l: { unsure?: Unsure[] }, field: UnsureField) => {
  const said = adSays(l, field);
  return said ? `Not sure: the ad shows ${said}` : null;
};
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Saved cars keep the rule engine's verdict; these labels match the result page's wording, and never say "safe".
/** Makes whose usual spelling isn't plain title case ("BMW", not "Bmw"; "McLaren"). */
const MAKE_SPELLING: Record<string, string> = { bmw: "BMW", gmc: "GMC", mini: "MINI", mclaren: "McLaren", "mclaren automotive": "McLaren" };

/** A make as people write it, from NHTSA's capitals ("LAND ROVER" → "Land Rover", "BMW" stays "BMW"). */
export function makeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  return MAKE_SPELLING[k] ?? k.replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

export const VERDICT_TEXT = { hide: "Serious warning", verify: "Verify in person", caution: "Check with the seller", clear: "Nothing found so far" } as const;
export const VERDICT_TAG = { hide: "bg-bad-soft text-bad", verify: "bg-warn-soft text-warn", caution: "bg-warn-soft text-warn", clear: "bg-surface-muted text-foreground" } as const;
