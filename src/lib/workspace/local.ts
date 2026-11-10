/**
 * "My list": cars a visitor saves on their own device (localStorage), with no
 * account and nothing on a server. Text only: the listing they pasted (so it
 * can be checked again), what VinVerdict concluded, their answers and notes.
 *
 * Anything read back (from storage or an imported file) is validated field by
 * field and capped, because a file can be edited by anyone. Everything is
 * rendered as plain text.
 */

import type { AreaStatus, Level } from "@/lib/decision";

export const WORKSPACE_KEY = "vv-workspace-v1";
export const MAX_CARS = 20;
const MAX_TEXT = 20_000;
const MAX_LINE = 300;
const MAX_IMPORT_BYTES = 1_000_000;

const LEVELS: Level[] = ["stop", "verify", "investigate", "thin"];
const STATUSES: AreaStatus[] = ["stop", "verify", "ok", "unchecked"];
const AREAS = ["listing", "car", "price", "deal"] as const;

export type SavedCar = {
  id: string;
  savedAt: string;
  title: string;
  /** What was pasted, so it can be checked again. */
  text: string;
  vin: string | null;
  price: number | null;
  miles: number | null;
  level: Level;
  verdict: string;
  areas: { area: (typeof AREAS)[number]; status: AreaStatus; line: string }[];
  /** Still-unknown items across the four areas. */
  unknown: number;
  /** The most serious findings, by title. */
  warnings: string[];
  /** The buyer's own note. */
  note: string;
};

export type Workspace = { version: 1; cars: SavedCar[] };

const str = (v: unknown, max: number): string | null => (typeof v === "string" ? v.slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 10_000_000 ? Math.round(v) : null);

/** One saved car from untrusted data, or null if it isn't one. */
export function parseCar(raw: unknown): SavedCar | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 64);
  const title = str(r.title, MAX_LINE);
  const text = str(r.text, MAX_TEXT);
  const level = LEVELS.includes(r.level as Level) ? (r.level as Level) : null;
  const savedAt = str(r.savedAt, 40);
  if (!id || !/^[a-z0-9-]+$/i.test(id) || !title || text == null || !level || !savedAt || Number.isNaN(Date.parse(savedAt))) return null;
  const vin = str(r.vin, 17);
  const areas = Array.isArray(r.areas)
    ? r.areas.flatMap((x) => {
        const a = x as Record<string, unknown>;
        const area = AREAS.find((k) => k === a?.area);
        const status = STATUSES.find((k) => k === a?.status);
        const line = str(a?.line, MAX_LINE);
        return area && status && line != null ? [{ area, status, line }] : [];
      }).slice(0, 4)
    : [];
  return {
    id, savedAt, title, text, level,
    vin: vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null,
    price: num(r.price),
    miles: num(r.miles),
    verdict: str(r.verdict, MAX_LINE) ?? "",
    areas,
    unknown: num(r.unknown) ?? 0,
    warnings: Array.isArray(r.warnings) ? r.warnings.flatMap((w) => (typeof w === "string" ? [w.slice(0, MAX_LINE)] : [])).slice(0, 5) : [],
    note: str(r.note, 2000) ?? "",
  };
}

/** A whole workspace from untrusted data (storage or an imported file). Bad entries are dropped. */
export function parseWorkspace(raw: unknown): Workspace {
  const cars = raw && typeof raw === "object" && Array.isArray((raw as { cars?: unknown }).cars) ? (raw as { cars: unknown[] }).cars : [];
  const seen = new Set<string>();
  const out: SavedCar[] = [];
  for (const c of cars) {
    const car = parseCar(c);
    if (car && !seen.has(car.id)) {
      seen.add(car.id);
      out.push(car);
    }
    if (out.length >= MAX_CARS) break;
  }
  return { version: 1, cars: out };
}

/** A stable id for a car: its VIN, else a short hash of what was pasted. */
export function carId(vin: string | null, text: string): string {
  if (vin) return `vin-${vin.toLowerCase()}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `ad-${h.toString(36)}`;
}

/** Adds or replaces a car (newest first), keeping at most MAX_CARS. */
export function upsert(w: Workspace, car: SavedCar): Workspace {
  const rest = w.cars.filter((c) => c.id !== car.id);
  const note = w.cars.find((c) => c.id === car.id)?.note ?? car.note;
  return { version: 1, cars: [{ ...car, note }, ...rest].slice(0, MAX_CARS) };
}

export function remove(w: Workspace, id: string): Workspace {
  return { version: 1, cars: w.cars.filter((c) => c.id !== id) };
}

export function setNote(w: Workspace, id: string, note: string): Workspace {
  return { version: 1, cars: w.cars.map((c) => (c.id === id ? { ...c, note: note.slice(0, 2000) } : c)) };
}

/** Reads an exported file; null if it's too big or not JSON. */
export function importFile(text: string): Workspace | null {
  if (text.length > MAX_IMPORT_BYTES) return null;
  try {
    return parseWorkspace(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Merges imported cars into the current list; the current copy of a car wins. */
export function merge(current: Workspace, incoming: Workspace): Workspace {
  const ids = new Set(current.cars.map((c) => c.id));
  return { version: 1, cars: [...current.cars, ...incoming.cars.filter((c) => !ids.has(c.id))].slice(0, MAX_CARS) };
}

/**
 * Saved ads that may be the same car: the same model and year, and miles within
 * 2% (or the same VIN). Relisted and cross-posted cars are common and not proof
 * of anything, but a different price, seller or story for the same car is worth
 * asking about.
 */
export function maybeSameCar(cars: SavedCar[]): { a: SavedCar; b: SavedCar; why: string }[] {
  const out: { a: SavedCar; b: SavedCar; why: string }[] = [];
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.vin && b.vin && a.vin === b.vin) {
        out.push({ a, b, why: "same VIN" });
      } else if (
        a.title.toLowerCase() === b.title.toLowerCase() && a.miles && b.miles &&
        Math.abs(a.miles - b.miles) <= Math.max(500, a.miles * 0.02)
      ) {
        out.push({ a, b, why: `same model, ${a.miles.toLocaleString("en-US")} vs ${b.miles.toLocaleString("en-US")} miles` });
      }
    }
  }
  return out;
}

// ----- Browser storage (wrapped: private windows and blocked storage throw) -----

export function load(): Workspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    return raw ? parseWorkspace(JSON.parse(raw)) : { version: 1, cars: [] };
  } catch {
    return { version: 1, cars: [] };
  }
}

/** Saves; false when the browser won't store it (private mode, storage full). */
export function save(w: Workspace): boolean {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(w));
    window.dispatchEvent(new Event("vv-workspace"));
    return true;
  } catch {
    return false;
  }
}
