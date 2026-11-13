/**
 * "Tell VinVerdict or ask": works out what a message is, with no AI (PLAN.md "assistant").
 * Pure. The order matters:
 *   1. a wholesale auction record (its own labels: MMR, CR grade, consignor…)
 *   2. a history report or check page that VinVerdict can read (Carfax, AutoCheck, NICB, recalls, NMVTIS)
 *   3. another listing for this car (or a different car)
 *   4. facts in a sentence ("sold at auction for 9,100")
 *   5. a question VinVerdict can answer from the page itself
 *   6. small talk, or too little to act on
 *   7. only then: a free AI model (an open question, or a sentence the patterns can't read)
 */

import { readProof, type ProofSource } from "@/lib/evidence/parse";
import { parseListing, type ParsedListing } from "@/lib/listing/parse";
import { parseAuctionRecord, type AuctionRecord } from "@/lib/listing/auction";
import { checkVin } from "@/lib/vin";
import { isChat, sellerSide } from "./chat";
import { termIn } from "./glossary";
import { factsFromSentence, isQuestion, type Fact } from "./facts";

export type Intent = "overview" | "offer" | "price" | "seller" | "recalls" | "history" | "next" | "auction" | "costs" | "fuel" | "scam" | "who" | "visit" | "problems" | "miles";

export type Route =
  | { kind: "auction"; record: AuctionRecord; facts: Fact[] }
  | { kind: "proof"; source: ProofSource }
  | { kind: "listing"; listing: ParsedListing }
  | { kind: "other-car"; vin: string }
  /** The VIN for an ad that had none ("the VIN is …"): re-check this ad with it. `problem` when the check digit fails. */
  | { kind: "add-vin"; vin: string; problem: string | null }
  /** Facts to apply; `question` when the message also asks something (answered after applying them). */
  | { kind: "facts"; facts: Fact[]; intent: Intent | null; question: boolean }
  | { kind: "intent"; intent: Intent }
  /** "What does CR grade mean?": a fixed definition (lib/assistant/glossary.ts). */
  | { kind: "term"; key: string }
  /** Several questions in one message ("is the price fair and is it a scam?"): each answered from the page. */
  | { kind: "intents"; intents: Intent[] }
  /** What the seller said or asked for ("he wants a deposit", "she'd take 13,500"): checked like their reply, plus any facts in it. */
  | { kind: "said"; facts: Fact[] }
  /** A pasted or screenshotted conversation with the seller: their side, checked like a reply. */
  | { kind: "chat"; seller: string; facts: Fact[] }
  | { kind: "small-talk" }
  /** A pasted link: VinVerdict doesn't open listing links, so ask for the page's text. */
  | { kind: "link"; host: string }
  | { kind: "ai" };

const READABLE: ProofSource[] = ["carfax", "autocheck", "nicb", "nhtsa", "maker", "nmvtis"];

/**
 * Words only a report or check page uses. Listing pages mention "Carfax", "AutoCheck" or a
 * "vehicle history report" too (a free-report badge), so a page counts as a report only with
 * at least two of these (real cases 3, 12, 22, 32 were listing pages that mention a report).
 */
const REPORT_MARKERS = [
  /\bprevious owners?\b/i, /\bservice history records?\b/i, /\bdetailed records available\b/i, /\bdamage severity scale\b/i,
  /\blast owned in\b/i, /\bautocheck score\b/i, /\bhistory at a glance\b/i, /\blast reported odometer\b/i, /\btypes? of owners\b/i,
  /\bvincheck\b/i, /\b(?:theft|salvage|total loss) records?\b/i, /\bnmvtis\b/i, /\brecall (?:status|results)\b/i, /\bremedy\b/i,
  /\bunrepaired recalls?\b/i, /\bowners? - \d\b/i, /\breport run\b/i, /\bno accidents or damage reported to carfax\b/i,
];
const reportMarkers = (t: string) => REPORT_MARKERS.filter((re) => re.test(t)).length;

