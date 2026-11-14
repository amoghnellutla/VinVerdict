/**
 * Reads a dealer's numbers (buyer's order, worksheet, purchase agreement, retail installment contract, or an
 * out-the-door quote in an email) into lines: what each line is, its amount, and the loan terms. Any layout:
 * "Label ...... $1,234.00", several pairs on one line, labels and amounts in separate columns (as PDF text
 * extraction and OCR flatten them), "Declined" / "N/A" / "$0" lines that aren't charged.
 *
 * Pure and on the device. The text should already have the buyer's details taken out (`redactDealSheet`).
 * Nothing is guessed: a line it can't place is kept as "other", with its words, for the buyer to ask about.
 */

import { ocrThousands } from "@/lib/listing/parse";

export type LineKind =
  | "price" | "reference" | "discount" | "rebate" | "tradeIn" | "payoff" | "negativeEquity"
  | "docFee" | "dealerFee" | "addOn" | "loanProduct" | "stateFee" | "tax" | "downPayment"
  | "subtotal" | "total" | "balanceDue" | "amountFinanced" | "loan" | "other";

export type DealLine = {
  /** The paper's own words for the line. */
  label: string;
  amount: number;
  kind: LineKind;
  /** Shown on the paper but not charged ("Declined", "N/A", "$0.00"). */
  declined: boolean;
  /** The add-on or product's plain name ("VIN etching"), for the message to the dealer. */
  name?: string;
};

export type LoanTerms = {
  aprPct: number | null;
  months: number | null;
  payment: number | null;
  amountFinanced: number | null;
  totalOfPayments: number | null;
  financeCharge: number | null;
};

export type DealSheet = { lines: DealLine[]; loan: LoanTerms };

/** Credits: they lower what's owed. */
export const CREDIT_KINDS: readonly LineKind[] = ["discount", "rebate", "tradeIn", "downPayment"];
/** Charges: they add to what's owed. */
export const CHARGE_KINDS: readonly LineKind[] = ["price", "docFee", "dealerFee", "addOn", "loanProduct", "stateFee", "tax", "negativeEquity", "payoff", "other"];
export const TOTAL_KINDS: readonly LineKind[] = ["subtotal", "total", "balanceDue", "amountFinanced"];

// Optional add-ons dealers put on cars (FTC consumer guidance: you can say no). Name → the words that mean it.
export const ADD_ONS: [string, RegExp][] = [
  ["Market adjustment", /\b(?:market (?:value )?adjust(?:ment)?|additional dealer (?:markup|mark-up|profit)|a\.?d\.?m\.?|dealer markup)\b/],
  ["VIN etching", /\b(?:vin )?etch(?:ing|ed)?\b|\bglass etch|\btheft[- ]?(?:etch|guard)\b/],
  ["Nitrogen tires", /\bnitrogen\b|\bn2 (?:tire|fill)/],
  ["Paint and fabric protection", /\b(?:paint|fabric|interior|exterior|leather|upholstery|ceramic|clear ?coat|surface)(?: (?:and|&|\/) (?:paint|fabric|interior|exterior|leather))? (?:protection|protectant|sealant|coating|guard|package|pkg)\b|\bappearance (?:protection|package|pkg|plan)\b|\bceramic coat/],
  ["Window tint", /\bwindow tint(?:ing)?\b|\btint(?:ed)? windows?\b|\btint\b/],
  ["Wheel locks", /\bwheel locks?\b|\blocking lug/],
  ["Theft deterrent", /\btheft (?:deterrent|protection|prevention|system|package)\b|\banti[- ]theft\b|\blo-?jack\b|\bgps (?:tracker|tracking|locator)\b|\bstarter interrupt/],
  ["Door edge guards", /\bdoor edge guards?\b|\bdoor guards?\b/],
  ["Pinstripe", /\bpin ?strip(?:e|ing)\b/],
  ["Mud flaps or splash guards", /\bmud ?flaps?\b|\bsplash guards?\b/],
  ["Key replacement", /\bkey (?:replacement|protection|fob (?:protection|replacement)|plan)\b/],
  ["Dent and ding protection", /\b(?:dent|ding|paintless dent)(?: and| &)?(?: ding)? (?:protection|repair plan|plan)\b/],
  ["Windshield protection", /\bwindshield (?:protection|repair plan|plan)\b/],
  ["Dealer accessories", /\bdealer (?:add(?:ed)?[- ]?ons?|accessories|installed (?:options|accessories|equipment)|options)\b|\b(?:protection|security|convenience|value) (?:package|pkg)\b/],
];

