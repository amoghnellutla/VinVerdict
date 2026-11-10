// Adds a pasted listing to the labelled dataset (src/lib/listing/corpus/cases/).
//
//   npm run add-case -- --name autotrader-civic --label honest --file listing.txt
//   npm run add-case -- --name fb-camry-deposit --label scam < listing.txt
//
// --label: scam | honest | none (none = a VIN or link with no scam judgement)
// --origin: real (default) | synthetic
//
// Phone numbers and email addresses are removed automatically. Street
// addresses and people's names are not: check the .txt before committing.
// The .json it writes has a "todo" that makes `npm test` fail until the
// correct answers have been filled in from the page by hand (never copied
// from what VinVerdict reads, or the test would only check itself).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "src", "lib", "listing", "corpus", "cases");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const name = (arg("name") ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
const label = arg("label");
const origin = arg("origin", "real");
const file = arg("file");
if (!name || !["scam", "honest", "none"].includes(label) || !["real", "synthetic"].includes(origin)) {
  console.error("Usage: npm run add-case -- --name <short-name> --label scam|honest|none [--origin real|synthetic] [--file listing.txt]");
  process.exit(1);
}

const raw = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
if (!raw.trim()) {
  console.error("The listing text is empty.");
  process.exit(1);
}

/** Removes phone numbers and email addresses; returns the text and how many were removed. */
export function redact(text) {
  let n = 0;
  const out = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, () => (n++, "[email removed]"))
    .replace(/(?<![\w#$])(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g, () => (n++, "[phone removed]"));
  return { text: out, removed: n };
}

const used = readdirSync(DIR).map((f) => Number(f.slice(0, 2))).filter(Number.isFinite);
const nn = String(Math.max(0, ...used) + 1).padStart(2, "0");
const base = `${nn}-${name}`;
const { text, removed } = redact(raw.replace(/\r\n?/g, "\n"));

const spec = {
  todo: "Fill in 'expect' from the page by hand (price, miles, title, accident, seller type, VIN...), add mustHit/mustNotHit, then delete this line.",
  note: `${origin === "real" ? "Real listing" : "Written example"} added ${new Date().toISOString().slice(0, 10)}. What's tricky about it:`,
  expect: {},
  ...(label === "none" ? {} : { scam: label === "scam" }),
  origin,
};

writeFileSync(join(DIR, `${base}.txt`), text.trimEnd() + "\n");
writeFileSync(join(DIR, `${base}.json`), JSON.stringify(spec, null, 2) + "\n");
console.log(`Added cases/${base}.txt and .json (${removed} phone number(s)/email(s) removed).`);
console.log("Next: check the .txt for street addresses and names, fill in the .json, then run: npm run retrain");
