/**
 * Turn Auto.dev and MarketCheck "listing by VIN" replies into one small
 * LiveListing (feature 2b: VIN → live listing). Pure and browser-safe.
 *
 * Copies listing facts only. Auto.dev replies also describe our own account
 * (email, IP), and MarketCheck includes dealer staff emails; none of that is
 * kept. Links are kept only if they are https, so API data can't smuggle a
 * javascript: link into the page.
 */

import type { SellerType, Usage } from "@/lib/listing/parse";

export type LiveSource = "Auto.dev" | "MarketCheck";

export type LiveListing = {
  source: LiveSource;
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  miles: number | null;
  sellerType: SellerType;
  sellerName: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** The listing page on the seller's site. */
  url: string | null;
  carfaxUrl: string | null;
  exteriorColor: string | null;
  /** null = the source doesn't say. 0 = none in its history data. */
  accidentCount: number | null;
  ownerCount: number | null;
  usage: Usage;
  certified: boolean | null;
  /** Only `true` is meaningful (MarketCheck's Carfax flag is false when unconfirmed). */
  cleanTitle: boolean | null;
  daysOnMarket: number | null;
  /** Set when the listing has ended: the source returned its last stored copy. */
  removedAt: string | null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const posNum = (v: unknown, max: number): number | null => {
  const n = num(v);
  return n !== null && n > 0 && n <= max ? Math.round(n) : null;
};
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v === 1 ? true : v === 0 ? false : null);

export function safeHttpsUrl(v: unknown): string | null {
  const s = str(typeof v === "string" ? v : null);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function usageOf(v: unknown): Usage {
  const s = (str(v) ?? "").toLowerCase();
  if (!s) return "unknown";
  if (/rental/.test(s)) return "rental";
  if (/fleet|commercial|lease|government|taxi|police/.test(s)) return "fleet";
  if (/personal/.test(s)) return "personal";
  return "unknown";
}

function sellerTypeOf(v: unknown): SellerType {
  const s = (str(v) ?? "").toLowerCase();
  if (/dealer/.test(s)) return "dealer";
  if (/private|fsbo|owner/.test(s)) return "private";
  return "unknown";
}

const sameVin = (a: unknown, vin: string) => typeof a === "string" && a.toUpperCase() === vin.toUpperCase();

/** Auto.dev `GET /listings/{vin}` → `{ data: listing }`. */
export function parseAutoDevListing(body: unknown, vin: string): LiveListing | null {
  const root = obj(body);
  const d = obj(root?.data) ?? root;
  if (!d || !sameVin(d.vin, vin)) return null;
  const v = obj(d.vehicle) ?? {};
  const r = obj(d.retailListing) ?? {};
  const h = obj(d.history);
  return {
    source: "Auto.dev",
    vin: vin.toUpperCase(),
    year: posNum(v.year, 2100),
    make: str(v.make),
    model: str(v.model),
    trim: str(v.trim),
    price: posNum(r.price, 1_000_000),
    miles: posNum(r.miles, 1_000_000),
    sellerType: str(r.dealer) ? "dealer" : "unknown",
    sellerName: str(r.dealer),
    city: str(r.city),
    state: str(r.state),
    zip: str(r.zip),
    url: safeHttpsUrl(r.vdp),
    carfaxUrl: safeHttpsUrl(r.carfaxUrl),
    exteriorColor: str(v.exteriorColor),
    accidentCount: h ? (num(h.accidentCount) ?? (h.accidents === false ? 0 : null)) : null,
    ownerCount: h ? posNum(h.ownerCount, 20) : null,
    usage: h ? usageOf(h.usageType) : "unknown",
    certified: bool(r.cpo),
    cleanTitle: null,
    daysOnMarket: null,
    removedAt: str(d.removedAt),
  };
}

/** MarketCheck `GET /v2/search/car/active?vin=` → `{ num_found, listings: [...] }`. */
export function parseMarketCheckListing(body: unknown, vin: string): LiveListing | null {
  const listings = obj(body)?.listings;
  if (!Array.isArray(listings)) return null;
  const x = listings.map(obj).find((l) => l && sameVin(l.vin, vin));
  if (!x) return null;
  const b = obj(x.build) ?? {};
  const dealer = obj(x.dealer) ?? {};
  return {
    source: "MarketCheck",
    vin: vin.toUpperCase(),
    year: posNum(b.year, 2100),
    make: str(b.make),
    model: str(b.model),
    trim: str(b.trim),
    price: posNum(x.price, 1_000_000),
    miles: posNum(x.miles, 1_000_000),
    sellerType: sellerTypeOf(x.seller_type),
    sellerName: str(dealer.name),
    city: str(dealer.city),
    state: str(dealer.state),
    zip: str(dealer.zip),
    url: safeHttpsUrl(x.vdp_url),
    carfaxUrl: null,
    exteriorColor: str(x.exterior_color),
    accidentCount: null, // MarketCheck has no accident field (Phase 1 finding)
    ownerCount: x.carfax_1_owner === true ? 1 : null,
    usage: "unknown",
    certified: bool(x.is_certified),
    cleanTitle: x.carfax_clean_title === true ? true : null,
    daysOnMarket: posNum(x.dom, 10_000),
    removedAt: null,
  };
}
