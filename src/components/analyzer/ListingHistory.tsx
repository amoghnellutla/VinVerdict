import { ExternalLink } from "@/components/ExternalLink";
import { historyHighlights, shortDate, type HistorySummary } from "@/lib/history/summary";

const money = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US")}`);

/** Every past online listing of this VIN, newest first (MarketCheck History). */
export function ListingHistory({ h }: { h: HistorySummary }) {
  if (!h.records) {
    return (
      <section className="border-t border-border pt-8" id="listing-history">
        <h2 className="section-title">Where this car has been listed</h2>
        <p className="max-w-2xl text-muted">
          No past listings found for this VIN. That&apos;s normal for a car that has only been sold privately, and it isn&apos;t proof of a clean
          history.
        </p>
      </section>
    );
  }
  const rows = [...h.stints].reverse();
  const notes = historyHighlights(h);
  return (
    <section className="border-t border-border pt-8" id="listing-history">
      <h2 className="section-title">Where this car has been listed</h2>
      <p className="max-w-2xl text-muted">
        Every dealer and online listing of this VIN since 2015, from MarketCheck. Miles and prices at each one show rollbacks, price cuts and
        how often it changed hands.
      </p>
      {notes.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      {/* A two-column list rather than a table, so it fits a phone. */}
      <ul className="nums mt-4 divide-y divide-border border-y border-border">
        {rows.map((s, i) => {
          const live = h.active.includes(s);
          const when = `${shortDate(s.firstSeen)}${s.lastSeen !== s.firstSeen ? ` – ${live ? "now" : shortDate(s.lastSeen)}` : ""}`;
          return (
            <li key={`${s.seller}-${s.firstSeen}-${i}`} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                {s.url ? <ExternalLink href={s.url} className="link font-semibold">{s.seller}</ExternalLink> : <span className="font-semibold">{s.seller}</span>}
                {live && <span className="tag ml-2 bg-accent-soft text-accent">Listed now</span>}
                <span className="block text-sm text-muted">{when}</span>
                <span className="block text-sm text-muted">
                  {[s.place, s.isNew ? "new car" : s.sellerType === "private" ? "private seller" : null].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <Price from={s.firstPrice} to={s.lastPrice} />
                <span className="block text-sm text-muted">{s.miles == null ? "miles not listed" : `${s.miles.toLocaleString("en-US")} mi`}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-muted">Old listing links may no longer open. Accidents and title brands aren&apos;t in this data: use the checks below.</p>
    </section>
  );
}

/** A cut shows the old price struck through; a rise shows old → new. */
function Price({ from, to }: { from: number | null; to: number | null }) {
  if (from !== null && to !== null && from > to) {
    return (
      <span className="block">
        <span className="text-sm text-muted line-through">{money(from)}</span> <strong>{money(to)}</strong>
      </span>
    );
  }
  if (from !== null && to !== null && from < to) {
    return (
      <span className="block">
        <span className="text-sm text-muted">{money(from)} → </span><strong>{money(to)}</strong>
      </span>
    );
  }
  return <strong className="block">{money(to)}</strong>;
}