const URL_ONLY = /^\s*https?:\/\/\S+\s*$/i;
const VIN_ONLY = /^\s*(?:vin:?\s*)?([A-HJ-NPR-Z0-9]{17})\s*$/i;
const VIN_SAID = /\bvin\b(?: number)?(?: is|:|'s|=)?\s*([A-HJ-NPR-Z0-9]{17})\b/i;

/** A pasted listing page, not a report: a price box, payments, "contact dealer", "for sale". */
const LISTING_PAGE = /\blisting price\b|\bcontact (?:the )?dealer\b|\bfor sale\b|\/mo\b|\best\. (?:finance|payment)|\bbuild your offer\b|\bmake offer\b|\bprice alerts?\b/i;

const INTENTS: [Intent, RegExp][] = [
  ["miles", /\b(?:too (?:many|much|high)|a lot of|high|low|good|ok(?:ay)?|bad|normal|average) (?:miles|mileage)\b|\b(?:miles|mileage) (?:too (?:high|low|much)|a lot|ok(?:ay)?|bad|high|normal|fine|good)\b|\bis [\d,.]+\s?k? ?miles\b|\bhow many miles (?:is|are) (?:too many|normal|ok)\b|\bmiles (?:a|per) year\b/i],
  ["problems", /\b(?:common|known|typical|usual|frequent|biggest) (?:problems?|issues?|faults?|complaints?)\b|\b(?:problems|issues) (?:with|on|for) (?:this|the|these|that) (?:car|model|year|engine)\b|\bwhat (?:usually )?(?:goes wrong|breaks|fails)\b|\breliab(?:le|ility)\b|\bhow long (?:will|does|do|can|would) (?:it|this|they|these|the car|this car) (?:last|go)\b|\bwhat (?:to|should i) (?:watch|look) out for\b|\bcomplaints\b/i],
  ["visit", /\btest[- ]drive\b|\bshow(?:ing)? (?:the|my) car\b|\bmeet(?:ing)? (?:a |the )?buyers?\b|\b(?:going|go|gonna) (?:to )?(?:see|look at|check out) (?:it|the car)\b|\bsee (?:it|the car) (?:tomorrow|today|tonight|this weekend|on \w+day)\b|\bbuying day\b|\bwhat (?:do|should) i (?:bring|take with me)\b|\bwhat (?:to|should i) (?:check|look (?:for|at)|inspect) (?:when|at|in person|on the car)\b|\bin person\b|\bpre-?purchase inspection\b|\binspection (?:list|checklist)\b/i],
  ["scam", /\bscam(?:s|med|mer)?\b|\bfraud\b|\blegit(?:imate)?\b|\bfake\b|\bsafe to (?:pay|send|wire|buy)\b|\bdeposit\b|\bgift cards?\b|\bzelle\b|\bvenmo\b|\bcash ?app\b|\bescrow\b|\bwire (?:the )?money\b|\bsell (?:it |my car )?safely\b|\bsafe(?:ly)? to sell\b|\bget paid safely\b|\boverseas\b|\bdeployed\b|\bship (?:it|the car)\b/i],
  ["who", /\bwho(?:'?s| is)? (?:the |this )?(?:seller|dealer|selling)\b|\b(?:tell me )?about the (?:seller|dealer)\b|\bwho (?:sells|owns) (?:it|this)\b|\b(?:the |this )?(?:seller|dealer) (?:reputable|any good|reliable|trustworthy)\b|\bis (?:it|this) a (?:dealer|private)\b|\bdealer or private\b/i],
  ["auction", /\bauction\b.*(?:\?|\b(?:bad|safe|ok|okay|good|risky|normal)\b)|\bbid(?:ding)?\b|\bhow much (?:should|to) bid\b/i],
  ["costs", /\bout[- ]the[- ]door\b|\bwhat will it cost\b|\btotal cost\b|\b(?:sales )?tax(?:es)?\b|\bregistration\b|\bfees?\b|\bcost (?:me|per|a) (?:year|month)\b|\bcost to own\b/i],
  ["fuel", /\bmpg\b|\bgas mileage\b|\bfuel (?:economy|cost)\b|\bmiles per gallon\b/i],
  ["offer", /\bwhat (?:should|do|can|would) i offer\b|\bhow much (?:should|to|can|do) i offer\b|\bmake (?:an |a |my )?offer\b|\bnegotiat|\bopening offer\b|\bhow (?:low|much lower) can i go\b|\blowball\b|\bwhat (?:price )?should i pay\b|\bcounter ?offer\b/i],
  ["price", /\bprice\b|\bfair\b|\bworth\b|\boffer\b|\bnegotiat|\bovercharg|\boverpriced\b|\btoo (?:much|expensive|high)\b|\bexpensive\b|\bgood deal\b|\bhow much\b|\bpay\b|\bcheaper\b|\bbetter deals?\b|\blist (?:it|my car) (?:at|for)\b|\bsell (?:it|my car) for\b|\bwhat should i ask for (?:it|my car)\b/i],
  ["seller", /\bask (?:the )?(?:seller|dealer)\b|\bwhat (?:should|do|can) i (?:ask|say|tell|write)\b|\bmessage\b|\bquestions? (?:for|to ask)\b|\bwhat will (?:buyers|they|people) ask\b/i],
  ["recalls", /\brecalls?\b/i],
  ["history", /\bcarfax\b|\bautocheck\b|\baccidents?\b|\bhistory\b|\bowners?\b|\btitle\b/i],
  ["next", /\bwhat(?:'?s| is)? (?:now|next)\b|\bnext steps?\b|\bwhat (?:should|do) i do\b|\bwhere (?:do i |should i )?start\b|\bwhat else\b/i],
  ["overview", /\b(?:thinking|think) (?:of|about) buying\b|\bshould i (?:buy|get) (?:it|this|that|the car|this car)\b|\bshould i buy\s*\??$|\bwould you buy\b|\bis (?:it|this) (?:a )?(?:good|safe|ok|worth)\b|\bbuy (?:it|this)\b|\binterested in\b|\bwhat do you think\b|\bverdict\b|\bany (?:red flags|problems|issues)\b/i],
];

/** Words that make a message about the car (anything else short and unasked is small talk). */
const CAR_WORDS = /\b(car|vehicle|camry|corolla|accord|civic|model|price|miles?|mileage|mpg|gas|fuel|dealer|seller|title|accident|engine|vin|auction|bid|buy|offer|carfax|autocheck|recall|warranty|inspect|inspection|check|owner|history|deal|tires?|brakes?|transmission|timing|belt|chain|oil|maintenance|repair|reliable|reliability|fee|tax|insurance|loan|finance|cost|grade|cr|mmr|consignor|rust|flood|salvage|rebuilt|lien|problems?|issues?|break|breaks|repairs?|safe|safety|scam|fraud|legit|fake|deposit|drive|warranty)\b|\blast(?:s|ing)?\b(?=\s*(?:\?|$|long|another|\d|more|over|until|for))/i;

export function intentOf(text: string): Intent | null {
  const hit = INTENTS.find(([, re]) => re.test(text))?.[0] ?? null;
  // "Is 126k miles too much?" is about the miles, not the price.
  if (hit === "price" && /\bmiles?\b|\bmileage\b/i.test(text) && !/\$|\bprice\b|\bpay\b|\bworth\b|\bdeal\b/i.test(text)) return null;
  return hit;
}

/** Each question in a message, in order ("what should I offer and is it a scam?" → offer, scam). */
export function intentsOf(text: string): Intent[] {
  const parts = text.split(/\?\s*|;\s*|\s+(?:and|also|plus)\s+(?=(?:is|are|what|what's|how|who|should|any|can|do|does|will)\b)/i).map((x) => x.trim()).filter((x) => x.length > 2);
  const out: Intent[] = [];
  for (const part of parts) {
    const i = intentOf(part);
    if (i && !out.includes(i)) out.push(i);
  }
  return out.slice(0, 3);
}

/** "He said…", "the seller asked…", "seller is overseas": a report of what the seller said or did. */
const WHO = String.raw`\b(?:he|she|they|seller|buyer|dealer(?:ship)?|owner|guy|lady|salesman|salesperson|sales rep)\b[^.?!]{0,24}?`;
const SAID_STRONG = new RegExp(String.raw`${WHO}\b(?:said|says|told me|tells me|texted|messaged|emailed|asked|asks|insists?|refuses?|refused|won'?t|will not|can'?t|cannot|needs? me|requires?|offered|agreed)\b|\b(?:seller|dealer|owner)\s+(?:(?:is|was)\s+(?!asking|selling|listing|offering|charging|a dealer|private)|lives|works)`, "i");
/** "they want…", "he'd…": a seller's request, but a plain price ("they want 14,500") stays a fact. */
const SAID_WEAK = new RegExp(String.raw`${WHO}\b(?:wants?|is asking|would|will|'d|'ll)\b`, "i");

export function routeMessage(raw: string, carVin: string | null): Route {
  const text = raw.trim();
  if (!text) return { kind: "small-talk" };

  const record = parseAuctionRecord(text);
  if (record) {
    if (record.vin && carVin && record.vin !== carVin) return { kind: "other-car", vin: record.vin };
    return { kind: "auction", record, facts: factsFromSentence(text).filter((f) => f.kind === "auctionSold") };
  }

  // A VIN on its own or in a short sentence ("the VIN is …"): this car's, the missing one, or another car.
  const vinOnly = (VIN_ONLY.exec(text) ?? (text.length <= 90 ? VIN_SAID.exec(text) : null))?.[1]?.toUpperCase();
  if (vinOnly) {
    if (vinOnly === carVin) return { kind: "small-talk" };
    if (!carVin) {
      const c = checkVin(vinOnly);
      return { kind: "add-vin", vin: vinOnly, problem: c.ok ? null : c.message };
    }
    return { kind: "other-car", vin: vinOnly };
  }
  // A link on its own: VinVerdict doesn't open listing links (and a VIN in it may be another car).
  if (URL_ONLY.test(text)) {
    const inUrl = parseListing(text).vin;
    if (inUrl && carVin && inUrl !== carVin) return { kind: "other-car", vin: inUrl };
    let host = "that site";
    try {
      host = new URL(text.trim()).hostname.replace(/^www\./, "");
    } catch {
      // keep "that site"
    }
    return { kind: "link", host };
  }

  const long = text.length >= 120;
  const read = long ? readProof(text) : null;
  const readable = !!read && READABLE.includes(read.source) && (read.findings.length > 0 || read.vins.length > 0);
  const proof = (): Route => (carVin && read!.vins.length && !read!.vins.includes(carVin) ? { kind: "other-car", vin: read!.vins[0] } : { kind: "proof", source: read!.source });
  // A page with report-only wording is a report, whatever else it mentions.
  if (readable && reportMarkers(text) >= 2) return proof();

  // A conversation with the seller (before the listing check: a chat mentions the price and the car too).
  const pre = text.length >= 80 ? parseListing(text) : null;
  const preSignals = pre ? [pre.vin, pre.price, pre.miles, pre.year && pre.model].filter(Boolean).length : 0;
  if (isChat(text, preSignals)) {
    const seller = sellerSide(text);
    // The seller's own claims and prices; a ZIP or "dealer/private" in a chat isn't reliable.
    return { kind: "chat", seller, facts: factsFromSentence(seller).filter((f) => f.kind !== "zip" && f.kind !== "seller") };
  }

  if (text.length >= 80) {
    const listing = parseListing(text);
    const signals = [listing.vin, listing.price, listing.miles, listing.year && listing.model].filter(Boolean).length;
    // A short paste needs more to count as a listing ("2018 Camry $14,995 126,360 mi VIN …").
    if (signals >= (text.length >= 150 ? 2 : 3)) {
      if (listing.vin && carVin && listing.vin !== carVin) return { kind: "other-car", vin: listing.vin };
      return { kind: "listing", listing };
    }
  }
  // A short report summary pasted on its own ("CARFAX: no accidents reported, 1 owner").
  if (readable && !LISTING_PAGE.test(text)) return proof();

  const term = text.length <= 80 ? termIn(text) : null;
  if (term) return { kind: "term", key: term.key };

  const question = isQuestion(text);
  const facts = factsFromSentence(text);
  const intent = intentOf(text);
  if (!question && text.length <= 600 && (SAID_STRONG.test(text) || (!facts.length && SAID_WEAK.test(text)))) return { kind: "said", facts };
  if (facts.length) return { kind: "facts", facts, intent: question ? intent : null, question };
  if (intent) {
    const all = intentsOf(text);
    return all.length > 1 ? { kind: "intents", intents: all } : { kind: "intent", intent };
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  const greeting = /^(hi|hello|hey|yo|thanks|thank you|thx|ty|ok|okay|cool|nice|great|lol|test|testing|help)\b/i.test(text) || /\b(?:i |we )?(?:bought|purchased) (?:it|the car)\b/i.test(text);
  if (greeting || !/[a-z]/i.test(text)) return { kind: "small-talk" };
  // A real question about the car goes to the AI; a few words with nothing about the car don't.
  // Off-topic, even as a question ("what's the weather tomorrow?"), never spends an AI action.
  if (!CAR_WORDS.test(text) || words < 2) return { kind: "small-talk" };
  return { kind: "ai" };
}

/**
 * A screenshot's text: how a route should be trusted. A typed question can go to a page answer
 * or the AI, but OCR text that only *looks* like one shouldn't (it would answer a garbled
 * "question" or spend an AI action). "unreadable": too little text to work with.
 */
export function screenshotFit(route: Route, text: string): "ok" | "unclear" | "unreadable" {
  const words = text.match(/[a-z]{3,}/gi)?.length ?? 0;
  if (words < 6) return "unreadable";
  return ["ai", "small-talk", "intent", "intents", "term", "link"].includes(route.kind) ? "unclear" : "ok";
}
