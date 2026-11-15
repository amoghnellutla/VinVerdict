/**
 * The paper's own arithmetic: do the lines read add up to a total the paper states? When they do, the reading
 * is confirmed (a misread line would break the sum). When they don't, either a line was misread or the paper is
 * wrong: the checks say "check this" unless a second reader (the AI) agrees on every line.
 */

import { CHARGE_KINDS, type DealLine, type LineKind } from "./parse";

export type Reconcile = {
  /** Charges minus credits, the ways papers total them. */
  sums: { label: string; amount: number }[];
  /** The paper's totals and whether one of the sums matches each. */
  totals: { label: string; amount: number; kind: LineKind; matches: string | null }[];
  /** At least one total matches: the reading adds up. */
  confirmed: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const CENTS = 1.01;

export function reconcile(lines: DealLine[]): Reconcile {
  const live = lines.filter((l) => !l.declined && !l.fromAi && !l.inPrice);
  const sum = (kinds: readonly LineKind[]) => r2(live.filter((l) => kinds.includes(l.kind)).reduce((s, l) => s + l.amount, 0));
  const charges = sum(CHARGE_KINDS);
  const discounts = sum(["discount", "rebate"]);
  const trade = sum(["tradeIn"]);
  const down = sum(["downPayment"]);
  const sums = [
    { label: "every charge", amount: charges },
    { label: "charges less discounts and rebates", amount: r2(charges - discounts) },
    { label: "charges less discounts and the trade-in", amount: r2(charges - discounts - trade) },
    { label: "charges less discounts, the trade-in and the down payment", amount: r2(charges - discounts - trade - down) },
    { label: "charges less discounts and the down payment", amount: r2(charges - discounts - down) },
  ].filter((s, i, a) => a.findIndex((x) => x.amount === s.amount) === i);
  // A subtotal of the lines just above it ("Total Other Charges", "Unpaid balance (1 minus 2)"): charges add,
  // credits take away, read upwards from the total. Matching to the cent is no coincidence.
  const signed = (l: DealLine) => (l.declined || l.fromAi || l.inPrice ? 0 : CREDIT.includes(l.kind) ? -l.amount : CHARGE_KINDS.includes(l.kind) ? l.amount : null);
  const runAbove = (t: number, amount: number) => {
    let run = 0;
    let n = 0;
    for (let k = t - 1; k >= 0; k--) {
      const v = signed(lines[k]);
      if (v == null) continue;
      run = r2(run + v);
      n++;
      if (n >= 2 && Math.abs(run - amount) <= CENTS) return true;
    }
    return false;
  };
  const totals = lines
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => (t.kind === "total" || t.kind === "balanceDue" || t.kind === "amountFinanced" || t.kind === "subtotal") && !t.declined && !t.fromAi)
    .map(({ t, i }) => ({
      label: t.label, amount: t.amount, kind: t.kind,
      matches: sums.find((s) => Math.abs(s.amount - t.amount) <= CENTS)?.label ?? (runAbove(i, t.amount) ? "the lines above it" : null),
    }));
  // A subtotal that adds up confirms the lines above it, not the whole paper.
  return { sums, totals, confirmed: totals.some((t) => t.matches && t.kind !== "subtotal") };
}

const CREDIT: readonly LineKind[] = ["discount", "rebate", "tradeIn", "downPayment"];
