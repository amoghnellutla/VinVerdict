/**
 * In-app search results (Phase 7): parse MarketCheck listings, apply the
 * hard filters, and rank by value for money. Pure.
 *
 * "Value for money" = how far under its own fair value each car is, where
 * fair value comes from the other results (the comps engine at this car's
 * miles and year). Ties break on price per remaining mile.
 */

import { safeHttpsUrl } from "@/lib/live/parse";
import type { SellerType } from "@/lib/listing/parse";
import { estimateFromComps, type Comp } from "@/lib/value/comps";
import { dealLabel, type DealLabel } from "@/lib/value/estimate";

export type SearchResult = {
  vin: string | null;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number;
  miles: number;
  sellerType: SellerType;
  sellerName: string | null;
  city: string | null;
  state: string | null;
  distance: number | null;
  daysOnMarket: number | null;
  color: string | null;
  transmission: string | null;
  oneOwnerCarfax: boolean;
  source: string | null;
  url: string | null;
  /** Filled by rankResults. */
  fair: number | null;
  pctUnder: number | null;
  label: DealLabel | null;
  /** 30%+ under fair value: usually a branded title, damage or a scam, not a bargain (PLAN.md §6). */
  suspicious: boolean;
  pricePerRemainingMile: number;
};

export const TOO_CHEAP = 0.3;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 160) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

export const EXPECTED_LIFE_MILES = 200_000;

export function parseSearchListings(body: unknown, seller: "dealer" | "private"): SearchResult[] {
  const listings = obj(body)?.listings;
  if (!Array.isArray(listings)) return [];
  const out: SearchResult[] = [];
  for (const raw of listings) {
    const x = obj(raw);
    if (!x) continue;
    const price = num(x.price);
    const miles = num(x.miles);
    if (!price || price < 500 || miles === null) continue;
    const b = obj(x.build) ?? {};
    const d = obj(x.dealer) ?? {};
    const year = num(b.year);
    const make = str(b.make);
    const model = str(b.model);
    const trim = str(b.trim);
    const vin = str(x.vin);
    out.push({
      vin: vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin) ? vin.toUpperCase() : null,
      title: str(x.heading) ?? ([year, make, model, trim].filter(Boolean).join(" ") || "Car"),
      year, make, model, trim,
      price, miles,
      sellerType: seller,
      sellerName: seller === "dealer" ? str(d.name) : null,
      city: str(d.city) ?? str(x.city),
      state: str(d.state) ?? str(x.state),
      distance: num(x.dist),
      daysOnMarket: num(x.dom_active) ?? num(x.dom),
      color: str(x.base_ext_color) ?? str(x.exterior_color),
      transmission: str(b.transmission),
      oneOwnerCarfax: x.carfax_1_owner === true,
      source: str(x.source),
      url: safeHttpsUrl(x.vdp_url),
      fair: null, pctUnder: null, label: null, suspicious: false,
      pricePerRemainingMile: price / Math.max(20_000, EXPECTED_LIFE_MILES - miles),
    });
  }
  return out;
}

export type RankOptions = { automaticOnly: boolean; blackOnly?: boolean; preferBlack?: boolean };

export function rankResults(all: SearchResult[], o: RankOptions): SearchResult[] {
  // Same car listed twice (dealer site + marketplace): keep the cheaper one.
  const byVin = new Map<string, SearchResult>();
  const noVin: SearchResult[] = [];
  for (const r of all) {
    if (!r.vin) noVin.push(r);
    else if (!byVin.has(r.vin) || byVin.get(r.vin)!.price > r.price) byVin.set(r.vin, r);
  }
  let rows = [...byVin.values(), ...noVin];
  if (o.automaticOnly) rows = rows.filter((r) => !/manual/i.test(r.transmission ?? ""));
  if (o.blackOnly) rows = rows.filter((r) => /black/i.test(r.color ?? ""));

  const comps: Comp[] = rows.map((r) => ({
    price: r.price, miles: r.miles, year: r.year, trim: r.trim, sellerType: r.sellerType, sold: false,
    url: r.url, city: r.city, state: r.state, daysOnMarket: r.daysOnMarket, seen: null,
  }));
  for (const r of rows) {
    // Fair value from the *other* results of the same model, so a car can't vouch for itself.
    const others = comps.filter((c, i) => rows[i] !== r && rows[i].model === r.model);
    const e = estimateFromComps(others, { year: r.year, miles: r.miles, trim: r.trim });
    if (e) {
      r.fair = e.value;
      r.pctUnder = (e.value - r.price) / e.value;
      r.label = dealLabel(r.pctUnder);
      r.suspicious = r.pctUnder >= TOO_CHEAP;
    }
  }
  const boost = (r: SearchResult) => (o.preferBlack && /black/i.test(r.color ?? "") ? 0.02 : 0) + (r.oneOwnerCarfax ? 0.01 : 0);
  // Suspiciously cheap cars stay visible but don't outrank normal good deals.
  const score = (r: SearchResult) => (r.suspicious ? 0.05 : (r.pctUnder ?? -1)) + boost(r);
  return rows.sort((a, b) => {
    const pa = score(a);
    const pb = score(b);
    return pb - pa || a.pricePerRemainingMile - b.pricePerRemainingMile;
  });
}

/** Text handed to the checker for one result (via #listing=), so it gets the full analysis. */
export function resultAsListing(r: SearchResult): string {
  return [
    r.title,
    `Price: $${r.price.toLocaleString("en-US")}`,
    `Mileage: ${r.miles.toLocaleString("en-US")} miles`,
    r.vin ? `VIN: ${r.vin}` : null,
    r.transmission ? `Transmission: ${r.transmission}` : null,
    r.color ? `Exterior color: ${r.color}` : null,
    r.sellerType === "dealer" ? `Seller: ${r.sellerName ?? "Dealer"} (dealer)` : "Private seller",
    r.city ? `Location: ${r.city}${r.state ? `, ${r.state}` : ""}` : null,
    r.oneOwnerCarfax ? "CARFAX 1-Owner" : null,
    r.url ? `Source: ${r.url}` : null,
  ].filter(Boolean).join("\n");
}
