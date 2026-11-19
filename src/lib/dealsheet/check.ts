/**
 * What's right and what's wrong on the dealer's paper, line by line, assuming the buyer says no to every
 * add-on. A line is called "wrong" only when two independent checks agree: the paper's own arithmetic (or the
 * free AI's reading) confirms the line was read right, AND the line disagrees with the ad, the loan math or
 * the state's tax. Anything less is "check this", in the paper's own words. Optional add-ons and loan products
 * are "remove": the buyer can say no to them (FTC, CFPB).
 */

import { secondOpinion } from "@/lib/ml/dealer-lines";
import { STATE_TAX, vehicleTax } from "@/lib/costs/stateTax";
import { STATES, type StateCode } from "@/lib/geo/zip";
import { REF, type SourceRef } from "@/lib/sources";
import { checkPayment, checkPaymentWithFinal, monthlyPayment, PAYMENT_TOLERANCE as PAYMENT_GAP, savingAtRate, totalInterest, type LoanCheck } from "./loan";
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
  /** A new or a used car (the buyer's button): some rules differ (the destination charge, the sticker, rebates). Default used. */
  condition?: "new" | "used";
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
  loan: (LoanCheck & {
    verdict: Verdict;
    note: string;
    longTerm: string | null;
    atMyRate: number | null;
    /** The payment without the lines to take off, how much less that is a month, and what those lines cost with interest. */
    without: { payment: number; drop: number; withInterest: number; amount: number } | null;
  }) | null;
  /** Money the buyer can save by saying no and asking for what's right, each with its reason. */
  hidden: Hidden[];
  hiddenTotal: number;
  /** One-line summary for the verdict's "Ready to pay" row. */
  summary: string;
  /** New or used, as checked. */
  condition: "new" | "used";
  /** A lease worksheet: price, fees and add-ons are checked; the lease payment isn't. */
  lease: boolean;
  /** The trade-in is worth less than its payoff: this much of the old loan is carried into the deal (0 when not). */
  negativeEquity: number;
  /** A lease's payment against the lease math (never "wrong": lease tax differs by state). */
  leaseMath: { base: number; stated: number; verdict: Verdict; note: string } | null;
  /** Checked as a used car, but the paper says it's for a new one: the buyer is asked to switch. */
  looksNew: boolean;
  /** A worksheet's payment options, each with what it pays in total. */
  paymentOptions: { months: number; payment: number; total: number }[];
  /** How the paper's tax was worked out, when it matched the state's rule (the negotiation target uses the same way). */
  taxRule?: TaxRule | null;
};

/**
 * Doc-fee caps set by a state's own law or DMV, checked on the official page (2026-11-14). Only states whose
 * current cap could be confirmed are here; others are left out rather than guessed (Ohio's, Illinois's, Louisiana's and
 * Pennsylvania's are re-indexed every year, with no current figure in the law). Where the law has two limits, the
 * higher one is the cap (the paper can't show which applies) and the lower one is named in the note.
 */
export const DOC_FEE_CAP: Partial<Record<StateCode, { max: number; source: SourceRef; extra?: string; /** Also at most this share of the sale (the lesser applies). */ pctOfSale?: number }>> = {
  NY: { max: 175, source: REF.nyDocFee },
  WA: { max: 200, source: REF.waDocFee, extra: "Washington law also says the dealer must tell you it's negotiable, and can't say the state requires it." },
  MD: { max: 800, source: REF.mdDocFee },
  MN: { max: 350, pctOfSale: 0.1, source: REF.mnDocFee },
  CA: { max: 85, source: REF.caDocFee, extra: "It's $70 if the dealer doesn't have a DMV partner agreement: ask which applies." },
  OR: { max: 250, source: REF.orDocFee, extra: "It's $200 if the dealer doesn't use an integrator: ask which applies." },
  IA: { max: 180, source: REF.iaDocFee, extra: "Iowa law also says the fee must be included in the advertised price." },
};

