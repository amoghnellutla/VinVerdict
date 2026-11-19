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
// The same papers in Spanish (California requires the contract in Spanish when the deal was negotiated in Spanish).
const WORDS_ES: typeof WORDS = {
  price: ["Precio del vehículo", "Precio de venta", "Precio de contado del vehículo", "Precio de contado"],
  doc: ["Cargo por documentación", "Cargo por procesamiento de documentos", "Cargo de documentos"],
  gov: ["Tasas de licencia", "Cuotas de registro", "Título y registro", "Placas y registro"],
  tax: ["Impuesto sobre las ventas", "Impuesto de venta", "Impuesto"],
  total: ["Total", "Precio total de contado", "Total a pagar"],
  down: ["Pago inicial", "Enganche"],
  trade: ["Valor de intercambio", "Crédito por intercambio"],
  payoff: ["Saldo del intercambio", "Liquidación del intercambio"],
  balance: ["Saldo adeudado", "Saldo a pagar"],
  financed: ["Importe financiado", "Monto financiado"],
  discount: ["Descuento del concesionario", "Descuento"],
  rebate: ["Reembolso del fabricante", "Rebaja"],
  addOn: [["Grabado del VIN", 399], ["Nitrógeno", 199], ["Protección de pintura", 1295], ["Polarizado", 499], ["Ajuste de mercado", 2000]],
  product: [["Contrato de servicio", 2895], ["Protección GAP", 895], ["Garantía extendida", 1595]],
  padding: [["Preparación del concesionario", 499], ["Preparación", 349]],
};

// A dealer-system printout: the same lines, abbreviated.
const WORDS_DMS: typeof WORDS = {
  price: ["SLS PRC", "VEH PRICE", "CASH PRC", "SELL PRICE"],
  doc: ["DOC FEE", "DOCS", "PROC FEE"],
  gov: ["TTL/LIC", "REG", "TITLE/REG", "TAG/TITLE", "DMV"],
  tax: ["SLS TAX", "ST TAX", "SALES TX"],
  total: ["TOTAL", "TOTAL DUE", "TOT"],
  down: ["DWN PMT", "CASH DN", "DEP"],
  trade: ["TRD ALLOW", "TRADE ALLOW"],
  payoff: ["TRD PAYOFF", "TRADE P/O"],
  balance: ["BAL DUE"],
  financed: ["AMT FIN", "AMT FINANCED"],
  discount: ["DLR DISC", "DISC"],
  rebate: ["MFR RBT", "RBT"],
  addOn: [["ETCH", 399], ["N2", 199], ["PNT PROT", 1295], ["TINT", 499], ["MKT ADJ", 2000]],
  product: [["SVC CONT", 2895], ["GAP INS", 895], ["T&W", 1195], ["MBI", 1795]],
  padding: [["DLR PREP", 499], ["RECON", 895]],
};

const RATE: Partial<Record<StateCode, number>> = { NJ: 0.06625, PA: 0.06, TX: 0.0625, VA: 0.0415, IN: 0.07, CA: 0.0725, MD: 0.065, MN: 0.06875 };
// The doc-fee caps confirmed in check.ts, for the states above that have one.
const CAP: Partial<Record<StateCode, number>> = { CA: 85, MD: 800, MN: 350 };

export type Problem = "none" | "addOn" | "product" | "overAd" | "packed" | "docOverCap" | "padding" | "combo";
export type Paper = { text: string; state: StateCode; ad: { price: number; docFee: number | null; sellerType: "dealer" } | null; problem: Problem; printed: Set<string>; name: string; hasLoan: boolean; condition: "new" | "used"; /** How many add-ons were planted (each must be found). */ planted: number; /** The trade-in owes more than it's worth. */ negativeEquity: boolean };

