/**
 * The same listings, pasted differently. A page copied on a phone loses its line breaks, Windows adds \r,
 * and most listing pages show other cars before or after this one ("Recently viewed", "Similar vehicles", or
 * just a row of car cards). Whatever happens, every fact must stay the same or become "not sure" (null):
 * never a different value. That is the bar for any listing from any site, not only the ones in the corpus.
 *
 * Runs offline over every case in cases/.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseListing, type ParsedListing } from "@/lib/listing/parse";

const DIR = join(__dirname, "cases");
const FIELDS = ["year", "make", "model", "price", "docFee", "miles", "exteriorColor", "titleStatus", "sellerType"] as const;

const OTHER_CARS = ["2016 Kia Optima LX", "92,410 mi.", "$9,995", "Exterior: Snow White Pearl", "2023 Ford Escape SE", "12,880 mi.", "$24,750", "Exterior color: Rapid Red"];
const CARDS = ["Used", "2016 Kia Optima LX", "92K mi", "$9,995", "", "Used", "2023 Ford Escape SE", "13K mi", "$24,750"];

const MUTATIONS: Record<string, (t: string) => string> = {
  "lines joined": (t) => t.replace(/\r?\n+/g, " "),
  "Windows line ends": (t) => t.replace(/\r?\n/g, "\r\n"),
  "blank lines between": (t) => t.replace(/\r?\n/g, "\n\n"),
  "similar cars after": (t) => `${t}\n\nSimilar vehicles\n${OTHER_CARS.join("\n")}\n`,
  "car cards after": (t) => `${t}\n\n${CARDS.join("\n")}\n`,
  "recently viewed before": (t) => `Recently viewed\n${OTHER_CARS.join("\n")}\n\n${t}`,
};

const cases = readdirSync(DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort()
  .map((f) => {
    const name = f.replace(/\.txt$/, "");
    const spec = JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as { expect?: Partial<Record<keyof ParsedListing, unknown>> };
    return { name, text: readFileSync(join(DIR, f), "utf8"), expect: spec.expect ?? {} };
  })
  .filter((c) => c.expect.kind !== "vin" && c.expect.kind !== "url");

const tally = { same: 0, notSure: 0, wrong: 0 };

describe("listing corpus, pasted differently", () => {
  for (const [how, mutate] of Object.entries(MUTATIONS)) {
    it(how, () => {
      const wrong: string[] = [];
      for (const c of cases) {
        const got = parseListing(mutate(c.text));
        for (const field of FIELDS) {
          if (!(field in c.expect) || c.expect[field] === null || c.expect[field] === "unknown") continue;
          const v = got[field];
          if (v === c.expect[field]) tally.same++;
          else if (v === null || v === "unknown") tally.notSure++;
          else {
            tally.wrong++;
            wrong.push(`${c.name}: ${field} ${JSON.stringify(c.expect[field])} became ${JSON.stringify(v)}`);
          }
        }
      }
      expect(wrong, `${how}\n  ${wrong.join("\n  ")}`).toEqual([]);
    });
  }

  afterAll(() => {
    console.log(`\nPasted differently (${cases.length} cases x ${Object.keys(MUTATIONS).length} ways): ${tally.same} same, ${tally.notSure} not sure, ${tally.wrong} wrong\n`);
  });
});
