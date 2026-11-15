/**
 * Reads a dealer's numbers (buyer's order, worksheet, purchase agreement, retail installment contract, or an
 * out-the-door quote in an email) into lines: what each line is, its amount, and the loan terms. Any layout:
 * "Label ...... $1,234.00", several pairs on one line, labels and amounts in separate columns (as PDF text
 * extraction and OCR flatten them), "Declined" / "N/A" / "$0" lines that aren't charged.
 *
 * Pure and on the device. The text should already have the buyer's details taken out (`redactDealSheet`).
 * Nothing is guessed: a line it can't place is kept as "other", with its words, for the buyer to ask about.
 */

import { toEnglish } from "./spanish";
import { ocrThousands } from "@/lib/listing/parse";

export type LineKind =
  | "price" | "reference" | "discount" | "rebate" | "tradeIn" | "payoff" | "negativeEquity"
  | "docFee" | "dealerFee" | "addOn" | "loanProduct" | "stateFee" | "tax" | "downPayment"
  | "subtotal" | "total" | "balanceDue" | "amountFinanced" | "loan" | "leaseTerm" | "leaseFee" | "other";

export type DealLine = {
  /** The paper's own words for the line. */
  label: string;
  amount: number;
  kind: LineKind;
  /** Shown on the paper but not charged ("Declined", "N/A", "$0.00"). */
  declined: boolean;
  /** The add-on or product's plain name ("VIN etching"), for the message to the dealer. */
  name?: string;
  /** Read only by the free AI (the pattern reader didn't find it): never a verdict on its own, never in a sum. */
  fromAi?: boolean;
};

export type LoanTerms = {
  aprPct: number | null;
  months: number | null;
  payment: number | null;
  amountFinanced: number | null;
  totalOfPayments: number | null;
  financeCharge: number | null;
  /** A last payment that differs from the others (a final odd payment, or a balloon). */
  finalPayment?: number | null;
};

export type DealSheet = {
  lines: DealLine[];
  loan: LoanTerms;
  /** A lease worksheet (money factor, residual, capitalized cost): the loan check doesn't apply. */
  lease?: boolean;
  /** Several payment options on one worksheet ("60 months $542/mo, 72 months $468/mo"): no single loan. */
  paymentOptions?: { months: number; payment: number }[];
  /** A lease's own numbers, as printed: the adjusted capitalized cost, the residual and the money factor. */
  /** The paper says it's for a new car ("New Vehicle Buyer's Order", "Status: New"), and nothing says used. */
  looksNew?: boolean;
  leaseTerms?: {
    adjustedCap: number | null;
    residual: number | null;
    moneyFactor: number | null;
    /** The federal lease disclosure's "Rent charge" (the lease's interest over the whole term), when there's no money factor. */
    rentCharge?: number | null;
    /** "Depreciation and any amortized amounts". */
    depreciation?: number | null;
    /** The payment before tax ("Base monthly payment"). */
    basePayment?: number | null;
  };
};

/** Credits: they lower what's owed. */
export const CREDIT_KINDS: readonly LineKind[] = ["discount", "rebate", "tradeIn", "downPayment"];
/** Charges: they add to what's owed. */
export const CHARGE_KINDS: readonly LineKind[] = ["price", "docFee", "dealerFee", "addOn", "loanProduct", "stateFee", "tax", "negativeEquity", "payoff", "other"];
export const TOTAL_KINDS: readonly LineKind[] = ["subtotal", "total", "balanceDue", "amountFinanced"];

// Optional add-ons dealers put on cars (FTC consumer guidance: you can say no). Name → the words that mean it.
export const ADD_ONS: [string, RegExp][] = [
  ["Market adjustment", /\b(?:market (?:value )?adjust(?:ment)?|additional dealer (?:markup|mark-up|profit)|a\.?d\.?m\.?|dealer markup)\b/],
  ["VIN etching", /\b(?:vin )?etch(?:ing|ed)?\b|\bglass etch|\btheft[- ]?(?:etch|guard)\b/],
  ["Nitrogen tires", /\bnitrogen\b|\bn2 (?:tire|fill)|\bnitro[- ]?fill\b/],
  ["Paint and fabric protection", /\b(?:paint|fabric|interior|exterior|leather|upholstery|ceramic|clear ?coat|surface)(?: (?:and|&|\/) (?:paint|fabric|interior|exterior|leather))? (?:protection|protectant|sealant|coating|guard|package|pkg)\b|\bappearance (?:protection|package|pkg|plan)\b|\bceramic coat/],
  ["Window tint", /\bwindow tint(?:ing)?\b|\btint(?:ed)? windows?\b|\btint\b|\bwindow film\b/],
  ["Wheel locks", /\bwheel locks?\b|\blocking lug/],
  ["Theft deterrent", /\btheft (?:deterrent|protection|prevention|system|package)\b|\banti[- ]theft\b|\blo-?jack\b|\bgps (?:tracker|tracking|locator)\b|\bstarter interrupt|\bimmobili[sz]er\b/],
  ["Door edge guards", /\bdoor edge guards?\b|\bdoor guards?\b/],
  ["Pinstripe", /\bpin ?strip(?:e|ing)\b/],
  ["Mud flaps or splash guards", /\bmud ?flaps?\b|\bsplash guards?\b/],
  ["Key replacement", /\bkey (?:replacement|protection|fob (?:protection|replacement)|plan)\b/],
  ["Dent and ding protection", /\b(?:dent|ding|paintless dent)(?: and| &)?(?: ding)? (?:protection|repair plan|plan|repair)\b/],
  ["Windshield protection", /\bwindshield (?:protection|repair plan|plan|repair|replacement)\b/],
  ["Roadside assistance", /\broadside\b/],
  // Accessories (mats, racks, hitches). On a new car they may be factory options already on the sticker.
  ["Accessories", /\baccessor(?:y|ies)\b|\bfloor (?:mats?|liners?)\b|\ball[- ]weather (?:mats?|liners?)\b|\bcargo (?:mat|liner|tray|net|cover)\b|\bremote (?:start|starter)\b|\broof rack\b|\bcross ?bars\b|\btonneau\b|\brunning boards?\b|\bstep bars?\b|\bbed ?liner\b|\b(?:tow(?:ing)? )?hitch\b/],
  ["Undercoating or rustproofing", /\bunder ?coat(?:ing)?\b|\brust ?proof(?:ing)?\b|\brust (?:protection|inhibitor|module|guard)\b|\bsound deaden(?:er|ing)\b/],
  ["Clear bra (paint film)", /\bclear ?bra\b|\bppf\b|\bpaint protection film\b/],
  ["Dealer accessories", /\bdealer (?:add(?:ed)?[- ]?ons?|accessories|installed (?:options|accessories|equipment)|options)\b|\b(?:protection|security|convenience|value) (?:package|pkg)\b|\b(?:dealer )?addendum\b/],
];