export function makePaper(seed: number, hard = false, condition: "new" | "used" = "used"): Paper {
  const rand = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const chance = (p: number) => hard && rand() < p;
  const state = pick(Object.keys(RATE) as StateCode[]);
  // Some hard papers are in Spanish.
  const es = chance(0.15);
  const dms = !es && chance(0.15);
  // (A dealer-system printout is line by line, never an email.)
  const W = es ? WORDS_ES : dms ? WORDS_DMS : WORDS;
  const drawn: Problem = pick(["none", "none", "none", "addOn", "product", "overAd", "packed", "docOverCap", "padding", "combo"]);
  // A doc fee over the legal cap needs a state with one.
  const problem: Problem = drawn === "docOverCap" && !CAP[state] ? "none" : drawn;
  const price = Math.round(8000 + rand() * 40000);
  const cap = CAP[state];
  const drawnDoc = pick([0, 85, 175, 299, 499, 699, 799, 899]);
  // Within the cap, except for a planted fee over it.
  const doc = cap == null ? drawnDoc : problem === "docOverCap" ? cap + pick([15, 50, 114, 250]) : Math.min(drawnDoc, cap);
  const gov = r2(30 + rand() * 300);
  // One add-on, or (hard) two or three different ones; "combo" is add-ons plus a price over the ad.
  const addOns = (k: number) => [...W.addOn].sort(() => rand() - 0.5).slice(0, k);
  const extra: [string, number][] = problem === "addOn" ? addOns(hard ? pick([1, 1, 2, 3]) : 1)
    : problem === "combo" ? addOns(pick([1, 2]))
      : problem === "product" ? [pick(W.product)] : problem === "padding" ? [pick(W.padding)] : [];
  const taxedExtras = problem === "addOn" || problem === "padding" || problem === "combo" ? extra.reduce((s, e) => s + e[1], 0) : 0;
  // A discount or rebate printed under a higher listed price: the net is still the ad's price.
  const credit = chance(0.3) ? Math.round(300 + rand() * 1500) : 0;
  const creditIsRebate = rand() >= 0.5;
  const creditRow: [string, number][] = credit ? [[pick(creditIsRebate ? W.rebate : W.discount), credit]] : [];
  const netPrice = problem === "overAd" || problem === "combo" ? price + Math.round(300 + rand() * 1500) : price;
  const listed = netPrice + credit;
  // A new car's destination charge (on its window sticker): part of the price, taxed, in the total.
  const destination = condition === "new" ? pick([995, 1095, 1295, 1395, 1595, 1695]) : 0;
  const destRow: [string, number][] = destination ? [[pick(es ? ["Cargo de destino", "Flete"] : dms ? ["DEST", "FRT", "DEST/FRT"] : ["Destination Charge", "Freight", "Destination & Handling", "Destination"]), destination]] : [];
  const hasTrade = rand() < 0.3;
  const trade = hasTrade ? Math.round(2000 + rand() * 8000) : 0;
  // How the state works out the tax: most take off the trade-in; some tax the price before a maker's rebate.
  // (Only where enough is left to tax: a trade-in worth more than the car leaves no realistic tax line.)
  const taxLessTrade = trade > 0 && netPrice - trade >= 3000 && chance(0.5);
  const taxBeforeRebate = credit > 0 && creditIsRebate && chance(0.5);
  const taxable = netPrice + (taxBeforeRebate ? credit : 0) + destination + doc + taxedExtras - (taxLessTrade ? trade : 0);
  const tax = r2(taxable * RATE[state]!);
  const total = r2(netPrice + destination + doc + gov + tax + extra.reduce((s, e) => s + e[1], 0));
  // A payoff, sometimes (hard) more than the trade-in is worth: negative equity carried into the deal.
  const underwater = hasTrade && chance(0.25);
  const payoff = hasTrade && (underwater || rand() < 0.5) ? Math.round(trade * (underwater ? 1.1 + rand() * 0.5 : 0.5 + rand() * 0.4)) : 0;
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
    [pick(W.price), listed],
    ...destRow,
    ...creditRow,
    // A summary that repeats the credit ("Total Savings").
    ...(creditRow.length && hard && rand() < 0.3 ? [[pick(["Total Savings", "You Save", "Total Discounts"]), credit] as [string, number]] : []),
    ...(doc ? [[pick(W.doc), doc] as [string, number]] : []),
    ...(risc ? [] : extra),
    [pick(W.gov), gov],
    [pick(W.tax), tax],
    [pick(W.total), r2(total - productCost)],
    ...(trade ? [[pick(W.trade), trade] as [string, number]] : []),
    ...(payoff ? [[pick(W.payoff), payoff] as [string, number]] : []),
    ...(down ? [[pick(W.down), down] as [string, number]] : []),
    ...(risc
      ? [[pick(["Unpaid Balance of Cash Price", "Unpaid Balance", "Unpaid Cash Balance"]), r2(balance - productCost)] as [string, number], ...extra]
      : trade || down || payoff ? [[pick(W.balance), balance] as [string, number]] : []),
    ...(hasLoan ? [[pick(W.financed), balance] as [string, number]] : []),
  ];
  // Whole-dollar amounts print without cents on some papers.
  const noCents = chance(0.2);
  const m = (a: number) => money(a, !(noCents && Number.isInteger(a)));
  const layout = hard ? pick(["dots", "colon", "tabs", "spaces", "pairs", "columns", "dash", ...(dms ? [] : ["email", "sentences"]), "amountFirst", "csv", "sheet"]) : pick(["dots", "colon", "tabs", "spaces", "pairs"]);
  const fmt = ([l, a]: [string, number]) => (layout === "amountFirst" ? `${m(a)}    ${l}` : layout === "csv" ? `${l.includes(",") ? `"${l}"` : l},${plain(a)}` : layout === "sheet" ? `${l}\t${plain(a)}` : layout === "dots" ? `${l} .......... ${m(a)}` : layout === "colon" ? `${l}: ${m(a)}` : layout === "tabs" ? `${l}\t\t${m(a)}` : layout === "dash" ? `${l} - ${m(a)}` : `${l}    ${m(a)}`);
  // Layouts with one line per item (the decorations below edit those lines).
  const prose = layout === "email" || layout === "sentences";
  // A spreadsheet export: "Vehicle Price,21998.00" (CSV) or a tab between label and a bare number (pasted from a sheet).
  const plain = (a: number) => a.toFixed(2);
  const perLine = layout !== "pairs" && layout !== "columns" && !prose;
  const body = layout === "email"
    // An emailed quote: one comma list.
    ? [`Hi, here's your quote: ${rows.map(([l, a]) => `${l.toLowerCase()} ${m(a)}`).join(", ")}.`, "Let me know!"]
    : layout === "sentences"
      // A quote in sentences, several on a line.
      ? [`Thanks for coming in. ${rows.map(([l, a]) => `The ${l.toLowerCase()} is ${m(a)}.`).join(" ")} Let me know if you have questions.`]
      : layout === "pairs"
    ? rows.reduce<string[]>((acc, r, i) => (i % 2 ? (acc[acc.length - 1] += `    ${r[0]} ${m(r[1])}`, acc) : [...acc, `${r[0]} ${m(r[1])}`]), [])
    : layout === "columns"
      ? ["ITEMIZATION", ...rows.map((r) => r[0]), ...rows.map((r) => m(r[1]))]
      : rows.map(fmt);
  // The tax line with what it's worked out on: "Sales Tax 6.625% of $23,000.00   $1,523.75".
  if (hard && perLine && chance(0.3)) {
    const at = rows.findIndex((r) => r[1] === tax);
    const pct = r2(RATE[state]! * 100);
    body[at] = pick([`${rows[at][0]} ${pct}% of ${m(taxable)}    ${m(tax)}`, `${rows[at][0]} (${pct}% x ${m(taxable)})    ${m(tax)}`, `${rows[at][0]} @ ${pct}% on ${m(taxable)}    ${m(tax)}`]);
  }
  // A note in brackets with its own amount: a former price, or the payoff beside the trade-in.
  if (hard && perLine && chance(0.3)) {
    body[0] = `${body[0]} (was ${m(listed + pick([500, 1000, 1500]))})`;
    const t = rows.findIndex((r) => r[1] === trade && trade > 0);
    if (t >= 0 && payoff) body[t] = body[t].replace(/(\$[\d,.]+)\s*$/, (amt) => `(payoff ${m(payoff)}) ${amt}`);
  }
  // A planted add-on or product on a contract with tick boxes, ticked as taken (before any line is inserted, so body still lines up with rows).
  if (hard && perLine && (problem === "addOn" || problem === "product") && chance(0.3)) {
    const at = rows.findIndex((r) => r[0] === extra[0][0]);
    if (at >= 0 && body[at]) body[at] = `${extra[0][0]}  ${pick(["[X] Accept  [ ] Decline", "(X) Yes  ( ) No", "☒ Accept  ☐ Decline"])}  ${m(extra[0][1])}`;
  }
  // A declined add-on printed on the paper (not charged): "DECLINED", "$0.00", or a tick box with its price.
  const tickedOff: number[] = [];
  if (chance(0.3) && layout !== "columns" && !prose) {
    const [l, a] = pick(W.addOn);
    const how = rand();
    if (how >= 0.66) tickedOff.push(a);
    body.splice(2, 0, how < 0.33 ? `${l} .......... DECLINED` : how < 0.66 ? `${l} $0.00` : `${l}  ${pick(["[ ] Accept  [X] Decline", "( ) Yes  (X) No", "☐ Accept  ☒ Decline"])}  ${m(a)}`);
  }
  // A page break with the form's header repeated.
  if (chance(0.2) && layout !== "columns" && !prose && body.length > 4) body.splice(4, 0, "Page 1 of 2", "BUYER'S ORDER (continued)");
  // Loan terms as printed: a term and payment, or a schedule with a final payment a few cents different.
  const finalStyle = hasLoan && chance(0.3);
  const finalPay = r2(payment + Math.round(rand() * 60) / 100);
  // A finance contract's Truth-in-Lending box: headings, their explanations, then the values, and the payment schedule.
  const tilaStyle = hasLoan && !finalStyle && chance(0.3);
  const totalOfPayments = r2(payment * months);
  const tila = [
    "ANNUAL PERCENTAGE RATE    FINANCE CHARGE    Amount Financed    Total of Payments    Total Sale Price",
    "The cost of your credit as a yearly rate.    The dollar amount the credit will cost you.    The amount of credit provided to you or on your behalf.    The amount you will have paid after you have made all payments as scheduled.    The total cost of your purchase on credit, including your down payment of " + money(down + trade),
    `${apr} %    ${money(r2(totalOfPayments - balance))}    ${money(balance)}    ${money(totalOfPayments)}    ${money(r2(totalOfPayments + down + trade))}`,
    "Your payment schedule will be:",
    "Number of Payments    Amount of Payments    When Payments Are Due",
    `${months}    ${money(payment)}    Monthly beginning 12/15/2026`,
  ];
  const loanLines = !hasLoan
    ? []
    : tilaStyle
      ? tila
      : finalStyle
      ? [`Annual Percentage Rate ${apr}%`, `Your payment schedule: ${months - 1} payments of ${money(payment)} monthly and 1 final payment of ${money(finalPay)}`]
      : dms
        ? [`APR ${apr}%  TERM ${months}  MO PMT ${money(payment)}`]
        : es
        ? [`Tasa de porcentaje anual ${apr}%`, `Plazo ${months} meses`, `Pago mensual ${money(payment)}`, ...(rand() < 0.7 ? [`Total de pagos ${money(r2(payment * months))}`] : [])]
        : [`Annual Percentage Rate ${apr}%`, `Term ${months} months`, `Monthly Payment ${money(payment)}`, ...(rand() < 0.7 ? [`Total of Payments ${money(r2(payment * months))}`] : [])];
  // The buyer's details, as different forms print them.
  const street = `${Math.round(rand() * 900 + 10)} Sample Rd`;
  const stock = `Stock # ${Math.round(rand() * 90000 + 10000)}`;
  const who = es
    ? pick([[`Comprador: ${name}`, `Dirección: ${street}, Anytown, CA 90001`, stock], ["VENDIDO A:", name.toUpperCase(), `${street}, Anytown`, stock]])
    : hard
    ? pick([
        [`Buyer: ${name}`, `Address: ${street}, Anytown`, stock],
        [`${stock}      Buyer: ${name}`, `Date: 11/15/2026\tAddress: ${street}`],
        ["SOLD TO:", name.toUpperCase(), `${street}, Anytown, NJ 07001`, stock],
        [`Buyer Name and Address: ${name}, ${street}, Anytown, NJ 07001`, stock],
        ["BUYER", name, stock],
      ])
    : [`Buyer: ${name}`, `Address: ${street}, Anytown`, stock];
  // The paper's own reference numbers, never money.
  const refs = hard && chance(0.5)
    ? [pick([`Contract No. ${Math.round(rand() * 90000 + 10000).toLocaleString("en-US")}`, `Deal # ${Math.round(rand() * 90000 + 10000).toLocaleString("en-US")}`]),
       `Odometer: ${Math.round(rand() * 120000 + 1000).toLocaleString("en-US")}`,
       pick([`Customer # ${Math.round(rand() * 90000 + 10000).toLocaleString("en-US")}`, `Lot ${Math.round(rand() * 9000 + 1000).toLocaleString("en-US")}   Key Tag ${Math.round(rand() * 9000 + 1000).toLocaleString("en-US")}`, `Weight ${Math.round(rand() * 2000 + 2800).toLocaleString("en-US")} lbs`])]
    : [];
  let text = [pick(["BUYER'S ORDER", "PURCHASE AGREEMENT", "DEAL WORKSHEET", "Retail Purchase Order"]), ...who, ...refs, ...body, ...loanLines].join("\n");
  if (chance(0.25)) text = text.toUpperCase();
  // OCR misreads: a thousands comma read as a period, or a space after "$".
  if (chance(0.25)) text = text.replace(/\$(\d{1,3}),(\d{3})/g, "$$$1.$2");
  else if (chance(0.2)) text = text.replace(/\$(\d)/g, "$$ $1");
  // …or "$" read as "S", or the gap before "$" lost (PDF text).
  else if (chance(0.15)) text = text.replace(/\$(\d{1,3}(?:,\d{3})*\.\d{2})/g, "S$1");
  else if (chance(0.15)) text = text.replace(/(?<! ) \$/g, "$$");
  const printed = new Set([...rows.map((r) => r[1]), ...tickedOff, payment, r2(payment * months), apr, 0, ...(tilaStyle ? [r2(totalOfPayments - balance), r2(totalOfPayments + down + trade), down + trade] : [])].map((n) => n.toFixed(2)));
  // A used car's ad shows its price and the dealer's fee; a new car's sticker shows the price with destination, no dealer fee.
  const ad = rand() < 0.8 ? (condition === "new" ? { price: price + destination, docFee: null, sellerType: "dealer" as const } : { price, docFee: doc, sellerType: "dealer" as const }) : null;
  // A packed payment needs a loan: with none (the trade-in and down payment cover it all) the paper is a clean one.
  return { text, state, ad, problem: problem === "packed" && !hasLoan ? "none" : problem, printed, name, hasLoan, condition, planted: problem === "addOn" || problem === "combo" ? extra.length : 0, negativeEquity: payoff > trade && trade > 0 };
}

