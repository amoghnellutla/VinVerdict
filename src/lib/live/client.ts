import "server-only";
import { cacheLife } from "next/cache";
import { parseAutoDevListing, parseMarketCheckListing, type LiveListing, type LiveSource } from "./parse";

/**
 * VIN → live listing (feature 2b). Server-only: the API keys never leave
 * the server. Costs quota, so it runs only when the user clicks the
 * lookup button (never automatically), and:
 *
 *   1. Auto.dev first: 1,000 free calls a month, and it has accident and
 *      owner history on about half of listings.
 *   2. MarketCheck only if Auto.dev doesn't have the VIN (500 a month).
 *
 * Each provider call is cached per VIN for about an hour (cacheLife
 * "hours"), so checking the same car again is free. Errors throw and are
 * not cached. On Vercel the cache is per server instance, so the daily cap
 * in the Server Action is the real quota guard.
 */

const TIMEOUT_MS = 10_000;

export class LiveLookupError extends Error {}

export type LiveLookup = {
  listing: LiveListing | null;
  /** Providers actually called (each one is one API call, unless cached). */
  tried: LiveSource[];
  /** False when no API key is set at all. */
  configured: boolean;
  /** Providers that failed (shown as a note; the other one may still answer). */
  failed: LiveSource[];
};

async function getJson(url: string, headers: Record<string, string>, source: LiveSource): Promise<unknown | null> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VinVerdict/0.1", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  // Never include the URL in errors: MarketCheck takes its key as a query parameter.
  if (!res.ok) throw new LiveLookupError(`${source} returned HTTP ${res.status}`);
  return res.json();
}

async function autoDevByVin(vin: string): Promise<LiveListing | null> {
  "use cache";
  cacheLife("hours");
  const key = process.env.AUTODEV_API_KEY;
  if (!key) return null;
  const body = await getJson(`https://api.auto.dev/listings/${encodeURIComponent(vin)}`, { Authorization: `Bearer ${key}` }, "Auto.dev");
  return body === null ? null : parseAutoDevListing(body, vin);
}

async function marketCheckByVin(vin: string): Promise<LiveListing | null> {
  "use cache";
  cacheLife("hours");
  const key = process.env.MARKETCHECK_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({ api_key: key, vin, rows: "1", car_type: "used" });
  const body = await getJson(`https://api.marketcheck.com/v2/search/car/active?${params}`, {}, "MarketCheck");
  return body === null ? null : parseMarketCheckListing(body, vin);
}

/** Caller must pass a VIN that passed checkVin(). */
export async function lookupLiveListing(vin: string, opts: { autoDevOnly?: boolean } = {}): Promise<LiveLookup> {
  const out: LiveLookup = { listing: null, tried: [], configured: false, failed: [] };
  const steps: [LiveSource, string | undefined, (v: string) => Promise<LiveListing | null>][] = [
    ["Auto.dev", process.env.AUTODEV_API_KEY, autoDevByVin],
    ["MarketCheck", opts.autoDevOnly ? undefined : process.env.MARKETCHECK_API_KEY, marketCheckByVin],
  ];
  for (const [source, key, fn] of steps) {
    if (!key) continue;
    out.configured = true;
    out.tried.push(source);
    try {
      out.listing = await fn(vin);
    } catch (err) {
      out.failed.push(source);
      console.error("live lookup failed", source, err instanceof Error ? err.message : "unknown error");
    }
    if (out.listing) break;
  }
  return out;
}