// Optional products sold with the loan (CFPB: a lender can't require them; you can buy them elsewhere or not at all).
export const LOAN_PRODUCTS: [string, RegExp][] = [
  ["Service contract (extended warranty)", /\bservice contract\b|\bextended (?:warranty|service|protection)\b|\bvehicle service (?:contract|agreement)\b|\bmechanical breakdown\b|\bvsc\b|\bpowertrain (?:protection|plan|warranty)\b/],
  ["GAP", /\bgap\b|\bguaranteed (?:auto|asset) protection\b|\bdebt cancellation\b/],
  ["Maintenance plan", /\b(?:pre-?paid )?maintenance (?:plan|contract|program|agreement|package)\b|\bcare ?plan\b/],
  ["Tire and wheel protection", /\btire (?:and|&|\/) wheel\b|\broad hazard\b/],
  ["Credit life or disability insurance", /\bcredit (?:life|disability|insurance)\b|\blife insurance\b|\bdisability insurance\b/],
];

const has = (re: RegExp, s: string) => re.test(s);

/** What a line is, from its label (lowercased, with spaces collapsed). */
export function classify(rawLabel: string): { kind: LineKind; name?: string } {
  const l = rawLabel.toLowerCase().replace(/[^a-z0-9%&/$.,'#-]+/g, " ").replace(/\s+/g, " ").trim();
  // Loan disclosure words first: "Total of payments" is not the total price.
  if (has(/\b(?:annual percentage rate|apr|interest rate|finance charge|total of payments|total sale price|monthly payment|payment amount|amount of (?:each )?payments?|number of payments|term|first payment|payments? (?:of|due))\b/, l)) return { kind: "loan" };
  if (has(/\bamount financed\b|\bunpaid balance\b|\bamount to (?:be )?financed\b|\bloan amount\b|\bbalance to finance\b/, l)) return { kind: "amountFinanced" };
  if (has(/\bnegative equity\b/, l)) return { kind: "negativeEquity" };
  if (has(/\b(?:trade[- ]?in )?pay-?off\b|\blien (?:payoff|balance)\b|\bowed on (?:the )?trade\b|\bbalance owed\b/, l)) return { kind: "payoff" };
  if (has(/\btrade[- ]?in\b|\btrade (?:allowance|value|credit|equity)\b|\ballowance\b/, l)) return { kind: "tradeIn" };
  for (const [name, re] of LOAN_PRODUCTS) if (has(re, l)) return { kind: "loanProduct", name };
  // A package of several ("Pro Pack (wheel locks, tint, door guards)") keeps its own name.
  const addOns = ADD_ONS.filter(([, re]) => has(re, l));
  if (addOns.length) return addOns.length === 1 ? { kind: "addOn", name: addOns[0][0] } : { kind: "addOn" };
  if (has(/\b(?:pro|protection|appearance|premium|value|security|dealer|accessory|accessories) ?pa(?:ck|ckage|kage)\b/, l)) return { kind: "addOn" };
  if (has(/\b(?:sales|use|state|county|city|local|excise|vehicle|privilege|highway use)? ?tax(?:es)?\b|\bhut\b/, l) && !has(/\btax(?:es)?,? (?:title|tag|license|registration)|title,? (?:tax|tag)/, l)) return { kind: "tax" };
  if (has(/\btitle\b|\bregistration\b|\bregist\b|\blicen[cs]e (?:fee|plates?)\b|\bplates?\b|\btags?\b|\bdmv\b|\bmvc\b|\bstate (?:fees?|inspection)\b|\binspection fee\b|\btire (?:fee|tax|disposal)\b|\bgovernment fees?\b|\bgov'?t fees?\b|\bwheel tax\b/, l)) return { kind: "stateFee" };
  if (has(/\bdoc(?:ument(?:ary|ation|s)?)?\.? ?(?:fee|charge|prep)\b|^docs?\.?$|\b(?:dealer )?(?:processing|admin(?:istrative|istration)?|service|conveyance|handling) (?:fee|charge)\b|\bdealer fees?\b/, l)) return { kind: "docFee" };
  if (has(/\b(?:dealer )?prep(?:aration)?\b|\brecon(?:ditioning)?\b|\bdelivery (?:fee|charge)\b|\bdestination\b|\belectronic (?:filing|registration|title)\b|\be-?fil(?:e|ing)\b|\bcertification fee\b|\bcpo (?:fee|charge)\b|\bfee\b/, l)) return { kind: "dealerFee" };
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
const AMOUNT = /(?<![\w.,$])(\()?(-)?\s?(\$)?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?(?![\d,]|\.\d|\s?%|\s?(?:\/\s?mo|\/\s?month|per month|a month|mo\b|months?\b|payments?\b|mi\b|miles\b|yrs?\b|years?\b|days?\b))(\))?(-)?(?!\w)/g;
// Numbers that follow these words are the car's details, not money ("MILES 41,233", "Stock #24689", "VIN …").
const NOT_MONEY_BEFORE = /\b(?:miles?|mileage|odometer|odo|stock|stk|deal|vin|year|zip|phone|#)\s*(?:no\.?|number|#)?\s*[:#]?\s*$/i;

type Hit = { at: number; end: number; value: number };

function amountsIn(line: string): Hit[] {
  const out: Hit[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const [, open, minus, dollar, whole, cents, close, trailMinus] = m;
    if (!dollar && !cents && !whole.includes(",")) continue;
    if (!dollar && NOT_MONEY_BEFORE.test(line.slice(Math.max(0, m.index - 30), m.index))) continue;
    const value = Number(whole.replace(/,/g, "")) + (cents ? Number(cents) : 0);
    if (!Number.isFinite(value) || value > 2_000_000) continue;
    out.push({ at: m.index, end: m.index + m[0].length, value: (open && close) || minus || trailMinus ? -value : value });
  }
  return out;
}

const NOT_CHARGED = /\b(?:declined?|waived|not (?:purchased|included|selected|charged)|n\/a|none|no charge|refused|opted out)\b/i;
const cleanLabel = (s: string) => s.replace(/[.:_·\-–—=*]{2,}/g, " ").replace(/^[\s:.\-–—|]+|[\s:.\-–—|$]+$/g, "").replace(/\s+/g, " ").trim();
const isLabel = (s: string) => /[a-z]{2}/i.test(s) && s.length <= 70;

/** Reads the paper's lines, pairing each amount with its label. */
export function parseDealSheet(input: string): DealSheet {
  // OCR reads "$21,998.00" as "$21.998.00": two periods, the first one three digits before the cents, is a comma.
  const text = ocrThousands(input.replace(/\r\n?/g, "\n").replace(/[OoIl]/g, (c, at: number, s: string) => (/[\d$]/.test(s[at - 1] ?? "") && /[\d.,]/.test(s[at + 1] ?? "") ? (/[Oo]/.test(c) ? "0" : "1") : c)))
    .replace(/(?<![\d.,])(\d{1,3})\.(\d{3})\.(\d{2})(?![\d.])/g, "$1,$2.$3");
  const lines: DealLine[] = [];
  const queue: string[] = [];
  const push = (label: string, value: number, wholeLine: string) => {
    const { kind, name } = classify(label);
    const declined = NOT_CHARGED.test(wholeLine) || value === 0;
    lines.push({ label, amount: Math.abs(value), kind, declined, ...(name ? { name } : {}) });
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

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\t/g, "  ").trim();
    if (!line) continue;
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
      if (isLabel(own[i])) push(own[i], h.value, line);
    });
    queue.length = 0;
  }
  flush();
  return { lines: lines.filter((l) => l.kind !== "loan"), loan: readLoan(text, lines) };
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

const num = (s: string | undefined) => (s == null ? null : Number(s.replace(/[$,\s]/g, "")));

/** The loan terms, from labelled lines first, then anywhere in the text ("72 months at 7.9%"). */
function readLoan(text: string, lines: DealLine[]): LoanTerms {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  // A whole amount only: never the "24.27" out of a misread "24.277.80".
  const money = String.raw`\$?\s?(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}|\d{3,6})(?![\d,]|\.\d)`;
  const near = (label: string) => num(new RegExp(`(?:${label})[^$\\d%]{0,40}${money}`).exec(t)?.[1]);
  const apr = /(?:annual percentage rate|\bapr\b|a\.p\.r\.|interest rate|\brate\b)[^%\d]{0,40}(\d{1,2}(?:\.\d{1,3})?)\s?%/.exec(t) ?? /(\d{1,2}(?:\.\d{1,3})?)\s?%\s?(?:apr|a\.p\.r|annual percentage rate|interest)/.exec(t);
  const months =
    /(?:term|number of payments|no\.? of payments|# of payments)[^\d]{0,25}(\d{2,3})\b/.exec(t) ??
    /\b(\d{2,3})\s?(?:months?|mos?\.?|monthly payments|payments)\b/.exec(t);
  const amountFinanced = lines.find((l) => l.kind === "amountFinanced")?.amount ?? near("amount financed|unpaid balance|amount to (?:be )?financed|loan amount");
  const m = months ? Number(months[1]) : null;
  return {
    aprPct: apr ? Number(apr[1]) : null,
    months: m && m >= 6 && m <= 96 ? m : null,
    payment: near("monthly payment|payment amount|amount of (?:each )?payments?|payments? of|est(?:imated)?\\.? payment|your payment"),
    amountFinanced,
    totalOfPayments: near("total of payments"),
    financeCharge: near("finance charge"),
  };
}
