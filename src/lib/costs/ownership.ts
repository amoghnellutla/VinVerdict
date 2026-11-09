/**
 * True cost per year of owning the car (feature 5). Pure.
 *
 *   (price + tax and fees − what it's worth when you sell) ÷ years
 *   + fuel and maintenance per year
 *
 * Value lost per year comes from the local comps when there are enough:
 * the price difference for one model year newer, plus the price of the miles
 * you'll drive. Without comps it uses a typical 12%-a-year decline, and says so.
 * Insurance is left out on purpose: it depends on the driver, not the car.
 */

export type OwnershipInput = {
  /** What you pay for the car. */
  price: number;
  /** Out-the-door total minus the price: tax, title, registration, inspection. */
  taxAndFees: number;
  years: number;
  milesPerYear: number;
  /** Fuel + maintenance per year, if known. */
  running: number | null;
  /** Today's fair value (resale starts from here, not from the price you paid). */
  marketValue: number;
  /** From the comps: $ per model year newer (positive) and $ per mile (negative). */
  perModelYear: number | null;
  perMile: number | null;
};

export type Ownership = {
  perYear: number;
  perMonth: number;
  /** Value lost per year while you own it. */
  lostPerYear: number;
  /** Estimated value when you sell. */
  resale: number;
  taxAndFeesPerYear: number;
  running: number | null;
  method: "local-sales" | "typical";
};

export const TYPICAL_DECLINE = 0.12;
// Never assume it ends up worth less than this share of today's value: old cars level off.
const FLOOR = 0.15;

export function ownershipCost(i: OwnershipInput): Ownership {
  const years = Math.max(1, Math.min(10, Math.round(i.years)));
  const useComps = i.perModelYear !== null && i.perMile !== null && i.perModelYear > 0 && i.perMile < 0;
  let resale: number;
  if (useComps) {
    const lossPerYear = i.perModelYear! + -i.perMile! * i.milesPerYear;
    resale = i.marketValue - lossPerYear * years;
  } else {
    resale = i.marketValue * (1 - TYPICAL_DECLINE) ** years;
  }
  resale = Math.max(resale, i.marketValue * FLOOR);
  const lostPerYear = Math.max(0, (i.price - resale) / years);
  const taxAndFeesPerYear = Math.max(0, i.taxAndFees) / years;
  const perYear = lostPerYear + taxAndFeesPerYear + (i.running ?? 0);
  return {
    perYear: Math.round(perYear),
    perMonth: Math.round(perYear / 12),
    lostPerYear: Math.round(lostPerYear),
    resale: Math.round(resale),
    taxAndFeesPerYear: Math.round(taxAndFeesPerYear),
    running: i.running === null ? null : Math.round(i.running),
    method: useComps ? "local-sales" : "typical",
  };
}