export type LeasePaper = { text: string; problem: "none" | "addOn" | "padded"; printed: Set<string>; name: string; ad: { price: number; docFee: null; sellerType: "dealer" } };

/**
 * A lease worksheet or the federal lease disclosure, with the lease math done here: the selling price, a cap cost
 * reduction, the residual, the money factor (or the rent charge it gives), the term and the payment. Optionally an
 * add-on in the cap cost, or a payment above the lease math.
 */
export function makeLease(seed: number): LeasePaper {
  const rand = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const problem = pick(["none", "none", "addOn", "padded"] as const);
  const price = Math.round(22000 + rand() * 30000);
  const acq = pick([595, 650, 695, 895, 995]);
  const doc = pick([85, 175, 299, 499]);
  const addOn: [string, number] | null = problem === "addOn" ? pick([["Paint & Fabric Protection", 1295], ["VIN Etching", 399], ["Nitrogen Tire Fill", 199]] as [string, number][]) : null;
  const gross = price + acq + doc + (addOn ? addOn[1] : 0);
  const reduction = pick([0, 1000, 2000, 3000]);
  const adjusted = gross - reduction;
  const months = pick([24, 36, 39, 48]);
  const residual = Math.round(price * pick([0.5, 0.55, 0.58, 0.62]));
  const mf = pick([0.00125, 0.0015, 0.00175, 0.0021, 0.0025]);
  const rent = Math.round((adjusted + residual) * mf * months * 100) / 100;
  const base = Math.round(((adjusted - residual) / months + (adjusted + residual) * mf) * 100) / 100;
  const payment = problem === "padded" ? Math.round((base + 25 + rand() * 40) * 100) / 100 : base;
  const name = `${pick(["Pat", "Sam", "Alex"])} ${pick(["Example", "Sample"])}`;
  const m = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const disclosure = rand() < 0.5;
  const lines = disclosure
    ? [
        "CLOSED-END MOTOR VEHICLE LEASE AGREEMENT",
        `Lessee: ${name}`,
        `Gross capitalized cost ${m(gross)}`,
        ...(addOn ? [`${addOn[0]} ${m(addOn[1])}`] : []),
        `Capitalized cost reduction ${m(reduction)}`,
        `Adjusted capitalized cost ${m(adjusted)}`,
        `Residual value ${m(residual)}`,
        `Depreciation and any amortized amounts ${m(adjusted - residual)}`,
        `Rent charge ${m(rent)}`,
        `Lease term ${months} months`,
        `Base monthly payment ${m(payment)}`,
      ]
    : [
        "LEASE WORKSHEET",
        `Customer: ${name}`,
        `Vehicle Selling Price ${m(price)}`,
        `Acquisition Fee ${m(acq)}`,
        `Doc Fee ${m(doc)}`,
        ...(addOn ? [`${addOn[0]} ${m(addOn[1])}`] : []),
        `Gross Capitalized Cost ${m(gross)}`,
        `Cap Cost Reduction ${m(reduction)}`,
        `Adjusted Capitalized Cost ${m(adjusted)}`,
        `Residual Value ${m(residual)}`,
        `Money Factor ${String(mf).replace(/^0/, "")}`,
        `Term ${months} months`,
        `Monthly Payment ${m(payment)}`,
      ];
  const printed = new Set([price, acq, doc, gross, reduction, adjusted, residual, adjusted - residual, rent, payment, ...(addOn ? [addOn[1]] : [])].map((n) => n.toFixed(2)));
  return { text: lines.join("\n"), problem, printed, name, ad: { price, docFee: null, sellerType: "dealer" } };
}

