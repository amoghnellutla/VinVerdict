/**
 * Value from comparable cars ("comps"). Pure and browser-safe.
 *
 * Fits price against miles and model year on the comps (a weighted least-
 * squares line on log price, so "each 10k miles costs about 6%" rather than
 * a fixed dollar amount), then reads the value at this car's miles and year.
 * Falls back to the median of the closest comps when there are too few to
 * fit a line, or the line comes out backwards (more miles = more money).
 */

import type { SellerType } from "@/lib/listing/parse";

export type Comp = {
  price: number;
  miles: number;
  year: number | null;
  trim: string | null;
  sellerType: SellerType;
  /** true = sold (MarketCheck "recents?sold=true"), false = for sale now. */
  sold: boolean;
  url: string | null;
  city: string | null;
  state: string | null;
  daysOnMarket: number | null;
  /** When it was last seen listed (sold comps) as an ISO date. */
  seen: string | null;
  /** For-sale comps from Auto.dev: the car's VIN and listing photos (Auto.dev's photo host only). */
  vin?: string | null;
  photos?: string[];
};

export type CompTarget = { year: number | null; miles: number | null; trim: string | null };

export type CompEstimate = {
  value: number;
  /** Middle half of where comparable cars land (25th–75th percentile of the fit's errors). */
  low: number;
  high: number;
  /** Comps used after filtering. */
  n: number;
  method: "regression" | "median";
  /** Dollars per mile near this car's miles (negative). */
  perMile: number | null;
  /** Dollars per model year newer (positive). */
  perYear: number | null;
  /** True when this car's miles are well outside the comps' range, so the value is a stretch. */
  extrapolated: boolean;
  /** The comps closest to this car, for "similar cars" lists. */
  closest: Comp[];
};

const squash = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};
const round = (n: number, to = 50) => Math.round(n / to) * to;

/** Solve a small linear system (Gaussian elimination). Returns null if singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Weighted least squares: y ≈ X·beta. */
function wls(X: number[][], y: number[], w: number[]): number[] | null {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => Array(k).fill(0));
  const B = Array(k).fill(0);
  X.forEach((x, i) => {
    for (let r = 0; r < k; r++) {
      B[r] += w[i] * x[r] * y[i];
      for (let c = 0; c < k; c++) A[r][c] += w[i] * x[r] * x[c];
    }
  });
  return solve(A, B);
}

export function estimateFromComps(all: Comp[], t: CompTarget): CompEstimate | null {
  let comps = all.filter((c) => c.price >= 1_000 && c.price <= 300_000 && c.miles >= 0 && c.miles <= 500_000);
  if (t.year !== null) {
    const near = comps.filter((c) => c.year !== null && Math.abs(c.year - t.year!) <= 1);
    comps = near.length >= 6 ? near : comps.filter((c) => c.year === null || Math.abs(c.year - t.year!) <= 2);
  }
  // Drop price outliers (salvage specials, typos, $1 "call for price").
  if (comps.length >= 8) {
    const logs = comps.map((c) => Math.log(c.price));
    const q1 = quantile(logs, 0.25);
    const q3 = quantile(logs, 0.75);
    const lim = 1.5 * (q3 - q1);
    comps = comps.filter((c) => Math.log(c.price) >= q1 - lim && Math.log(c.price) <= q3 + lim);
  }
  if (comps.length < 3) return null;

  const trimKey = squash(t.trim);
  const weight = (c: Comp) => (trimKey && squash(c.trim).startsWith(trimKey) ? 1.5 : 1);
  const miles = t.miles;
  const year = t.year;
  const closest = [...comps]
    .sort((a, b) => score(a) - score(b))
    .slice(0, 6);
  function score(c: Comp) {
    return (miles === null ? 0 : Math.abs(c.miles - miles) / 10_000) + (year === null || c.year === null ? 0 : Math.abs(c.year - year) * 2) - (weight(c) - 1);
  }

  const mileList = comps.map((c) => c.miles);
  const minM = Math.min(...mileList);
  const maxM = Math.max(...mileList);
  const span = Math.max(maxM - minM, 1);
  const extrapolated = miles !== null && (miles > maxM + 0.25 * span || miles < minM - 0.25 * span);

  // Regression on log price: ln(p) = a + b·(miles/10k) + c·(year − target year).
  // Local: comps with miles near this car's count more (a Gaussian kernel), so a
  // 180k-mile car is priced mostly from high-mileage sales, not a line through 40k-mile ones.
  const useYear = year !== null && comps.every((c) => c.year !== null) && new Set(comps.map((c) => c.year)).size > 1;
  if (miles !== null && comps.length >= 8 && span >= 20_000) {
    const anchor = Math.min(Math.max(miles, minM), maxM); // nearest point inside the comps' range
    const bandwidth = Math.max(25_000, 0.35 * span);
    const X = comps.map((c) => (useYear ? [1, c.miles / 10_000, c.year! - year!] : [1, c.miles / 10_000]));
    const y = comps.map((c) => Math.log(c.price));
    const w = comps.map((c) => weight(c) * Math.exp(-(((c.miles - anchor) / bandwidth) ** 2)) + 0.02);
    const beta = wls(X, y, w);
    if (beta && beta[1] < 0) {
      // Beyond the comps, extend from the edge with the local slope, capped at 8% per 10k miles.
      const slope = Math.max(beta[1], -0.08);
      // (Tried 2026-11-09: shifting toward same-trim comps' residuals. Backtest got worse
      // on median error, 6.6% → 7.7%, so the trim only weights comps, above.)
      const lnHere = beta[0] + beta[1] * (anchor / 10_000) + slope * ((miles - anchor) / 10_000);
      const value = Math.exp(lnHere);
      const resid = comps.map((c, i) => y[i] - X[i].reduce((s, x, k) => s + x * beta[k], 0));
      const r25 = quantile(resid, 0.25);
      const r75 = quantile(resid, 0.75);
      return {
        value: round(value),
        low: round(value * Math.exp(Math.min(r25, -0.03))),
        high: round(value * Math.exp(Math.max(r75, 0.03))),
        n: comps.length,
        method: "regression",
        perMile: Math.round((value * beta[1]) / 10_000 * 1000) / 1000,
        perYear: useYear ? Math.round(value * (Math.exp(beta[2]) - 1)) : null,
        extrapolated,
        closest,
      };
    }
  }

  // Median of the closest comps (by miles and year).
  const pool = comps.length > 10 ? closest.concat([...comps].sort((a, b) => score(a) - score(b)).slice(6, 10)) : comps;
  const prices = pool.map((c) => c.price);
  return {
    value: round(median(prices)),
    low: round(quantile(prices, 0.25)),
    high: round(quantile(prices, 0.75)),
    n: comps.length,
    method: "median",
    perMile: null,
    perYear: null,
    extrapolated,
    closest,
  };
}
