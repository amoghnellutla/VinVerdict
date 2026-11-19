import Link from "next/link";
import { ExternalLink } from "@/components/ExternalLink";
import { usd } from "@/lib/format";
import { searchLinks } from "@/lib/search-links";
import type { MyCar } from "@/lib/shortlist/mine";
import type { ShortlistModel, ShortlistYear } from "@/lib/shortlist/shortlist";

const YEAR_STYLE: Record<ShortlistYear["rating"], string> = {
  fewer: "border-good/40 bg-good-soft text-good",
  typical: "border-border bg-surface text-foreground",
  many: "border-bad/40 bg-bad-soft text-bad",
};

const RATING_TEXT: Record<ShortlistYear["rating"], string> = {
  fewer: "fewer owner reports than this model's usual year",
  typical: "about as many owner reports as this model's usual year",
  many: "many more owner reports than this model's usual year",
};

/**
 * One model of the Shortlist guide: its model years coloured by owner reports, the years to be careful with, and
 * searches of outside sites. With `mine` (the owner's checked cars of this model), those cars are listed, their
 * years are ringed, and what the guide says about each of their years is spelled out.
 */
export function ModelCard({ m, zip = null, budget = null, mine = [] }: { m: ShortlistModel; zip?: string | null; budget?: number | null; mine?: MyCar[] }) {
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
  const myYears = new Set(mine.map((c) => c.year).filter((y): y is number => y != null));
  return (
    <li className="border-t border-border pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">{m.make} {m.model}</h2>
        <span className="text-muted">{m.body}</span>
      </div>

      {mine.length > 0 && (
        <ul className="mt-3 space-y-1">
          {mine.map((c) => {
            const y = m.years.find((x) => x.year === c.year);
            return (
              <li key={c.id}>
                <Link href={`/car/${c.id}`} className="link font-semibold">{c.title}</Link>
                {c.price != null && <span className="nums text-muted"> · {usd(c.price)}</span>}
                <span className="block text-[0.95rem] text-muted">
                  {c.year == null
                    ? "Its model year wasn't read, so it isn't marked below."
                    : !y
                      ? `${c.year} isn't in the guide's data for this model.`
                      : y.sparse
                        ? `${c.year}: too few owner reports on record to judge.`
                        : `${c.year}: ${RATING_TEXT[y.rating]}${y.knownIssues.length ? `, and a known issue (${y.knownIssues.map((k) => k.title).join("; ")})` : ""}${y.recalls ? `; ${y.recalls} recall${y.recalls === 1 ? "" : "s"} to check were done` : ""}.`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <ol className="nums mt-3 flex flex-wrap gap-1.5" aria-label={`${m.make} ${m.model} model years`}>
        {m.years.map((y) => (
          <li
            key={y.year}
            title={`${y.year}: ${y.sparse ? "too few complaints on record to judge; " : ""}${y.complaints} owner reports (${y.perYearOnRoad}/year on the road), ${y.recalls} recall${y.recalls === 1 ? "" : "s"}${y.topArea ? `, mostly ${y.topArea.toLowerCase()}` : ""}${y.knownIssues.length ? `. Known issue: ${y.knownIssues.map((k) => k.title).join("; ")}` : ""}${myYears.has(y.year) ? ". You checked this year." : ""}`}
            className={`rounded border px-2 py-0.5 text-sm ${y.sparse ? "border-dashed border-border-strong text-muted" : YEAR_STYLE[y.rating]} ${y.knownIssues.length && y.rating !== "many" ? "border-warn/50 bg-warn-soft text-warn" : ""} ${myYears.has(y.year) ? "font-semibold ring-2 ring-accent ring-offset-1 ring-offset-background" : ""}`}
          >
            {y.year}
            {y.knownIssues.length ? " !" : ""}
            {myYears.has(y.year) && <span className="sr-only"> (yours)</span>}
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