// Optional products sold with the loan (CFPB: a lender can't require them; you can buy them elsewhere or not at all).
export const LOAN_PRODUCTS: [string, RegExp][] = [
  ["Service contract (extended warranty)", /\bservice (?:contract|agreement)\b|\bextended (?:warranty|service|protection)\b|\bmechanical breakdown\b|\bvsc\b|\bpowertrain (?:protection|plan|warranty)\b|\bwarranty\b|\blifetime (?:powertrain|engine)\b/],
  ["GAP", /\bgap\b|\bguaranteed (?:auto|asset) protection\b|\bdebt cancellation\b/],
  ["Maintenance plan", /\b(?:pre-?paid )?maintenance (?:plan|contract|program|agreement|package)\b|\bpre-?paid maintenance\b|\bcare ?plan\b|\b(?:oil change|tire rotation|service) (?:package|pkg|plan)\b/],
  ["Tire and wheel protection", /\btire (?:and|&|\/) (?:wheel|rim)\b|\btire protection\b|\bwheel protection\b|\broad hazard\b/],
  // Insurance on the car itself: a lender can require it, but you choose the insurer (asked about, not refused).
  ["Car insurance", /\b(?:vehicle|auto|car|physical damage|collision|comprehensive) insurance\b/],
  ["Credit life or disability insurance", /\bcredit (?:life|disability|insurance)\b|\blife insurance\b|\bdisability insurance\b|\baccident (?:and|&) health\b|\ba ?& ?h insurance\b/],
];

const has = (re: RegExp, s: string) => re.test(s);

