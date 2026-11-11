/**
 * "Sources for this report": every source behind a result, numbered, with a
 * link to check each one. Pure, so the result page and the downloadable report
 * list exactly the same sources.
 */

import type { Analysis } from "@/lib/analyze";
import { AAA_MAINTENANCE } from "@/lib/costs/running";
import { SOURCE_NAME, type ProofSource } from "@/lib/evidence/parse";
import { DAMAGE_LABEL, TITLE_LABEL, type ReportAnswers } from "@/lib/history-report";
import type { HistoryRecord } from "@/lib/history/parse";
import type { LiveListing } from "@/lib/live/parse";
import type { RuleHit } from "@/lib/scam/rules";
import { raw, REF, RULE_SOURCE, type SourceRef } from "@/lib/sources";
import type { PriceSources } from "@/lib/value/estimate";

export type SourceLink = { label: string; href: string };
export type SourceItem = { what: string; from: string; links: SourceLink[] };

export type SourcesInput = {
  a: Analysis;
  hits: RuleHit[];
  live: LiveListing | null;
  sources: PriceSources | null;
  history: HistoryRecord[] | null;
  /** Demo example: when its data was recorded. */
  recordedAt: string | null;
  report: ReportAnswers;
  /** Attached proof: where each came from and whether it was a screenshot. */
  proofs: { source: ProofSource; screenshot: boolean }[];
};

export function reportSourceItems({ a, hits, live, sources, history, recordedAt, report, proofs }: SourcesInput): { items: SourceItem[]; guidance: SourceRef[] } {
  const key = a.nhtsaVehicle ?? a.vehicle;
  const vin = a.vinCheck?.ok ? a.listing.vin : null;
  const when = recordedAt ? `recorded ${recordedAt}` : a.checkedAt ? `checked ${a.checkedAt}` : "checked today";
  const items: SourceItem[] = [];

  if (vin && a.decoded) {
    items.push({ what: "Year, make, model, engine and body from the VIN", from: `NHTSA vPIC VIN decoder, ${when}`, links: [{ label: "raw data", href: raw.decode(vin) }] });
  }
  if (key && a.recalls) {
    items.push({ what: `${a.recalls.length} recall${a.recalls.length === 1 ? "" : "s"} for the ${key.year} ${a.vehicle?.model ?? key.model}`, from: `NHTSA recalls database, ${when}`, links: [{ label: "raw data", href: raw.recalls(key) }] });
  }
  if (key && a.ratings?.length) {
    items.push({
      what: "Crash-test stars",
      from: `NHTSA New Car Assessment Program, ${when}`,
      links: a.ratings.map((r, i) => ({ label: a.ratings!.length > 1 ? `variant ${i + 1}` : "raw data", href: raw.rating(r.vehicleId) })),
    });
  }
  if (key && a.complaints) {
    items.push({ what: `${a.complaints.total.toLocaleString("en-US")} owner complaints, with each quote's NHTSA number`, from: `NHTSA complaints database, ${when}`, links: [{ label: "raw data", href: raw.complaints(key) }] });
  }
  if (key && a.years) {
    items.push({
      what: "Other model years, for comparison",
      from: `NHTSA recalls and complaints, ${when}`,
      links: a.years.filter((y) => y.year !== key.year).flatMap((y) => [
        { label: `${y.year} recalls`, href: raw.recalls({ ...key, year: y.year }) },
        { label: `${y.year} complaints`, href: raw.complaints({ ...key, year: y.year }) },
      ]),
    });
  }
  if (a.fuel?.vehicles.length) {
    items.push({
      what: "Fuel economy (EPA ratings) and national fuel prices",
      from: `FuelEconomy.gov (EPA and U.S. Department of Energy), ${when}`,
      links: a.fuel.vehicles.slice(0, 3).map((v) => ({ label: v.label, href: raw.fuel(v.id) })),
    });
    items.push({ what: "Maintenance and repair cost per mile", from: `AAA Your Driving Costs ${AAA_MAINTENANCE.year}`, links: [{ label: "fact sheet", href: AAA_MAINTENANCE.source }] });
  }
  if (live) {
    items.push({ what: "This car's live listing: price, miles, seller, history flags", from: `${live.source}, ${recordedAt ? `recorded ${recordedAt}` : "looked up just now"}`, links: live.url ? [{ label: "the listing", href: live.url }] : [] });
  }
  if (history?.length) {
    const sites = [...new Set(history.map((h) => h.host).filter(Boolean))];
    items.push({ what: `${history.length} past listings of this VIN (dates, prices, miles, sellers)`, from: `MarketCheck listing history${sites.length ? `, from ${sites.slice(0, 4).join(", ")}${sites.length > 4 ? "…" : ""}` : ""}`, links: [{ label: "each listing is linked above", href: "#listing-history" }] });
  }
  if (sources && (sources.sold || sources.active || sources.predicted)) {
    const parts = [sources.sold && `${sources.sold.n} recently ended listings`, sources.active && `${sources.active.n} current listings`].filter(Boolean).join(" and ");
    items.push({
      what: `Estimated price range: ${parts ? `${parts} of similar cars near ${sources.zip}` : `a price model for similar cars near ${sources.zip}`}`,
      from: [sources.sold && "MarketCheck (ended listings, last advertised price)", sources.active && "Auto.dev (asking prices)", sources.predicted && "MarketCheck Price model"].filter(Boolean).join(", "),
      links: [{ label: "the closest ones are linked above", href: "#price-check" }],
    });
  }

  const answered = [report.damage !== "unknown" && DAMAGE_LABEL[report.damage], report.title !== "unknown" && TITLE_LABEL[report.title], report.commercial !== null && (report.commercial ? "rental, fleet or commercial use" : "no rental or fleet use")].filter(Boolean);
  items.push({
    what: answered.length ? `Accident and title history: ${answered.join(", ").toLowerCase()}` : "Accident and title history: not confirmed",
    from: answered.length
      ? "What you recorded, or read from proof you attached (Carfax, AutoCheck), which VinVerdict can't open itself"
      : "No free source has it. Listing feeds aren't history reports, so their \"no accidents\" isn't used",
    links: live?.carfaxUrl ? [{ label: "the dealer's free Carfax report", href: live.carfaxUrl }] : [],
  });

  if (proofs.length) {
    items.push({
      what: `Proof you attached: ${proofs.map((p) => `${SOURCE_NAME[p.source] === "Unrecognized" ? "an item" : SOURCE_NAME[p.source]} (${p.screenshot ? "screenshot" : "pasted text"})`).join(", ")}`,
      from: "Read on your device; the findings are listed under Check it yourself",
      links: [{ label: "see what each one showed", href: "#check-yourself" }],
    });
  }

  // The official guidance behind each warning shown, once each.
  const guidance = new Map<string, SourceRef>();
  if (report.damage !== "unknown" && report.damage !== "none") guidance.set(REF.cargurusAccident.href, REF.cargurusAccident);
  for (const h of hits) {
    const s = RULE_SOURCE[h.id];
    if (s) guidance.set(s.href, s);
  }
  return { items, guidance: [...guidance.values()] };
}
