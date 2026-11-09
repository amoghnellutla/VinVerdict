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
};

const MAX_QUESTIONS = 7;

export function sellerMessage(m: MessageInput): string {
  const l = m.listing;
  const has = (id: string) => m.hits.some((h) => h.id === id);
  const dealer = l.sellerType === "dealer";
  const c = m.checklist;
  const q: string[] = [];

  if (!l.vin || has("vin-invalid")) q.push("What's the full VIN? I'd like to run the free recall and title checks.");
  if (has("history-miles-lower") || has("history-rollback") || has("live-miles-lower") || has("mileage-low")) {
    q.push("An earlier listing of this car showed different miles. Could you send a photo of the odometer today?");
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
  if (!dealer) q.push("Could you send a photo of the VIN sticker on the driver's door, next to a note with today's date?");

  const priced = l.price ? ` listed at $${l.price.toLocaleString("en-US")}` : "";
  return [
    `Hi, I'm interested in your ${m.carName}${priced}. Before I come to see it, could you tell me:`,
    "",
    ...q.slice(0, MAX_QUESTIONS).map((x, i) => `${i + 1}. ${x}`),
    "",
    "Thanks!",
  ].join("\n");
}