/** A state's doc-fee cap for this sale: its dollar limit, or a share of the sale when that's lower (Minnesota). */
function capFor(state: StateCode, sale: number): { max: number; how: string; source: SourceRef; extra?: string } | null {
  const c = DOC_FEE_CAP[state];
  if (!c) return null;
  if (c.pctOfSale && sale > 0 && sale * c.pctOfSale < c.max) return { max: r2(sale * c.pctOfSale), how: `${c.pctOfSale * 100}% of the sale`, source: c.source, extra: c.extra };
  return { max: c.max, how: usd(c.max), source: c.source, extra: c.extra };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cents = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The amounts a paper's tax may be worked out on. */
function taxParts(lines: DealLine[]) {
  const live = lines.filter((l) => !l.declined && !l.fromAi);
  const sum = (f: (l: DealLine) => boolean) => r2(live.filter(f).reduce((s, l) => s + l.amount, 0));
  const price = sum((l) => l.kind === "price");
  let discount = sum((l) => l.kind === "discount");
  let rebate = sum((l) => l.kind === "rebate");
  // "MSRP $32,900 / Discount $1,500 / Selling Price $31,400": the credits are already in the selling price.
  if (live.some((l) => l.kind === "reference" && Math.abs(l.amount - discount - rebate - price) <= 1)) discount = rebate = 0;
  const destination = sum((l) => l.kind === "dealerFee" && l.name === "Destination charge");
  return {
    price,
    discount,
    rebate,
    destination,
    doc: sum((l) => l.kind === "docFee" && !l.inPrice),
    extras: sum((l) => (l.kind === "dealerFee" && l.name !== "Destination charge") || l.kind === "addOn"),
    trade: sum((l) => l.kind === "tradeIn"),
  };
}

const listWords = (w: string[]) => (w.length <= 1 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`);

/** How a paper's tax was worked out, when it matched: what's in the taxable amount besides the price. */
export type TaxRule = { withDoc: boolean; withExtras: boolean; lessTrade: boolean; keepRebate: boolean };

/** Every common way of working out the taxable amount, the usual one first: the price after its discounts (and,
 * in some states, before the maker's rebate), with or without the destination charge, doc fee, other fees and
 * add-ons, and less the trade-in where the state allows it. */
function taxBases(lines: DealLine[]): [number, string, TaxRule][] {
  const t = taxParts(lines);
  const out: [number, string, TaxRule][] = [];
  for (const keepRebate of t.rebate > 0 ? [false, true] : [false]) {
    for (const lessTrade of t.trade > 0 ? [false, true] : [false]) {
      for (const withDest of t.destination > 0 ? [true, false] : [false]) {
        for (const [withDoc, withExtras] of [[true, false], [false, false], [true, true], [false, true]] as const) {
          if ((withDoc && !t.doc) || (withExtras && !t.extras)) continue;
          const b = r2(t.price - t.discount - (keepRebate ? 0 : t.rebate) + (withDest ? t.destination : 0) + (withDoc ? t.doc : 0) + (withExtras ? t.extras : 0) - (lessTrade ? t.trade : 0));
          const plus = [...(withDest ? ["destination charge"] : []), ...(withDoc ? ["doc fee"] : []), ...(withExtras ? ["other fees and add-ons"] : [])];
          const words = `${keepRebate ? "the price before the maker's rebate" : "the price"}${plus.length ? `, plus the ${listWords(plus)}` : ""}${lessTrade ? ", less the trade-in" : ""}`;
          out.push([b, words, { withDoc, withExtras, lessTrade, keepRebate }]);
        }
      }
    }
  }
  return out.filter(([b]) => b > 0);
}

/** The tax the state's rule gives on each way of working out the taxable amount (the usual one first). */
function taxCandidates(lines: DealLine[], state: StateCode, modelYear: number | null, now: Date): { amount: number; base: string; rule: TaxRule }[] {
  return taxBases(lines).map(([b, base, rule]) => {
    const t = vehicleTax(state, { taxable: b, price: b, seller: "dealer", modelYear, localPct: 0, now });
    return { amount: r2(t.lines.reduce((s, l) => s + l.amount, 0)), base, rule };
  });
}

/** The local rate (city, county, district) a state-plus-local tax implies, on the likely taxable amount: up to 6%. */
function impliedLocal(lines: DealLine[], state: StateCode, modelYear: number | null, now: Date, tax: number): { pct: number; base: string } | null {
  const found: { pct: number; base: string; round: boolean }[] = [];
  for (const [b, base] of taxBases(lines)) {
    const stateOnly = vehicleTax(state, { taxable: b, price: b, seller: "dealer", modelYear, localPct: 0, now }).lines.reduce((s, l) => s + l.amount, 0);
    const pct = Math.round(((tax - stateOnly) / b) * 100000) / 1000;
    if (!(pct > 0 && pct <= 6 && Math.abs(stateOnly + (b * pct) / 100 - tax) <= 1)) continue;
    // Local rates are set in steps (2.25%, 1.5%, 4.875%, 0.375%): the taxable amount that gives such a rate, to
    // the cent, is the one the dealer used; any amount gives some rate.
    const exact = [0.125, 0.05].some((step) => {
      const r = Math.round(pct / step) * step;
      return Math.abs(stateOnly + (b * r) / 100 - tax) <= 0.02;
    });
    found.push({ pct: exact ? Math.round(pct / 0.005) * 0.005 : pct, base, round: exact });
  }
  const pick = found.find((f) => f.round) ?? found[0];
  return pick ? { pct: Math.round(pick.pct * 1000) / 1000, base: pick.base } : null;
}

// No state sales tax on a car (the state's own rule in costs/stateTax.ts; Oregon's is for used cars only).
const NO_TAX: readonly StateCode[] = ["MT", "NH", "OR"];
// States that tax a value rather than the price (costs/stateTax.ts notes): the paper's tax may differ for that reason.
const VALUE_TAX: Partial<Record<StateCode, string>> = {
  GA: "Georgia's title tax (TAVT) is 7% of the state's own value for the car, not the price you pay.",
  KY: "Kentucky's usage tax may use the car's book (NADA) value instead of the price.",
  DE: "Delaware's document fee is on the price or the book value, whichever is higher.",
};

// How the line model's guesses read in a note.
const KIND_WORDS: Record<string, string> = {
  price: "part of the car's price", discount: "a discount", rebate: "a rebate", tradeIn: "a trade-in credit", payoff: "a trade-in payoff",
  docFee: "the dealer's doc fee", dealerFee: "a dealer fee", addOn: "an optional add-on", loanProduct: "an optional loan product (warranty, GAP or similar)",
  stateFee: "a government fee", tax: "a tax", downPayment: "a down payment", total: "a total", subtotal: "a subtotal", balanceDue: "the balance due",
  amountFinanced: "the amount financed", reference: "a reference figure", leaseTerm: "a lease term", leaseFee: "a leasing company fee",
};

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
  const counted = sheet.lines.filter((l) => !l.declined && !l.fromAi);
  const sumOf = (kinds: string[]) => r2(counted.filter((l) => kinds.includes(l.kind)).reduce((s, l) => s + l.amount, 0));
  // The car's price after the paper's own discounts and rebates is what's compared with the ad: "$23,000 less a
  // $1,000 dealer discount" is the ad's $22,000, not $1,000 over it.
  const condition = input.condition ?? "used";
  const isNew = condition === "new";
  const listedCredits = sumOf(["discount", "rebate"]);
  // "MSRP $32,900 / Dealer Discount $1,500 / Selling Price $31,400": the discount is already in the selling price.
  const refs = counted.filter((l) => l.kind === "reference").map((l) => l.amount);
  const credits = refs.some((r) => Math.abs(r - listedCredits - sumOf(["price"])) <= 1) ? 0 : listedCredits;
  // A doc fee the paper says is inside the price comes off before the price is compared with the ad.
  const feeInside = r2(counted.filter((l) => l.kind === "docFee" && l.inPrice).reduce((s, l) => s + l.amount, 0));
  const adFeeInside = !feeInside && counted.some((l) => l.kind === "price" && l.feeInPrice) && adFee != null ? adFee : 0;
  const netPrice = r2(sumOf(["price"]) - credits - feeInside - adFeeInside);
  // A new car's sticker (the ad's price for a new car) includes the destination charge: compare like with like.
  const destination = isNew ? r2(counted.filter((l) => l.kind === "dealerFee" && l.name === "Destination charge").reduce((s, l) => s + l.amount, 0)) : 0;
  const adWord = isNew ? "sticker or advertised price" : "ad's price";
  const firstPrice = sheet.lines.findIndex((l) => l.kind === "price" && !l.declined && !l.fromAi);
  const trade = sumOf(["tradeIn"]);
  const payoff = sumOf(["payoff"]);
  const negativeEquity = sheet.lines.some((l) => l.kind === "negativeEquity") ? sumOf(["negativeEquity"]) : payoff > trade && trade > 0 ? r2(payoff - trade) : 0;

  let taxRule: TaxRule | null = null;
  const rows: LineResult[] = sheet.lines.map((line, i): LineResult => {
    if (line.declined) {
      // "Trade Allowance $0.00" is no trade-in, not a declined charge.
      if (["tradeIn", "downPayment", "discount", "rebate"].includes(line.kind)) return { line, verdict: "info", note: "None on this paper." };
      return { line, verdict: "right", note: "Not charged (declined or $0)." };
    }
    // One reader alone is never enough: a line only the AI found is for the buyer to compare with the paper.
    if (line.fromAi) return { line, verdict: "check", note: line.kind === "addOn" || line.kind === "loanProduct" || line.kind === "dealerFee" ? "Only the free AI read this line. Compare it with the paper: if it's there, it's optional, so ask for it to be removed." : "Only the free AI read this line. Compare it with the paper." };
    switch (line.kind) {
      case "price": {
        if (i !== firstPrice) return { line, verdict: "info", note: "Part of the car's price on this paper." };
        if (adPrice == null) return { line, verdict: "info", note: isNew ? "The car's price. Compare it with the window sticker (MSRP) or the dealer's advertised price." : "The car's price. Compare it with the price in the ad you saw." };
        const inside = feeInside || adFeeInside;
        const after = (credits ? ` after the paper's ${usd(credits)} in discounts and rebates` : "") + (inside ? `${credits ? " and" : ""} once the ${usd(inside)} doc fee it includes is taken off` : "") + (destination ? `${credits || inside ? " and" : ""} with the ${usd(destination)} destination charge` : "");
        const compared = r2(netPrice + destination);
        const afterText = after ? (Math.abs(compared - adPrice) <= 1 ? after : `${after} (${usd(compared)})`) : "";
        const over = r2(compared - adPrice);
        if (over <= 1) return { line, verdict: "right", note: over < -1 ? `${usd(-over)} below the ${adWord} (${usd(adPrice)})${afterText}.` : `Matches the ${adWord} (${usd(adPrice)})${afterText}.` };
        // Counted as money to take off only once the line's reading is confirmed.
        if (sure(i)) hidden.push({ what: isNew ? "Price above the sticker or advertised price" : "Price above the ad", amount: over, why: `The ${adWord} was ${usd(adPrice)}; this paper says ${usd(compared)}${credits ? " after its discounts" : ""}.` });
        return sure(i)
          ? { line, verdict: "wrong", note: `${usd(over)} more than the ${adWord} (${usd(adPrice)})${afterText}. Ask them to honor it.` }
          : { line, verdict: "check", note: `Reads as ${usd(over)} more than the ${adWord} (${usd(adPrice)})${afterText}. Check this line on the paper, then ask them to honor it.` };
      }
      case "leaseFee":
        return { line, verdict: "check", note: "The leasing company's fee. Dealers sometimes add to it: ask for the leasing company's own amount in writing." };
      case "leaseTerm": {
        const T = sheet.leaseTerms;
        // The disclosure's depreciation is the adjusted cap cost less the residual.
        if (/depreciation/i.test(line.label) && T?.adjustedCap && T.residual) {
          const d = r2(T.adjustedCap - T.residual);
          if (Math.abs(d - line.amount) <= 1) return { line, verdict: "right", note: `The adjusted cap cost (${cents(T.adjustedCap)}) less the residual (${cents(T.residual)}).` };
          return { line, verdict: "check", note: `The adjusted cap cost less the residual is ${cents(d)}, not ${cents(line.amount)}: ask what else is in it.` };
        }
        // "Total of base monthly payments" is the depreciation plus the rent charge.
        if (/total of base/i.test(line.label) && T?.depreciation != null && T.rentCharge != null) {
          const sum = r2(T.depreciation + T.rentCharge);
          if (Math.abs(sum - line.amount) <= 1) return { line, verdict: "right", note: `The depreciation (${cents(T.depreciation)}) plus the rent charge (${cents(T.rentCharge)}).` };
          return { line, verdict: "check", note: `The depreciation plus the rent charge is ${cents(sum)}, not ${cents(line.amount)}: ask what else is in the payments.` };
        }
        return { line, verdict: "info", note: "A lease term (see the note on leases above)." };
      }
      case "docFee": {
        // A state's legal maximum, where its own law or DMV says so (only those checked are listed).
        const cap = state ? capFor(state, netPrice) : null;
        if (cap && line.amount > cap.max + 0.5) {
          const over = r2(line.amount - cap.max);
          const limit = cap.how === usd(cap.max) ? usd(cap.max) : `${usd(cap.max)} (${cap.how})`;
          if (sure(i)) hidden.push({ what: `Doc fee above ${STATES[state!]}'s legal maximum`, amount: over, why: `${STATES[state!]} caps it at ${limit}.` });
          return sure(i)
            ? { line, verdict: "wrong", note: `${usd(over)} more than ${STATES[state!]}'s legal maximum of ${limit}.${cap.extra ? ` ${cap.extra}` : ""}`, source: cap.source }
            : { line, verdict: "check", note: `Reads as ${usd(over)} more than ${STATES[state!]}'s legal maximum of ${limit}. Check this line.`, source: cap.source };
        }
        if (adFee != null) {
          const over = r2(line.amount - adFee);
          if (over <= 1) return { line, verdict: "right", note: `Matches the dealer fee the ad showed (${usd(adFee)}).` };
          if (sure(i)) hidden.push({ what: "Doc fee above the ad's", amount: over, why: `The ad showed a ${usd(adFee)} dealer fee.` });
          return sure(i)
            ? { line, verdict: "wrong", note: `${usd(over)} more than the dealer fee the ad showed (${usd(adFee)}).` }
            : { line, verdict: "check", note: `Reads as ${usd(over)} more than the ad's dealer fee (${usd(adFee)}). Check this line.` };
        }
        // Only say what the ad showed when the ad is known.
        if (!ad || ad.price == null) return { line, verdict: "info", note: "The dealer's own fee for the paperwork. Ask whether it's negotiable, or for it to be taken off the price." };
        if (isNew) return { line, verdict: "check", note: "The dealer's own fee; it isn't on the window sticker. Ask for it to be lowered or taken off the price.", source: REF.ftcAddOns };
        return { line, verdict: "check", note: "The dealer's own fee. It wasn't in a price the ad showed: ask for it to be lowered or included in the price.", source: REF.ftcAddOns };
      }
      case "dealerFee":
        if (line.name === "Destination charge") {
          if (isNew) return { line, verdict: "check", note: "The maker's charge for shipping the car to the dealer. Federal law puts it on the window sticker: it should match the sticker exactly and appear only once. A second delivery or freight line is extra.", source: REF.monroney };
          // Checked as used, but the paper says new: never call a real destination charge padding.
          if (sheet.looksNew) return { line, verdict: "check", note: "This paper says the car is new. If it is, choose New car above: a new car's destination charge is real and should match its window sticker. On a used car it's padding.", source: REF.monroney };
          hidden.push({ what: line.label, amount: line.amount, why: "A destination charge belongs to a new car's sticker." });
          return { line, verdict: "remove", note: "A destination or freight charge is part of a new car's window sticker. On a used car it was paid when the car was first sold: ask them to remove it." };
        }
        if (line.name === "Certification fee" && !isNew) {
          return { line, verdict: "check", note: "A certified pre-owned charge. Certification is usually part of a CPO car's price: ask what it covers and whether it's in the advertised price, and get the CPO warranty in writing." };
        }
        if (line.name === "Smog or emissions") {
          return { line, verdict: "check", note: "A smog or emissions charge. Some states require the seller to provide the certificate: ask whether this is the state's fee or the test's cost, and for the receipt." };
        }
        if (line.name === "Electronic filing fee") {
          return { line, verdict: "check", note: "A fee for filing the title and registration electronically. Some states allow and limit it: ask whether it's set by the state, and for the amount in writing." };
        }
        if (line.name === "Loan fee") {
          return { line, verdict: "check", note: "A fee for the loan itself, paid through the amount financed (it's part of the APR). Ask whether the lender requires it and whether it's negotiable; another lender may not charge one." };
        }
        if (line.name === "Other fee") {
          return { line, verdict: "check", note: "A fee VinVerdict can't place. Ask what it's for: if it's a government fee it should be on your DMV's fee list; if it's the dealer's own, ask for it to be removed." };
        }
        hidden.push({ what: line.label, amount: line.amount, why: "A dealer charge on top of the car's price (preparation, reconditioning or delivery)." });
        return { line, verdict: "remove", note: "A dealer charge on top of the price. Ask them to remove it or include it in the advertised price.", source: REF.ftcAddOns };
      case "addOn":
        if (isNew && line.name === "Accessories") {
          return { line, verdict: "check", note: "If it's printed on the window sticker, it's a factory or port option already in the sticker price; if not, it's a dealer add-on you can refuse.", source: REF.monroney };
        }
        hidden.push({ what: line.name ?? line.label, amount: line.amount, why: "An optional add-on." });
        return { line, verdict: "remove", note: `Optional add-on${line.name && line.name !== line.label ? ` (${line.name})` : ""}. You're saying no to it: ask them to take it off. If they say it's already installed, ask them to remove the charge anyway.`, source: REF.ftcAddOns };
      case "loanProduct":
        if (line.name === "Car insurance") {
          return { line, verdict: "check", note: "Insurance on the car. A lender can require you to insure it, but you choose the insurer: compare quotes before buying it here." };
        }
        hidden.push({ what: line.name ?? line.label, amount: line.amount, why: "An optional product sold with the loan." });
        return { line, verdict: "remove", note: `Optional: ${line.name ? (/^[A-Z][a-z]/.test(line.name) ? line.name.charAt(0).toLowerCase() + line.name.slice(1) : line.name) : "a loan product"}. A lender generally can't require it to give you the loan. You're saying no to it.`, source: REF.cfpbAddOns };
      case "tax": {
        if (sheet.lease && /\bmonthly\b|\bper month\b|\bpayment\b/i.test(line.label)) {
          const base = sheet.leaseTerms?.basePayment;
          if (state && base) {
            const t = r2(vehicleTax(state, { taxable: base, price: base, seller: "dealer", modelYear: input.modelYear, localPct: 0, now }).lines.reduce((s, l) => s + l.amount, 0));
            if (Math.abs(t - line.amount) <= 0.05) return { line, verdict: "right", note: `${STATES[state]}'s ${STATE_TAX[state].summary} of the ${cents(base)} base monthly payment.` };
          }
          return { line, verdict: "info", note: "Tax on each lease payment. States tax leases differently (on each payment, or up front): ask how it's worked out." };
        }
        if (!state) return { line, verdict: "info", note: "Sales tax. Add your ZIP to check it against your state's rate." };
        const cands = taxCandidates(sheet.lines, state, input.modelYear, now);
        const hit = cands.find((c) => Math.abs(c.amount - line.amount) <= 2);
        if (hit) {
          taxRule = hit.rule;
          return { line, verdict: "right", note: `What ${STATES[state]}'s ${STATE_TAX[state].summary} gives on ${hit.base}.` };
        }
        const low = cands.length ? cands[0].amount : 0;
        if (STATE_TAX[state].local) {
          // A state with city or county tax: say which local rate the paper's tax implies, for the buyer to compare.
          const implied = impliedLocal(sheet.lines, state, input.modelYear, now, line.amount);
          if (implied) {
            return { line, verdict: "check", note: `That's ${STATES[state]}'s ${STATE_TAX[state].summary.replace(/ \+.*$/, "")} plus about ${implied.pct}% local tax on ${implied.base}. Check that ${implied.pct}% is your city or county's rate.` };
          }
          return { line, verdict: "check", note: `${STATES[state]}'s ${STATE_TAX[state].summary} on these lines gives ${cands.length ? cents(low) : "a different amount"} before any local tax. Ask how they worked it out.` };
        }
        // A state with no sales tax on cars: a "tax" line there is worth asking about directly.
        if (NO_TAX.includes(state) && !(state === "OR" && isNew)) return { line, verdict: "check", note: `${STATES[state]} has no sales tax on ${state === "OR" ? "used cars" : "cars"}. Ask what this charge is and who it's paid to.` };
        // A state that taxes a value, not the price: a different amount isn't a sign of anything by itself.
        if (VALUE_TAX[state]) return { line, verdict: "check", note: `${VALUE_TAX[state]} On the price it would be ${cands.length ? cents(low) : "a different amount"}: ask which value they used.` };
        return { line, verdict: "check", note: `${STATES[state]}'s ${STATE_TAX[state].summary} on these lines gives ${cands.length ? cents(low) : "a different amount"}. Ask how they worked it out.` };
      }
      case "stateFee":
        return { line, verdict: "info", note: state ? `A government fee (title, registration, plates). Compare with ${STATES[state]}'s own fee page.` : "A government fee (title, registration, plates). Compare with your DMV's fee page." };
      case "negativeEquity":
        return { line, verdict: "check", note: "What you still owe on your trade-in, added to this loan. You'll pay interest on it: ask for the trade-in's payoff in writing and whether paying it down first is cheaper." };
      case "payoff":
        if (negativeEquity > 0 && !sheet.lines.some((l) => l.kind === "negativeEquity")) {
          return { line, verdict: "check", note: `Your trade-in (${usd(trade)}) is worth less than what you owe on it (${usd(payoff)}): ${usd(negativeEquity)} of your old loan is carried into this deal, and you'll pay interest on it. Check the payoff against your lender's letter.` };
        }
        return { line, verdict: "info", note: "The payoff of the loan on your trade-in. Check it against your lender's payoff letter." };
      case "discount":
      case "rebate":
      case "tradeIn":
      case "downPayment":
        return {
          line,
          verdict: "credit",
          note: line.kind === "tradeIn" ? "Your trade-in. Get a written offer elsewhere (CarMax, Carvana, another dealer) to compare."
            : line.kind === "downPayment" ? "Your down payment."
              : line.kind === "rebate" && isNew ? "A maker rebate. Ask for every rebate and incentive you qualify for to be listed: they're often by region, loyalty or financing."
                : "Taken off the price.",
        };
      case "reference":
        return { line, verdict: "info", note: "A reference figure, not a charge." };
      case "subtotal": {
        const t = rec.totals.find((x) => x.label === line.label && x.amount === line.amount);
        return t?.matches ? { line, verdict: "right", note: `A subtotal: the lines add up to this (${t.matches}).` } : { line, verdict: "info", note: "A subtotal." };
      }
      case "total":
      case "balanceDue":
      case "amountFinanced": {
        const t = rec.totals.find((x) => x.label === line.label && x.amount === line.amount);
        if (t?.matches) return { line, verdict: "right", note: `The lines add up to this (${t.matches}).` };
        const near = rec.sums.reduce((a, b) => (Math.abs(b.amount - line.amount) < Math.abs(a.amount - line.amount) ? b : a));
        const diff = r2(line.amount - near.amount);
        const msg = `The lines add up to ${cents(near.amount)} (${near.label}), ${cents(Math.abs(diff))} ${diff > 0 ? "less" : "more"} than this.`;
        // A paper that doesn't list its tax and government fees as numbers ("plus tax, tag and title") has charges
        // the lines can't show, so a higher total isn't proof of anything.
        const itemized = sheet.lines.some((l) => l.kind === "tax" && !l.fromAi) && sheet.lines.some((l) => l.kind === "stateFee" && !l.fromAi);
        if (!itemized && diff > 1) {
          return { line, verdict: "check", note: `${msg} The paper doesn't list its tax and government fees as numbers, so the difference may be those: ask for every charge in writing.` };
        }
        if (aiAll && diff > 1) {
          hidden.push({ what: "Total more than the lines", amount: diff, why: msg });
          return { line, verdict: "wrong", note: `${msg} Ask what the difference is for.` };
        }
        return { line, verdict: "check", note: `${msg} A line may not have been read: compare with the paper, or ask what the difference is for.` };
      }
      default:
      {
        // The trained line model's second opinion (only once it has passed its gate in lib/ml/gate.json): what the line
        // probably is. The line stays "check this"; the model never decides a verdict.
        const guess = secondOpinion(line.label);
        const words = guess ? KIND_WORDS[guess.kind] : null;
        return {
          line,
          verdict: "check",
          note: words
            ? `VinVerdict's rules don't recognise this line; its trained model reads it as ${words} (${Math.round(guess!.p * 100)}% sure). Check it on the paper and ask what it is.`
            : "VinVerdict doesn't recognise this line. Ask what it is and whether it's optional.",
        };
      }
    }
  });

  // ----- The loan -----
  // The money to take off the lines themselves (before anything about the loan is added).
  const lineSaving = r2(hidden.reduce((s, h) => s + h.amount, 0));
  const L = sheet.loan;
  let loan: DealCheck["loan"] = null;
  const principal = L.amountFinanced;
  // Only numbers that make sense as a car loan are checked (a misread "24.27" financed is not a loan).
  const plausible = !!principal && principal >= 1_000 && L.payment != null && L.payment >= 25 && L.months != null && L.payment * L.months >= principal * 0.9 && L.payment <= principal / 5;
  if (!sheet.lease && !sheet.paymentOptions && plausible && principal && L.aprPct != null && L.months && L.payment) {
    // A last payment that differs (an odd final payment, or a balloon) is part of the math.
    const final = L.finalPayment && L.finalPayment > 0 && Math.abs(L.finalPayment - L.payment) > 0.005 ? L.finalPayment : null;
    const balloon = final != null && final > L.payment * 1.5;
    const c = final != null ? checkPaymentWithFinal(principal, L.aprPct, L.months, L.payment, final) : checkPayment(principal, L.aprPct, L.months, L.payment);
    const n = c.months;
    const finalWords = final != null ? ` with a ${balloon ? "balloon" : "final"} payment of ${cents(final)}` : "";
    // Second check for the loan numbers: the paper's own total of payments (payment × months, a final payment a
    // few cents different). When they disagree, one of them was misread (a photo's "$450.20" read as "$450.00").
    const scheduled = final != null ? L.payment * (n - 1) + final : L.payment * n;
    const tilaOk = L.totalOfPayments != null && Math.abs(L.totalOfPayments - scheduled) <= 2;
    const tilaDisagrees = L.totalOfPayments != null && !tilaOk;
    let verdict: Verdict = "right";
    let note = `The payment matches ${cents(principal)} at ${L.aprPct}% for ${n} months${finalWords} (${cents(c.expected)}).`;
    if (tilaDisagrees) {
      verdict = "check";
      note = `The payment reads as ${cents(L.payment)}, but the paper's total of payments (${cents(L.totalOfPayments!)}) is ${cents(L.totalOfPayments! / n)} a month. Check both on the paper. The loan math for ${cents(principal)} at ${L.aprPct}% for ${n} months${finalWords} is ${cents(c.expected)}${c.diff > PAYMENT_GAP ? ": anything above that is something not shown" : ""}.`;
    } else if (!c.ok && c.diff > 0) {
      verdict = tilaOk ? "wrong" : "check";
      note = `${cents(principal)} at ${L.aprPct}% for ${n} months${finalWords} is ${cents(c.expected)} a month; the paper says ${cents(L.payment)}. That's ${cents(c.diff)} a month (${usd(c.overLoan)} over the loan) for something not shown. Ask for every product in the payment.`;
      if (verdict === "wrong") hidden.push({ what: "Payment above the loan math", amount: c.overLoan, why: note });
    } else if (!c.ok) {
      verdict = "check";
      note = `The loan math gives ${cents(c.expected)} a month; the paper says ${cents(L.payment)}. Check the amount financed, rate and term on the paper.`;
    }
    const longTerm = !balloon && n > 60
      ? `At ${n} months you pay ${usd(totalInterest(principal, L.aprPct, n))} in interest; at 60 months it would be ${usd(totalInterest(principal, L.aprPct, 60))} (payment ${cents(monthlyPayment(principal, L.aprPct, 60))}). A long term lowers the payment, not the price.`
      : null;
    // What the lines to take off (add-ons, products, dealer fees, a price over the ad) cost inside this loan, with
    // interest, and the payment without them, against the loan math's payment (so money hidden in the payment
    // isn't counted twice). Tax on them is left out, so the real drop is at least this.
    const without = !balloon && lineSaving > 0 && principal - lineSaving > 0
      ? (() => {
          const payment = monthlyPayment(principal - lineSaving, L.aprPct!, n);
          return { payment, drop: r2(c.expected - payment), withInterest: r2((lineSaving / principal) * c.expected * n), amount: lineSaving };
        })()
      : null;
    const my = input.myAprPct;
    const atMyRate = my != null && my >= 0 && my < L.aprPct ? savingAtRate(principal, L.aprPct, n, my) : null;
    if (atMyRate && atMyRate > 0) hidden.push({ what: `Interest at ${L.aprPct}% instead of your ${my}%`, amount: atMyRate, why: "The dealer's rate usually includes an amount for the dealer, and it's negotiable (FTC)." });
    loan = { ...c, verdict, note, longTerm, atMyRate, without };
  }

  // ----- A lease's payment: (adjusted cap − residual) ÷ term, plus (adjusted cap + residual) × money factor -----
  // Never "wrong": states tax lease payments differently, and some fees are rolled in. It says what the math gives.
  let leaseMath: DealCheck["leaseMath"] = null;
  const T = sheet.leaseTerms;
  const leaseFactor = T?.moneyFactor ?? (T?.rentCharge && L.months && T.adjustedCap && T.residual ? Math.round((T.rentCharge / L.months / (T.adjustedCap + T.residual)) * 1e6) / 1e6 : null);
  const leasePayment = T?.basePayment ?? L.payment;
  if (sheet.lease && T?.adjustedCap && T.residual && leaseFactor && L.months && leasePayment && T.adjustedCap > T.residual) {
    const fromRent = !T.moneyFactor && !!T.rentCharge;
    const base = fromRent ? r2((T.adjustedCap - T.residual + T.rentCharge!) / L.months) : r2((T.adjustedCap - T.residual) / L.months + (T.adjustedCap + T.residual) * leaseFactor);
    const stated = leasePayment;
    const pct = Math.round((stated / base - 1) * 1000) / 10;
    const rate = `${fromRent ? `a ${cents(T.rentCharge!)} rent charge, which is a money factor of about ${leaseFactor}` : `money factor ${leaseFactor}`} (about ${Math.round(leaseFactor * 2400 * 100) / 100}% as an interest rate)`;
    if (Math.abs(stated - base) <= PAYMENT_GAP) {
      leaseMath = { base, stated, verdict: "right", note: `The ${T.basePayment ? "base " : ""}payment matches the lease math before tax: ${cents(T.adjustedCap)} adjusted cap cost, ${cents(T.residual)} residual, ${L.months} months, ${rate}. Ask whether that's the leasing company's base rate.` };
    } else if (stated > base && pct <= 11.5 && !T.basePayment) {
      leaseMath = { base, stated, verdict: "info", note: `The lease math gives ${cents(base)} a month before tax (${rate}). The paper's ${cents(stated)} is ${pct}% more: if that's your state's tax on lease payments it's right. Ask how it's made up.` };
    } else if (stated > base) {
      leaseMath = { base, stated, verdict: "check", note: `The lease math gives ${cents(base)} a month before tax (${rate}). The paper says ${cents(stated)}, ${cents(r2(stated - base))} a month more, ${T.basePayment ? "and a base payment has no tax in it" : "more than sales tax would add"}. Ask for everything in the payment.` };
    } else {
      leaseMath = { base, stated, verdict: "check", note: `The lease math gives ${cents(base)} a month, more than the paper's ${cents(stated)}: check the cap cost, residual and money factor on the paper.` };
    }
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
  const paymentOptions = (sheet.paymentOptions ?? []).map((o) => ({ ...o, total: r2(o.months * o.payment) }));
  return { rows, reconcile: rec, confirmed, loan, hidden, hiddenTotal, summary, condition, lease: !!sheet.lease, negativeEquity, paymentOptions, leaseMath, taxRule, looksNew: !isNew && !!sheet.looksNew };
}
