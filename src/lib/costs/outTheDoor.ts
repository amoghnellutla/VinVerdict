/**
 * Out-the-door cost for the state where the buyer registers the car
 * (PLAN.md feature A): price + doc fee + car tax for that state (+ the local
 * rate the buyer typed) + title/registration + inspection. NJ fees are itemised;
 * other states use the fee amount the buyer enters from their DMV's site.
 */

import type { StateCode } from "@/lib/geo/zip";
import { njFeeLines, type CostLine, type WeightClass } from "./nj";
import { vehicleTax, type Seller } from "./stateTax";

export type { CostLine };

export type OtdInput = {
  state: StateCode;
  price: number;
  /** Dealer documentation fee: taxed like the price in most states. */
  docFee?: number | null;
  seller: Seller;
  modelYear: number | null;
  /** City/county rate in percent, where the state has one (0 if not entered). */
  localPct?: number;
  inspection: number;
  /** NJ only: drives the itemised MVC fees. */
  nj?: { weightClass: WeightClass; financed: boolean };
  /** Other states: title + registration total the buyer typed in. */
  otherFees?: number;
  now?: Date;
};

export type OtdResult = { lines: CostLine[]; total: number; notes: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function outTheDoor(i: OtdInput): OtdResult {
  const now = i.now ?? new Date();
  const docFee = i.docFee && i.docFee > 0 ? i.docFee : 0;
  const tax = vehicleTax(i.state, {
    taxable: i.price + docFee,
    price: i.price,
    seller: i.seller,
    modelYear: i.modelYear,
    localPct: i.localPct && i.localPct > 0 ? i.localPct : 0,
    now,
  });

  const lines: CostLine[] = [{ label: "Price", amount: i.price }];
  if (docFee) lines.push({ label: "Dealer doc fee", amount: docFee, note: "Negotiable; taxed like the price in most states" });
  lines.push(...tax.lines);

  if (i.state === "NJ") {
    lines.push(...njFeeLines({ modelYear: i.modelYear, weightClass: i.nj?.weightClass ?? "light", financed: i.nj?.financed ?? false, now }));
  } else if (i.otherFees && i.otherFees > 0) {
    lines.push({ label: "Title and registration", amount: i.otherFees, note: "Your entry, from your DMV's fee page" });
  }

  lines.push({ label: "Pre-purchase inspection", amount: i.inspection, note: "Usually $100–250, paid to your mechanic" });
  return { lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)), notes: tax.notes };
}
