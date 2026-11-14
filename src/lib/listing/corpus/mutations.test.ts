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
const FIELDS = ["year", "make", "model", "price", "docFee", "miles", "exteriorColor", "titleStatus", "accident", "ownerCount", "usage", "sellerType"] as const;

const OTHER_CARS = ["2016 Kia Optima LX", "92,410 mi.", "$9,995", "Exterior: Snow White Pearl", "2023 Ford Escape SE", "12,880 mi.", "$24,750", "Exterior color: Rapid Red"];
const CARDS = ["Used", "2016 Kia Optima LX", "92K mi", "$9,995", "", "Used", "2023 Ford Escape SE", "13K mi", "$24,750"];
// Other cars' cards with the badges real sites put on them: their history must never become this car's.
const BADGED = ["Similar vehicles", "2015 Nissan Sentra S", "$6,450", "141,200 mi.", "1 accident reported", "Rebuilt title", "Fleet vehicle", "",
  "2017 Chevrolet Malibu LT", "$8,990", "118,000 mi.", "Salvage title", "Current bid: $4,100", "Lien reported"];
const BADGED_CARDS = ["Used", "2015 Nissan Sentra S", "141K mi", "$6,450", "1 accident reported", "Rebuilt title", "", "Used", "2017 Chevrolet Malibu LT", "118K mi", "$8,990", "Salvage title"];

/** Screenshot text (OCR) misreads: a thousands comma read as a period, a zero read as the letter O. */
const commaAsPeriod = (t: string) => t.replace(/(\d),(\d{3})(?![\d,])/g, "$1.$2");
const zeroAsO = (t: string) => t.replace(/(?<=\$\d{1,3},?\d?)0/g, "O");

const MUTATIONS: Record<string, (t: string) => string> = {
  "lines joined": (t) => t.replace(/\r?\n+/g, " "),
  "Windows line ends": (t) => t.replace(/\r?\n/g, "\r\n"),
  "blank lines between": (t) => t.replace(/\r?\n/g, "\n\n"),
  "similar cars after": (t) => `${t}\n\nSimilar vehicles\n${OTHER_CARS.join("\n")}\n`,
  "car cards after": (t) => `${t}\n\n${CARDS.join("\n")}\n`,
  "recently viewed before": (t) => `Recently viewed\n${OTHER_CARS.join("\n")}\n\n${t}`,
  "other cars with history badges after": (t) => `${t}\n\n${BADGED.join("\n")}\n`,
  "car cards with history badges after": (t) => `${t}\n\n${BADGED_CARDS.join("\n")}\n`,
  "OCR: comma read as a period": commaAsPeriod,
  "OCR: zero read as the letter O": zeroAsO,
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
          if (!(field in c.expect)) continue;
          const v = got[field];
          // A fact the ad doesn't give must stay blank: another car's "Rebuilt title" is not this car's.
          if (c.expect[field] === null || c.expect[field] === "unknown") {
            if (v === null || v === "unknown") tally.same++;
            else {
              tally.wrong++;
              wrong.push(`${c.name}: ${field} not in the ad, but read as ${JSON.stringify(v)}`);
            }
            continue;
          }
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
