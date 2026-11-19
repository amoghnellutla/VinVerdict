import { ExternalLink } from "@/components/ExternalLink";
import { searchLinks } from "@/lib/search-links";
import type { ShortlistModel, ShortlistYear } from "@/lib/shortlist/shortlist";

const YEAR_STYLE: Record<ShortlistYear["rating"], string> = {
  fewer: "border-good/40 bg-good-soft text-good",
  typical: "border-border bg-surface text-foreground",
  many: "border-bad/40 bg-bad-soft text-bad",
};

/**
 * One model of the Shortlist guide: its model years coloured by owner reports, the years to be careful with, and
 * searches of outside sites (the visitors' Shortlist and the owner's full guide).
 */
export function ModelCard({ m, zip = null, budget = null }: { m: ShortlistModel; zip?: string | null; budget?: number | null }) {
  const recentGood = m.best.filter((y) => y >= 2015);
  const links = searchLinks({
    make: m.make,
    model: m.model,
    zip,
    maxPrice: budget,
    minYear: recentGood.length ? Math.min(...recentGood) : null,
    maxYear: recentGood.length ? Math.max(...recentGood) : null,
  });
  const careful = m.years.filter((y) => m.careful.includes(y.year));
  return (
    <li className="border-t border-border pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">{m.make} {m.model}</h2>
        <span className="text-muted">{m.body}</span>
      </div>

      <ol className="nums mt-3 flex flex-wrap gap-1.5" aria-label={`${m.make} ${m.model} model years`}>
        {m.years.map((y) => (
          <li
            key={y.year}
            title={`${y.year}: ${y.sparse ? "too few complaints on record to judge; " : ""}${y.complaints} owner reports (${y.perYearOnRoad}/year on the road), ${y.recalls} recall${y.recalls === 1 ? "" : "s"}${y.topArea ? `, mostly ${y.topArea.toLowerCase()}` : ""}${y.knownIssues.length ? `. Known issue: ${y.knownIssues.map((k) => k.title).join("; ")}` : ""}`}
            className={`rounded border px-2 py-0.5 text-sm ${y.sparse ? "border-dashed border-border-strong text-muted" : YEAR_STYLE[y.rating]} ${y.knownIssues.length && y.rating !== "many" ? "border-warn/50 bg-warn-soft text-warn" : ""}`}
          >
            {y.year}
            {y.knownIssues.length ? " !" : ""}
          </li>
        ))}
      </ol>

      {careful.length > 0 && (
        <ul className="mt-3 space-y-1">
          {careful.map((y) => (
            <li key={y.year}>
              <strong>{y.year}:</strong>{" "}
              {y.rating === "many" && <>{y.complaints.toLocaleString("en-US")} owner reports{y.topArea ? `, mostly ${y.topArea.toLowerCase()}` : ""}. </>}
              {y.parkIt > 0 && (
                <>
                  <span className="tag bg-bad-soft text-bad">Don&apos;t drive</span> {y.parkIt} recall{y.parkIt > 1 ? "s say" : " says"} not to
                  drive the car until it&apos;s repaired.{" "}
                </>
              )}
              {y.parkOutside > 0 && (
                <>
                  <span className="tag bg-warn-soft text-warn">Park outside</span> {y.parkOutside} recall{y.parkOutside > 1 ? "s say" : " says"} to
                  park it outside, away from buildings, until repaired (fire risk).{" "}
                </>
              )}
              {(y.parkIt > 0 || y.parkOutside > 0) && <>Not every car of this year is affected: check the VIN on NHTSA or ask for proof of the repair. </>}
              {y.knownIssues.map((k) => (
                <span key={k.title}>
                  {k.title} (<ExternalLink href={k.url} className="link">{k.label}</ExternalLink>).{" "}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {links.map((l) => (
          <ExternalLink key={l.site} href={l.href} className="link font-semibold" title={l.note}>
            Search {l.site}
          </ExternalLink>
        ))}
        {recentGood.length > 0 && <span className="text-sm text-muted">Searches {Math.min(...recentGood)}–{Math.max(...recentGood)}{budget ? ` under $${budget.toLocaleString("en-US")}` : ""}</span>}
      </p>
    </li>
  );
}