export type OptionsPaper = { text: string; problem: "none" | "addOn"; printed: Set<string>; options: number; ad: { price: number; docFee: number; sellerType: "dealer" } };

/** A payment-options worksheet ("four-square"): the price and fees, then two to four terms with a monthly payment each. */
export function makeOptions(seed: number): OptionsPaper {
  const rand = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const problem = pick(["none", "none", "addOn"] as const);
  const price = Math.round(15000 + rand() * 30000);
  const doc = pick([299, 499, 699, 799]);
  const addOn: [string, number] | null = problem === "addOn" ? pick([["VIN Etching", 399], ["Window Tint", 499], ["Appearance Package", 995]] as [string, number][]) : null;
  const down = pick([0, 1000, 2000, 3000]);
  const apr = pick([5.9, 6.9, 7.9, 9.9]);
  const financed = price + doc + (addOn ? addOn[1] : 0) - down;
  const terms = [...[36, 48, 60, 72, 84]].sort(() => rand() - 0.5).slice(0, pick([2, 3, 4])).sort((a, b) => a - b);
  const m = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pays = terms.map((t) => monthlyPayment(financed, apr, t));
  const style = pick(["mo", "months at", "colon"]);
  const optLines = terms.map((t, i) => (style === "mo" ? `${t} mo  $${Math.round(pays[i])}/mo` : style === "months at" ? `${t} months at $${pays[i].toFixed(2)} a month` : `${t} months: $${Math.round(pays[i])}`));
  const lines = [
    "DEAL WORKSHEET",
    `Selling Price ${m(price)}`,
    `Doc Fee ${m(doc)}`,
    ...(addOn ? [`${addOn[0]} ${m(addOn[1])}`] : []),
    ...(down ? [`Cash Down ${m(down)}`] : []),
    "PAYMENT OPTIONS",
    ...optLines,
  ];
  const printed = new Set([price, doc, down, ...(addOn ? [addOn[1]] : [])].map((n) => n.toFixed(2)));
  return { text: lines.join("\n"), problem, printed, options: terms.length, ad: { price, docFee: doc, sellerType: "dealer" } };
}

/** Every line name the generator writes, with what it is (training data for the line model in lib/ml). */
export function generatorLabels(): [string, string][] {
  const kind: Record<keyof typeof WORDS, string> = {
    price: "price", doc: "docFee", gov: "stateFee", tax: "tax", total: "total", down: "downPayment", trade: "tradeIn", payoff: "payoff",
    balance: "balanceDue", financed: "amountFinanced", discount: "discount", rebate: "rebate", addOn: "addOn", product: "loanProduct", padding: "dealerFee",
  };
  const out: [string, string][] = [];
  for (const w of [WORDS, WORDS_ES, WORDS_DMS]) {
    for (const k of Object.keys(kind) as (keyof typeof WORDS)[]) {
      for (const e of w[k] as (string | [string, number])[]) out.push([typeof e === "string" ? e : e[0], kind[k]]);
    }
  }
  return out;
}
