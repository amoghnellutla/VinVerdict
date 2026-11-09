import type { ReactNode } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import { AAA_MAINTENANCE } from "@/lib/costs/running";
import type { HistoryRecord } from "@/lib/history/parse";
import type { LiveListing } from "@/lib/live/parse";
import type { RuleHit } from "@/lib/scam/rules";
import { raw, RULE_SOURCE, SOURCES_CHECKED, type SourceRef } from "@/lib/sources";
import type { PriceSources } from "@/lib/value/estimate";

type Props = {
  a: Analysis;
  hits: RuleHit[];
  live: LiveListing | null;
  sources: PriceSources | null;
  history: HistoryRecord[] | null;
  /** Demo example: when its data was recorded. */
  recordedAt: string | null;
};

/**
 * Every source behind this result, numbered, with a link to check each one.
 * Government data links go to the exact public request VinVerdict made.
 */
export function ReportSources({ a, hits, live, sources, history, recordedAt }: Props) {
  const key = a.nhtsaVehicle ?? a.vehicle;
  const vin = a.vinCheck?.ok ? a.listing.vin : null;
  const when = recordedAt ? `recorded ${recordedAt}` : a.checkedAt ? `checked ${a.checkedAt}` : "checked today";
  const items: { what: string; from: string; links: ReactNode[] }[] = [];

  if (vin && a.decoded) {
    items.push({ what: "Year, make, model, engine and body from the VIN", from: `NHTSA vPIC VIN decoder, ${when}`, links: [<ExternalLink key="d" href={raw.decode(vin)}>raw data</ExternalLink>] });
  }
  if (key && a.recalls) {
    items.push({ what: `${a.recalls.length} recall${a.recalls.length === 1 ? "" : "s"} for the ${key.year} ${a.vehicle?.model ?? key.model}`, from: `NHTSA recalls database, ${when}`, links: [<ExternalLink key="r" href={raw.recalls(key)}>raw data</ExternalLink>] });
  }
  if (key && a.ratings?.length) {
    items.push({
      what: "Crash-test stars",
      from: `NHTSA New Car Assessment Program, ${when}`,
      links: a.ratings.map((r, i) => <ExternalLink key={r.vehicleId} href={raw.rating(r.vehicleId)}>{a.ratings!.length > 1 ? `variant ${i + 1}` : "raw data"}</ExternalLink>),
    });
  }
  if (key && a.complaints) {
    items.push({ what: `${a.complaints.total.toLocaleString("en-US")} owner complaints, with each quote's NHTSA number`, from: `NHTSA complaints database, ${when}`, links: [<ExternalLink key="c" href={raw.complaints(key)}>raw data</ExternalLink>] });
  }
  if (key && a.years) {
    items.push({
      what: "Other model years, for comparison",
      from: `NHTSA recalls and complaints, ${when}`,
      links: a.years.filter((y) => y.year !== key.year).flatMap((y) => [
        <ExternalLink key={`r${y.year}`} href={raw.recalls({ ...key, year: y.year })}>{y.year} recalls</ExternalLink>,
        <ExternalLink key={`c${y.year}`} href={raw.complaints({ ...key, year: y.year })}>{y.year} complaints</ExternalLink>,
      ]),
    });
  }
  if (a.fuel?.vehicles.length) {
    items.push({
      what: "Fuel economy (EPA ratings) and national fuel prices",
      from: `FuelEconomy.gov (EPA and U.S. Department of Energy), ${when}`,
      links: a.fuel.vehicles.slice(0, 3).map((v) => <ExternalLink key={v.id} href={raw.fuel(v.id)}>{v.label}</ExternalLink>),
    });
    items.push({ what: "Maintenance and repair cost per mile", from: `AAA Your Driving Costs ${AAA_MAINTENANCE.year}`, links: [<ExternalLink key="aaa" href={AAA_MAINTENANCE.source}>fact sheet</ExternalLink>] });
  }
  if (live) {
    items.push({ what: "This car's live listing: price, miles, seller, history flags", from: `${live.source}, ${recordedAt ? `recorded ${recordedAt}` : "looked up just now"}`, links: live.url ? [<ExternalLink key="l" href={live.url}>the listing</ExternalLink>] : [] });
  }
  if (history?.length) {
    const sites = [...new Set(history.map((h) => h.host).filter(Boolean))];
    items.push({ what: `${history.length} past listings of this VIN (dates, prices, miles, sellers)`, from: `MarketCheck listing history${sites.length ? `, from ${sites.slice(0, 4).join(", ")}${sites.length > 4 ? "…" : ""}` : ""}`, links: [<a key="h" href="#listing-history" className="text-accent underline-offset-2 hover:underline">each listing is linked above</a>] });
  }
  if (sources && (sources.sold || sources.active || sources.predicted)) {
    const parts = [sources.sold && `${sources.sold.n} recently sold`, sources.active && `${sources.active.n} for sale`].filter(Boolean).join(" and ");
    items.push({
      what: `Fair price: ${parts || "a price model"} similar cars near ${sources.zip}`,
      from: [sources.sold && "MarketCheck (sold cars)", sources.active && "Auto.dev (cars for sale)", sources.predicted && "MarketCheck Price model"].filter(Boolean).join(", "),
      links: [<a key="p" href="#price-check" className="text-accent underline-offset-2 hover:underline">the closest ones are linked above</a>],
    });
  }

  // The official guidance behind each warning shown, once each.
  const guidance = new Map<string, SourceRef>();
  for (const h of hits) {
    const s = RULE_SOURCE[h.id];
    if (s) guidance.set(s.href, s);
  }

  if (!items.length && !guidance.size) return null;
  return (
    <section className="border-t border-border pt-8" id="sources">
      <h2 className="section-title">Sources for this report</h2>
      <p className="max-w-2xl text-muted">
        Nothing here is generated or guessed. Each fact comes from one of these, and the links open the same public records VinVerdict read.
      </p>
      <ol className="mt-4 space-y-3">
        {items.map((it, i) => (
          <li key={it.what} className="grid grid-cols-[1.75rem_1fr] gap-1">
            <span className="nums font-serif text-muted">{i + 1}.</span>
            <div>
              <p>{it.what}</p>
              <p className="text-sm text-muted">
                {it.from}
                {it.links.length > 0 && <> · {it.links.map((l, j) => <span key={j}>{j > 0 && ", "}{l}</span>)}</>}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {guidance.size > 0 && (
        <>
          <h3 className="mt-6 font-semibold">Official guidance behind the warnings</h3>
          <ul className="mt-2 space-y-1">
            {[...guidance.values()].map((g) => (
              <li key={g.href}>
                <ExternalLink href={g.href}>{g.name}</ExternalLink>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Links checked {SOURCES_CHECKED}.</p>
        </>
      )}
    </section>
  );
}
