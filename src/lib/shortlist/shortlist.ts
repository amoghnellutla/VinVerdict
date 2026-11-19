/**
 * Shortlist (Phase 6): which model years owners complained about most. Pure.
 *
 * Data: NHTSA's complete owner-complaint and recall files, per model year
 * (tools/build_shortlist.py → data.json): about 300 models with enough
 * complaints to compare their years, 15 of them listed in the guide. Raw counts favour newer cars (fewer years on the road to
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
  /** NHTSA recalls for this model year, how many say "don't drive it until fixed", and how many say "park it outside until fixed". */
  recalls: number;
  parkIt: number;
  parkOutside: number;
  knownIssues: { title: string; url: string; label: string }[];
  /** NHTSA's overall crash-test stars for this year (low and high when its versions were rated differently). */
  stars: Stars | null;
  /** Defect investigations NHTSA opened into this year, newest first. */
  investigations: Investigation[];
};

export type Stars = { low: number; high: number };
/** closed: the year it was closed, or null while it's open; recall: the recall it led to, if any. */
export type Investigation = { id: string; subject: string; opened: number; closed: number | null; recall: string | null };

export type ShortlistModel = {
  make: string;
  /** Display name ("ES" rather than NHTSA's "ES350"). */
  model: string;
  body: string;
  years: ShortlistYear[];
  /** Years to look at first: fewer complaints than usual and no known issue. */
  best: number[];
  /** Years to be careful with: many owner reports, a known issue, or a "don't drive" / "park outside" recall to confirm was fixed. */
  careful: number[];
};

/** data.json, packed: per model one row per year from firstYear, [complaints, crashes, recalls, parkIt, parkOutside,
 * area, count, area, count…] with areas as indexes, and 0 for a year with nothing on file. */
type Packed = {
  generated: string;
  source: string;
  firstYear: number;
  areas: string[];
  models: PackedModel[];
};
type PackedModel = {
  make: string;
  model: string;
  nhtsa: string;
  rows: (number[] | 0)[];
  guide?: boolean;
  body?: string;
  /** Per year: 0 (not rated), the stars, or [low, high]. */
  stars?: (number | number[])[];
  /** [id, subject, opened, closed (0 = open), recall or "", year indexes]. */
  inv?: (string | number | number[])[][];
};
const packed = data as Packed;

export type YearRow = {
  year: number;
  complaints: number;
  crashes: number;
  top: { component: string; count: number }[];
  recalls: number;
  parkIt: number;
  parkOutside: number;
  stars?: Stars | null;
  investigations?: Investigation[];
};

/** One packed model's years, unpacked (with its crash stars and investigations when given). */
export function unpack(rows: (number[] | 0)[], firstYear = packed.firstYear, areas = packed.areas, extra: Pick<PackedModel, "stars" | "inv"> = {}): YearRow[] {
  const inv = (extra.inv ?? []).map(([id, subject, opened, closed, recall, years]) => ({
    years: years as number[],
    v: { id: id as string, subject: subject as string, opened: opened as number, closed: (closed as number) || null, recall: (recall as string) || null },
  }));
  return rows.map((r, i) => {
    const year = firstYear + i;
    const st = extra.stars?.[i];
    const stars = !st ? null : Array.isArray(st) ? { low: st[0], high: st[1] } : { low: st, high: st };
    const investigations = inv.filter((x) => x.years.includes(i)).map((x) => x.v);
    if (r === 0) return { year, complaints: 0, crashes: 0, top: [], recalls: 0, parkIt: 0, parkOutside: 0, stars, investigations };
    const top: YearRow["top"] = [];
    for (let j = 5; j + 1 < r.length; j += 2) top.push({ component: areas[r[j]], count: r[j + 1] });
    return { year, complaints: r[0], crashes: r[1], top, recalls: r[2], parkIt: r[3], parkOutside: r[4], stars, investigations };
  });
}

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
  rows: (Omit<YearRow, "recalls" | "parkIt" | "parkOutside"> & Partial<Pick<YearRow, "recalls" | "parkIt" | "parkOutside">>)[],
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
    parkOutside: r.parkOutside ?? 0,
    stars: r.stars ?? null,
    investigations: r.investigations ?? [],
    knownIssues: KNOWN_ISSUES.filter((k) => k.make === make.toLowerCase())
      .filter((k) => Object.entries(k.fits).some(([m, [a, b]]) => m === key && r.year >= a && r.year <= b))
      .map((k) => ({ title: k.title, url: k.source.url, label: k.source.label })),
  }));
}

function build(m: PackedModel, now: Date): ShortlistModel {
  const years = rateYears(unpack(m.rows, packed.firstYear, packed.areas, m), m.make, m.model, now);
  return {
    make: m.make,
    model: m.model,
    body: m.body ?? "",
    years,
    best: years.filter((y) => y.rating === "fewer" && !y.sparse && !y.knownIssues.length).map((y) => y.year),
    careful: years.filter((y) => y.rating === "many" || y.knownIssues.length || y.parkIt > 0 || y.parkOutside > 0).map((y) => y.year),
  };
}

/** The guide: the models listed on the Shortlist page. */
export function shortlist(now = new Date()): ShortlistModel[] {
  return packed.models.filter((m) => m.guide).map((m) => build(m, now));
}

/** Every model with enough owner complaints to compare its years (the guide's and about 285 more), for matching a
 * saved car. Rated per make only when asked for, so a lookup for one car doesn't rate them all. */
export function allModels(now = new Date(), make?: string | null): ShortlistModel[] {
  const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return packed.models.filter((m) => !make || k(m.make) === k(make)).map((m) => build(m, now));
}
