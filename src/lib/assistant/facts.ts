/**
 * Facts a person states in a sentence ("it's an auction sale and sold for 9,100",
 * "asking 12,500", "126k miles", "I'm in 08540"). Pure, no AI. Each fact keeps the
 * words it came from, so the page can show "you said: …".
 */

export type Fact =
  | { kind: "auctionSold"; value: number; quote: string }
  | { kind: "price"; value: number; quote: string }
  | { kind: "miles"; value: number; quote: string }
  | { kind: "zip"; value: string; quote: string }
  | { kind: "seller"; value: "dealer" | "private"; quote: string }
  | { kind: "owners"; value: number; quote: string }
  | { kind: "accident"; value: "none" | "reported"; quote: string }
  | { kind: "title"; value: "clean" | "salvage" | "rebuilt" | "flood"; quote: string };

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** "9,100", "$9100", "9.1k", "12k" → dollars; null when it isn't a plausible car price. */
export function money(s: string): number | null {
  const m = /^\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k)?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1_000 : 1);
  return n >= 300 && n < 1_000_000 ? Math.round(n) : null;
}

const AMOUNT = String.raw`(\$?\s?\d{1,3}(?:,\d{3})+|\$?\s?\d{3,7}(?:\.\d+)?\s?k?|\$?\s?\d{1,3}(?:\.\d)?\s?k)\b`;

/** A question, not a statement: "has it been in an accident?" must never be read as "it has". */
export const isQuestion = (text: string) => /\?\s*$|^(?:is|are|was|were|has|have|had|did|does|do|can|could|should|would|will|how|what|what's|whats|why|which|who|where|when|any)\b/i.test(text.trim());

export function factsFromSentence(raw: string): Fact[] {
  const whole = raw.replace(/\s+/g, " ").trim();
  // Facts come only from statements: questions in the message are left out.
  // "The auction sold it for $9,100, is that good?": the part before the question still counts.
  const text = whole
    .split(/(?<=[.!?])\s+|,\s*(?=(?:is|are|was|were|has|have|did|does|do|can|could|should|would|will|how|what|why|which)\b)/i)
    .filter((s) => !isQuestion(s))
    .join(" ");
  const t = whole.toLowerCase();
  const out: Fact[] = [];
  const quote = (m: RegExpExecArray) => text.slice(m.index, m.index + m[0].length);

  // Sold at auction: "auction sale and sold for 9,100", "went for $9,100 at auction", "hammer price 9100".
  // Amogh's own words (real case 34): "It is a auction sale and it is priced for 9,100".
  const isAuction = /\bauction\b|\bhammer|\bbid\b/.test(t);
  const sold = new RegExp(String.raw`\b(?:sold|went|hammer(?:ed)?|winning bid|high bid${isAuction ? "|priced|price|for" : ""})\b[^.?!]{0,30}?${AMOUNT}`, "i").exec(text);
  if (sold && isAuction) {
    const v = money(sold[1]);
    if (v) out.push({ kind: "auctionSold", value: v, quote: quote(sold) });
  }
  // Asking price.
  const ask = new RegExp(String.raw`\b(?:asking(?: price)?(?: is)?|price is|priced (?:at|for)|listed (?:at|for)|they want|wants|selling (?:it )?for|offered (?:at|for))\s*:?\s*${AMOUNT}`, "i").exec(text);
  if (ask && !(sold && ask.index === sold.index)) {
    const v = money(ask[1]);
    if (v) out.push({ kind: "price", value: v, quote: quote(ask) });
  }
  // Miles.
  const mi = /\b(\d{1,3}(?:,\d{3})+|\d{4,6}|\d{1,3}(?:\.\d)?\s?k)\s*(?:miles|mi)\b|\bodometer(?: reads| shows| says| is| at| reading)?:?\s*(\d{1,3}(?:,\d{3})+|\d{4,6})/i.exec(text);
  if (mi) {
    const s = (mi[1] ?? mi[2]).replace(/,/g, "").replace(/\s/g, "");
    const v = /k$/i.test(s) ? Math.round(parseFloat(s) * 1_000) : Number(s);
    if (v > 0 && v < 1_000_000) out.push({ kind: "miles", value: v, quote: quote(mi) });
  }
  // ZIP.
  const zip = /\b(?:zip(?: code)?|i'?m in|i am in|i live in|near)\D{0,12}(\d{5})\b/i.exec(text);
  if (zip) out.push({ kind: "zip", value: zip[1], quote: quote(zip) });
  // Seller.
  const priv = /\bprivate (?:seller|party|sale)\b|\bby owner\b|\bfrom (?:an?|the) owner\b/i.exec(text);
  // A statement about who sells it ("from a dealer", "it's a dealer car"), not "ask the dealer".
  const dlr = /\b(?:from a|at a|sold by a|it'?s a|its a|it is a) dealer(?:ship)?\b|\bdealer (?:sale|car|listing)\b/i.exec(text);
  if (priv) out.push({ kind: "seller", value: "private", quote: quote(priv) });
  else if (dlr) out.push({ kind: "seller", value: "dealer", quote: quote(dlr) });
  // Owners.
  const own = /\b(\d|one|two|three|four|five)\s+(?:previous\s+)?owners?\b/i.exec(text);
  if (own) out.push({ kind: "owners", value: WORD_NUM[own[1].toLowerCase()] ?? Number(own[1]), quote: quote(own) });
  // Accidents.
  const noAcc = /\bno accidents?\b(?: or damage)?(?: reported)?/i.exec(text);
  const acc = /\b(?:had|has|was in|been in) an? (?:minor |small |major )?accident\b|\baccident (?:reported|on (?:the )?(?:carfax|autocheck|report))\b/i.exec(text);
  if (noAcc) out.push({ kind: "accident", value: "none", quote: quote(noAcc) });
  else if (acc) out.push({ kind: "accident", value: "reported", quote: quote(acc) });
  // Title.
  const title = /\b(clean|salvage|rebuilt|flood)(?: title)\b/i.exec(text);
  if (title) out.push({ kind: "title", value: title[1].toLowerCase() as "clean" | "salvage" | "rebuilt" | "flood", quote: quote(title) });
  return out;
}

export const FACT_LABEL: Record<Fact["kind"], string> = {
  auctionSold: "sold at auction for",
  price: "asking price",
  miles: "miles",
  zip: "your ZIP",
  seller: "seller",
  owners: "owners",
  accident: "accidents",
  title: "title",
};

export function factText(f: Fact): string {
  switch (f.kind) {
    case "auctionSold": return `Sold at auction for $${f.value.toLocaleString("en-US")}`;
    case "price": return `Asking price $${f.value.toLocaleString("en-US")}`;
    case "miles": return `${f.value.toLocaleString("en-US")} miles`;
    case "zip": return `Your ZIP ${f.value}`;
    case "seller": return f.value === "dealer" ? "Seller is a dealer" : "Private seller";
    case "owners": return `${f.value} owner${f.value > 1 ? "s" : ""}`;
    case "accident": return f.value === "none" ? "No accidents (as you were told)" : "An accident reported";
    case "title": return `${f.value[0].toUpperCase()}${f.value.slice(1)} title`;
  }
}
