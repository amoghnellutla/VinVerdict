/**
 * What the car's vehicle history report (Carfax, AutoCheck) says, as read by
 * the person checking it. Pure and browser-safe.
 *
 * Why a person reads it: Carfax and AutoCheck have no free API and don't
 * allow automated access, and listing-data feeds (Auto.dev, MarketCheck) are
 * not history reports. A feed's "0 accidents" often just means the feed has
 * no record; e.g. for one recorded example the feed said 0 accidents and
 * 1 owner while the dealer's own Carfax showed minor damage and 3 owners.
 * So feeds may add bad news, but only a history report (or a dealer's
 * history box) can clear a car.
 */

import type { ParsedListing } from "@/lib/listing/parse";

export type Damage = "unknown" | "none" | "minor" | "moderate" | "severe";
export type ReportTitle = "unknown" | "clean" | "branded";

export type ReportAnswers = {
  damage: Damage;
  title: ReportTitle;
  /** Rental, fleet or commercial use on the report (Carfax "Types of owners: Commercial"). */
  commercial: boolean | null;
};

export const EMPTY_REPORT: ReportAnswers = { damage: "unknown", title: "unknown", commercial: null };

export const DAMAGE_LABEL: Record<Damage, string> = {
  unknown: "Not checked yet",
  none: "No accidents or damage",
  minor: "Minor damage",
  moderate: "Moderate damage",
  severe: "Severe damage (structural or airbag)",
};

export const TITLE_LABEL: Record<ReportTitle, string> = {
  unknown: "Not checked yet",
  clean: "Clean title",
  branded: "Salvage, rebuilt, flood or junk",
};

export const damaged = (d: Damage) => d === "minor" || d === "moderate" || d === "severe";

/**
 * Is "no accidents" backed by something better than a feed or the seller's
 * word? The history report, or a dealer listing's history box (dealers print
 * the Carfax/AutoCheck summary on the page).
 */
export function accidentHistoryConfirmed(listing: ParsedListing, report: ReportAnswers): boolean {
  if (report.damage !== "unknown") return true;
  return listing.accident !== "unknown" && listing.sellerType === "dealer";
}

const SEVERITY: Damage[] = ["unknown", "none", "minor", "moderate", "severe"];

/**
 * Your answers plus what attached proof shows. Bad news wins: the worse
 * damage, a branded title, commercial use. To undo something a report
 * shows, remove that report.
 */
export function mergeAnswers(mine: ReportAnswers, proof: Partial<ReportAnswers>): ReportAnswers {
  const d = proof.damage ?? "unknown";
  const damage = SEVERITY.indexOf(d) > SEVERITY.indexOf(mine.damage) ? d : mine.damage;
  const titles = [mine.title, proof.title ?? "unknown"];
  const title: ReportTitle = titles.includes("branded") ? "branded" : titles.includes("clean") ? "clean" : "unknown";
  const uses = [mine.commercial, proof.commercial ?? null];
  const commercial = uses.includes(true) ? true : uses.includes(false) ? false : null;
  return { damage, title, commercial };
}
