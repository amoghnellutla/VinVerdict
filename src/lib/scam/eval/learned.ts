/**
 * A model trained on the labelled ads, measured next to the written rules.
 *
 * Naive Bayes over the words and word pairs of each ad (each counted once per
 * ad, numbers folded to "#"). Retrained from the dataset on every test run,
 * so it keeps learning as labelled ads are added. Deterministic: the same
 * data always gives the same model and the same score.
 *
 * It doesn't change any answer VinVerdict gives. It's here to show, with
 * numbers, whether learning from the data beats written rules yet. If it
 * ever does on held-out ads, it could add warnings (never clear a car).
 */

import { normalizeText } from "@/lib/listing/text";

export type Example = { text: string; scam: boolean };

export type Model = {
  /** log P(scam) − log P(honest) before seeing any words, plus every feature's "absent" term. */
  base: number;
  /** Per feature: how much seeing it (instead of not seeing it) moves the log-odds towards "scam". */
  weight: Map<string, number>;
  trainedOn: number;
};

/** The distinct words and word pairs of a text. */
export function features(text: string): Set<string> {
  const words = normalizeText(text)
    .replace(/\d+/g, "#")
    .match(/[a-z#$'][a-z#$']*/g) ?? [];
  const out = new Set<string>(words);
  for (let i = 1; i < words.length; i++) out.add(`${words[i - 1]} ${words[i]}`);
  return out;
}

/**
 * Bernoulli naive Bayes: P(feature | class) is the share of that class's ads
 * containing it (add-one smoothed), so a long dealer page doesn't outweigh a
 * short ad. Features never seen in training are ignored.
 */
/** A word or pair must appear in at least this many training ads to count. */
const MIN_ADS = 2;

export function train(examples: Example[]): Model {
  const df = { scam: new Map<string, number>(), honest: new Map<string, number>() };
  let scams = 0;
  for (const e of examples) {
    const bag = e.scam ? df.scam : df.honest;
    if (e.scam) scams++;
    for (const f of features(e.text)) bag.set(f, (bag.get(f) ?? 0) + 1);
  }
  const honest = examples.length - scams;
  const base = Math.log((scams + 1) / (examples.length + 2)) - Math.log((honest + 1) / (examples.length + 2));
  const weight = new Map<string, number>();
  for (const f of new Set([...df.scam.keys(), ...df.honest.keys()])) {
    const s = df.scam.get(f) ?? 0;
    const h = df.honest.get(f) ?? 0;
    if (s + h < MIN_ADS) continue;
    weight.set(f, Math.log((s + 1) / (scams + 2)) - Math.log((h + 1) / (honest + 2)));
  }
  return { base, weight, trainedOn: examples.length };
}

/** Log-odds that the text is a scam; above 0 means the model calls it one. */
export function scoreText(model: Model, text: string): number {
  let s = model.base;
  for (const f of features(text)) s += model.weight.get(f) ?? 0;
  return s;
}

export const predict = (model: Model, text: string) => scoreText(model, text) > 0;

/** Leave-one-out: each example is scored by a model trained on all the others. */
export function leaveOneOut(examples: Example[]): { scam: boolean; flagged: boolean }[] {
  return examples.map((e, i) => ({ scam: e.scam, flagged: predict(train(examples.filter((_, j) => j !== i)), e.text) }));
}

/** The words that push the model hardest towards "scam" (for explaining what it learned). */
export function topScamFeatures(model: Model, n = 10): string[] {
  return [...model.weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([f]) => f);
}
