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
  | { kind: "title"; value: "clean" | "salvage" | "rebuilt" | "flood"; quote: string }
  | { kind: "docFee"; value: number; quote: string }
  /** What the buyer's own mechanic found ("my mechanic said it's fine", "inspection found worn brakes"). */
  | { kind: "inspection"; value: "passed" | "issues"; quote: string }
  | { kind: "usage"; value: "rental" | "fleet"; quote: string }
  /** A price guide value the person looked up ("KBB says 13,200", "Edmunds private party 12,500"). Trade-in is kept only to explain why it isn't used. */
  | { kind: "guide"; value: number; name: string; guide: "retail" | "private" | "trade" | "unknown"; quote: string };

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** "9,100", "$9100", "9.1k", "12k" → dollars; null when it isn't a plausible car price. */
export function money(s: string): number | null {
  const m = /^\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|grand)?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1_000 : 1);
  return n >= 300 && n < 1_000_000 ? Math.round(n) : null;
}

const AMOUNT = String.raw`(\$?\s?\d{1,3}(?:,\d{3})+|\$?\s?\d{3,7}(?:\.\d+)?\s?k?|\$?\s?\d{1,3}(?:\.\d)?\s?(?:k|grand))\b`;

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
  // Asking price, or the seller's lower price since ("she'd take 13,500", "came down to 14k",
  // "asking 14,995 but they said 14,500 cash"): the last one said counts. Never a deposit,
  // an amount off, or anything under $1,000 ("take $500 off" isn't a price).
  const NOT_PRICE = String.raw`(?!\s*(?:off|less|discount|more|deposit|down\b|to hold|for (?:a |the )?deposit|doc|fee|out the door|otd))`;
  const prices = [
    ...text.matchAll(new RegExp(String.raw`\b(?:asking(?: price)?(?: is)?|price is|priced (?:at|for)|listed (?:at|for)|they want|wants|selling (?:it )?for|offered (?:at|for)|(?:would|will|'d|'ll|could|can) (?:take|do|accept|let it go for)|(?:came|come|coming|go|goes|went|dropped|dropping|drop|lowered|lowering|reduced|cut|knocked|knock|brought|bring) (?:it |the price |(?:his|her|their) price )?(?:down )?to|(?:won'?t|will not|can'?t|cannot|wouldn'?t) (?:go |come |take )?(?:any )?(?:below|under|lower than|less than)|(?:lowest|bottom line|bottom dollar|least|final offer|best offer)(?: price)?(?: (?:he|she|they)(?:'ll| will| would| can| could)?(?: go| take| do| accept)?)? is|counter(?:ed|s)?(?: (?:my|our) \S+)? (?:at|with)|came back (?:at|with)|accepted (?:my |our )?offer (?:of|at)|price (?:dropped|went down|was (?:lowered|reduced|cut)|is now|now) (?:to )?|(?:best|final|lowest|new|cash) price(?: is| of)?|agreed (?:to|on))\s*:?\s*${AMOUNT}${NOT_PRICE}`, "gi")),
    ...text.matchAll(new RegExp(String.raw`\b(?:said|says|for)\s+${AMOUNT}\s+(?:cash|firm|obo|or best offer|plus (?:tax|fees|tax and fees|doc)|before (?:tax|fees))\b`, "gi")),
    // "13k is his lowest", "12,500 is the lowest she'll go", "14,000 is my final price" (said by the seller)
    ...text.matchAll(new RegExp(String.raw`(?<![\w$,.])${AMOUNT}\s+is\s+(?:his|her|their|the|my)\s+(?:lowest|bottom(?: line)?|final|best|last)\b`, "gi")),
  ].sort((x, y) => x.index - y.index);
  // "My final offer is 12,000", "I countered at 12,500": the buyer's own number, not the seller's price.
  const buyers = (m: RegExpExecArray) => /offer|counter|came back/i.test(m[0]) && /\b(?:i|we|my|our)\s+$/i.test(text.slice(Math.max(0, m.index - 15), m.index));
  const ask = [...prices].reverse().find((m) => !(sold && m.index === sold.index) && (money(m[1]) ?? 0) >= 1_000 && !buyers(m));
  if (ask) out.push({ kind: "price", value: money(ask[1])!, quote: text.slice(ask.index, ask.index + ask[0].length) });
  // Miles.
  const mi = [...text.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d{4,6}|\d{1,3}(?:\.\d)?\s?k)\s*(?:miles|mi)\b|\bodometer(?: reads| shows| says| is| at| reading)?:?\s*(\d{1,3}(?:,\d{3})+|\d{4,6})/gi)].find((m) => {
    if (m[2]) return true;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
    const before = text.slice(Math.max(0, m.index - 50), m.index);
    // "15,000 miles a year", "300 miles away", "36k miles of warranty left"
    if (/^\s*(?:a|per|each|every|\/)\s?(?:year|yr|month|mo|week|day)\b|^\s*(?:away|from (?:here|me|my)|round[- ]?trip|(?:of )?warranty|left on)\b/i.test(after)) return false;
    // "I drive 15,000 miles", "every 5,000 miles", "replaced at 90,000 miles", "due at 100k miles"
    if (/\b(?:i|we)\s+(?:drive|commute|put on|do)\b[^.;]{0,20}$|\b(?:every|after|until|within|up to)\s*$/i.test(before)) return false;
    if (/\b(?:replaced|done|changed|serviced|rebuilt|installed|fixed|put on|swapped|due|needs?|recommended)\b[^.;,]{0,30}\bat\s*$/i.test(before)) return false;
    return true;
  });
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
  const noAcc = /\bno accidents?\b(?: or damage)?(?: reported)?|\baccident[- ]free\b|\bnever (?:been )?in an accident\b/i.exec(text);
  const acc = /\b(?:had|has|was in|been in) an? (?:minor |small |major )?accident\b|\baccident (?:reported|on (?:the )?(?:carfax|autocheck|report))\b|\b(?:1|one|2|two|3|three) (?:minor |small |major )?accidents?\b/i.exec(text);
  if (noAcc) out.push({ kind: "accident", value: "none", quote: quote(noAcc) });
  else if (acc && !/\b(?:i|we|i've|we've|i have|my (?:(?:last|old|other|previous|first|current|own|friend'?s|wife'?s|husband'?s|dad'?s|mom'?s) )?(?:car|truck|suv|van|vehicle))\s*$/i.test(text.slice(Math.max(0, acc.index - 40), acc.index))) {
    out.push({ kind: "accident", value: "reported", quote: quote(acc) });
  }
  // Title.
  const title = /\b(clean|salvage|rebuilt|flood)(?: title)\b|\btitle is (clean|salvage|rebuilt|flood)\b/i.exec(text);
  if (title) out.push({ kind: "title", value: (title[1] ?? title[2]).toLowerCase() as "clean" | "salvage" | "rebuilt" | "flood", quote: quote(title) });
  // A price guide value ("KBB says 13,200", "kelley blue book private party value is $12,500", "edmunds 13k").
  const GUIDES: [RegExp, string][] = [[/\bkbb\b|\bkelley(?: blue book)?\b|\bblue book\b/i, "KBB"], [/\bedmunds\b/i, "Edmunds"], [/\bnada(?:guides)?\b|\bj\.?d\.? power\b/i, "J.D. Power (NADA)"], [/\bcargurus\b/i, "CarGurus"], [/\bcarfax value\b|\bcarfax says (?:it'?s )?worth\b/i, "Carfax"]];
  const guideName = GUIDES.find(([re]) => re.test(text))?.[1];
  if (guideName) {
    const g = new RegExp(String.raw`(?:kbb|kelley(?: blue book)?|blue book|edmunds|nada(?:guides)?|j\.?d\.? power|cargurus|carfax)[^.?!$\d]{0,60}${AMOUNT}`, "i").exec(text);
    const v = g ? money(g[1]) : null;
    if (g && v && v >= 1_000) {
      const said = g[0].toLowerCase();
      const kind = /trade[- ]?in/.test(said) ? "trade" : /private(?: party)?/.test(said) ? "private" : /retail|dealer|fair purchase|typical listing|market value|instant market/.test(said) ? "retail" : "unknown";
      out.push({ kind: "guide", value: v, name: guideName, guide: kind, quote: quote(g) });
    }
  }
  // The buyer's own inspection: passed, or what it found (the person's words are kept for the offer).
  if (/\b(?:mechanic|inspection|inspector|ppi|pre-?purchase)\b/i.test(text) && !/\b(?:inspection list|get an? inspection|book an? inspection|allow (?:an )?inspection)\b/i.test(text)) {
    const GOOD = /\b(?:passed|went (?:well|fine|great)|all good|looks? (?:good|fine|great)|checked out|no (?:issues|problems)|found nothing|nothing (?:wrong|major)|(?:is|was|it'?s|its) (?:fine|ok(?:ay)?|solid|clean)|(?:good|great) (?:shape|condition))\b/i;
    const BAD = /\b(?:found|needs?|leak(?:s|ing)?|worn|bad|broken|issues?|problems?|rust(?:y)?|replace(?:d|ment)?|cracked|failing|codes?|damage|repair)\b/i;
    const sentence = text.split(/(?<=[.!?])\s+/).find((x) => /\b(?:mechanic|inspection|inspector|ppi|pre-?purchase)\b/i.test(x)) ?? text;
    const good = GOOD.exec(sentence);
    // "No issues", "nothing wrong": every reassuring phrase is taken out before looking for problems.
    const bad = BAD.exec(sentence.replace(new RegExp(GOOD.source, "gi"), ""));
    // "my mechanic found worn brakes" → "worn brakes": the finding itself, said once.
    const finding = sentence.trim().replace(/^(?:my |the |our )?(?:mechanic|inspector|inspection|ppi|pre-?purchase inspection)\s+(?:found|said|says|shows|showed|turned up)\s+(?:that\s+)?(?:it\s+(?:has|needs)\s+)?/i, "").slice(0, 200);
    if (bad) out.push({ kind: "inspection", value: "issues", quote: finding });
    else if (good) out.push({ kind: "inspection", value: "passed", quote: sentence.trim().slice(0, 200) });
  }
  // The dealer's doc fee ("doc fee is 499", "added a $899 doc fee").
  const doc = /\bdoc(?:ument(?:ation|ary)?)?[ -]?fees?\b(?:\s*(?:is|of|:|=))?\s*\$?\s?(\d{2,4})\b|\$\s?(\d{2,4})\s*(?:dealer\s+)?doc(?:ument(?:ation|ary)?)?[ -]?fee/i.exec(text);
  const docFee = doc ? Number(doc[1] ?? doc[2]) : 0;
  if (docFee >= 25 && docFee <= 3_000) out.push({ kind: "docFee", value: docFee, quote: quote(doc!) });
  // A former rental or fleet car, stated ("it was a rental"; "it's not a rental" doesn't match).
  const use = /\b(?:was|it'?s|it is|is|former|ex-?)\s*(?:an?\s+)?(rental|fleet|company car)\b|\bused (?:as )?(?:a |in a )?(rental|fleet)\b/i.exec(text);
  if (use) out.push({ kind: "usage", value: (use[1] ?? use[2]).toLowerCase() === "rental" ? "rental" : "fleet", quote: quote(use) });
  const guide = out.find((f) => f.kind === "guide");
  // "KBB private party value" describes the guide's number, not who's selling.
  return guide ? out.filter((f) => !(f.kind === "price" && f.value === guide.value) && !(f.kind === "seller" && guide.quote.toLowerCase().includes(f.quote.toLowerCase()))) : out;
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
  docFee: "doc fee",
  usage: "past use",
  guide: "price guide",
  inspection: "your mechanic's inspection",
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
    case "docFee": return `Doc fee $${f.value.toLocaleString("en-US")}`;
    case "usage": return f.value === "rental" ? "Former rental car" : "Former fleet car";
    case "inspection": return f.value === "passed" ? "Your mechanic's inspection: passed" : `Your mechanic found: "${f.quote}"`;
    case "guide": return `${f.name}${f.guide === "private" ? " private party" : f.guide === "retail" ? " retail" : f.guide === "trade" ? " trade-in" : ""} value $${f.value.toLocaleString("en-US")}`;
  }
}
