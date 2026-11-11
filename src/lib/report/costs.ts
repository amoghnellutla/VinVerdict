/**
 * The cost panels' numbers as pure functions, so the page and the downloadable
 * report work them out the same way. Pure.
 */

import type { Analysis } from "@/lib/analyze";
import { guessWeightClass } from "@/lib/costs/nj";
import { outTheDoor, type OtdInput, type OtdResult } from "@/lib/costs/outTheDoor";
import { ownershipCost, type Ownership } from "@/lib/costs/ownership";
import { defaultMaintenance, FUEL_UNIT, yearlyRunningCost, type RunningCost } from "@/lib/costs/running";
import type { StateCode } from "@/lib/geo/zip";
import type { CompEstimate } from "@/lib/value/comps";
import type { ManualResult } from "@/lib/value/manual";
import type { Valuation } from "@/lib/value/estimate";

export const DEFAULT_INSPECTION = 175;

/** Out the door with the page's starting values: your saved state, the listed price and doc fee, a $175 inspection. */
export function defaultOtdInput(a: Analysis, state: StateCode): OtdInput | null {
  const price = a.listing.price;
  if (!price) return null;
  const seller = a.listing.sellerType === "private" ? "private" : "dealer";
  return {
    state,
    price,
    docFee: seller === "dealer" ? (a.listing.docFee ?? 0) : 0,
    seller,
    modelYear: a.decoded?.year ?? a.listing.year,
    localPct: 0,
    inspection: DEFAULT_INSPECTION,
    nj: { weightClass: guessWeightClass(a.decoded?.curbWeightLb ?? null, a.decoded?.body ?? null).value, financed: false },
    otherFees: 0,
  };
}

/** What owning it costs per year (the "Cost per year" panel). */
export function costPerYear(a: Analysis, valuation: Valuation | null, comps: CompEstimate | null, state: StateCode, years: number, milesPerYear: number): Ownership | null {
  const price = a.listing.price;
  if (!price) return null;
  const otd = outTheDoor({
    state,
    price,
    docFee: a.listing.docFee,
    seller: a.listing.sellerType === "private" ? "private" : "dealer",
    modelYear: a.decoded?.year ?? a.listing.year,
    inspection: 0,
    nj: { weightClass: guessWeightClass(a.decoded?.curbWeightLb ?? null, a.decoded?.body ?? null).value, financed: false },
  });
  const v = a.fuel?.vehicles[0];
  const fuelPrice = v && a.fuel?.prices ? a.fuel.prices[v.fuel] : 0;
  const running = v && fuelPrice > 0
    ? yearlyRunningCost({ vehicle: v, milesPerYear, fuelPrice, maintenancePerYear: defaultMaintenance(milesPerYear) }).total
    : null;
  return ownershipCost({
    price,
    taxAndFees: otd.total - price,
    years,
    milesPerYear,
    running,
    marketValue: valuation?.fair ?? price,
    perModelYear: comps?.perYear ?? null,
    perMile: comps?.perMile ?? null,
  });
}

export type RunningSnapshot = {
  label: string;
  mpg: string;
  milesPerYear: number;
  fuelPrice: number;
  unit: string;
  maintenance: number;
  cost: RunningCost;
};

/** Fuel and upkeep for one EPA version (the "Fuel and upkeep" panel), with the page's defaults unless given. */
export function runningFor(a: Analysis, pick = 0, milesPerYear: number, fuelPrice: number | null = null, maintenance: number | null = null): RunningSnapshot | null {
  const match = a.fuel;
  const v = match?.vehicles[Math.min(pick, (match?.vehicles.length ?? 1) - 1)];
  if (!match || !v) return null;
  const price = fuelPrice ?? (match.prices ? match.prices[v.fuel] : 0);
  const maint = maintenance ?? defaultMaintenance(milesPerYear);
  if (!(price > 0)) return null;
  const ev = v.fuel === "electric";
  return {
    label: v.label,
    mpg: `${v.comb} ${ev ? "MPGe" : "MPG"} combined (${v.city} city / ${v.hwy} highway)`,
    milesPerYear,
    fuelPrice: price,
    unit: FUEL_UNIT[v.fuel],
    maintenance: maint,
    cost: yearlyRunningCost({ vehicle: v, milesPerYear, fuelPrice: price, maintenancePerYear: maint }),
  };
}

/** What each cost panel last showed, kept for the report (lib/report/markdown.ts). */
export type CostParts = {
  otd?: { input: OtdInput; result: OtdResult };
  perYear?: { years: number; milesPerYear: number; state: StateCode; result: Ownership };
  running?: RunningSnapshot;
  manual?: { asking: number; prices: number[]; result: ManualResult };
};
