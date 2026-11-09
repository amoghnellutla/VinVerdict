/**
 * New Jersey MVC fees (PLAN.md feature A): title and registration. NJ is the
 * one state with a full fee breakdown; other states get an editable fee line
 * (see outTheDoor.ts). NJ sales tax is in stateTax.ts with the other states.
 *
 * Rates checked on 2026-11-08 against official NJ sources (links below).
 * Re-check them yearly. MVC says to confirm with its fee calculator.
 */

export const NJ_RATES = {
  asOf: "2026-11-08",
  /** On the purchase price of a new or used vehicle, since 2018-01-01. Private sales pay it at the MVC. */
  salesTaxRate: 0.06625,
  titleFee: 60,
  titleFeeOneLien: 85,
  /** Passenger "weight class 7/8" basic registration, per year. Plates are included. */
  registration: {
    light: { recent: 59, older: 46.5 },
    heavy: { recent: 84, older: 71.5 },
  },
  /** MVC splits weight classes at 3,500 lb (shipping weight). */
  weightSplitLb: 3500,
  inspection: { low: 100, high: 250 },
  sources: {
    salesTax: "https://www.nj.gov/treasury/taxation/moveqa.shtml",
    fees: "https://www.nj.gov/mvc/vehicles/regfees.htm",
    privateSale: "https://www.nj.gov/mvc/vehicles/preowntitle.htm",
  },
} as const;

export type WeightClass = "light" | "heavy";

export type CostLine = { label: string; amount: number; note?: string };

/**
 * "Within 2 years" on the MVC table: this model year or last year's (or next
 * year's). Older cars pay the lower rate.
 */
export function isRecentModel(modelYear: number | null, now = new Date()): boolean {
  return modelYear != null && modelYear >= now.getFullYear() - 1;
}

/** Weight class from curb weight if known, otherwise a body-type guess. */
export function guessWeightClass(curbWeightLb: number | null, body: string | null): { value: WeightClass; estimated: boolean } {
  if (curbWeightLb && curbWeightLb > 0) {
    return { value: curbWeightLb > NJ_RATES.weightSplitLb ? "heavy" : "light", estimated: false };
  }
  const heavyBody = /sport utility|suv|crossover|minivan|van|pickup|truck|wagon/i.test(body ?? "");
  return { value: heavyBody ? "heavy" : "light", estimated: true };
}

/** NJ MVC title + one year of registration. Sales tax lives in stateTax.ts. */
export function njFeeLines(i: { modelYear: number | null; weightClass: WeightClass; financed: boolean; now?: Date }): CostLine[] {
  const reg = NJ_RATES.registration[i.weightClass][isRecentModel(i.modelYear, i.now) ? "recent" : "older"];
  return [
    { label: i.financed ? "Title (with a lien)" : "Title", amount: i.financed ? NJ_RATES.titleFeeOneLien : NJ_RATES.titleFee },
    { label: "Registration, 1 year (plates included)", amount: reg, note: `${i.weightClass === "heavy" ? "Over" : "Under"} 3,500 lb` },
  ];
}
