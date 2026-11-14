/**
 * What's right and what's wrong on the dealer's paper, line by line, assuming the buyer says no to every
 * add-on. A line is called "wrong" only when two independent checks agree: the paper's own arithmetic (or the
 * free AI's reading) confirms the line was read right, AND the line disagrees with the ad, the loan math or
 * the state's tax. Anything less is "check this", in the paper's own words. Optional add-ons and loan products
 * are "remove": the buyer can say no to them (FTC, CFPB).
 */

import { STATE_TAX, vehicleTax } from "@/lib/costs/stateTax";
import { STATES, type StateCode } from "@/lib/geo/zip";
import { REF, type SourceRef } from "@/lib/sources";
import { checkPayment, monthlyPayment, savingAtRate, totalInterest, type LoanCheck } from "./loan";
import type { DealLine, DealSheet } from "./parse";
import { reconcile, type Reconcile } from "./reconcile";

export type AdFacts = { price: number | null; docFee: number | null; sellerType: "dealer" | "private" | "unknown" };

export type CheckInput = {
  sheet: DealSheet;
  /** The listing this car was checked from (its price and dealer fee), when there is one. */
  ad: AdFacts | null;
  /** Where the buyer registers the car (from their ZIP), for the tax check. */
  state: StateCode | null;
  modelYear: number | null;
  /** A bank or credit union's pre-approval rate the buyer typed, to price the dealer's rate. */
  myAprPct?: number | null;
  /** Per line (same order as `sheet.lines`): the free AI read the same label and amount. */
  aiAgrees?: boolean[];
  now?: Date;
};

export type Verdict = "right" | "wrong" | "remove" | "check" | "credit" | "info";
export type LineResult = { line: DealLine; verdict: Verdict; note: string; source?: SourceRef };
export type Hidden = { what: string; amount: number; why: string };

