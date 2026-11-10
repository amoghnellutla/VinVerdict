/**
 * A message to send the seller before going to see the car, built from what
 * this check found and what's still unknown. Pure; plain text only.
 */

import type { ParsedListing } from "@/lib/listing/parse";
import type { RuleHit, SellerChecklist } from "@/lib/scam/rules";

export type MessageInput = {
  carName: string;
  listing: ParsedListing;
  hits: RuleHit[];
  checklist: SellerChecklist;
  recallCount: number | null;
  /** NHTSA's most-reported problem area for this model year, e.g. "POWER TRAIN". */
  topComplaint: string | null;
  /** Known problems for this model year, with the maker's document that covers them. */
  knownIssues?: { title: string; label: string }[];
  /** A random phrase for the "photo with a note" check (proves they have the car right now). */
  phrase?: string | null;
};

const MAX_QUESTIONS = 8;

// Short, common, easy to write by hand and hard to have ready in advance.
const WORDS = [
  "maple", "river", "orange", "tiger", "pencil", "harbor", "violet", "rocket", "garden", "silver", "falcon", "candle",
  "meadow", "copper", "lemon", "anchor", "breeze", "cactus", "dolphin", "ember", "forest", "glacier", "hammer", "island",
  "jasmine", "kettle", "ladder", "marble", "nickel", "olive", "pepper", "quartz", "raven", "saddle", "tulip", "umbrella",
  "velvet", "walnut", "yellow", "zebra", "basket", "cobalt", "desert", "feather", "ginger", "honey", "igloo", "jungle",
];

/** An unbiased random index below n, from the browser's cryptographic generator (rejection sampling). */
function cryptoIndex(n: number): number {
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Three random words, e.g. "copper tulip harbor". Pass an index source in tests. */
export function proofPhrase(pick: (n: number) => number = cryptoIndex): string {
  return Array.from({ length: 3 }, () => WORDS[pick(WORDS.length)]).join(" ");
}

export function sellerMessage(m: MessageInput): string {
  const l = m.listing;
  const has = (id: string) => m.hits.some((h) => h.id === id);
  const dealer = l.sellerType === "dealer";
  const c = m.checklist;
  const q: string[] = [];

  if (!l.vin || has("vin-invalid")) q.push("What's the full VIN? I'd like to run the free recall and title checks.");
  for (const k of (m.knownIssues ?? []).slice(0, 2)) {
    q.push(`This model year has a known issue (${k.title.toLowerCase()}, covered by ${k.label}). Was it fixed, and do you have the record?`);
  }
  if (has("history-miles-lower") || has("history-rollback") || has("live-miles-lower")) {
    q.push("An earlier listing of this car showed different miles. Could you send a photo of the odometer today?");
  } else if (has("odometer-unknown")) {
    q.push("What does the title say about the mileage? Do you have service records that show past odometer readings?");
  } else if (has("mileage-low")) {
    q.push("The miles are very low for its age. Could you send a photo of the odometer today, and service records that show past readings?");
  }
  if (!dealer && c.titleInSellerName == null) q.push("Is the title in your name, and is it clean (no salvage, rebuilt or flood brand)?");
  if (dealer) q.push("Could you send the Carfax or AutoCheck report, and the out-the-door price with every fee?");
  if (c.anyAccidents == null && !has("accident-reported") && !has("live-accident")) q.push("Has it been in any accident, even a small one?");
  if (has("accident-reported") || has("live-accident")) q.push("What was damaged in the accident, and do you have the repair invoice?");
  if (!dealer && c.lienOnTitle == null) q.push("Is there a loan on it? If so, which bank holds the title?");
  if (m.recallCount) q.push(`Have the recalls been done? There ${m.recallCount === 1 ? "is 1" : `are ${m.recallCount}`} for this model and year.`);
  if (m.topComplaint) q.push(`Any problems with the ${m.topComplaint.toLowerCase()}? It's the most reported issue for this year.`);
  if (c.allowsInspection == null) q.push("Can my mechanic do a pre-purchase inspection before I buy?");
  q.push("Do you have the service records?");
  // A private seller's photo of the VIN next to a note shows they have the car right now. Never cut.
  const photo = dealer
    ? []
    : [
        m.phrase
          ? `Could you send a photo of the VIN sticker on the driver's door, next to a handwritten note saying "${m.phrase}"?`
          : "Could you send a photo of the VIN sticker on the driver's door, next to a note with today's date?",
      ];
  const asked = [...q.slice(0, MAX_QUESTIONS - photo.length), ...photo];

  const priced = l.price ? ` listed at $${l.price.toLocaleString("en-US")}` : "";
  return [
    `Hi, I'm interested in your ${m.carName}${priced}. Before I come to see it, could you tell me:`,
    "",
    ...asked.map((x, i) => `${i + 1}. ${x}`),
    "",
    "Thanks!",
  ].join("\n");
}
