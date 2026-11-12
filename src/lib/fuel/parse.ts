/**
 * FuelEconomy.gov (EPA/DOE) helpers: turn API replies into small objects and
 * pick the variants that match a car (PLAN.md feature C). Pure, no network;
 * the fetching lives in ./client.ts.
 *
 * Why matching is needed: NHTSA says "CR-V", FuelEconomy.gov lists "CR-V AWD"
 * and "CR-V FWD", each with several engines. We narrow by hybrid/EV, drive,
 * cylinders, engine size and manual vs. automatic, never to zero.
 */

export type FuelKind = "regular" | "midgrade" | "premium" | "diesel" | "electric" | "e85" | "cng";

export type FuelVehicle = {
  id: number;
  /** e.g. "Accord, Auto (AV-S7), 4 cyl, 2.4 L" */
  label: string;
  comb: number;
  city: number;
  hwy: number;
  /** kWh per 100 miles (EVs). */
  kwhPer100: number | null;
  fuel: FuelKind;
  /** "Hybrid", "EV", "Plug-in Hybrid", … or null. */
  atvType: string | null;
};

export type FuelPrices = Record<FuelKind, number>;

export type FuelTarget = {
  model: string;
  displacementL: number | null;
  cylinders: number | null;
  transmission: "automatic" | "manual" | "unknown";
  drive: "awd" | "2wd" | null;
  hybrid: boolean;
  electric: boolean;
  /** VIN-decoded trim ("LE"), to prefer "Camry LE/SE" over "Camry XSE". */
  trim?: string | null;
};

export type MenuItem = { text: string; value: string };

/** The API returns an array, a single object when there's one item, or null. */
export function parseMenu(body: unknown): MenuItem[] {
  const m = (body as { menuItem?: unknown } | null)?.menuItem;
  const list = Array.isArray(m) ? m : m ? [m] : [];
  return list.filter(
    (x): x is MenuItem => typeof (x as MenuItem)?.text === "string" && typeof (x as MenuItem)?.value === "string",
  );
}

export function fuelKind(fuelType: string): FuelKind {
  const f = fuelType.toLowerCase();
  if (f === "electricity") return "electric";
  if (f.startsWith("premium")) return "premium";
  if (f.startsWith("midgrade")) return "midgrade";
  if (f.startsWith("diesel")) return "diesel";
  if (f.startsWith("cng")) return "cng";
  return "regular"; // "Regular", "Gasoline or E85", "Regular Gas and Electricity", …
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function parseVehicle(body: unknown, label: string): FuelVehicle | null {
  const v = body as Record<string, unknown> | null;
  const id = num(v?.id);
  const comb = num(v?.comb08);
  if (!v || !id || !comb) return null;
  const kwh = num(v.combE);
  return {
    id,
    label,
    comb,
    city: num(v.city08),
    hwy: num(v.highway08),
    kwhPer100: kwh > 0 ? kwh : null,
    fuel: fuelKind(String(v.fuelType ?? "")),
    atvType: typeof v.atvType === "string" && v.atvType.trim() ? v.atvType.trim() : null,
  };
}

export function parsePrices(body: unknown): FuelPrices | null {
  const p = body as Record<string, unknown> | null;
  const regular = num(p?.regular);
  if (!p || !(regular > 0)) return null;
  const get = (k: string) => (num(p[k]) > 0 ? num(p[k]) : regular);
  return {
    regular,
    midgrade: get("midgrade"),
    premium: get("premium"),
    diesel: get("diesel"),
    e85: get("e85"),
    cng: get("cng"),
    electric: num(p.electric) > 0 ? num(p.electric) : 0.15,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// "\d{3}h": Lexus names its hybrids "RX 450h", "ES 300h".
const ELECTRIFIED = /\b(hybrid|plug in|phev|prime|ev|electric|fcv|fuel cell|energi|\d{3}h)\b/;
const AWD = /\b(awd|4wd|4x4)\b/;
const TWO_WD = /\b(2wd|fwd|rwd)\b/;

/** Keep `next` only if it isn't empty: each filter narrows, never to zero. */
const narrow = <T>(list: T[], keep: (x: T) => boolean) => {
  const next = list.filter(keep);
  return next.length ? next : list;
};

/** NHTSA drive text → awd / 2wd. */
export function driveOf(driveType: string | null): FuelTarget["drive"] {
  if (!driveType) return null;
  if (/4wd|awd|4x4|all[- ]wheel|four[- ]wheel/i.test(driveType)) return "awd";
  if (/4x2|fwd|rwd|2wd|front[- ]wheel|rear[- ]wheel/i.test(driveType)) return "2wd";
  return null;
}

/** FuelEconomy.gov model names for this car, best first (at most `max`). */
export function pickModels(names: string[], t: FuelTarget, max = 4): string[] {
  const base = norm(t.model);
  if (!base) return [];
  let list = names.filter((n) => norm(n) === base || norm(n).startsWith(base + " "));
  if (!list.length) return [];
  if (t.hybrid || t.electric) list = narrow(list, (n) => ELECTRIFIED.test(norm(n)));
  else list = narrow(list, (n) => !ELECTRIFIED.test(norm(n)));
  // An untagged name ("RAV4") is usually the 2WD one when an "RAV4 AWD" exists.
  if (t.drive === "awd") list = narrow(narrow(list, (n) => !TWO_WD.test(norm(n))), (n) => AWD.test(norm(n)));
  if (t.drive === "2wd") list = narrow(list, (n) => !AWD.test(norm(n)));
  // Names carrying the VIN's trim first ("Camry XLE/XSE" for an XLE), so the cut to `max` can't drop them;
  // then the shortest (the plainest name).
  const trim = t.trim ? norm(t.trim).split(" ")[0] : "";
  const withTrim = (n: string) => (trim && norm(n).split(" ").includes(trim) ? 0 : 1);
  return [...list].sort((a, b) => withTrim(a) - withTrim(b) || a.length - b.length).slice(0, max);
}

const cyl = (s: string) => Number(s.match(/(\d+) cyl/)?.[1] ?? NaN);
const displ = (s: string) => Number(s.match(/([\d.]+) L\b/)?.[1] ?? NaN);

/** Engine options ("Auto (AV-S7), 4 cyl, 2.4 L") that match the VIN decode. */
export function pickOptions(options: MenuItem[], t: FuelTarget, max = 4): MenuItem[] {
  let list = options;
  if (t.cylinders) list = narrow(list, (o) => cyl(o.text) === t.cylinders);
  if (t.displacementL) list = narrow(list, (o) => Math.abs(displ(o.text) - t.displacementL!) < 0.15);
  if (t.transmission !== "unknown") list = narrow(list, (o) => /^man/i.test(o.text) === (t.transmission === "manual"));
  return list.slice(0, max);
}

/**
 * Order the variants found across all model names, best match first. Each
 * name is filtered on its own, so "Camry" (V6 only) can survive next to the
 * right "Camry LE/SE · 4 cyl, 2.5 L": drop wrong engines when a right one
 * exists, then put names carrying the VIN's trim first.
 */
export function rankVariants<T extends { model: string; text: string }>(list: T[], t: FuelTarget): T[] {
  const kept = narrow(
    list,
    (x) => (!t.cylinders || cyl(x.text) === t.cylinders) && (!t.displacementL || Math.abs(displ(x.text) - t.displacementL) < 0.15),
  );
  const trim = t.trim ? norm(t.trim).split(" ")[0] : "";
  const hasTrim = (x: T) => (trim && norm(x.model).split(" ").includes(trim) ? 0 : 1);
  return [...kept].sort((a, b) => hasTrim(a) - hasTrim(b));
}
