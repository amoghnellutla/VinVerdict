import "server-only";
import { cacheLife } from "next/cache";
import { estimateFromComps, type Comp, type CompTarget } from "./comps";
import type { PriceSources } from "./estimate";
import { parseAutoDevComps, parseMarketCheckComps } from "./parse";

/**
 * Fetch the three price sources (feature 2, PLAN.md §5). Server-only: keys
 * never leave the server. Quota per check, each cached for a day so the same
 * car or model again is free:
 *   - MarketCheck Price (needs a VIN): 1 MarketCheck call
 *   - Recently sold nearby (MarketCheck recents?sold=true): 1 MarketCheck call
 *   - For sale now nearby (Auto.dev listings): 1 Auto.dev call
 * A failed source is skipped; the others still answer.
 */

const TIMEOUT_MS = 12_000;
const DAY = 86_400;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VinVerdict/0.1", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Never put the URL in errors: MarketCheck's key is a query parameter.
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function marketCheckPrice(vin: string, milesRounded: number, zip: string): Promise<number | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: DAY, expire: 2 * DAY });
  const key = process.env.MARKETCHECK_API_KEY;
  if (!key) return null;
  const q = new URLSearchParams({ api_key: key, vin, miles: String(milesRounded), dealer_type: "independent", zip });
  const body = (await getJson(`https://api.marketcheck.com/v2/predict/car/us/marketcheck_price?${q}`)) as { marketcheck_price?: unknown };
  const p = typeof body?.marketcheck_price === "number" ? body.marketcheck_price : null;
  return p && p > 500 && p < 1_000_000 ? Math.round(p) : null;
}

async function soldNearby(year: number, make: string, model: string, zip: string): Promise<Comp[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: DAY, expire: 2 * DAY });
  const key = process.env.MARKETCHECK_API_KEY;
  if (!key) return [];
  const q = new URLSearchParams({
    api_key: key, year: [year - 1, year, year + 1].join(","), make, model, zip,
    radius: "100", rows: "50", car_type: "used", sold: "true",
  });
  return parseMarketCheckComps(await getJson(`https://api.marketcheck.com/v2/search/car/recents?${q}`), true);
}

async function forSaleNearby(year: number, make: string, model: string, zip: string): Promise<Comp[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: DAY, expire: 2 * DAY });
  const key = process.env.AUTODEV_API_KEY;
  if (!key) return [];
  const q = new URLSearchParams({ "vehicle.make": make, "vehicle.model": model, "vehicle.year": String(year), zip, distance: "100" });
  return parseAutoDevComps(await getJson(`https://api.auto.dev/listings?${q}`, { Authorization: `Bearer ${key}` }));
}

/** MarketCheck's sold-price model alone (owner checks whose miles were only found during the lookup). */
export async function fetchPredicted(vin: string, miles: number, zip: string): Promise<number | null> {
  try {
    return await marketCheckPrice(vin, Math.round(miles / 1000) * 1000, zip);
  } catch {
    return null;
  }
}

export type PriceCar = { vin: string | null; year: number; make: string; model: string; trim: string | null; miles: number | null; zip: string };

export type PriceCheck = PriceSources & {
  /** Sources that failed (shown as a note). */
  failed: string[];
  /** Real API calls made, roughly (cached answers cost nothing). */
  calls: number;
};

export async function fetchPriceSources(car: PriceCar, opts: { skipPriceModel?: boolean } = {}): Promise<PriceCheck> {
  const target: CompTarget = { year: car.year, miles: car.miles, trim: car.trim };
  const failed: string[] = [];
  const make = car.make.toLowerCase();
  const model = car.model.toLowerCase();
  const [p, s, a] = await Promise.allSettled([
    car.vin && car.miles !== null && !opts.skipPriceModel ? marketCheckPrice(car.vin, Math.round(car.miles / 1000) * 1000, car.zip) : Promise.resolve(null),
    soldNearby(car.year, make, model, car.zip),
    forSaleNearby(car.year, make, model, car.zip),
  ]);
  if (p.status === "rejected") failed.push("MarketCheck Price");
  if (s.status === "rejected") failed.push("recently ended listings");
  if (a.status === "rejected") failed.push("listings for sale");
  for (const r of [p, s, a]) if (r.status === "rejected") console.error("price source failed", r.reason instanceof Error ? r.reason.message : "unknown");
  const soldComps = s.status === "fulfilled" ? s.value : [];
  const days = soldComps.map((c) => c.daysOnMarket).filter((d): d is number => typeof d === "number" && d > 0 && d < 400).sort((x, y) => x - y);
  return {
    marketDays: days.length >= 5 ? days[days.length >> 1] : null,
    predicted: p.status === "fulfilled" ? p.value : null,
    sold: s.status === "fulfilled" ? estimateFromComps(s.value, target) : null,
    active: a.status === "fulfilled" ? estimateFromComps(a.value, target) : null,
    zip: car.zip,
    comps: {
      sold: s.status === "fulfilled" ? s.value : [],
      active: a.status === "fulfilled" ? a.value : [],
      target,
    },
    failed,
    calls: (car.vin && car.miles !== null && !opts.skipPriceModel ? 1 : 0) + 2,
  };
}
