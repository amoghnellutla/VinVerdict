/**
 * The paper generator behind fuzz.test.ts: random wording, layout, money and loan terms, with the arithmetic done
 * here so the paper is right, then optionally one planted problem. `hard` adds what real papers do to a reader:
 * ALL-CAPS printouts, labels and amounts in separate columns, OCR misreads, amounts without cents, declined
 * add-ons printed on the paper, dealer discounts and maker rebates, and a page-2 header in the middle.
 */

import type { StateCode } from "@/lib/geo/zip";
import { monthlyPayment } from "./loan";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number, cents = true) => `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

const WORDS = {
  price: ["Vehicle Price", "Selling Price", "Cash Price of Vehicle", "Sale Price", "Agreed Price", "Purchase Price", "Price of Vehicle"],
  doc: ["Doc Fee", "Documentation Fee", "Documentary Fee", "Dealer Documentary Fee", "Processing Fee", "Administrative Fee"],
  gov: ["Title & Registration", "Title/Reg Fees", "MVC Fees", "DMV Fees", "Title Fee", "Registration Fee", "License and Title", "Reg Fee", "Lic & Reg", "BMV Fees", "License Fees", "TT&L"],
  tax: ["Sales Tax", "State Sales Tax", "Tax", "Sales/Use Tax"],
  total: ["Total Price", "Total", "Total Cash Price", "Out the Door Price", "Grand Total"],
  down: ["Cash Down", "Down Payment", "Deposit"],
  trade: ["Trade-In Allowance", "Trade Allowance", "Trade-In Value"],
  payoff: ["Payoff on Trade", "Trade Payoff", "Lien Payoff"],
  balance: ["Balance Due", "Amount Due"],
  financed: ["Amount Financed", "Amount to Finance"],
  discount: ["Dealer Discount", "Discount", "Internet Savings"],
  rebate: ["Manufacturer Rebate", "Factory Rebate", "Loyalty Rebate"],
  addOn: [["VIN Etching", 399], ["Nitrogen Tire Fill", 199], ["Paint & Fabric Protection", 1295], ["Window Tint", 499], ["Wheel Locks", 89], ["Market Adjustment", 2000]] as [string, number][],
  product: [["Service Contract", 2895], ["GAP Protection", 895], ["Tire & Wheel Protection", 1195]] as [string, number][],
  // Dealer charges on top of the price.
  padding: [["Dealer Prep", 499], ["Reconditioning Fee", 895], ["Pre-Delivery Inspection", 299], ["Delivery Fee", 349], ["PDI", 199], ["Dealer Inspection Fee", 249]] as [string, number][],
};
const RATE: Partial<Record<StateCode, number>> = { NJ: 0.06625, PA: 0.06, TX: 0.0625, VA: 0.0415, IN: 0.07, CA: 0.0725, MD: 0.065, MN: 0.06875 };
// The doc-fee caps confirmed in check.ts, for the states above that have one.
const CAP: Partial<Record<StateCode, number>> = { CA: 85, MD: 800, MN: 350 };

export type Problem = "none" | "addOn" | "product" | "overAd" | "packed" | "docOverCap" | "padding";
export type Paper = { text: string; state: StateCode; ad: { price: number; docFee: number | null; sellerType: "dealer" } | null; problem: Problem; printed: Set<string>; name: string; hasLoan: boolean; condition: "new" | "used" };

export function makePaper(seed: number, hard = false, condition: "new" | "used" = "used"): Paper {
  const rand = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const chance = (p: number) => hard && rand() < p;
  const state = pick(Object.keys(RATE) as StateCode[]);
  const drawn: Problem = pick(["none", "none", "none", "addOn", "product", "overAd", "packed", "docOverCap", "padding"]);
  // A doc fee over the legal cap needs a state with one.
  const problem: Problem = drawn === "docOverCap" && !CAP[state] ? "none" : drawn;
  const price = Math.round(8000 + rand() * 40000);
  const cap = CAP[state];
  const drawnDoc = pick([0, 85, 175, 299, 499, 699, 799, 899]);
  // Within the cap, except for a planted fee over it.
  const doc = cap == null ? drawnDoc : problem === "docOverCap" ? cap + pick([15, 50, 114, 250]) : Math.min(drawnDoc, cap);
  const gov = r2(30 + rand() * 300);
  const extra: [string, number][] = problem === "addOn" ? [pick(WORDS.addOn)] : problem === "product" ? [pick(WORDS.product)] : problem === "padding" ? [pick(WORDS.padding)] : [];
  // A discount or rebate printed under a higher listed price: the net is still the ad's price.
  const credit = chance(0.3) ? Math.round(300 + rand() * 1500) : 0;
  const creditIsRebate = rand() >= 0.5;
  const creditRow: [string, number][] = credit ? [[pick(creditIsRebate ? WORDS.rebate : WORDS.discount), credit]] : [];
  const netPrice = problem === "overAd" ? price + Math.round(300 + rand() * 1500) : price;
  const listed = netPrice + credit;
  // A new car's destination charge (on its window sticker): part of the price, taxed, in the total.
  const destination = condition === "new" ? pick([995, 1095, 1295, 1395, 1595, 1695]) : 0;
  const destRow: [string, number][] = destination ? [[pick(["Destination Charge", "Freight", "Destination & Handling", "Destination"]), destination]] : [];
  const hasTrade = rand() < 0.3;
  const trade = hasTrade ? Math.round(2000 + rand() * 8000) : 0;
  // How the state works out the tax: most take off the trade-in; some tax the price before a maker's rebate.
  // (Only where enough is left to tax: a trade-in worth more than the car leaves no realistic tax line.)
  const taxLessTrade = trade > 0 && netPrice - trade >= 3000 && chance(0.5);
  const taxBeforeRebate = credit > 0 && creditIsRebate && chance(0.5);
  const taxable = netPrice + (taxBeforeRebate ? credit : 0) + destination + doc + (problem === "addOn" || problem === "padding" ? extra[0][1] : 0) - (taxLessTrade ? trade : 0);
  const tax = r2(taxable * RATE[state]!);
  const total = r2(netPrice + destination + doc + gov + tax + extra.reduce((s, e) => s + e[1], 0));
  const payoff = hasTrade && rand() < 0.5 ? Math.round(trade * (0.5 + rand() * 0.4)) : 0;
  const down = rand() < 0.6 ? pick([500, 1000, 2000, 3000, 5000]) : 0;
  const balance = r2(total - trade + payoff - down);
  const hasLoan = balance > 1500 && (rand() < 0.6 || problem === "packed");
  const apr = pick([3.9, 4.99, 5.49, 6.9, 7.9, 9.99, 12.5]);
  const months = pick([36, 48, 60, 66, 72, 84]);
  const exact = monthlyPayment(balance, apr, months);
  const payment = problem === "packed" ? r2(exact + 20 + Math.round(rand() * 40)) : exact;
  const name = `${pick(["Pat", "Sam", "Alex", "Jordan"])} ${pick(["Example", "Sample", "Tester"])}`;

  // An installment contract's layout: the cash price total, the credits, the "Unpaid Balance of Cash Price", then
  // the loan products after it, then the Amount Financed (a principal that isn't the unpaid balance).
  const risc = hard && problem === "product" && hasLoan && chance(0.5);
  const productCost = risc ? extra[0][1] : 0;
  const rows: [string, number][] = [
    [pick(WORDS.price), listed],
    ...destRow,
    ...creditRow,
    ...(doc ? [[pick(WORDS.doc), doc] as [string, number]] : []),
    ...(risc ? [] : extra),
    [pick(WORDS.gov), gov],
    [pick(WORDS.tax), tax],
    [pick(WORDS.total), r2(total - productCost)],
    ...(trade ? [[pick(WORDS.trade), trade] as [string, number]] : []),
    ...(payoff ? [[pick(WORDS.payoff), payoff] as [string, number]] : []),
    ...(down ? [[pick(WORDS.down), down] as [string, number]] : []),
    ...(risc
      ? [[pick(["Unpaid Balance of Cash Price", "Unpaid Balance", "Unpaid Cash Balance"]), r2(balance - productCost)] as [string, number], ...extra]
      : trade || down || payoff ? [[pick(WORDS.balance), balance] as [string, number]] : []),
    ...(hasLoan ? [[pick(WORDS.financed), balance] as [string, number]] : []),
  ];
  // Whole-dollar amounts print without cents on some papers.
  const noCents = chance(0.2);
  const m = (a: number) => money(a, !(noCents && Number.isInteger(a)));
  const layout = hard ? pick(["dots", "colon", "tabs", "spaces", "pairs", "columns", "dash"]) : pick(["dots", "colon", "tabs", "spaces", "pairs"]);
  const fmt = ([l, a]: [string, number]) => (layout === "dots" ? `${l} .......... ${m(a)}` : layout === "colon" ? `${l}: ${m(a)}` : layout === "tabs" ? `${l}\t\t${m(a)}` : layout === "dash" ? `${l} - ${m(a)}` : `${l}    ${m(a)}`);
  const body = layout === "pairs"
    ? rows.reduce<string[]>((acc, r, i) => (i % 2 ? (acc[acc.length - 1] += `    ${r[0]} ${m(r[1])}`, acc) : [...acc, `${r[0]} ${m(r[1])}`]), [])
    : layout === "columns"
      ? ["ITEMIZATION", ...rows.map((r) => r[0]), ...rows.map((r) => m(r[1]))]
      : rows.map(fmt);
  // The tax line with what it's worked out on: "Sales Tax 6.625% of $23,000.00   $1,523.75".
  if (hard && layout !== "pairs" && layout !== "columns" && chance(0.3)) {
    const at = rows.findIndex((r) => r[1] === tax);
    const pct = r2(RATE[state]! * 100);
    body[at] = pick([`${rows[at][0]} ${pct}% of ${m(taxable)}    ${m(tax)}`, `${rows[at][0]} (${pct}% x ${m(taxable)})    ${m(tax)}`, `${rows[at][0]} @ ${pct}% on ${m(taxable)}    ${m(tax)}`]);
  }
  // A declined add-on printed on the paper (not charged).
  if (chance(0.3) && layout !== "columns") {
    const [l] = pick(WORDS.addOn);
    body.splice(2, 0, rand() < 0.5 ? `${l} .......... DECLINED` : `${l} $0.00`);
  }
  // A page break with the form's header repeated.
  if (chance(0.2) && layout !== "columns" && body.length > 4) body.splice(4, 0, "Page 1 of 2", "BUYER'S ORDER (continued)");
  // Loan terms as printed: a term and payment, or a schedule with a final payment a few cents different.
  const finalStyle = hasLoan && chance(0.3);
  const finalPay = r2(payment + Math.round(rand() * 60) / 100);
  const loanLines = !hasLoan
    ? []
    : finalStyle
      ? [`Annual Percentage Rate ${apr}%`, `Your payment schedule: ${months - 1} payments of ${money(payment)} monthly and 1 final payment of ${money(finalPay)}`]
      : [`Annual Percentage Rate ${apr}%`, `Term ${months} months`, `Monthly Payment ${money(payment)}`, ...(rand() < 0.7 ? [`Total of Payments ${money(r2(payment * months))}`] : [])];
  // The buyer's details, as different forms print them.
  const street = `${Math.round(rand() * 900 + 10)} Sample Rd`;
  const stock = `Stock # ${Math.round(rand() * 90000 + 10000)}`;
  const who = hard
    ? pick([
        [`Buyer: ${name}`, `Address: ${street}, Anytown`, stock],
        [`${stock}      Buyer: ${name}`, `Date: 11/15/2026\tAddress: ${street}`],
        ["SOLD TO:", name.toUpperCase(), `${street}, Anytown, NJ 07001`, stock],
        [`Buyer Name and Address: ${name}, ${street}, Anytown, NJ 07001`, stock],
        ["BUYER", name, stock],
      ])
    : [`Buyer: ${name}`, `Address: ${street}, Anytown`, stock];
  let text = [pick(["BUYER'S ORDER", "PURCHASE AGREEMENT", "DEAL WORKSHEET", "Retail Purchase Order"]), ...who, ...body, ...loanLines].join("\n");
  if (chance(0.25)) text = text.toUpperCase();
  // OCR misreads: a thousands comma read as a period, or a space after "$".
  if (chance(0.25)) text = text.replace(/\$(\d{1,3}),(\d{3})/g, "$$$1.$2");
  else if (chance(0.2)) text = text.replace(/\$(\d)/g, "$$ $1");
  // …or "$" read as "S", or the gap before "$" lost (PDF text).
  else if (chance(0.15)) text = text.replace(/\$(\d{1,3}(?:,\d{3})*\.\d{2})/g, "S$1");
  else if (chance(0.15)) text = text.replace(/(?<! ) \$/g, "$$");
  const printed = new Set([...rows.map((r) => r[1]), payment, r2(payment * months), apr, 0].map((n) => n.toFixed(2)));
  // A used car's ad shows its price and the dealer's fee; a new car's sticker shows the price with destination, no dealer fee.
  const ad = rand() < 0.8 ? (condition === "new" ? { price: price + destination, docFee: null, sellerType: "dealer" as const } : { price, docFee: doc, sellerType: "dealer" as const }) : null;
  // A packed payment needs a loan: with none (the trade-in and down payment cover it all) the paper is a clean one.
  return { text, state, ad, problem: problem === "packed" && !hasLoan ? "none" : problem, printed, name, hasLoan, condition };
}
