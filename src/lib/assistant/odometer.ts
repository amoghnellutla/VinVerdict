/**
 * Do the car's odometer readings agree? Pure. Takes independent readings (this listing once,
 * even when a live feed repeats it; an auction record; each history report) and, when two or
 * more sources agree, says so: "Miles agree across 3 sources". A reading clearly lower than
 * another is already a warning elsewhere (history-rollback, auction-miles-lower, proof
 * odometer checks), so this only adds the good news, which is real evidence against a rollback.
 */

import type { RuleHit } from "@/lib/scam/rules";

export type Reading = { source: string; miles: number };

/** Readings agree when they're within 1,000 miles or 3% of the highest (normal driving between them). */
export function milesAgree(readings: Reading[]): RuleHit | null {
  const seen = new Map<string, number>();
  for (const r of readings) if (r.miles > 0 && !seen.has(r.source)) seen.set(r.source, r.miles);
  if (seen.size < 2) return null;
  const values = [...seen.values()];
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  if (hi - lo > Math.max(1_000, hi * 0.03)) return null;
  const range = lo === hi ? `${hi.toLocaleString("en-US")} miles` : `${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")} miles`;
  return {
    id: "miles-agree",
    action: "info",
    title: `Miles agree across ${seen.size} sources (${range})`,
    reason: `${[...seen.entries()].map(([s, m]) => `${s}: ${m.toLocaleString("en-US")}`).join("; ")}. Independent readings that line up are good evidence the odometer hasn't been rolled back. Still check the dashboard matches.`,
  };
}
