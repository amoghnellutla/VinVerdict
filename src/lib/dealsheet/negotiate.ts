/**
 * The negotiation plan from a checked deal sheet, assuming the buyer says no to every add-on: the out-the-door
 * price to aim for (the car at the advertised price, the dealer's fee the ad showed, government fees and tax,
 * nothing else), the order to negotiate in, a message to send, and answers to the usual pressure lines.
 * Only numbers from the paper, the ad and the state's tax rule; tax is recomputed only when the paper's tax
 * matched the state's rate, otherwise it's left as "plus tax".
 */

import { vehicleTax } from "@/lib/costs/stateTax";
import type { StateCode } from "@/lib/geo/zip";
import { REF, type SourceRef } from "@/lib/sources";
import type { AdFacts, DealCheck } from "./check";
import type { DealSheet } from "./parse";

export type Plan = {
  /** The out-the-door price to ask for, or null without a price line. */
  target: number | null;
  /** How the target is made up, line by line. */
  parts: { label: string; amount: number | null; note?: string }[];
  /** Tax left out of the target because it couldn't be checked ("plus tax"). */
  plusTax: boolean;
  steps: string[];
  message: string;
  scripts: { they: string; you: string; source?: SourceRef }[];
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cents = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

export const SCRIPTS: Plan["scripts"] = [
  { they: "The add-ons are already on the car.", you: "That's fine, I'm not paying for them. Please take the charge off the buyer's order.", source: REF.ftcAddOns },
  { they: "The bank requires the warranty (or GAP) to approve the loan.", you: "Please show me where the contract says it's required. If it doesn't say so, I'm declining it.", source: REF.cfpbAddOns },
  { they: "This is the best rate we can get you.", you: "I'm pre-approved elsewhere. Can you beat that rate? The rate is negotiable like the price.", source: REF.ftcFinancing },
  { they: "What monthly payment are you looking for?", you: "I'm only discussing the out-the-door price. We can talk about financing after that's agreed." },
  { they: "This price is only good today.", you: "Then please put it in writing, itemized, and I'll decide. A real price will still be real tomorrow." },
  { they: "Everyone pays the doc fee / it's state-required.", you: "Then please lower the car's price by that amount so my out-the-door total stays the same." },
  { they: "Sign here and we'll sort the paperwork later.", you: "I'll sign once the buyer's order matches what we agreed, line by line." },
];

export function negotiationPlan(input: { sheet: DealSheet; check: DealCheck; ad: AdFacts | null; state: StateCode | null; modelYear: number | null; car?: string | null; myAprPct?: number | null; now?: Date }): Plan {
  const { sheet, check, ad } = input;
  const live = sheet.lines.filter((l) => !l.declined);
  const sum = (kinds: string[]) => r2(live.filter((l) => kinds.includes(l.kind)).reduce((s, l) => s + l.amount, 0));
  const paperPrice = sum(["price"]) ? r2(sum(["price"]) - sum(["discount", "rebate"])) : null;
  const adPrice = ad?.price ?? null;
  const carPrice = paperPrice == null ? adPrice : adPrice == null ? paperPrice : Math.min(paperPrice, adPrice);
  const adFee = ad && ad.sellerType === "dealer" ? ad.docFee : null;
  const paperDoc = sum(["docFee"]);
  const docFee = adFee != null ? Math.min(adFee, paperDoc || adFee) : paperDoc;
  const gov = sum(["stateFee"]);

  // Tax: recomputed only when the paper's tax matched the state's rule (the tax row says "right").
  const taxRow = check.rows.find((r) => r.line.kind === "tax" && !r.line.declined);
  let tax: number | null = null;
  if (taxRow && taxRow.verdict === "right" && input.state && carPrice != null) {
    const onPrice = /on the price\.$/.test(taxRow.note);
    const t = vehicleTax(input.state, { taxable: onPrice ? carPrice : carPrice + docFee, price: carPrice, seller: "dealer", modelYear: input.modelYear, localPct: 0, now: input.now ?? new Date() });
    tax = r2(t.lines.reduce((s, l) => s + l.amount, 0));
  }
  const plusTax = tax == null && !!taxRow;
  const target = carPrice == null ? null : r2(carPrice + docFee + gov + (tax ?? 0));

  const parts: Plan["parts"] = [
    { label: "The car", amount: carPrice, note: adPrice != null && paperPrice != null && paperPrice > adPrice ? "the advertised price" : undefined },
    ...(docFee ? [{ label: "Doc fee", amount: docFee, note: adFee != null ? "as the ad showed" : "ask for it to be lowered" }] : []),
    ...(gov ? [{ label: "Government fees", amount: gov, note: "title, registration, plates" }] : []),
    ...(tax != null ? [{ label: "Tax", amount: tax, note: "on the lower price" }] : plusTax ? [{ label: "Tax", amount: null, note: "plus tax: ask them to recompute it on the lower price" }] : []),
  ];

  const removes = check.rows.filter((r) => r.verdict === "remove").map((r) => `${r.line.name ?? r.line.label} (${usd(r.line.amount)})`);
  const priceOver = adPrice != null && paperPrice != null && paperPrice > adPrice + 1;
  const L = check.loan;
  const steps = [
    "Agree the out-the-door price first, in writing. Not the monthly payment.",
    "Say no to every add-on and every optional product. You can buy a warranty or GAP later, elsewhere, if you want one.",
    ...(sheet.lines.some((l) => l.kind === "tradeIn") ? ["Then the trade-in, as a separate number. Bring a written offer from CarMax, Carvana or another dealer."] : []),
    "Then the financing: bring a bank or credit union pre-approval and ask the dealer to beat it.",
    "Before you sign, check the final paper again here: every line should match what you agreed.",
    target != null ? `Walk away if they won't come to ${usd(target)}${plusTax ? " plus tax" : ""} out the door. Other cars like this one exist.` : "Walk away if they won't put an itemized out-the-door price in writing.",
  ];

  const car = input.car ? `the ${input.car}` : "the car";
  const lines: string[] = [];
  if (target != null) {
    const made = parts.filter((p) => p.amount != null).map((p) => `${usd(p.amount!)} ${p.label === "The car" ? "for the car" : p.label === "Doc fee" ? "doc fee" : p.label === "Government fees" ? "in government fees" : "tax"}`);
    lines.push(`Hi, I'm ready to buy ${car} at ${usd(target)}${plusTax ? " plus tax" : ""} out the door: ${made.join(", ")}.`);
  } else {
    lines.push(`Hi, I'm interested in ${car}. Please send me an itemized out-the-door price.`);
  }
  if (priceOver) lines.push(`Your buyer's order shows ${usd(paperPrice!)} for the car; it was advertised at ${usd(adPrice!)}. Please honor the advertised price.`);
  if (removes.length) lines.push(`Please remove ${removes.length === 1 ? removes[0] : `${removes.slice(0, -1).join(", ")} and ${removes[removes.length - 1]}`}. I'm not buying any add-ons.`);
  if (L && L.verdict !== "right" && L.diff > 0) lines.push(`Your payment of ${cents(L.stated)} doesn't match ${cents(L.principal)} at ${L.aprPct}% for ${L.months} months (${cents(L.expected)}). Please list everything included in it.`);
  if (L && input.myAprPct != null && input.myAprPct < L.aprPct) lines.push(`I'm pre-approved at ${input.myAprPct}%. Can you beat that rate?`);
  lines.push("Please send an updated, itemized buyer's order. Thank you.");

  return { target, parts, plusTax, steps, message: lines.join(" "), scripts: SCRIPTS };
}
