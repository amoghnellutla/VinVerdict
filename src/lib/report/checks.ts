/**
 * "Check it yourself": the outside checks for one VIN and what VinVerdict read
 * from anything attached to them. Shared by the page and the downloadable report. Pure.
 */

import type { CheckRating } from "@/lib/evidence/combine";
import type { FindingStatus, ProofKind } from "@/lib/evidence/parse";
import type { LiveListing } from "@/lib/live/parse";
import { verifyLinks } from "@/lib/sources";
import type { CheckRow } from "./markdown";

export const RATING_TEXT: Record<CheckRating, string> = {
  clear: "Clear",
  problem: "Problem found",
  check: "Look closer",
  read: "Attached",
  none: "Not checked",
};

/** The history-report row: the dealer's free Carfax when the live listing has one, otherwise Carfax/AutoCheck in general. */
export function historyReportLink(live: Pick<LiveListing, "carfaxUrl"> | null): { name: string; href: string; cost: string; what: string } {
  return live?.carfaxUrl
    ? { name: "The dealer's free Carfax report", href: live.carfaxUrl, cost: "Free from the dealer", what: "Accidents, title brands, owners, use and odometer readings. Open it, then screenshot or copy the summary." }
    : { name: "Carfax or AutoCheck report", href: "https://www.carfax.com/", cost: "Often free from dealers, paid otherwise", what: "Accidents, title brands, owners and odometer readings. Dealer listings usually link one free; ask a private seller to send it." };
}

type AttachedRead = { kind: ProofKind; findings: { label: string; status: FindingStatus }[] };

/** Every check as a row: name, link, cost, what it shows, its status and what the attached proof said. */
export function checkRows(vin: string | null, make: string | null, live: Pick<LiveListing, "carfaxUrl"> | null, rating: Record<ProofKind, CheckRating>, attached: AttachedRead[]): CheckRow[] {
  if (!vin) return [];
  const said = (kind: ProofKind) => attached.filter((p) => p.kind === kind).flatMap((p) => p.findings.map((f) => f.label));
  const h = historyReportLink(live);
  return [
    { ...h, status: RATING_TEXT[rating.history], findings: said("history") },
    ...verifyLinks(vin, make).map((l) => ({
      name: l.name,
      href: l.href,
      cost: `${l.cost}${l.kind && !l.vinInLink ? "; paste the VIN" : ""}`,
      what: l.what,
      status: l.kind ? RATING_TEXT[rating[l.kind]] : "A link to open",
      findings: l.kind ? said(l.kind) : [],
    })),
  ];
}
