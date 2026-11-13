/**
 * "Walking a dealer lot": the cars scanned with the camera, kept on this device (3 days, up to
 * 30) and ranked, so you can compare them at a glance. Pure ranking; storage wrapped like the
 * other on-device stores (a blocked storage just means the list isn't kept).
 */

import type { Level } from "@/lib/decision";

export type LotCar = { vin: string; at: number; car?: string; verdict?: string; level?: Level; price?: number | null; recalls?: number | null };

const KEY = "vv-lot";
const KEEP_MS = 3 * 86_400_000;
const MAX = 30;

/** Best first: worth investigating, then not enough information, then check-this, then stop; then fewer recalls, then cheaper. */
const ORDER: Record<Level, number> = { investigate: 0, thin: 1, verify: 2, stop: 3 };
export function rankLot(cars: LotCar[]): LotCar[] {
  return [...cars].sort(
    (a, b) =>
      (a.level ? ORDER[a.level] : 9) - (b.level ? ORDER[b.level] : 9) ||
      (a.recalls ?? 99) - (b.recalls ?? 99) ||
      (a.price ?? Infinity) - (b.price ?? Infinity) ||
      b.at - a.at,
  );
}

export function loadLot(now = Date.now()): LotCar[] {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is LotCar => !!x && typeof x.vin === "string" && /^[A-HJ-NPR-Z0-9]{17}$/.test(x.vin) && typeof x.at === "number" && now - x.at < KEEP_MS).slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveLot(cars: LotCar[]): void {
  try {
    if (cars.length) globalThis.localStorage?.setItem(KEY, JSON.stringify(cars.slice(0, MAX)));
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Storage blocked: the list just isn't kept.
  }
}

/** Add a scanned VIN (newest first, no duplicates) or update what's known about one. */
export function upsertLot(cars: LotCar[], car: LotCar): LotCar[] {
  const old = cars.find((c) => c.vin === car.vin);
  return [{ ...old, ...car, at: old?.at ?? car.at }, ...cars.filter((c) => c.vin !== car.vin)].slice(0, MAX);
}
