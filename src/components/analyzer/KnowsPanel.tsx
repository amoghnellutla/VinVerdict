"use client";

import { useState } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import type { Known, KnownAction } from "@/lib/assistant/knows";
import { openTab } from "./SectionTabs";

/** Ask the assistant to fill its box ("They're asking $") or open its file picker. */
export const TELL_EVENT = "vinverdict:tell";
export const ATTACH_EVENT = "vinverdict:attach";

function run(a: KnownAction) {
  if (a.kind === "tell") window.dispatchEvent(new CustomEvent(TELL_EVENT, { detail: a.prefill }));
  else if (a.kind === "attach") window.dispatchEvent(new CustomEvent(ATTACH_EVENT));
  else if (a.kind === "go") document.querySelector(a.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  else if (a.kind === "tab") openTab(a.tab);
}

/**
 * "What VinVerdict knows": everything that decides this purchase, ticked as it becomes known
 * (from the ad, the checks, what you tell VinVerdict or paste), with one tap to fill each gap.
 */
export function KnowsPanel({ items }: { items: Known[] }) {
  const done = items.filter((x) => x.done).length;
  // On a phone the full list is a screen tall and pushes the assistant away: show what's known in
  // one line and the next three gaps, with the rest one tap away. Wider screens show it all.
  const [all, setAll] = useState(false);
  const known = items.filter((x) => x.done);
  const next = items.filter((x) => !x.done).slice(0, 3);
  return (
    <section className="rounded-lg border border-border px-4 py-3" aria-labelledby="knows-title" id="knows">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="knows-title" className="text-lg font-semibold">What VinVerdict knows</h2>
        <p className="nums text-sm text-muted" aria-live="polite">
          {done} of {items.length} known
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
      </div>
      <div className={all ? "hidden" : "sm:hidden"}>
        {known.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">Known:</span> <span className="text-muted">{known.map((x) => x.label).join(", ")}</span>
          </p>
        )}
        {next.length > 0 && (
          <ul className="mt-2 space-y-2" aria-label="Still to find out">
            {next.map((x) => (
              <li key={x.key} className="flex items-start gap-2 text-sm">
                <span aria-hidden="true" className="mt-0.5 inline-grid size-4 shrink-0 rounded-full border border-border-strong" />
                <span className="min-w-0">
                  <span className="font-semibold">{x.label}</span>
                  <span className="block text-muted">{x.detail}</span>
                  {x.action && (x.action.kind === "link" ? (
                    <ExternalLink href={x.action.href} className="link text-sm">{x.action.label}</ExternalLink>
                  ) : (
                    <button type="button" className="link text-sm" onClick={() => run(x.action!)}>{x.action.label}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="link mt-2 text-sm sm:hidden" aria-expanded={all} aria-controls="knows-all" onClick={() => setAll((v) => !v)}>
        {all ? "Show less" : `Show all ${items.length}`}
      </button>
      <ul id="knows-all" className={`mt-3 gap-x-6 gap-y-2 sm:grid sm:grid-cols-2 ${all ? "grid" : "hidden"}`}>
        {items.map((x) => (
          <li key={x.key} className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className={`mt-0.5 inline-grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${x.done ? "bg-good text-background" : "border border-border-strong"}`}>
              {x.done ? "✓" : ""}
            </span>
            <span className="min-w-0">
              <span className="font-semibold">{x.label}</span>
              <span className="sr-only">{x.done ? " (known)" : " (not known yet)"}</span>
              <span className="block text-muted">{x.detail}</span>
              {x.action &&
                (x.action.kind === "link" ? (
                  <ExternalLink href={x.action.href} className="link text-sm">{x.action.label}</ExternalLink>
                ) : (
                  <button type="button" className="link text-sm" onClick={() => run(x.action!)}>{x.action.label}</button>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
