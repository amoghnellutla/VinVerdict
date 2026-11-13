/**
 * A pasted (or screenshotted) conversation with the seller: Facebook Marketplace, Craigslist
 * email, texts. Pure. Spots one from its shape (several short lines, "is this still
 * available?", "Me:"/"Seller:" labels, timestamps, "Seen"/"You sent") and keeps only what the
 * seller wrote, so the seller-reply checks (lib/seller-replies.ts) read their words, not the
 * buyer's questions or the app's buttons.
 */

const CHROME = /^(?:seen|delivered|read|sent|you sent|message\.{0,3}|type a message\.{0,3}|reply|send|active (?:now|\d+\s?\w+ ago)|online|today|yesterday|\d{1,2}:\d{2}\s?(?:am|pm)?|(?:mon|tue|wed|thu|fri|sat|sun)\w*(?: \d{1,2}:\d{2}\s?(?:am|pm)?)?|marketplace(?: ·.*)?|view (?:listing|profile)|mark as sold|.{0,40}\s·\s\$[\d,]+)$/i;
const BUYER = /^\s*(?:me|you|i|buyer)\s*:\s*/i;
const SELLER = /^\s*(?:seller|them|owner|dealer|he|she|they|[A-Z][a-z]+(?: [A-Z][a-z]+)?)\s*:\s*/;
const STILL = /\bis (?:this|it|the \w+) still (?:available|for sale)\b|\bstill available\?/i;

/**
 * A listing page carries a "Message" button and "Is this still available?" too, so a page with
 * strong listing signals counts as a chat only with real conversation marks (labels, "You sent").
 */
export function isChat(text: string, listingSignals = 0): boolean {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3 || text.length > 6_000) return false;
  const labelled = lines.filter((l) => BUYER.test(l) || /^\s*(?:seller|them|owner|buyer)\s*:/i.test(l)).length;
  const questions = lines.filter((l) => /\?\s*$/.test(l) && l.length <= 160).length;
  const answers = lines.filter((l) => !/\?\s*$/.test(l) && !CHROME.test(l)).length;
  const cues = [
    STILL.test(text),
    labelled >= 2,
    /\b\d{1,2}:\d{2}\s?(?:am|pm)\b/i.test(text),
    lines.some((l) => /^(?:seen|delivered|you sent|message\.{2,3}|active (?:now|\d+\s?\w+ ago))$/i.test(l)),
    questions >= 2 && answers >= 2,
  ].filter(Boolean).length;
  const marked = labelled >= 2 || lines.some((l) => /^(?:you sent|seen|delivered)$/i.test(l));
  return cues >= 2 && (listingSignals < 3 || marked);
}

/** The seller's side of a chat: chrome and the buyer's lines removed, "Seller:" labels stripped. */
export function sellerSide(text: string): string {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const labelled = lines.some((l) => BUYER.test(l));
  const out: string[] = [];
  let mine = false; // after "You sent" (Messenger), the next lines are the buyer's until a name line
  for (const l of lines) {
    if (/^you sent$/i.test(l)) { mine = true; continue; }
    if (CHROME.test(l)) continue;
    if (BUYER.test(l)) continue;
    if (labelled && SELLER.test(l)) { out.push(l.replace(SELLER, "")); continue; }
    // A short line of one or two capitalised words is a name (Messenger shows it above their messages).
    if (/^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(l)) { mine = false; continue; }
    if (mine) continue;
    // Unlabelled chats: the buyer's opening questions aren't the seller's words.
    if (!labelled && /\?\s*$/.test(l) && (STILL.test(l) || /^(?:hi|hello|hey)\b/i.test(l) || /\b(?:can|could|may) (?:i|my|we)\b|\bdoes it\b|\bany\b|\bis (?:it|the title)\b/i.test(l))) continue;
    out.push(l);
  }
  return out.join("\n");
}
