"use client";

import { ExternalLink } from "@/components/ExternalLink";
import { DAMAGE_LABEL, TITLE_LABEL, type Damage, type ReportAnswers, type ReportTitle } from "@/lib/history-report";
import type { LiveListing } from "@/lib/live/parse";

type Props = {
  /** Your answers merged with attached proof (what the verdict uses). */
  value: ReportAnswers;
  /** Changes your own answers only. */
  onChange: (patch: Partial<ReportAnswers>) => void;
  /** Which answers attached proof settled, and from where ("AutoCheck"). */
  from: Partial<Record<keyof ReportAnswers, string>>;
  live: LiveListing | null;
  vin: string | null;
  /** Selling your own car: same questions, worded for the owner. */
  selling: boolean;
};

const DAMAGES: Damage[] = ["unknown", "none", "minor", "moderate", "severe"];
const TITLES: ReportTitle[] = ["unknown", "clean", "branded"];

/**
 * The accident and title history, from the car's Carfax or AutoCheck report.
 * VinVerdict can't read those reports itself (no free API; their terms don't
 * allow automated access), and listing feeds aren't history reports, so the
 * verdict and the price wait for what the person reads there.
 */
export function HistoryReport({ value, onChange, from, live, vin, selling }: Props) {
  const set = onChange;
  const fromNote = (k: keyof ReportAnswers) => (from[k] ? `From your ${from[k]} proof. Remove it under Check it yourself to change this.` : null);
  return (
    <section className="border-t border-border pt-8" id="history-report">
      <h2 className="section-title">{selling ? "Your car's history report" : "What does the history report say?"}</h2>
      <div className="max-w-2xl space-y-2">
        {live?.carfaxUrl ? (
          <p>
            The dealer gives this car&apos;s Carfax report for free:{" "}
            <ExternalLink href={live.carfaxUrl} className="link font-semibold">open the Carfax report</ExternalLink>. Read its accident, title and
            owner sections and pick what it says below.
          </p>
        ) : selling ? (
          <p>
            Buyers will look up your car&apos;s Carfax or AutoCheck report, so price it for what the report shows. Pick what yours says below.
          </p>
        ) : (
          <p>
            Accidents only show on a vehicle history report. Dealers usually include a free Carfax or AutoCheck link in the listing; ask a private
            seller to send one{vin ? <>, or check the free records in <a href="#check-yourself" className="link">Check it yourself</a></> : ""}.
            Then pick what it says below.
          </p>
        )}
        {live && live.accidentCount === 0 && (
          <p className="text-sm text-muted">
            {live.source}&apos;s listing data shows no accidents for this VIN, but a listing feed isn&apos;t a history report and can miss damage, so
            it isn&apos;t counted.
          </p>
        )}
        <p className="text-sm text-muted">
          VinVerdict can&apos;t open these reports for you: Carfax and AutoCheck have no free API and don&apos;t allow automated access. Add a
          screenshot or the report&apos;s text under <a href="#check-yourself" className="link">Check it yourself</a> and it fills these in, or
          pick them yourself. Until then, the result says the history isn&apos;t confirmed.
        </p>
      </div>

      <div className="mt-4 space-y-4">
        <Choice
          legend="Accidents or damage"
          options={DAMAGES.map((d) => [d, DAMAGE_LABEL[d]])}
          value={value.damage}
          onPick={(damage) => set({ damage: damage as Damage })}
          note={fromNote("damage")}
        />
        <Choice
          legend="Title"
          options={TITLES.map((t) => [t, TITLE_LABEL[t]])}
          value={value.title}
          onPick={(title) => set({ title: title as ReportTitle })}
          note={fromNote("title")}
        />
        <Choice
          legend="Rental, fleet or commercial use"
          options={[["unknown", "Not checked yet"], ["no", "No"], ["yes", "Yes"]]}
          value={value.commercial === null ? "unknown" : value.commercial ? "yes" : "no"}
          onPick={(v) => set({ commercial: v === "unknown" ? null : v === "yes" })}
          note={fromNote("commercial")}
        />
      </div>
    </section>
  );
}

function Choice({ legend, options, value, onPick, note }: { legend: string; options: [string, string][]; value: string; onPick: (v: string) => void; note: string | null }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map(([v, label]) => (
          <label
            key={v}
            className={`cursor-pointer rounded-md border px-3 py-1 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
              value === v ? "border-foreground bg-foreground font-semibold text-background" : "border-border-strong text-muted hover:border-foreground hover:text-foreground"
            }`}
          >
            <input type="radio" name={legend} className="sr-only" checked={value === v} onChange={() => onPick(v)} />
            {label}
          </label>
        ))}
      </div>
      {note && <p className="mt-1 text-sm text-accent">{note}</p>}
    </fieldset>
  );
}