/** What a line is, from its label (lowercased, with spaces collapsed). */
export function classify(rawLabel: string): { kind: LineKind; name?: string } {
  const l = toEnglish(rawLabel).toLowerCase().replace(/[^a-z0-9%&/$.,'#-]+/g, " ").replace(/\s+/g, " ").trim();
  // Lease terms are information, not charges: the cap cost, residual, money factor, the amount due at signing.
  if (has(/\b(?:gross |adjusted |net )?capitali[sz]ed cost\b|\bcap(?:italized)? cost(?: reduction)?\b|\bresidual\b|\bmoney factor\b|\bdue at (?:signing|lease signing|inception)\b|\bdrive[- ]?off\b|\bfirst month'?s? payment\b|\blease (?:payment|term|rate)\b|\bdepreciation\b|\brent charge\b|\bbase monthly payments?\b/, l)) return { kind: "leaseTerm" };
  // The leasing company's own fees (often marked up by the dealer): asked about, not refused.
  if (has(/\b(?:acquisition|disposition|bank|lease (?:origination|initiation)|lessor) fee\b/, l)) return { kind: "leaseFee" };
  // Loan disclosure words first: "Total of payments" is not the total price.
  if (has(/\b(?:annual percentage rate|apr|interest rate|finance charge|total of payments|total sale price|monthly payment|payment amount|amount of (?:each )?payments?|number of payments|term|first payment|payments? (?:of|due))\b/, l)) return { kind: "loan" };
  if (has(/\bamount financed\b|\bunpaid balance\b|\bamount to (?:be )?financ(?:e|ed)\b|\bamount financing\b|\bto be financed\b|\bloan amount\b|\bbalance to finance\b|\btotal (?:amount )?financed\b/, l)) return { kind: "amountFinanced" };
  if (has(/\bnegative equity\b/, l)) return { kind: "negativeEquity" };
  if (has(/\b(?:trade[- ]?in )?pay-?off\b|\blien (?:payoff|balance)\b|\bowed on (?:the )?trade\b|\bbalance owed\b|\bprior (?:credit|lease) (?:or lease )?balance\b/, l)) return { kind: "payoff" };
  // "Trade Difference" (Texas) is the price less the trade-in: a subtotal, not a credit.
  if (has(/\b(?:trade|cash) difference\b/, l)) return { kind: "subtotal" };
  if (has(/\btrade[- ]?in\b|\btrade (?:allowance|value|credit|equity)\b|\ballowance\b/, l)) return { kind: "tradeIn" };
  for (const [name, re] of LOAN_PRODUCTS) if (has(re, l)) return { kind: "loanProduct", name };
  // A package of several ("Pro Pack (wheel locks, tint, door guards)") keeps its own name.
  const addOns = ADD_ONS.filter(([, re]) => has(re, l));
  if (addOns.length) return addOns.length === 1 ? { kind: "addOn", name: addOns[0][0] } : { kind: "addOn" };
  if (has(/\b(?:pro|protection|appearance|premium|value|security|dealer|accessory|accessories) ?pa(?:ck|ckage|kage)\b/, l)) return { kind: "addOn" };
  if (has(/\b(?:sales|use|state|county|city|local|excise|vehicle|privilege|highway use)? ?tax(?:es)?\b|\bhut\b/, l) && !has(/\btax(?:es)?,? (?:title|tag|license|registration)|title,? (?:tax|tag)|\bdoc(?:umentary)? stamps?\b/, l)) return { kind: "tax" };
  if (has(/\btitle\b|\bregistration\b|\bregist\b|\blicen[cs]e (?:fees?|plates?|and|&)\b|\bplates?\b|\btags?\b|\bdmv\b|\bmvc\b|\bbmv\b|\bmva\b|\bstate (?:fees?|inspection)\b|(?<!delivery |dealer |pdi )\b(?:state |safety )?inspection fee\b|\bpublic officials?\b|\btire (?:fee|tax|disposal)\b|\bgovernment fees?\b|\bgov'?t fees?\b|\bwheel tax\b|\b(?:reg|lic|regis)\.? ?(?:fees?|&|and|\/)|\b(?:reg|lic)\.?$|\btt ?& ?l\b|\bttl\b|\bt ?& ?l\b|\bdoc(?:umentary)? stamps?\b|\blemon law\b|\bcounty fees?\b/, l)) return { kind: "stateFee" };
  if (has(/\bdelivery,? processing,? (?:and |& )?handling\b|\bdelivery (?:and|&) handling\b|\bdph\b/, l)) return { kind: "dealerFee", name: "Destination charge" };
  if (has(/\bsmog\b|\bemissions?\b/, l)) return { kind: "dealerFee", name: "Smog or emissions" };
  if (has(/\bdeputy\b/, l)) return { kind: "dealerFee", name: "Other fee" };
  if (has(/\bdoc(?:ument(?:ary|ation)?)?s? ?(?:&|and) handling\b|\bdoc(?:ument(?:ary|ation|s)?)?\.? ?(?:fee|charge|prep)\b|^docs?\.?$|\b(?:dealer )?(?:processing|admin(?:istrative|istration)?|service|conveyance|handling) (?:fee|charge)\b|\bdealer fees?\b|\bdealer handling\b/, l)) return { kind: "docFee" };
  // The maker's shipping charge: real on a new car (it's on the window sticker), padding on a used one.
  if (has(/\bdestination\b|\bfreight\b|\bdest\.? (?:&|and) (?:handling|delivery)\b|\bd ?& ?h\b/, l)) return { kind: "dealerFee", name: "Destination charge" };
  // Certified pre-owned charges: usually part of a CPO car's price.
  if (has(/\bcertification (?:fee|charge)\b|\bcpo (?:fee|charge|certification)\b|\bcertified pre-?owned (?:fee|charge)\b/, l)) return { kind: "dealerFee", name: "Certification fee" };
  if (has(/\belectronic (?:filing|registration|title)\b|\be-?fil(?:e|ing)\b|\bevr\b/, l)) return { kind: "dealerFee", name: "Electronic filing fee" };
  // Plain dealer padding: preparing, reconditioning or delivering a car that's for sale.
  if (has(/\b(?:dealer )?prep(?:aration)?\b|\brecon(?:ditioning)?\b|\bdelivery (?:fee|charge)\b|\bpdi\b|\bpre-?delivery (?:inspection|service)\b|\bdealer inspection\b/, l)) return { kind: "dealerFee" };
  // Some other fee: it could be a government one, so it's asked about rather than refused.
  if (has(/\bfee\b/, l)) return { kind: "dealerFee", name: "Other fee" };
  if (has(/\brebate\b|\bincentive\b|\bcash back\b|\bbonus cash\b|\bloyalty\b|\bconquest\b|\bcustomer cash\b(?= rebate)/, l)) return { kind: "rebate" };
  if (has(/\bdiscount\b|\bsavings?\b|\bprice reduction\b|\bdealer cash\b|\bmarkdown\b|\bless\b/, l)) return { kind: "discount" };
  if (has(/\bdown ?payment\b|\bcash down\b|\bcustomer cash\b|\bdeposit\b|\bcash (?:due|paid)\b|\bcash on delivery\b/, l)) return { kind: "downPayment" };
  if (has(/\bbalance due\b|\bdue (?:at|on) (?:signing|delivery)\b|\bamount due\b|\bbalance owing\b|\bnet (?:due|payoff)\b/, l)) return { kind: "balanceDue" };
  if (has(/\bsub-?total\b|\btaxable (?:amount|total|price)\b|\btotal taxable\b/, l)) return { kind: "subtotal" };
  if (has(/\btotal\b|\bout[- ]the[- ]door\b|\botd\b|\bgrand total\b/, l)) return { kind: "total" };
  // "MSRP" on a deal sheet is the starting price that discounts come off; a market or book value is only a reference.
  if (has(/\bmarket value\b|\bkbb\b|\bbook value\b|\bretail value\b|\bnada\b|\bblack book\b/, l)) return { kind: "reference" };
  if (has(/\bprice\b|\bmsrp\b|\bsticker\b|\bvehicle\b|\bcash price\b|\bselling\b|\bsale amount\b|\bagreed\b|\bused car\b|\bnew car\b|\bunit\b/, l)) return { kind: "price" };
  return { kind: "other" };
}

// "$1,234.56", "1,234.56", "$1,234", "($500.00)", "-$500", "$500-". A plain "1234" needs a "$" (years, months, stock numbers).
// Not a monthly figure ("$512/mo", "$384 per month"), a percentage, a term or a mileage.
const AMOUNT = /(?:(?<=[^\d$\s])(?=\$)|(?<![\w.,$]))(\()?(-)?(\$)?\s?(-)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?(?![\d,]|\.\d|\s?%|\s?(?:\/\s?mo|\/\s?month|per month|a month|mo\b|months?\b|payments?\b|mi\b|miles\b|yrs?\b|years?\b|days?\b))(\))?(-)?(?!\w)/gi;
// Numbers that follow these words are the car's details, not money ("MILES 41,233", "Stock #24689", "VIN …").
const NOT_MONEY_BEFORE = /\b(?:miles?|mileage|odometer|odo|stock|stk|deal|vin|year|zip|phone|#)\s*(?:no\.?|number|#)?\s*[:#]?\s*$/i;

type Hit = { at: number; end: number; value: number };

function amountsIn(line: string): Hit[] {
  const out: Hit[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    // A minus before or after the "$" ("-$500", "$-1,051.46"), brackets, or a trailing minus: a negative amount.
    const [, open, minus, dollar, minus2, whole, cents, close, trailMinus] = m;
    if (!dollar && !cents && !whole.includes(",")) continue;
    if (!dollar && NOT_MONEY_BEFORE.test(line.slice(Math.max(0, m.index - 30), m.index))) continue;
    const value = Number(whole.replace(/,/g, "")) + (cents ? Number(cents) : 0);
    if (!Number.isFinite(value) || value > 2_000_000) continue;
    out.push({ at: m.index, end: m.index + m[0].length, value: (open && close) || minus || minus2 || trailMinus ? -value : value });
  }
  return out;
}

const NOT_CHARGED = /\b(?:declined?|waived|not (?:purchased|included|selected|charged)|n\/a|none|no charge|refused|opted out|declinado|rechazado|no incluido|ninguno|no aplica)\b/i;
const cleanLabel = (s: string) =>
  s.replace(/[.:_·\-–—=*]{2,}/g, " ").replace(/^[\s:.\-–—|]+|[\s:.\-–—−|$]+$/g, "").replace(/\s+/g, " ").trim()
    .replace(/^(?:\d{1,2}[.)]|[A-Za-z][.)]|\([a-z0-9]\))\s+(?=[A-Za-z(])/, "").replace(/\s+usd$/i, "").trim();
// A label that ends with a base ("Sales Tax 6.625% of", "Tax (6.625% x"): the amount after it is what the line is
// worked out on, and the line's own amount is the next one.
const BASE_END = /\s*(?:\bof|\bon|\bx|\btimes|[@×*])\s*[($]*$/i;
const isLabel = (s: string) => /[a-z]{2}/i.test(s) && s.length <= 70;

/** Reads the paper's lines, pairing each amount with its label. */
export function parseDealSheet(input: string): DealSheet {
  // OCR reads "$21,998.00" as "$21.998.00": two periods, the first one three digits before the cents, is a comma.
  // More OCR misreads of money: "$" read as "S" ("S21,998.00") or doubled ("$$"), and the cents point read as a
  // comma ("$21,998,00"). Each only where cents follow, so words and plain numbers are untouched.
  const ocrMoney = (s: string) =>
    s.replace(/\${2,}/g, "$")
      .replace(/(?<![A-Za-z0-9$])S(?=\d{1,3}(?:,\d{3})*\.\d{2}(?!\d))/g, "$")
      .replace(/\$(\s?)(\d{1,3}(?:,\d{3})*),(\d{2})(?![\d,.])/g, "$$$1$2.$3");
  const text = ocrThousands(ocrMoney(input.replace(/\r\n?/g, "\n")).replace(/[OoIl]/g, (c, at: number, s: string) => (/[\d$]/.test(s[at - 1] ?? "") && /[\d.,]/.test(s[at + 1] ?? "") ? (/[Oo]/.test(c) ? "0" : "1") : c)))
    .replace(/(?<![\d.,])(\d{1,3})\.(\d{3})\.(\d{2})(?![\d.])/g, "$1,$2.$3")
    // …and the comma as a space: "$26 635.71" (only after "$" and with cents, where nothing else fits).
    .replace(/\$\s?(\d{1,3}) (\d{3})(\.\d{2})(?![\d.,])/g, "$$$1,$2$3")
    .replace(/[−‒–](?=\$?\d)/g, "-")
    .replace(/[\s\S]*/, (t) => ocrMoney(t));
  const lines: DealLine[] = [];
  const queue: string[] = [];
  const push = (label: string, value: number, wholeLine: string) => {
    const { kind, name } = classify(label);
    const declined = NOT_CHARGED.test(wholeLine) || value === 0;
    // A balance keeps its sign: "Amount Due $-1,051.46" means the dealer owes the buyer. A total price, subtotal or
    // amount financed is never below zero ("Total -$11,479.46" is a dash with its gap lost). Charges and credits are
    // amounts; their kind says which way they go.
    const signed = kind === "balanceDue";
    lines.push({ label, amount: signed ? value : Math.abs(value), kind, declined, ...(name ? { name } : {}) });
  };

  // Amounts with no words of their own ("$799.00" on its own line, or "$21,998.00  $799.00" in a column): the
  // labels are the label-only lines just before them, in order. With more labels than amounts, the first
  // ones are section headings ("FEES"), so the last labels go with the amounts.
  let pending: { value: number; line: string }[] = [];
  const flush = () => {
    if (!pending.length) return;
    const labels = queue.slice(-pending.length);
    pending.forEach((p, i) => {
      const label = labels[i - (pending.length - labels.length)] ?? "";
      push(label || "A line without a label", p.value, p.line);
    });
    pending = [];
    queue.length = 0;
  };

  const allLines = text.split("\n");
  // A Spanish paper's words in English, for the rules that read the whole text (same lines, same numbers).
  const en = toEnglish(text);
  const box = tilaBox(en.split("\n"));
  for (const [n, rawLine] of allLines.entries()) {
    if (box.skip.has(n)) continue;
    let line = rawLine.replace(/\t/g, "  ").trim();
    if (!line) continue;
    // "1. Cash Price (including $1,510.30 sales tax)  $24,307.30": the tax inside the brackets is a line of its own
    // (it's in the cash price, which is then a subtotal), never the label of the amount after it.
    const included = /\((?:including|incl\.?)\s*[^)]*?\$\s?([\d,]+\.\d{2})[^)]*\)|\((?:including|incl\.?)\s*[^)]*?\btax(?:es)? of\s?\$\s?([\d,]+\.\d{2})\)/i.exec(line);
    let subtotalHere = false;
    if (included && /tax/i.test(included[0])) {
      flush();
      push("Sales tax (included in the cash price)", Number((included[1] ?? included[2]).replace(/,/g, "")), line);
      line = line.replace(included[0], " ");
      subtotalHere = true;
    }
    // A quote written as a sentence ("we can do 17,900 plus 699 doc and 450 dealer prep… out the door 20,382").
    const prose = proseQuote(line);
    if (prose) {
      flush();
      for (const p of prose) push(p.label, p.value, p.label);
      queue.length = 0;
      continue;
    }
    const hits = amountsIn(line);
    const own = hits.map((h, i) => cleanLabel(line.slice(i ? hits[i - 1].end : 0, h.at)));
    if (!hits.length) {
      flush();
      // A label whose amount comes later (columns flattened), or prose, which ends a label run.
      if (isLabel(cleanLabel(line))) queue.push(cleanLabel(line));
      else queue.length = 0;
      continue;
    }
    const tail = cleanLabel(line.slice(hits[hits.length - 1].end));
    // "$399.00 VIN etching": one amount, its words after it.
    if (hits.length === 1 && !isLabel(own[0]) && tail && isLabel(tail) && classify(tail).kind !== "other") {
      flush();
      push(tail, hits[0].value, line);
      queue.length = 0;
      continue;
    }
    if (hits.every((_, i) => !isLabel(own[i]))) {
      pending.push(...hits.map((h) => ({ value: h.value, line })));
      continue;
    }
    flush();
    hits.forEach((h, i) => {
      if (!isLabel(own[i])) return;
      // The middle of a sentence ("is due at signing, followed by 35 payments of"), not a line's name ("Due at Signing").
      if (i > 0 && (/^(?:is|are|and|or|then|which|followed)\b/i.test(own[i]) || /\bfollowed by\b/i.test(own[i]))) return;
      if (BASE_END.test(own[i]) && i + 1 < hits.length && !isLabel(own[i + 1])) push(own[i].replace(BASE_END, "").replace(/[\s(]+$/, ""), hits[i + 1].value, line);
      else push(own[i], h.value, line);
    });
    // The amount whose bracketed tax was taken out is that line's subtotal (the cash price including tax).
    if (subtotalHere && lines.length) lines[lines.length - 1].kind = "subtotal";
    queue.length = 0;
  }
  flush();
  // A negative balance that the paper's own arithmetic gives as positive was a dash, not a minus ("Amount Due -$6,479.46"
  // with the gap after the dash lost): the lines decide.
  const sumKinds = (kinds: readonly LineKind[]) => lines.filter((l) => !l.declined && kinds.includes(l.kind)).reduce((s, l) => s + l.amount, 0);
  const owed = sumKinds(CHARGE_KINDS) - sumKinds(["discount", "rebate"]);
  const due = [owed, owed - sumKinds(["tradeIn"]), owed - sumKinds(["downPayment"]), owed - sumKinds(["tradeIn", "downPayment"]), owed - sumKinds(["tradeIn", "downPayment"]) + sumKinds(["payoff"])];
  for (const l of lines) {
    if (l.kind === "balanceDue" && l.amount < 0 && due.some((d) => Math.abs(d + l.amount) <= 1.01) && !due.some((d) => Math.abs(d - l.amount) <= 1.01)) l.amount = -l.amount;
  }
  // "MSRP $32,900 / Selling Price $31,400": with another price on the paper, the MSRP or sticker line is a reference.
  const prices = lines.filter((l) => l.kind === "price" && !l.declined);
  const msrpLike = (l: DealLine) => /\bmsrp\b|\bsticker\b|\b(?:base|list) price\b/i.test(toEnglish(l.label));
  if (prices.length >= 2) for (const l of prices) if (msrpLike(l) && prices.some((o) => o !== l && !msrpLike(o))) l.kind = "reference";
  const options = paymentOptions(en);
  return {
    lines: lines.filter((l) => l.kind !== "loan"),
    loan: options.length >= 2 ? { aprPct: null, months: null, payment: null, amountFinanced: null, totalOfPayments: null, financeCharge: null } : { ...readLoan(en, lines), ...box.loan },
    ...(LEASE_WORDS.test(en) ? { lease: true, leaseTerms: leaseTerms(en, lines) } : {}),
    ...(options.length >= 2 ? { paymentOptions: options } : {}),
    ...(LOOKS_NEW.test(en) && !LOOKS_USED.test(en) ? { looksNew: true } : {}),
  };
}

const TILA_HEADS: [keyof LoanTerms | "totalSalePrice", RegExp][] = [
  ["aprPct", /annual percentage rate/i],
  ["financeCharge", /finance charge/i],
  ["amountFinanced", /amount financed/i],
  ["totalOfPayments", /total of payments/i],
  ["totalSalePrice", /total sale price/i],
];

/**
 * The federal Truth-in-Lending box on a finance contract: a row of headings (Annual Percentage Rate, Finance
 * Charge, Amount Financed, Total of Payments, Total Sale Price), a row of explanations, then a row of values, in
 * the same order. And the payment schedule: "Number of Payments / Amount of Payments" over "72 / $450.20".
 * Returns the loan terms read from them, and the lines they take up (skipped when reading line items).
 */
export function tilaBox(lines: string[]): { loan: Partial<LoanTerms>; skip: Set<number> } {
  const skip = new Set<number>();
  const loan: Partial<LoanTerms> = {};
  const money = (s: string) => Number(s.replace(/[$,\s]/g, ""));
  for (let h = 0; h < lines.length; h++) {
    const heads = TILA_HEADS.map(([k, re]) => ({ k, at: lines[h].search(re) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
    if (heads.length >= 3) {
      for (let v = h + 1; v <= Math.min(h + 10, lines.length - 1); v++) { // explanations can wrap over several lines
        const tokens = [...lines[v].matchAll(/(\d{1,2}(?:\.\d{1,3})?)\s?%|\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g)];
        if (tokens.length < Math.min(3, heads.length)) continue;
        // The values come in the headings' order: the rate is the one with "%", the rest are dollar amounts.
        const dollars = tokens.filter((t) => t[2] != null).map((t) => money(t[2]));
        const pct = tokens.find((t) => t[1] != null);
        let d = 0;
        for (const { k } of heads) {
          if (k === "aprPct") {
            if (pct) loan.aprPct = Number(pct[1]);
          } else {
            const val = dollars[d++];
            if (val != null && k !== "totalSalePrice") loan[k] = val;
          }
        }
        // The box has one percentage, the rate, even when its heading wrapped onto the next line in a PDF
        // ("ANNUAL" / "PERCENTAGE RATE") and isn't in the headings row.
        if (loan.aprPct == null && pct) loan.aprPct = Number(pct[1]);
        for (let x = h; x <= v; x++) skip.add(x);
        break;
      }
    }
    if (/number of payments/i.test(lines[h]) && /amount of (?:each )?payments?/i.test(lines[h])) {
      const next = lines[h + 1] ?? "";
      const n = /^\s*(\d{2,3})\b/.exec(next);
      const pay = /\$\s?(\d{1,3}(?:,\d{3})*\.\d{2})/.exec(next);
      if (n && pay) {
        loan.months = Number(n[1]);
        loan.payment = money(pay[1]);
        skip.add(h);
        skip.add(h + 1);
        if (/payment schedule/i.test(lines[h - 1] ?? "")) skip.add(h - 1);
      }
    }
  }
  return { loan, skip };
}

/**
 * A sentence with the numbers in it, as a text or email quote is written: split at "plus", "and", "+", commas
 * and full stops, and read each piece's number with that piece's words. The first number after "we can do",
 * "asking", "price" or "for" is the car's price. Null when the line isn't a sentence with numbers.
 */
function proseQuote(line: string): { label: string; value: number }[] | null {
  const words = line.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
  // A message to the buyer ("we can do…", "let me know"), not a numbered contract line with a long label.
  if (words < 10 || /^\(?[0-9A-Z]{1,2}[.)]\s/.test(line) || !/\b(?:we|you|i|i'm|we're|we'll|can|could|would|let me|thanks|thank you|hey|hi|hello|please)\b/i.test(line)) return null;
  const NUM = /(?<![\w.,$])\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{3,6}(?:\.\d{2})?)(?![\d,]|\.\d|\s?(?:%|\/\s?mo|per month|a month|months?\b|mo\b|miles?\b|mi\b))/g;
  const pieces = line.split(/\s*(?:,(?!\d{3})|[;!?]|\.(?!\d)|\bplus\b|\band\b|\+|&)\s*/i);
  const out: { label: string; value: number }[] = [];
  let sawPrice = false;
  for (const piece of pieces) {
    const nums = [...piece.matchAll(NUM)].filter((m) => !/^(?:19[89]\d|20[0-4]\d)$/.test(m[1]) || m[0].includes("$"));
    if (nums.length !== 1) continue;
    const value = Number(nums[0][1].replace(/,/g, ""));
    if (value < 50) continue;
    const label = (piece.slice(0, nums[0].index) + " " + piece.slice(nums[0].index + nums[0][0].length)).replace(/\s+/g, " ").trim();
    let kind = classify(label).kind;
    if (kind === "other" && !sawPrice && /\b(?:can do|do it for|asking|price|sell(?:ing)? (?:it )?for|for|at)\b/i.test(label)) kind = "price";
    if (kind === "price") sawPrice = true;
    out.push({ label: kind === "price" && classify(label).kind !== "price" ? "Price" : label || "A number without words", value });
  }
  return out.length >= 2 ? out : null;
}

/** The lease's numbers: the adjusted cap cost (or gross less the cap cost reduction), the residual and the money factor. */
function leaseTerms(text: string, lines: DealLine[]): NonNullable<DealSheet["leaseTerms"]> {
  const find = (re: RegExp) => lines.find((l) => l.kind === "leaseTerm" && re.test(toEnglish(l.label).toLowerCase()))?.amount ?? null;
  const adjusted = find(/\badjusted cap|\bnet cap/);
  const gross = find(/\bgross cap|\bcapitali[sz]ed cost\b(?! reduction)/);
  const reduction = find(/cap(?:italized)? cost reduction/);
  const mf = /money factor\s*[:\-]?\s*(0?\.\d{3,6})\b/i.exec(text);
  const factor = mf ? Number(mf[1]) : null;
  const base = /\bbase monthly payment\b[^$\d\n]{0,20}\$?\s?(\d{1,3}(?:,\d{3})*\.\d{2})/i.exec(text);
  return {
    adjustedCap: adjusted ?? (gross != null && reduction != null ? Math.round((gross - reduction) * 100) / 100 : gross),
    residual: find(/\bresidual/),
    moneyFactor: factor != null && factor > 0 && factor < 0.01 ? factor : null,
    rentCharge: find(/\brent charge/),
    depreciation: find(/\bdepreciation/),
    basePayment: base ? Number(base[1].replace(/,/g, "")) : null,
  };
}

const LOOKS_NEW = /\bnew (?:vehicle|car|truck|suv)\b|\b(?:status|condition|new\/used|n\/u)\s*[:#]?\s*new\b|\bnew \d{4} [a-z]/i;
const LOOKS_USED = /\bused\b|\bpre-?owned\b|\bcpo\b|\bcertified\b|\bodometer\b|\bbuyers guide\b|\bas[- ]is\b/i;
const LEASE_WORDS = /\bmoney factor\b|\bresidual (?:value|amount)?\b|\bcapitali[sz]ed cost\b|\bcap cost\b|\blease (?:worksheet|agreement|payment|term)\b|\bacquisition fee\b|\bdisposition fee\b/i;

/** "60 months $542/mo", "72 mos @ $468": a worksheet's payment options, each a term and a monthly payment. */
function paymentOptions(text: string): { months: number; payment: number }[] {
  const out: { months: number; payment: number }[] = [];
  for (const m of text.matchAll(/\b(\d{2})\s?(?:months?|mos?\.?)\s*(?:@|at|for|:|-|–)?\s*\$\s?(\d{2,4}(?:\.\d{2})?)\s?(?:\/\s?mo(?:nth)?|per month|a month|monthly)?/gi)) {
    const months = Number(m[1]);
    const payment = Number(m[2]);
    if (months >= 12 && months <= 96 && payment >= 25 && !out.some((o) => o.months === months)) out.push({ months, payment });
  }
  return out;
}

const num = (s: string | undefined) => (s == null ? null : Number(s.replace(/[$,\s]/g, "")));

/** The loan terms, from labelled lines first, then anywhere in the text ("72 months at 7.9%"). */
function readLoan(text: string, lines: DealLine[]): LoanTerms {
  // Line by line: a label's number is on its own line, or on the next line when the label stands alone. Never
  // across other labels: in a flattened column "Down Payment / Amount Due / $17,605.00" is not a payment amount.
  const rows = text.toLowerCase().split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  // A whole amount only: never the "24.27" out of a misread "24.277.80".
  const money = String.raw`\$?\s?(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}|\d{3,6})(?![\d,]|\.\d)`;
  const onlyMoney = new RegExp(String.raw`^\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})$`);
  const find = (label: string, value: string, gap: string) => {
    const re = new RegExp(`(?:${label})${gap}${value}`);
    const alone = new RegExp(`(?:${label})\\s*:?$`);
    for (let i = 0; i < rows.length; i++) {
      const m = re.exec(rows[i]);
      if (m) return m[1];
      if (alone.test(rows[i]) && rows[i + 1]) {
        const next = onlyMoney.exec(rows[i + 1]) ?? new RegExp(`^${value}`).exec(rows[i + 1]);
        if (next) return next[1];
      }
    }
    return undefined;
  };
  const near = (label: string) => num(find(label, money, "[^$\\d%]{0,40}"));
  const aprAt = find("annual percentage rate|\\bapr\\b|a\\.p\\.r\\.|interest rate|\\brate\\b", String.raw`(\d{1,2}(?:\.\d{1,3})?)\s?%`, "[^%\\d]{0,40}");
  const aprAfter = rows.map((r) => /(\d{1,2}(?:\.\d{1,3})?)\s?%\s?(?:apr|a\.p\.r|annual percentage rate|interest)/.exec(r)).find(Boolean);
  // "72 mo @ 8.99%", or a rate printed without its "%" ("Interest Rate 8.99 (simple)", always with decimals).
  const aprAtSign = rows.map((r) => /\b(?:mos?|months?)\.?\s?@\s?(\d{1,2}(?:\.\d{1,3})?)\s?%/.exec(r)).find(Boolean);
  const aprNoPct = find("annual percentage rate|\\bapr\\b|interest rate", String.raw`(\d{1,2}\.\d{1,3})(?![\d.,%]|\s?%)`, "[^\\d$]{0,20}");
  const apr = aprAt != null ? [aprAt, aprAt] : aprAfter ?? aprAtSign ?? (aprNoPct != null ? [aprNoPct, aprNoPct] : null);
  const monthsAt = find("term|number of payments|no\\.? of payments|# of payments", String.raw`(\d{2,3})\b`, "[^\\d]{0,25}");
  const monthsLoose = rows.map((r) => /\b(\d{2,3})\s?(?:months?|mos?\.?|monthly payments|payments)\b/.exec(r)).find(Boolean);
  // "Term 6 years": in months.
  const termYears = rows.map((r) => /\bterm\b[^\d]{0,12}(\d{1,2})\s?(?:years?|yrs?)\b/.exec(r)).find(Boolean);
  const months = monthsAt != null ? [monthsAt, monthsAt] : monthsLoose ?? (termYears ? [termYears[0], String(Number(termYears[1]) * 12)] : null);
  // The loan's principal is the line that says "Amount Financed", not an "Unpaid balance of cash price" printed
  // before the other charges are added (taking that one made a right payment look $46 a month too high).
  const financedLines = lines.filter((l) => l.kind === "amountFinanced" && !l.declined);
  const named = financedLines.filter((l) => /\bamount (?:financed|to (?:be )?financ)|\btotal (?:amount )?financed\b|\bloan amount\b/i.test(toEnglish(l.label)));
  const amountFinanced = (named.at(-1) ?? financedLines.filter((l) => !/\bunpaid balance\b/i.test(toEnglish(l.label))).at(-1) ?? financedLines.at(-1))?.amount ?? near("amount financed|unpaid balance|amount to (?:be )?financ(?:e|ed)|to be financed|loan amount");
  let m = months ? Number(months[1]) : null;
  // "71 payments of $468.51 and 1 final payment of $469.10": the count printed with the regular payment leaves the
  // final one out (a term in months already includes it).
  const finalPayment = near("final (?:balloon )?payment|balloon payment|last payment");
  if (m && finalPayment != null) {
    const asCount = rows.some((r) => new RegExp(String.raw`\b${m} (?:regular |monthly |equal )?payments\b|(?:number|no\.?|#) of payments\D{0,25}\b${m}\b`).test(r));
    const asTerm = rows.some((r) => new RegExp(String.raw`\bterm\b\D{0,12}\b${m}\b|\b${m} ?(?:months?|mos?)\b`).test(r));
    if (asCount && !asTerm) m += 1;
  }
  return {
    aprPct: apr ? Number(apr[1]) : null,
    months: m && m >= 6 && m <= 96 ? m : null,
    // A plain "Payment" (never a down, first, final or deferred one), or "$468.51 per month" as a last resort.
    payment: near("monthly payment|payment amount|amount of (?:each )?payments?|payments? of|est(?:imated)?\\.? payment|your payment")
      ?? near("(?<!down |first |final |last |balloon |deferred |pickup |cash |total of |number of |no\\. of |# of )\\bpayment\\b(?! schedule| due| date| to| option)")
      ?? num(rows.map((r) => /\$\s?(\d{1,3}(?:,\d{3})*\.\d{2})\s?(?:\/\s?mo(?:nth)?\b|per month|a month)/.exec(r)?.[1]).find(Boolean)),
    finalPayment,
    amountFinanced,
    totalOfPayments: near("total of payments"),
    financeCharge: near("finance charge"),
  };
}