export type DealCheck = {
  rows: LineResult[];
  reconcile: Reconcile;
  /** The reading is confirmed (the sums match, or the AI agrees on every line). */
  confirmed: boolean;
  loan: (LoanCheck & { verdict: Verdict; note: string; longTerm: string | null; atMyRate: number | null }) | null;
  /** Money the buyer can save by saying no and asking for what's right, each with its reason. */
  hidden: Hidden[];
  hiddenTotal: number;
  /** One-line summary for the verdict's "Ready to pay" row. */
  summary: string;
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cents = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The tax the state's rate gives on the likely taxable amounts (price; + doc fee; + dealer fees and add-ons; − trade-in). */
function taxCandidates(lines: DealLine[], state: StateCode, modelYear: number | null, now: Date): { amount: number; base: string }[] {
  const live = lines.filter((l) => !l.declined);
  const sum = (kinds: string[]) => live.filter((l) => kinds.includes(l.kind)).reduce((s, l) => s + l.amount, 0);
  const price = sum(["price"]) - sum(["discount", "rebate"]);
  const doc = sum(["docFee"]);
  const extras = sum(["dealerFee", "addOn"]);
  const trade = sum(["tradeIn"]);
  const bases: [number, string][] = [
    [price, "the price"],
    [price + doc, "the price and doc fee"],
    [price + doc + extras, "the price, fees and add-ons"],
    [price + doc - trade, "the price and doc fee, less the trade-in"],
    [price + doc + extras - trade, "the price, fees and add-ons, less the trade-in"],
  ];
  return bases
    .filter(([b]) => b > 0)
    .map(([b, base]) => {
      const t = vehicleTax(state, { taxable: b, price: b, seller: "dealer", modelYear, localPct: 0, now });
      return { amount: r2(t.lines.reduce((s, l) => s + l.amount, 0)), base };
    });
}

export function checkDealSheet(input: CheckInput): DealCheck {
  const { sheet, ad, state } = input;
  const now = input.now ?? new Date();
  const rec = reconcile(sheet.lines);
  const aiAll = !!input.aiAgrees && sheet.lines.length > 0 && sheet.lines.every((_, i) => input.aiAgrees![i]);
  const confirmed = rec.confirmed || aiAll;
  const sure = (i: number) => confirmed || !!input.aiAgrees?.[i];
  const hidden: Hidden[] = [];
  const adPrice = ad?.price ?? null;
  const adFee = ad && ad.sellerType === "dealer" ? ad.docFee : null;

  const rows: LineResult[] = sheet.lines.map((line, i): LineResult => {
    if (line.declined) return { line, verdict: "right", note: "Not charged (declined or $0)." };
    switch (line.kind) {
      case "price": {
        if (adPrice == null) return { line, verdict: "info", note: "The car's price. Compare it with the price in the ad you saw." };
        const over = r2(line.amount - adPrice);
        if (over <= 1) return { line, verdict: "right", note: over < -1 ? `${usd(-over)} below the ad's price (${usd(adPrice)}).` : `Matches the ad's price (${usd(adPrice)}).` };
        // Counted as money to take off only once the line's reading is confirmed.
        if (sure(i)) hidden.push({ what: "Price above the ad", amount: over, why: `The ad's price was ${usd(adPrice)}; this paper says ${usd(line.amount)}.` });
        return sure(i)
          ? { line, verdict: "wrong", note: `${usd(over)} more than the ad's price (${usd(adPrice)}). Ask them to honor the advertised price.` }
          : { line, verdict: "check", note: `Reads as ${usd(over)} more than the ad's price (${usd(adPrice)}). Check this line on the paper, then ask for the advertised price.` };
      }
      case "docFee": {
        if (adFee != null) {
          const over = r2(line.amount - adFee);
          if (over <= 1) return { line, verdict: "right", note: `Matches the dealer fee the ad showed (${usd(adFee)}).` };
          if (sure(i)) hidden.push({ what: "Doc fee above the ad's", amount: over, why: `The ad showed a ${usd(adFee)} dealer fee.` });
          return sure(i)
            ? { line, verdict: "wrong", note: `${usd(over)} more than the dealer fee the ad showed (${usd(adFee)}).` }
            : { line, verdict: "check", note: `Reads as ${usd(over)} more than the ad's dealer fee (${usd(adFee)}). Check this line.` };
        }
        return { line, verdict: "check", note: "The dealer's own fee. It wasn't in a price the ad showed: ask for it to be lowered or included in the price.", source: REF.ftcAddOns };
      }
      case "dealerFee":
        hidden.push({ what: line.label, amount: line.amount, why: "A dealer charge on top of the car's price (preparation, reconditioning, delivery or filing)." });
        return { line, verdict: "remove", note: "A dealer charge on top of the price. Ask them to remove it or include it in the advertised price.", source: REF.ftcAddOns };
      case "addOn":
        hidden.push({ what: line.name ?? line.label, amount: line.amount, why: "An optional add-on." });
        return { line, verdict: "remove", note: `Optional add-on${line.name && line.name !== line.label ? ` (${line.name})` : ""}. You're saying no to it: ask them to take it off. If they say it's already installed, ask them to remove the charge anyway.`, source: REF.ftcAddOns };
      case "loanProduct":
        hidden.push({ what: line.name ?? line.label, amount: line.amount, why: "An optional product sold with the loan." });
        return { line, verdict: "remove", note: `Optional (${line.name ?? "a loan product"}). A lender generally can't require it to give you the loan. You're saying no to it.`, source: REF.cfpbAddOns };
      case "tax": {
        if (!state) return { line, verdict: "info", note: "Sales tax. Add your ZIP to check it against your state's rate." };
        const cands = taxCandidates(sheet.lines, state, input.modelYear, now);
        const hit = cands.find((c) => Math.abs(c.amount - line.amount) <= 2);
        if (hit) return { line, verdict: "right", note: `What ${STATES[state]}'s ${STATE_TAX[state].summary} gives on ${hit.base}.` };
        const low = Math.min(...cands.map((c) => c.amount));
        const local = STATE_TAX[state].local ? " A city or county tax can add to it." : "";
        return { line, verdict: "check", note: `${STATES[state]}'s ${STATE_TAX[state].summary} on these lines gives ${cands.length ? cents(low) : "a different amount"}. Ask how they worked it out.${local}` };
      }
      case "stateFee":
        return { line, verdict: "info", note: state ? `A government fee (title, registration, plates). Compare with ${STATES[state]}'s own fee page.` : "A government fee (title, registration, plates). Compare with your DMV's fee page." };
      case "negativeEquity":
        return { line, verdict: "check", note: "What you still owe on your trade-in, added to this loan. You'll pay interest on it: ask for the trade-in's payoff in writing and whether paying it down first is cheaper." };
      case "payoff":
        return { line, verdict: "info", note: "The payoff of the loan on your trade-in. Check it against your lender's payoff letter." };
      case "discount":
      case "rebate":
      case "tradeIn":
      case "downPayment":
        return { line, verdict: "credit", note: line.kind === "tradeIn" ? "Your trade-in. Get a written offer elsewhere (CarMax, Carvana, another dealer) to compare." : line.kind === "downPayment" ? "Your down payment." : "Taken off the price." };
      case "reference":
        return { line, verdict: "info", note: "A reference figure, not a charge." };
      case "subtotal":
        return { line, verdict: "info", note: "A subtotal." };
      case "total":
      case "balanceDue":
      case "amountFinanced": {
        const t = rec.totals.find((x) => x.label === line.label && x.amount === line.amount);
        if (t?.matches) return { line, verdict: "right", note: `The lines add up to this (${t.matches}).` };
        const near = rec.sums.reduce((a, b) => (Math.abs(b.amount - line.amount) < Math.abs(a.amount - line.amount) ? b : a));
        const diff = r2(line.amount - near.amount);
        const msg = `The lines add up to ${cents(near.amount)} (${near.label}), ${cents(Math.abs(diff))} ${diff > 0 ? "less" : "more"} than this.`;
        if (aiAll && diff > 1) {
          hidden.push({ what: "Total more than the lines", amount: diff, why: msg });
          return { line, verdict: "wrong", note: `${msg} Ask what the difference is for.` };
        }
        return { line, verdict: "check", note: `${msg} A line may not have been read: compare with the paper, or ask what the difference is for.` };
      }
      default:
        return { line, verdict: "check", note: "VinVerdict doesn't recognise this line. Ask what it is and whether it's optional." };
    }
  });

  // ----- The loan -----
  const L = sheet.loan;
  let loan: DealCheck["loan"] = null;
  const principal = L.amountFinanced;
  // Only numbers that make sense as a car loan are checked (a misread "24.27" financed is not a loan).
  const plausible = !!principal && principal >= 1_000 && L.payment != null && L.payment >= 25 && L.months != null && L.payment * L.months >= principal * 0.9;
  if (plausible && principal && L.aprPct != null && L.months && L.payment) {
    const c = checkPayment(principal, L.aprPct, L.months, L.payment);
    // Second check for the loan numbers: the paper's own total of payments (payment × months).
    const tilaOk = L.totalOfPayments != null && Math.abs(L.totalOfPayments - L.payment * L.months) <= L.months;
    let verdict: Verdict = "right";
    let note = `The payment matches ${cents(principal)} at ${L.aprPct}% for ${L.months} months (${cents(c.expected)}).`;
    if (!c.ok && c.diff > 0) {
      verdict = tilaOk ? "wrong" : "check";
      note = `${cents(principal)} at ${L.aprPct}% for ${L.months} months is ${cents(c.expected)} a month; the paper says ${cents(L.payment)}. That's ${cents(c.diff)} a month (${usd(c.overLoan)} over the loan) for something not shown. Ask for every product in the payment.`;
      if (verdict === "wrong") hidden.push({ what: "Payment above the loan math", amount: c.overLoan, why: note });
    } else if (!c.ok) {
      verdict = "check";
      note = `The loan math gives ${cents(c.expected)} a month; the paper says ${cents(L.payment)}. Check the amount financed, rate and term on the paper.`;
    }
    const longTerm = L.months > 60
      ? `At ${L.months} months you pay ${usd(totalInterest(principal, L.aprPct, L.months))} in interest; at 60 months it would be ${usd(totalInterest(principal, L.aprPct, 60))} (payment ${cents(monthlyPayment(principal, L.aprPct, 60))}). A long term lowers the payment, not the price.`
      : null;
    const my = input.myAprPct;
    const atMyRate = my != null && my >= 0 && my < L.aprPct ? savingAtRate(principal, L.aprPct, L.months, my) : null;
    if (atMyRate && atMyRate > 0) hidden.push({ what: `Interest at ${L.aprPct}% instead of your ${my}%`, amount: atMyRate, why: "The dealer's rate usually includes an amount for the dealer, and it's negotiable (FTC)." });
    loan = { ...c, verdict, note, longTerm, atMyRate };
  }

  const hiddenTotal = r2(hidden.reduce((s, h) => s + h.amount, 0));
  const removes = rows.filter((r) => r.verdict === "remove").length;
  const wrongs = rows.filter((r) => r.verdict === "wrong").length + (loan?.verdict === "wrong" ? 1 : 0);
  const checks = rows.filter((r) => r.verdict === "check").length + (loan?.verdict === "check" ? 1 : 0);
  const parts = [
    removes ? `${removes} ${removes === 1 ? "charge" : "charges"} to refuse` : null,
    wrongs ? `${wrongs} wrong` : null,
    checks ? `${checks} to ask about` : null,
  ].filter(Boolean);
  const summary = parts.length ? `Dealer's numbers: ${parts.join(", ")}${hiddenTotal > 0 ? `; up to ${usd(hiddenTotal)} to take off` : ""}.` : "Dealer's numbers: every line checks out.";
  return { rows, reconcile: rec, confirmed, loan, hidden, hiddenTotal, summary };
}
