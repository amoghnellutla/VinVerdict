/**
 * Real-case accuracy suite. Every `cases/NN-name.txt` is a listing exactly as
 * pasted (or as the bookmark sends it); the matching `.json` says what the
 * parser and verdict must produce. Only the fields listed in `expect` are
 * checked, so a case can test just the parts it is about.
 *
 * Runs offline (no NHTSA decode, no API calls). See README.md to add a case.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseListing, type ParsedListing } from "@/lib/listing/parse";
import type { Verdict } from "@/lib/scam/rules";
import { buildVerdict } from "@/lib/verdict";

type CaseSpec = {
  note?: string;
  expect?: Partial<Record<keyof ParsedListing, unknown>>;
  verdict?: Verdict;
  mustHit?: string[];
  mustNotHit?: string[];
};

const DIR = join(__dirname, "cases");
// Fixed date so age-based rules (mileage) don't drift as years pass.
const NOW = new Date("2026-11-09T12:00:00Z");

const cases = readdirSync(DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort()
  .map((f) => {
    const name = f.replace(/\.txt$/, "");
    return {
      name,
      text: readFileSync(join(DIR, f), "utf8"),
      spec: JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as CaseSpec,
    };
  });

const score = new Map<string, { ok: number; total: number }>();
const tally = (field: string, ok: boolean) => {
  const s = score.get(field) ?? { ok: 0, total: 0 };
  s.total++;
  if (ok) s.ok++;
  score.set(field, s);
};

describe("listing corpus", () => {
  it("has cases", () => expect(cases.length).toBeGreaterThan(0));

  for (const c of cases) {
    it(c.name, () => {
      const listing = parseListing(c.text);
      const result = buildVerdict({ text: c.text, listing, decoded: null }, {}, NOW);
      const ids = result.hits.map((h) => h.id);
      const problems: string[] = [];

      for (const [field, want] of Object.entries(c.spec.expect ?? {})) {
        const got = listing[field as keyof ParsedListing];
        const ok = got === want;
        tally(field, ok);
        if (!ok) problems.push(`${field}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      }
      if (c.spec.verdict) {
        const ok = result.verdict === c.spec.verdict;
        tally("verdict", ok);
        if (!ok) problems.push(`verdict: expected ${c.spec.verdict}, got ${result.verdict} [${ids.join(", ")}]`);
      }
      for (const id of c.spec.mustHit ?? []) {
        const ok = ids.includes(id);
        tally("rules fired", ok);
        if (!ok) problems.push(`rule "${id}" should fire [got ${ids.join(", ") || "none"}]`);
      }
      for (const id of c.spec.mustNotHit ?? []) {
        const ok = !ids.includes(id);
        tally("false alarms avoided", ok);
        if (!ok) problems.push(`rule "${id}" should NOT fire: ${result.hits.find((h) => h.id === id)?.reason}`);
      }

      expect(problems, `${c.name}\n  ${problems.join("\n  ")}`).toEqual([]);
    });
  }

  afterAll(() => {
    const rows = [...score.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([field, s]) => `  ${field.padEnd(22)} ${String(s.ok).padStart(3)}/${s.total}${s.ok < s.total ? "  <-- misses" : ""}`);
    console.log(`\nListing corpus scorecard (${cases.length} cases)\n${rows.join("\n")}\n`);
  });
});
