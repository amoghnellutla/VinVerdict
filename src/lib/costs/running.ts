/**
 * Yearly running cost (PLAN.md feature C): fuel from the EPA combined rating
 * plus maintenance, repairs and tires. Pure, so the page recalculates as you
 * type. Insurance is not included (it depends on the driver, not the car).
 */

import type { FuelKind, FuelVehicle } from "@/lib/fuel/parse";

/**
 * AAA "Your Driving Costs" 2025: maintenance, repair & tires averaged
 * 11.04¢/mile (new cars, first 5 years / 75,000 miles). Older cars usually
 * cost more, so the page treats it as a floor you can raise.
 */
export const AAA_MAINTENANCE = {
  centsPerMile: 11.04,
  year: 2025,
  source: "https://newsroom.aaa.com/wp-content/uploads/2025/09/UPDATE-AAA-Fact-Sheet-Your-Driving-Cost-9.2025-1.pdf",
} as const;

export const FUEL_SOURCE = "https://www.fueleconomy.gov/";
export const DEFAULT_MILES_PER_YEAR = 12_000;

export const FUEL_UNIT: Record<FuelKind, string> = {
  regular: "gallon of regular",
  midgrade: "gallon of midgrade",
  premium: "gallon of premium",
  diesel: "gallon of diesel",
  e85: "gallon of E85",
  cng: "gallon-equivalent of CNG",
  electric: "kWh",
};

export type RunningInput = {
  vehicle: Pick<FuelVehicle, "comb" | "kwhPer100" | "fuel">;
  milesPerYear: number;
  /** $ per gallon, or $ per kWh for an EV. */
  fuelPrice: number;
  maintenancePerYear: number;
};

export type RunningCost = { fuel: number; maintenance: number; total: number; perMonth: number; centsPerMile: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function defaultMaintenance(milesPerYear: number): number {
  return Math.round((milesPerYear * AAA_MAINTENANCE.centsPerMile) / 100);
}

export function yearlyRunningCost(i: RunningInput): RunningCost {
  const miles = Math.max(0, i.milesPerYear);
  const ev = i.vehicle.fuel === "electric" && i.vehicle.kwhPer100;
  const fuel = ev ? (miles * i.vehicle.kwhPer100!) / 100 * i.fuelPrice : i.vehicle.comb > 0 ? (miles / i.vehicle.comb) * i.fuelPrice : 0;
  const maintenance = Math.max(0, i.maintenancePerYear);
  const total = fuel + maintenance;
  return {
    fuel: r2(fuel),
    maintenance: r2(maintenance),
    total: r2(total),
    perMonth: r2(total / 12),
    centsPerMile: miles > 0 ? r2((total / miles) * 100) : 0,
  };
}
