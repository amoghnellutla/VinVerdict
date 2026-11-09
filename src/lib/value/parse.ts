/**
 * Turn listing-search replies into comps (pure). Same rules as live/parse.ts:
 * listing facts only, https links only.
 */

import { safeHttpsUrl } from "@/lib/live/parse";
import type { Comp } from "./comps";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** MarketCheck `search/car/recents?sold=true` or `search/car/active` → comps. */
export function parseMarketCheckComps(body: unknown, sold: boolean): Comp[] {
  const listings = obj(body)?.listings;
  if (!Array.isArray(listings)) return [];
  const out: Comp[] = [];
  for (const raw of listings) {
    const x = obj(raw);
    if (!x) continue;
    const price = num(x.price);
    const miles = num(x.miles);
    if (!price || miles === null) continue;
    const b = obj(x.build) ?? {};
    const d = obj(x.dealer) ?? {};
    const st = (str(x.seller_type) ?? "").toLowerCase();
    out.push({
      price, miles,
      year: num(b.year), trim: str(b.trim),
      sellerType: /dealer/.test(st) ? "dealer" : /private|fsbo/.test(st) ? "private" : "unknown",
      sold,
      url: safeHttpsUrl(x.vdp_url),
      city: str(d.city), state: str(d.state),
      daysOnMarket: num(x.dom),
      seen: str(x.last_seen_at_date)?.slice(0, 10) ?? null,
    });
  }
  return out;
}

/** Auto.dev `GET /listings?vehicle.make=…` → comps (for sale now, dealer retail). */
export function parseAutoDevComps(body: unknown): Comp[] {
  const data = obj(body)?.data;
  if (!Array.isArray(data)) return [];
  const out: Comp[] = [];
  for (const raw of data) {
    const x = obj(raw);
    if (!x) continue;
    const r = obj(x.retailListing);
    const v = obj(x.vehicle) ?? {};
    const price = num(r?.price);
    const miles = num(r?.miles);
    if (!r || !price || miles === null) continue;
    out.push({
      price, miles,
      year: num(v.year), trim: str(v.trim),
      sellerType: str(r.dealer) ? "dealer" : "unknown",
      sold: false,
      url: safeHttpsUrl(r.vdp),
      city: str(r.city), state: str(r.state),
      daysOnMarket: null,
      seen: null,
    });
  }
  return out;
}
