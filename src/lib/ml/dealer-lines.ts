/**
 * The trained model for dealer-paper lines: what a line is ("price", "docFee", "addOn", "loanProduct"…), learned from
 * real labeled line names (lib/dealsheet/vocabulary.ts) and the generator's word lists. It runs beside the rules, is
 * scored on lines it never saw (ml.test.ts), and is only used once it passes the gate in gate.json, and then only as
 * a second opinion: for a line the rules can't place, it names what the line probably is and the line stays "check
 * this". It never calls anything wrong and never overrides a rule.
 */

import { generatorLabels } from "@/lib/dealsheet/fuzz-gen";
import { toEnglish } from "@/lib/dealsheet/spanish";
import { LABELED_NAMES } from "@/lib/dealsheet/vocabulary";
import gate from "./gate.json";
import { predictLR, trainLR, type LRModel } from "./logistic";

/** Words, word pairs and letter triples of a line name (Spanish put in English, accents and punctuation off). */
export function lineFeatures(label: string): string[] {
  const t = toEnglish(label).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();
  const words = t.split(" ").filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    out.push(`w:${w}`);
    const p = `^${w}$`;
    for (let i = 0; i + 3 <= p.length; i++) out.push(`c:${p.slice(i, i + 3)}`);
  }
  for (let i = 0; i + 1 < words.length; i++) out.push(`b:${words[i]}_${words[i + 1]}`);
  return out;
}

/** The training set: the real labeled names and the generator's words (duplicates once). */
export function trainingSet(extra: [string, string][] = []): [string, string][] {
  const seen = new Set<string>();
  return [...LABELED_NAMES, ...generatorLabels(), ...extra].filter(([l, k]) => {
    const key = `${l.toLowerCase()}|${k}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Logistic regression: compared with naive Bayes on the same held-out data, its confident guesses were right far
 * more often (naive Bayes claimed 100% on wrong answers), so it's the one used. */
export function trainLineModel(rows: [string, string][]): LRModel {
  return trainLR(rows.map(([l, k]) => ({ features: lineFeatures(l), label: k })));
}

export const predictLine = (m: LRModel, label: string) => predictLR(m, lineFeatures(label));

/** How sure the model must be before its guess is shown (the gate is measured at this level). */
export const CONFIDENT = 0.95;

let model: LRModel | null = null;

/**
 * The model's guess for a line the rules couldn't place, or null: when the model hasn't passed its gate, when it
 * isn't confident, or when it only guesses "other".
 */
export function secondOpinion(label: string): { kind: string; p: number } | null {
  if (!gate.dealerLines.passed) return null;
  model ??= trainLineModel(trainingSet());
  const r = predictLine(model, label);
  return r.p >= CONFIDENT && r.label !== "other" ? { kind: r.label, p: Math.round(r.p * 100) / 100 } : null;
}
