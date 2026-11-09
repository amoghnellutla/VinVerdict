import "server-only";
import { cacheLife } from "next/cache";
import { parseSearchListings, type SearchResult } from "./rank";

/**
 * In-app search (Phase 7) through MarketCheck. Server-only. Each distinct
 * search is cached for a day ("use cache"), so repeating it is free.
 * Free plan limits: 100-mile radius, 50 results per call.
 */

export type SearchFilters = {
  make: string;
  model: string;
  minYear: number;
  maxYear: number;
  maxPrice: number | null;
  maxMiles: number | null;
  zip: string;
  radius: number;
};

const DAY = 86_400;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "VinVerdict/0.1" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`); // never the URL: it holds the key
  return res.json();
}

function params(f: SearchFilters, key: string): URLSearchParams {
  const years = [];
  for (let y = f.minYear; y <= f.maxYear; y++) years.push(y);
  const q = new URLSearchParams({
    api_key: key, make: f.make.toLowerCase(), model: f.model.toLowerCase(), year: years.join(","),
    zip: f.zip, radius: String(Math.min(100, f.radius)), rows: "50",
  });
  if (f.maxPrice) q.set("price_range", `0-${f.maxPrice}`);
  if (f.maxMiles) q.set("miles_range", `0-${f.maxMiles}`);
  return q;
}

export async function searchDealers(f: SearchFilters): Promise<SearchResult[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: DAY, expire: 2 * DAY });
  const key = process.env.MARKETCHECK_API_KEY;
  if (!key) throw new Error("MARKETCHECK_API_KEY is not set");
  const q = params(f, key);
  q.set("car_type", "used");
  return parseSearchListings(await getJson(`https://api.marketcheck.com/v2/search/car/active?${q}`), "dealer");
}

export async function searchPrivate(f: SearchFilters): Promise<SearchResult[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: DAY, expire: 2 * DAY });
  const key = process.env.MARKETCHECK_API_KEY;
  if (!key) throw new Error("MARKETCHECK_API_KEY is not set");
  return parseSearchListings(await getJson(`https://api.marketcheck.com/v2/search/car/fsbo/active?${params(f, key)}`), "private");
}
