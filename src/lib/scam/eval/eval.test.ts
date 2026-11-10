/**
 * Scam-warning scorecard. Prints precision, recall and false alarms for
 * VinVerdict and a keyword baseline. The published copy (scorecard.json,
 * shown on /accuracy) must match what the code does now: after changing the
 * rules or the cases, refresh it with
 *   UPDATE_SCORECARD=1 npx vitest run src/lib/scam/eval
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDataset, toJsonl, type CorpusRow } from "./dataset";
import { score, type EvalCase } from "./evaluate";
import data from "./cases.json";
import holdout from "./holdout.json";
import messages from "./messages.json";
import published from "./scorecard.json";

const CORPUS = join(__dirname, "../../listing/corpus/cases");

/** Every listing corpus case: its text, field answers and (when given) scam label. */
function corpusRows(): CorpusRow[] {
  return readdirSync(CORPUS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const spec = JSON.parse(readFileSync(join(CORPUS, f), "utf8")) as { scam?: boolean; origin?: "real" | "synthetic"; expect?: Record<string, unknown> };
      const id = f.replace(/\.json$/, "");
      return { id, origin: spec.origin ?? "synthetic", scam: spec.scam, fields: spec.expect ?? {}, text: readFileSync(join(CORPUS, `${id}.txt`), "utf8") };
    });
}

/** Corpus listings that carry a scam label (full pages: good tests for false alarms). */
function corpusCases(): EvalCase[] {
  return corpusRows().flatMap((c) => (typeof c.scam === "boolean" ? [{ id: `corpus/${c.id}`, origin: c.origin, scam: c.scam, text: c.text }] : []));
}

const DATASET = join(__dirname, "../../../../dataset/vinverdict-labelled.jsonl");

const all = [...(data.cases as EvalCase[]), ...corpusCases()];
const held = holdout.cases as EvalCase[];
const dataset = toJsonl(buildDataset({ tuning: data.cases as EvalCase[], heldOut: held, replies: messages, corpus: corpusRows() }));

describe("scam scorecard", () => {
  const card = score(all, held, published.generated, messages);

  it("prints the scorecard", () => {
    const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
    const line = (name: string, m: typeof card.vinverdict) =>
      `  ${name.padEnd(12)} precision ${pct(m.precision)}  recall ${pct(m.recall)}  false alarms ${pct(m.falseAlarmRate)}  (${m.tp} caught, ${m.fn} missed of ${m.scams} scams; ${m.fp} false alarms of ${m.legit} legit)`;
    console.log(`\nScam scorecard (${card.vinverdict.cases} labelled ads)\n${line("VinVerdict", card.vinverdict)}\n${line("Keywords", card.baseline)}
${line("Held out", card.heldOut)}
${line("Replies", card.messages)}
${line("Replies (kw)", card.messagesBaseline)}
${line("Model (LOO)", card.learned.crossValidated)}
${line("Model (held)", card.learned.heldOut)}
${line("Model (rep.)", card.learned.replies)}\n${card.misses.map((m) => `    ${m.kind}: ${m.id}${m.why.length ? ` [${m.why.join(", ")}]` : ""}`).join("\n")}\n`);
  });

  it("the published scorecard matches the code (refresh with UPDATE_SCORECARD=1)", () => {
    if (process.env.UPDATE_SCORECARD) {
      const fresh = score(all, held, new Date().toISOString().slice(0, 10), messages);
      writeFileSync(join(__dirname, "scorecard.json"), JSON.stringify(fresh, null, 2) + "\n");
      mkdirSync(join(DATASET, ".."), { recursive: true });
      writeFileSync(DATASET, dataset);
      return;
    }
    const { generated: _g, ...now } = card;
    const { generated: _p, ...was } = published as typeof card;
    void _g;
    void _p;
    expect(now).toEqual(was);
  });

  it("the committed dataset file matches the labelled data (refresh with UPDATE_SCORECARD=1)", () => {
    if (process.env.UPDATE_SCORECARD) return;
    expect(existsSync(DATASET)).toBe(true);
    expect(readFileSync(DATASET, "utf8").replace(/\r\n/g, "\n")).toBe(dataset);
  });
});
