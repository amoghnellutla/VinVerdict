"use client";

import { ExternalLink } from "@/components/ExternalLink";
import type { Known, KnownAction } from "@/lib/assistant/knows";

/** Ask the assistant to fill its box ("They're asking $") or open its file picker. */
export const TELL_EVENT = "vinverdict:tell";
export const ATTACH_EVENT = "vinverdict:attach";

function run(a: KnownAction) {
  if (a.kind === "tell") window.dispatchEvent(new CustomEvent(TELL_EVENT, { detail: a.prefill }));
  else if (a.kind === "attach") window.dispatchEvent(new CustomEvent(ATTACH_EVENT));
  else if (a.kind === "go") document.querySelector(a.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * "What VinVerdict knows": everything that decides this purchase, ticked as it becomes known
 * (from the ad, the checks, what you tell VinVerdict or paste), with one tap to fill each gap.
 */
export function KnowsPanel({ items }: { items: Known[] }) {
  const done = items.filter((x) => x.done).length;
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
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
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
