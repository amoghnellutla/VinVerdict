import type { Metadata } from "next";
import { Suspense } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import { PageHeader } from "@/components/PageHeader";
import { searchLinks } from "@/lib/search-links";
import { shortlist, SHORTLIST_DATE, type ShortlistYear } from "@/lib/shortlist/shortlist";

export const metadata: Metadata = { title: "Shortlist" };

const YEAR_STYLE: Record<ShortlistYear["rating"], string> = {
  fewer: "border-good/40 bg-good-soft text-good",
  typical: "border-border bg-surface text-foreground",
  many: "border-bad/40 bg-bad-soft text-bad",
};

export default function ShortlistPage({ searchParams }: PageProps<"/shortlist">) {
  return (
    <>
      <PageHeader
        title="Shortlist"
        description="Reliable everyday cars, and the model years owners complained about most. Set a budget and ZIP to get ready-made searches."
      />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        {searchParams.then((sp) => {
          const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
          const budget = Number(one("budget").replace(/\D/g, "")) || null;
          const zip = /^\d{5}$/.test(one("zip")) ? one("zip") : null;
          const body = ["Sedan", "SUV"].includes(one("body")) ? one("body") : "";
          return <List budget={budget} zip={zip} body={body} />;
        })}
      </Suspense>
    </>
  );
}

function List({ budget, zip, body }: { budget: number | null; zip: string | null; body: string }) {
  const models = shortlist().filter((m) => !body || m.body === body || (body === "Sedan" && m.body === "Hatchback"));
  return (
    <>
      <form method="get" className="card flex flex-wrap items-end gap-4">
        <label>
          <span className="text-sm font-semibold">Budget (max $)</span>
          <input name="budget" defaultValue={budget ?? ""} inputMode="numeric" placeholder="15000" className="field mt-1 w-36" />
        </label>
        <label>
          <span className="text-sm font-semibold">ZIP</span>
          <input name="zip" defaultValue={zip ?? ""} inputMode="numeric" maxLength={5} placeholder="08540" className="field mt-1 w-28" />
        </label>
        <label>
          <span className="text-sm font-semibold">Type</span>
          <select name="body" defaultValue={body} className="field mt-1 w-32">
            <option value="">Any</option>
            <option value="Sedan">Sedan</option>
            <option value="SUV">SUV</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary">Update</button>
      </form>

      <p className="mt-6 text-muted">
        <span className="tag bg-good-soft text-good">Fewer complaints</span>{" "}
        <span className="tag bg-bad-soft text-bad">Many complaints</span>{" "}
        <span className="tag bg-warn-soft text-warn">! Known issue</span>{" "}
        <span className="tag border border-dashed border-border-strong text-muted">Not enough data</span>{" "}
        Based on owner complaints filed with NHTSA per year on the road, compared with other years of the same model (data from{" "}
        {SHORTLIST_DATE}). Low numbers can also mean fewer cars sold. Hover a year for its complaint and recall counts; recalls are free to
        fix at any dealer.
      </p>

      <ul className="mt-6 space-y-10">
        {models.map((m) => {
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
            <li key={`${m.make}-${m.model}`} className="border-t border-border pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-2xl">{m.make} {m.model}</h2>
                <span className="text-muted">{m.body}</span>
              </div>
              <ol className="nums mt-3 flex flex-wrap gap-1.5" aria-label={`${m.make} ${m.model} model years`}>
                {m.years.map((y) => (
                  <li
                    key={y.year}
                    title={`${y.year}: ${y.sparse ? "too few complaints on record to judge; " : ""}${y.complaints} complaints (${y.perYearOnRoad}/year on the road), ${y.recalls} recall${y.recalls === 1 ? "" : "s"}${y.topArea ? `, mostly ${y.topArea.toLowerCase()}` : ""}${y.knownIssues.length ? `. Known issue: ${y.knownIssues.map((k) => k.title).join("; ")}` : ""}`}
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
                      {y.rating === "many" && <>{y.complaints.toLocaleString("en-US")} owner complaints{y.topArea ? `, mostly ${y.topArea.toLowerCase()}` : ""}. </>}
                      {y.parkIt > 0 && (
                        <>
                          {y.parkIt} recall{y.parkIt > 1 ? "s say" : " says"} don&apos;t drive it or park it outside until fixed: ask for proof the repair
                          was done, or check the VIN on NHTSA.{" "}
                        </>
                      )}
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
        })}
      </ul>
    </>
  );
}
