import "server-only";
import { cacheLife } from "next/cache";
import { parseMenu, parsePrices, parseVehicle, pickModels, pickOptions, rankVariants, type FuelPrices, type FuelTarget, type FuelVehicle, type MenuItem } from "./parse";

/**
 * FuelEconomy.gov web services (EPA/DOE, free, no key). Server-only.
 * Everything is cached with "use cache": vehicle data is fixed per model year
 * (weeks), national fuel prices change weekly (days). One car costs at most
 * 1 + 4 + 8 calls the first time, then none.
 */

const API = "https://www.fueleconomy.gov/ws/rest";
const TIMEOUT_MS = 10_000;

export class FuelError extends Error {}

async function getJson(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VinVerdict/0.1" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new FuelError(`FuelEconomy.gov returned HTTP ${res.status} for ${url.pathname}`);
  const text = (await res.text()).trim();
  return text && text !== "null" ? JSON.parse(text) : null;
}

function assertYmm(year: number, make: string, model?: string) {
  if (!Number.isInteger(year) || year < 1984 || year > new Date().getFullYear() + 2) throw new FuelError(`Invalid year: ${year}`);
  if (!make.trim() || make.length > 40 || (model != null && (!model.trim() || model.length > 80))) throw new FuelError("Invalid make/model");
}

export async function getModelNames(year: number, make: string): Promise<string[]> {
  "use cache";
  cacheLife("weeks");
  assertYmm(year, make);
  return parseMenu(await getJson("/vehicle/menu/model", { year, make })).map((m) => m.value);
}

export async function getOptions(year: number, make: string, model: string): Promise<MenuItem[]> {
  "use cache";
  cacheLife("weeks");
  assertYmm(year, make, model);
  return parseMenu(await getJson("/vehicle/menu/options", { year, make, model }));
}

export async function getFuelVehicle(id: number, label: string): Promise<FuelVehicle | null> {
  "use cache";
  cacheLife("weeks");
  if (!Number.isInteger(id) || id <= 0) throw new FuelError(`Invalid id: ${id}`);
  return parseVehicle(await getJson(`/vehicle/${id}`), label);
}

/** National average prices: $/gallon, electricity $/kWh. */
export async function getFuelPrices(): Promise<FuelPrices | null> {
  "use cache";
  cacheLife("days");
  return parsePrices(await getJson("/fuelprices"));
}

export type FuelMatch = { vehicles: FuelVehicle[]; prices: FuelPrices | null };

/** EPA ratings for the car's likely variants, best match first. Null if none found. */
export async function findFuelEconomy(year: number, make: string, t: FuelTarget): Promise<FuelMatch | null> {
  const models = pickModels(await getModelNames(year, make), t);
  if (!models.length) return null;

  const optionLists = await Promise.all(models.map((m) => getOptions(year, make, m)));
  const picks = rankVariants(
    models.flatMap((m, i) => pickOptions(optionLists[i], t).map((o) => ({ id: Number(o.value), model: m, text: o.text, label: `${m} · ${o.text}` }))),
    t,
  ).slice(0, 8);

  const [vehicles, prices] = await Promise.all([
    Promise.all(picks.map((p) => getFuelVehicle(p.id, p.label))),
    getFuelPrices().catch(() => null),
  ]);
  const found = vehicles.filter((v): v is FuelVehicle => v != null);
  return found.length ? { vehicles: found, prices } : null;
}
