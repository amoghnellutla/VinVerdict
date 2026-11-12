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
import { factsFromSentence, isQuestion, type Fact } from "./facts";

export type Intent = "overview" | "price" | "seller" | "recalls" | "history" | "next" | "auction" | "costs" | "fuel";

export type Route =
  | { kind: "auction"; record: AuctionRecord; facts: Fact[] }
  | { kind: "proof"; source: ProofSource }
  | { kind: "listing"; listing: ParsedListing }
  | { kind: "other-car"; vin: string }
  /** Facts to apply; `question` when the message also asks something (answered after applying them). */
  | { kind: "facts"; facts: Fact[]; intent: Intent | null; question: boolean }
  | { kind: "intent"; intent: Intent }
  | { kind: "small-talk" }
  | { kind: "ai" };

const READABLE: ProofSource[] = ["carfax", "autocheck", "nicb", "nhtsa", "maker", "nmvtis"];

/** A pasted listing page, not a report: a price box, payments, "contact dealer", "for sale". */
const LISTING_PAGE = /\blisting price\b|\bcontact (?:the )?dealer\b|\bfor sale\b|\/mo\b|\best\. (?:finance|payment)|\bbuild your offer\b|\bmake offer\b|\bprice alerts?\b/i;

const INTENTS: [Intent, RegExp][] = [
  ["auction", /\bauction\b.*(?:\?|\b(?:bad|safe|ok|okay|good|risky|normal)\b)|\bbid(?:ding)?\b|\bhow much (?:should|to) bid\b/i],
  ["costs", /\bout[- ]the[- ]door\b|\bwhat will it cost\b|\btotal cost\b|\b(?:sales )?tax(?:es)?\b|\bregistration\b|\bfees?\b|\bcost (?:me|per|a) (?:year|month)\b|\bcost to own\b/i],
  ["fuel", /\bmpg\b|\bgas mileage\b|\bfuel (?:economy|cost)\b|\bmiles per gallon\b/i],
  ["price", /\bprice\b|\bfair\b|\bworth\b|\boffer\b|\bnegotiat|\bovercharg|\boverpriced\b|\btoo (?:much|expensive|high)\b|\bexpensive\b|\bgood deal\b|\bhow much\b|\bpay\b/i],
  ["seller", /\bask (?:the )?(?:seller|dealer)\b|\bwhat (?:should|do|can) i (?:ask|say|tell|write)\b|\bmessage\b|\bquestions? (?:for|to ask)\b/i],
  ["recalls", /\brecalls?\b/i],
  ["history", /\bcarfax\b|\bautocheck\b|\baccidents?\b|\bhistory\b|\bowners?\b|\btitle\b/i],
  ["next", /\bwhat(?:'?s| is)? (?:now|next)\b|\bnext steps?\b|\bwhat (?:should|do) i do\b|\bwhere (?:do i |should i )?start\b|\bwhat else\b/i],
  ["overview", /\b(?:thinking|think) (?:of|about) buying\b|\bshould i (?:buy|get)\b|\bwould you buy\b|\bis (?:it|this) (?:a )?(?:good|safe|ok|worth)\b|\bbuy (?:it|this)\b|\binterested in\b|\bwhat do you think\b|\bverdict\b|\bany (?:red flags|problems|issues)\b/i],
];

/** Words that make a message about the car (anything else short and unasked is small talk). */
const CAR_WORDS = /\b(car|vehicle|camry|corolla|accord|civic|model|price|miles?|mileage|mpg|gas|fuel|dealer|seller|title|accident|engine|vin|auction|bid|buy|offer|carfax|autocheck|recall|warranty|inspect|inspection|check|owner|history|deal|tires?|brakes?|transmission|timing|belt|chain|oil|maintenance|repair|reliable|reliability|fee|tax|insurance|loan|finance|cost|grade|cr|mmr|consignor|rust|flood|salvage|rebuilt|lien|last|problems?|issues?|break|breaks|repairs?|safe|safety)\b/i;

export function intentOf(text: string): Intent | null {
  return INTENTS.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function routeMessage(raw: string, carVin: string | null): Route {
  const text = raw.trim();
  if (!text) return { kind: "small-talk" };

  const record = parseAuctionRecord(text);
  if (record) {
    if (record.vin && carVin && record.vin !== carVin) return { kind: "other-car", vin: record.vin };
    return { kind: "auction", record, facts: factsFromSentence(text).filter((f) => f.kind === "auctionSold") };
  }

  const long = text.length >= 120;
  const looksLikeListing = LISTING_PAGE.test(text);
  if (long && !looksLikeListing) {
    const read = readProof(text);
    if (READABLE.includes(read.source) && (read.findings.length > 0 || read.vins.length > 0)) {
      if (carVin && read.vins.length && !read.vins.includes(carVin)) return { kind: "other-car", vin: read.vins[0] };
      return { kind: "proof", source: read.source };
    }
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

  const question = isQuestion(text);
  const facts = factsFromSentence(text);
  const intent = intentOf(text);
  if (facts.length) return { kind: "facts", facts, intent: question ? intent : null, question };
  if (intent) return { kind: "intent", intent };

  const words = text.split(/\s+/).filter(Boolean).length;
  const greeting = /^(hi|hello|hey|yo|thanks|thank you|thx|ty|ok|okay|cool|nice|great|lol|test|testing|help)\b/i.test(text);
  if (greeting || !/[a-z]/i.test(text)) return { kind: "small-talk" };
  // A real question about the car goes to the AI; a few words with nothing about the car don't.
  // Off-topic, even as a question ("what's the weather tomorrow?"), never spends an AI action.
  if (!CAR_WORDS.test(text) || words < 2) return { kind: "small-talk" };
  return { kind: "ai" };
}
