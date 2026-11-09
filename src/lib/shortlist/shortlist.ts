/**
 * Shortlist (Phase 6): which model years owners complained about most. Pure.
 *
 * Data: NHTSA owner complaints per model year (tools/build_shortlist.py →
 * data.json). Raw counts favour newer cars (fewer years on the road to
 * complain), so years are compared by complaints per year on the road,
 * within the same model. A year is flagged when it's well above (or below)
 * that model's typical rate. Complaint counts also grow with how many were
 * sold, so this compares years of one model, not models with each other.
 */

import { KNOWN_ISSUES } from "@/lib/inspection";
import data from "./data.json";

export type YearRating = "fewer" | "typical" | "many";

export type ShortlistYear = {
  year: number;
  complaints: number;
  crashes: number;
  perYearOnRoad: number;
  rating: YearRating;
  /** Too few complaints to judge (often a gap in NHTSA's data, or very few sold). Never counted as "best". */
  sparse: boolean;
  topArea: string | null;
  /** NHTSA recalls for this model year, and how many say "don't drive / park outside until fixed". */
  recalls: number;
  parkIt: number;
  knownIssues: { title: string; url: string; label: string }[];
};

export type ShortlistModel = {
  make: string;
  /** Display name ("ES" rather than NHTSA's "ES350"). */
  model: string;
  body: string;
  years: ShortlistYear[];
  /** Years to look at first: fewer complaints than usual and no known issue. */
  best: number[];
  /** Years to be careful with: many complaints, a known issue, or a "park it" recall to confirm was fixed. */
  careful: number[];
};

export const SHORTLIST_SOURCE = data.source;
export const SHORTLIST_DATE = data.generated;

const MANY = 1.8;
const FEWER = 0.6;
const SPARSE = 0.15;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};

export function rateYears(
  rows: { year: number; complaints: number; crashes: number; top: { component: string; count: number }[]; recalls?: number; parkIt?: number }[],
  make: string,
  nhtsaModel: string,
  now = new Date(),
): ShortlistYear[] {
  const thisYear = now.getFullYear();
  // No complaints at all almost always means the model wasn't sold that year (e.g. HR-V before 2016).
  const sold = rows.filter((r) => r.complaints > 0);
  const rawTypical = median(sold.map((r) => r.complaints));
  const withRate = sold.map((r) => ({ ...r, perYearOnRoad: r.complaints / Math.max(1, thisYear - r.year + 1) }));
  const typical = median(withRate.map((r) => r.perYearOnRoad));
  const key = nhtsaModel.replace(/ ?\d{3}h?$/i, "").toLowerCase();
  return withRate.map((r) => ({
    year: r.year,
    complaints: r.complaints,
    crashes: r.crashes,
    perYearOnRoad: Math.round(r.perYearOnRoad * 10) / 10,
    rating: typical > 0 && r.perYearOnRoad >= MANY * typical ? "many" : typical > 0 && r.perYearOnRoad <= FEWER * typical ? "fewer" : "typical",
    sparse: r.complaints < Math.max(5, SPARSE * rawTypical),
    topArea: r.top[0]?.component ?? null,
    recalls: r.recalls ?? 0,
    parkIt: r.parkIt ?? 0,
    knownIssues: KNOWN_ISSUES.filter((k) => k.make === make.toLowerCase())
      .filter((k) => Object.entries(k.fits).some(([m, [a, b]]) => m === key && r.year >= a && r.year <= b))
      .map((k) => ({ title: k.title, url: k.source.url, label: k.source.label })),
  }));
}

export function shortlist(now = new Date()): ShortlistModel[] {
  return data.models.map((m) => {
    const years = rateYears(m.years, m.make, m.model, now);
    return {
      make: m.make,
      model: m.model.replace(/ ?\d{3}h?$/i, ""),
      body: m.body,
      years,
      best: years.filter((y) => y.rating === "fewer" && !y.sparse && !y.knownIssues.length).map((y) => y.year),
      careful: years.filter((y) => y.rating === "many" || y.knownIssues.length || y.parkIt > 0).map((y) => y.year),
    };
  });
}
