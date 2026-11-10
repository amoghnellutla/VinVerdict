/**
 * Checks what the seller wrote back (pasted, or read from chat screenshots on
 * the device). Many scams only show after the first message: the deposit
 * request, the shipping story, the refusal to meet. This finds those, and
 * stories that change from the ad (miles, title, accidents), quotes the line,
 * and suggests a safe reply. Pure and browser-only in use: nothing is sent or
 * saved.
 */

import { hasUnnegated, normalizeText } from "@/lib/listing/text";
import type { ParsedListing } from "@/lib/listing/parse";
import { evaluateScamRules, type RuleHit } from "@/lib/scam/rules";

/** The ad rules that can fire from words in a message. */
const MESSAGE_RULES = new Set([
  "pay-gift-card", "pay-wire", "pay-app-upfront", "pay-app", "deposit-first", "shipping-only", "seller-remote",
  "no-inspection", "rushed", "curbstoning", "lien", "title-washing", "auction",
]);

const NO_DEPOSIT = "I don't send money before I've seen the car and the title in person. Can we meet so I can see it first? I'll pay at a bank once everything checks out.";
const IN_PERSON = "I only buy a car I can see in person with the title. Can we meet locally?";

const REPLY: Record<string, string> = {
  "pay-gift-card": NO_DEPOSIT,
  "pay-wire": NO_DEPOSIT,
  "pay-app-upfront": NO_DEPOSIT,
  "deposit-first": NO_DEPOSIT,
  "pay-app": "I'd rather pay at a bank, once the title is signed over to me.",
  "shipping-only": IN_PERSON,
  "seller-remote": IN_PERSON,
  "no-inspection": "I'll need my mechanic to inspect it before I buy. Is that OK?",
  rushed: "I'm interested, but I need a day to check the title and history. If it's still available after that, I'll come see it.",
  curbstoning: "Whose name is on the title? I need to buy from the person named on it, with matching ID.",
  lien: "Which bank holds the loan? I'd want to pay the bank directly and get the lien release.",
  "title-washing": "Can you send a photo of the title, front and back?",
  auction: "Was it bought at an insurance or salvage auction? Can you share the auction listing?",
  "story-miles": "Your message gives different miles from the ad. Could you send a photo of the odometer today?",
  "story-title": "The ad says the title is clean. Can you send a photo of the title, front and back?",
  "story-accident": "What was damaged, and do you have the repair invoice?",
};

export type ReplyHit = RuleHit & { quote: string | null; suggest: string | null };

const sentencesOf = (text: string) =>
  text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

function milesIn(t: string): number | null {
  const m = /\b(\d{1,3}(?:,\d{3})+|\d{4,6}|\d{1,3}(?:\.\d)?\s?k)\s*(?:miles|mi)\b/.exec(t);
  if (!m) return null;
  const raw = m[1].replace(/,/g, "").replace(/\s/g, "");
  const n = raw.endsWith("k") ? Math.round(parseFloat(raw) * 1000) : Number(raw);
  return Number.isFinite(n) && n >= 1000 ? n : null;
}

export function checkReplies(replies: string, listing: ParsedListing): ReplyHit[] {
  const text = replies.trim();
  if (!text) return [];
  const sentences = sentencesOf(text);
  const quoteFor = (id: string): string | null => {
    for (const s of sentences) {
      if (evaluateScamRules({ text: s, listing, checklist: {} }).hits.some((h) => h.id === id)) return s;
    }
    return null;
  };

  const out: ReplyHit[] = [];
  for (const h of evaluateScamRules({ text, listing, checklist: {} }).hits) {
    if (!MESSAGE_RULES.has(h.id)) continue;
    out.push({ ...h, id: `msg-${h.id}`, title: `In their reply: ${h.title.toLowerCase()}`, quote: quoteFor(h.id), suggest: REPLY[h.id] ?? null });
  }

  // Stories that change from the ad.
  const t = normalizeText(text);
  const said = milesIn(t);
  if (said && listing.miles && Math.abs(said - listing.miles) > Math.max(3000, listing.miles * 0.1)) {
    out.push({
      id: "msg-story-miles", action: "flag", title: "Their miles don't match the ad",
      reason: `The ad says ${listing.miles.toLocaleString("en-US")} miles; their message says ${said.toLocaleString("en-US")}. Ask for an odometer photo.`,
      quote: sentences.find((s) => milesIn(normalizeText(s)) === said) ?? null, suggest: REPLY["story-miles"],
    });
  }
  const brand = /\b(salvage|rebuilt|reconstructed|flood|branded|junk) title\b|\btitle is (salvage|rebuilt|branded)\b/.exec(t);
  if (brand && listing.titleStatus === "clean") {
    out.push({
      id: "msg-story-title", action: "hide", title: "Title isn't clean after all",
      reason: "The ad says clean title, but their message mentions a branded title. A branded title means major past damage and lower value.",
      quote: sentences.find((s) => /salvage|rebuilt|reconstructed|flood|branded|junk/i.test(s)) ?? null, suggest: REPLY["story-title"],
    });
  }
  const ACCIDENT = /\b(accident|fender bender|was hit|got hit|rear[- ]ended|body ?work|front end damage|minor damage)\b/;
  if (listing.accident === "none" && hasUnnegated(t, ACCIDENT)) {
    out.push({
      id: "msg-story-accident", action: "flag", title: "An accident the ad didn't mention",
      reason: "The ad says no accidents, but their message mentions one. Get the history report and the repair invoice, and price it lower.",
      quote: sentences.find((s) => ACCIDENT.test(normalizeText(s))) ?? null, suggest: REPLY["story-accident"],
    });
  }
  return out;
}
