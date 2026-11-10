/**
 * "Compare it yourself": the buyer types the asking prices of similar ads they
 * found (same model, close in year, miles and trim). Works with no lookup, so
 * it's always there when the free data runs out. It compares asking prices
 * only, and says how rough that is.
 */

export type ManualResult = {
  n: number;
  median: number;
  low: number;
  high: number;
  /** (asking − median) ÷ median. −0.2 = 20% below. */
  diff: number;
  verdict: "far-below" | "below" | "in-line" | "above";
  confidence: "very rough" | "rough" | "fair";
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Plausible car prices only ($500–$500,000); null with fewer than 2 or no asking price. */
export function compareManually(asking: number | null, prices: (number | null)[]): ManualResult | null {
  const ps = prices.filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p >= 500 && p <= 500_000);
  if (!asking || asking < 500 || ps.length < 2) return null;
  const med = median(ps);
  const diff = (asking - med) / med;
  return {
    n: ps.length,
    median: Math.round(med),
    low: Math.min(...ps),
    high: Math.max(...ps),
    diff: Math.round(diff * 1000) / 1000,
    verdict: diff <= -0.25 ? "far-below" : diff <= -0.08 ? "below" : diff < 0.08 ? "in-line" : "above",
    confidence: ps.length < 3 ? "very rough" : ps.length < 5 ? "rough" : "fair",
  };
}

/** "$9,000" or "9k" or "9000" → 9000. */
export function parsePrice(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!t) return null;
  const k = /^(\d+(?:\.\d+)?)k$/.exec(t);
  const n = k ? parseFloat(k[1]) * 1000 : /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}
