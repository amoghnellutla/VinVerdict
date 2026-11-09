/**
 * Out-the-door cost for a used car bought and registered in New Jersey
 * (PLAN.md feature A). Pure, so the page recalculates instantly when you
 * change an input.
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

export type CostInput = {
  price: number;
  modelYear: number | null;
  weightClass: WeightClass;
  /** A lien means a car loan: the title fee goes up. */
  financed: boolean;
  /** Dealer documentation fee, if any (taxable in NJ, so it's added before tax). */
  docFee?: number | null;
  /** Who collects the sales tax: a dealer at sale, or the MVC for a private sale. */
  seller?: "private" | "dealer" | "unknown";
  inspection: number;
  now?: Date;
};

export type CostLine = { label: string; amount: number; note?: string };

export type CostBreakdown = { lines: CostLine[]; total: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

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

export function njOutTheDoor(i: CostInput): CostBreakdown {
  const docFee = i.docFee && i.docFee > 0 ? i.docFee : 0;
  const taxable = i.price + docFee;
  const reg = NJ_RATES.registration[i.weightClass][isRecentModel(i.modelYear, i.now) ? "recent" : "older"];

  const lines: CostLine[] = [{ label: "Price", amount: i.price }];
  if (docFee) lines.push({ label: "Dealer doc fee", amount: docFee, note: "Negotiable; taxed like the price" });
  lines.push(
    { label: "NJ sales tax (6.625%)", amount: round2(taxable * NJ_RATES.salesTaxRate), note: i.seller === "dealer" ? "Collected by the dealer" : i.seller === "private" ? "Private sale: paid at the MVC" : "Paid to the dealer, or at the MVC for a private sale" },
    {
      label: i.financed ? "Title (with a lien)" : "Title",
      amount: i.financed ? NJ_RATES.titleFeeOneLien : NJ_RATES.titleFee,
    },
    {
      label: "Registration, 1 year (plates included)",
      amount: reg,
      note: `${i.weightClass === "heavy" ? "Over" : "Under"} 3,500 lb`,
    },
    { label: "Pre-purchase inspection", amount: i.inspection, note: "Usually $100–250, paid to your mechanic" },
  );
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}
