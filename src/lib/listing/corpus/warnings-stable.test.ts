/**
 * The warnings must belong to this car. Other cars listed on the same page ("Similar vehicles" with their own
 * "1 accident reported", "Salvage title" or "Current bid" badges) must not add a warning about this one, and a
 * listing pasted without its line breaks must not lose a serious one.
 *
 * Runs offline over every listing case in cases/.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { buildVerdict } from "@/lib/verdict";

const DIR = join(__dirname, "cases");
const NOW = new Date("2026-11-09T12:00:00Z");

const BADGED = ["Similar vehicles", "2015 Nissan Sentra S", "$6,450", "141,200 mi.", "1 accident reported", "Rebuilt title", "Fleet vehicle", "",
  "2017 Chevrolet Malibu LT", "$8,990", "118,000 mi.", "Salvage title", "Current bid: $4,100", "Lien reported", "TMU", "Ships nationwide"];
const BADGED_CARDS = ["Used", "2015 Nissan Sentra S", "141K mi", "$6,450", "1 accident reported", "Rebuilt title", "", "Used", "2017 Chevrolet Malibu LT", "118K mi", "$8,990", "Salvage title", "Current bid"];

const cases = readdirSync(DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort()
  .map((f) => ({ name: f.replace(/\.txt$/, ""), text: readFileSync(join(DIR, f), "utf8") }))
  .filter((c) => parseListing(c.text).kind === "text");

const verdictOf = (text: string) => {
  const r = buildVerdict({ text, listing: parseListing(text), decoded: null }, {}, NOW);
  return { verdict: r.verdict, ids: new Set(r.hits.map((h) => h.id)) };
};

const tally = { added: 0, lost: 0 };

describe("warnings stay with this car", () => {
  for (const [how, mutate] of Object.entries({
    "other cars with history badges after": (t: string) => `${t}\n\n${BADGED.join("\n")}\n`,
    "car cards with history badges after": (t: string) => `${t}\n\n${BADGED_CARDS.join("\n")}\n`,
  })) {
    it(`${how}: no warning is added`, () => {
      const added: string[] = [];
      for (const c of cases) {
        const base = verdictOf(c.text);
        const got = verdictOf(mutate(c.text));
        const extra = [...got.ids].filter((id) => !base.ids.has(id));
        tally.added += extra.length;
        if (extra.length) added.push(`${c.name}: ${extra.join(", ")}`);
      }
      expect(added, `${how}\n  ${added.join("\n  ")}`).toEqual([]);
    });
  }

  it("lines joined: no serious warning is lost", () => {
    const lost: string[] = [];
    for (const c of cases) {
      const base = buildVerdict({ text: c.text, listing: parseListing(c.text), decoded: null }, {}, NOW);
      const joined = c.text.replace(/\r?\n+/g, " ");
      const got = verdictOf(joined);
      const missing = base.hits.filter((h) => h.action === "hide" && !got.ids.has(h.id)).map((h) => h.id);
      tally.lost += missing.length;
      if (missing.length) lost.push(`${c.name}: ${missing.join(", ")}`);
    }
    expect(lost, `lines joined\n  ${lost.join("\n  ")}`).toEqual([]);
  });

  afterAll(() => console.log(`\nWarnings with other cars on the page: ${tally.added} added; lines joined: ${tally.lost} serious lost\n`));
});
