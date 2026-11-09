import "server-only";
import { cacheLife } from "next/cache";
import { parseMarketCheckHistory, type HistoryRecord } from "./parse";

/**
 * VIN → every past online listing (MarketCheck History, 1 call, works on the
 * Free plan). Server-only: the key never leaves the server. Runs only from
 * the "Check price & history" button; cached a day per VIN, so re-checking
 * the same car is free. Errors throw and are not cached.
 */

const TIMEOUT_MS = 10_000;

export async function fetchVinHistory(vin: string): Promise<HistoryRecord[] | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 86_400, expire: 2 * 86_400 });
  const key = process.env.MARKETCHECK_API_KEY;
  if (!key) return null;
  const q = new URLSearchParams({ api_key: key });
  const res = await fetch(`https://api.marketcheck.com/v2/history/car/${encodeURIComponent(vin)}?${q}`, {
    headers: { Accept: "application/json", "User-Agent": "VinVerdict/0.1" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // No history at all comes back as 200 [] (or 404/422 on some VINs).
  if (res.status === 404 || res.status === 422) return [];
  // Never put the URL in errors: the key is a query parameter.
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseMarketCheckHistory(await res.json());
}
