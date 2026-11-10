"use client";

import { useEffect, useState } from "react";

/** Seconds since `running` became true (0 when not running). */
export function useElapsed(running: boolean): number {
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    // Starting a clock when work begins: a timer is an outside source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(t0);
    setNow(t0);
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);
  return running && started ? Math.floor((now - started) / 1000) : 0;
}

/**
 * What the live lookup is doing while it runs: the sources being asked, the
 * seconds so far, and the usual wait. One request does all of it, so the list
 * says what's being checked rather than faking step-by-step progress.
 */
export function LookupProgress({ steps, usual, slowAfter = 15, limit = 25 }: { steps: string[]; usual: string; slowAfter?: number; limit?: number }) {
  const s = useElapsed(true);
  const slow = s >= slowAfter;
  return (
    <div role="status" aria-live="polite" className="pop rounded-lg border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-3 font-semibold">
        <span aria-hidden className="relative flex size-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-3 rounded-full bg-accent" />
        </span>
        <span>
          Looking it up <span className="nums font-normal text-muted">({s} {s === 1 ? "second" : "seconds"})</span>
        </span>
      </p>
      <ul className="mt-2 space-y-1 pl-6 text-sm text-muted">
        {steps.map((x) => (
          <li key={x} className="list-disc">{x}</li>
        ))}
      </ul>
      <p className={`mt-2 text-sm ${slow ? "text-warn" : "text-muted"}`}>
        {slow
          ? `Still waiting on the listing sites. It stops at ${limit} seconds and tells you what happened; everything else on this page already works.`
          : `Usually takes ${usual}.`}
      </p>
    </div>
  );
}
