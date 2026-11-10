/**
 * What a price estimate is based on, in one line a buyer can judge: how many
 * similar cars, how close in year, miles and trim, and how recent. An outside
 * review asked for exactly this ("sample size, radius, mileage, trim match and
 * data freshness") so a range never looks more precise than its data.
 */

import type { Comp, CompTarget } from "./comps";

export type Basis = {
  ended: number;
  current: number;
  years: [number, number] | null;
  miles: [number, number] | null;
  /** Comps with the same trim as this car (null when this car's trim isn't known). */
  sameTrim: number | null;
  /** Oldest and newest dates the ended listings were last seen (ISO dates). */
  seen: [string, string] | null;
  radiusMiles: number;
  /** Plain-English cautions about the sample. */
  cautions: string[];
};

const RADIUS_MILES = 100;
const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const span = (xs: number[]): [number, number] | null => (xs.length ? [Math.min(...xs), Math.max(...xs)] : null);

export function priceBasis(comps: { sold: Comp[]; active: Comp[]; target: CompTarget }): Basis {
  const all = [...comps.sold, ...comps.active];
  const t = comps.target;
  const trim = norm(t.trim);
  const sameTrim = trim ? all.filter((c) => c.trim && (norm(c.trim) === trim || norm(c.trim).includes(trim) || trim.includes(norm(c.trim)))).length : null;
  const seenDates = comps.sold.map((c) => c.seen).filter((d): d is string => !!d && !Number.isNaN(Date.parse(d))).sort();
  const years = span(all.map((c) => c.year).filter((y): y is number => typeof y === "number"));
  const miles = span(all.map((c) => c.miles).filter((m) => m > 0));

  const cautions: string[] = [];
  if (all.length < 5) cautions.push("fewer than 5 similar cars, so treat the range as rough");
  if (t.miles != null && miles && (t.miles < miles[0] * 0.8 || t.miles > miles[1] * 1.2)) cautions.push("this car's miles are outside the range of the similar cars");
  if (sameTrim === 0 && all.length) cautions.push("none of the similar cars has the same trim");
  return {
    ended: comps.sold.length,
    current: comps.active.length,
    years,
    miles,
    sameTrim,
    seen: seenDates.length ? [seenDates[0].slice(0, 10), seenDates[seenDates.length - 1].slice(0, 10)] : null,
    radiusMiles: RADIUS_MILES,
    cautions,
  };
}

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Found 48 ended and 23 current listings within 100 miles: 2015–2017 models, 61k–132k miles, 9 with the same trim, ended listings last seen Aug 28 – Nov 10, 2026." */
export function basisText(b: Basis): string {
  const parts = [
    b.years && (b.years[0] === b.years[1] ? `${b.years[0]} models` : `${b.years[0]}–${b.years[1]} models`),
    b.miles && (b.miles[0] === b.miles[1] ? `${k(b.miles[0])} miles` : `${k(b.miles[0])}–${k(b.miles[1])} miles`),
    b.sameTrim != null && `${b.sameTrim} with the same trim`,
    b.seen && `ended listings last seen ${b.seen[0] === b.seen[1] ? short(b.seen[0]) : `${short(b.seen[0])} – ${short(b.seen[1])}`}`,
  ].filter(Boolean);
  const counts = [b.ended && `${b.ended} ended`, b.current && `${b.current} current`].filter(Boolean).join(" and ");
  return `Found ${counts || "no"} listing${b.ended + b.current === 1 ? "" : "s"} within ${b.radiusMiles} miles${parts.length ? `: ${parts.join(", ")}` : ""} (the estimate leaves out outliers).`;
}
