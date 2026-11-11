import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import type { HistoryRecord } from "@/lib/history/parse";
import type { ReportAnswers } from "@/lib/history-report";
import type { LiveListing } from "@/lib/live/parse";
import { reportSourceItems } from "@/lib/report/sources";
import type { RuleHit } from "@/lib/scam/rules";
import { SOURCES_CHECKED } from "@/lib/sources";
import type { PriceSources } from "@/lib/value/estimate";
import type { Attached } from "./CheckYourself";

type Props = {
  a: Analysis;
  hits: RuleHit[];
  live: LiveListing | null;
  sources: PriceSources | null;
  history: HistoryRecord[] | null;
  /** Demo example: when its data was recorded. */
  recordedAt: string | null;
  /** What the person read on the vehicle history report, merged with attached proof. */
  report: ReportAnswers;
  /** Screenshots and pasted reports the person attached. */
  proofs: Attached[];
};

const internal = "text-accent underline underline-offset-2 hover:decoration-2";

/**
 * Every source behind this result, numbered, with a link to check each one.
 * Government data links go to the exact public request VinVerdict made. The
 * list itself comes from lib/report/sources.ts, which the downloadable report uses too.
 */
export function ReportSources({ a, hits, live, sources, history, recordedAt, report, proofs }: Props) {
  const { items, guidance } = reportSourceItems({
    a, hits, live, sources, history, recordedAt, report,
    proofs: proofs.map((p) => ({ source: p.read.source, screenshot: !!p.thumb })),
  });

  if (!items.length && !guidance.length) return null;
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
                {it.links.length > 0 && (
                  <>
                    {" "}·{" "}
                    {it.links.map((l, j) => (
                      <span key={l.href + l.label}>
                        {j > 0 && ", "}
                        {l.href.startsWith("#") ? <a href={l.href} className={internal}>{l.label}</a> : <ExternalLink href={l.href}>{l.label}</ExternalLink>}
                      </span>
                    ))}
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {guidance.length > 0 && (
        <>
          <h3 className="mt-6 font-semibold">Official guidance behind the warnings</h3>
          <ul className="mt-2 space-y-1">
            {guidance.map((g) => (
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
