/**
 * Training and scoring the ML models (Amogh: "use AI and ML algorithms also to train simultaneously; once they get
 * best and have negligible error we can deploy"). Every test run retrains and re-scores on data the model never saw;
 * `TRAIN_ML=1 npx vitest run src/lib/ml/ml.test.ts` writes the result to gate.json, and the app uses a model only
 * when its gate says it passed. If the training data changes and gate.json isn't rewritten, this test fails, so the
 * deployed model and its score never drift from the data.
 *
 * The bar ("negligible error"): of the lines the model is confident about (p ≥ 0.95), at least 99% right, at least
 * 20% of lines confident, and no safety mistake at all, both in 5-fold cross-validation on the real labeled names and
 * on the lines of the real test papers (never trained on).
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generatorLabels } from "@/lib/dealsheet/fuzz-gen";
import { classify } from "@/lib/dealsheet/parse";
import { LABELED_NAMES } from "@/lib/dealsheet/vocabulary";
import { CONFIDENT, predictLine, trainingSet, trainLineModel } from "./dealer-lines";
import gate from "./gate.json";

const CORPUS = "src/lib/dealsheet/corpus/cases";
const corpusLines: [string, string][] = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => (JSON.parse(readFileSync(join(CORPUS, f), "utf8")).expect?.lines ?? []).map((l: { label: string; kind: string }) => [l.label, l.kind] as [string, string]));

// A confident wrong guess that would refuse something real or move money between sides is a safety mistake.
const REFUSE = new Set(["addOn", "loanProduct", "dealerFee"]);
const MONEY_CORE = new Set(["price", "total", "tax", "amountFinanced", "balanceDue", "subtotal", "stateFee"]);
const CREDIT = new Set(["discount", "rebate", "tradeIn", "downPayment"]);
const safetyMistake = (truth: string, guess: string) => (REFUSE.has(guess) && !REFUSE.has(truth)) || MONEY_CORE.has(truth) || CREDIT.has(truth) !== CREDIT.has(guess);

type Score = { n: number; confident: number; right: number; safety: number; mistakes: string[] };
const score = (): Score => ({ n: 0, confident: 0, right: 0, safety: 0, mistakes: [] });
function judge(s: Score, label: string, truth: string, guess: string, p: number) {
  s.n++;
  if (p < CONFIDENT) return;
  s.confident++;
  if (guess === truth) s.right++;
  else {
    if (safetyMistake(truth, guess)) s.safety++;
    s.mistakes.push(`${label} → ${guess} (${Math.round(p * 100)}%), is ${truth}`);
  }
}
// Coverage matters less than accuracy (the model only speaks for lines the rules can't place), but it must speak often enough to be worth having.
const pass = (s: Score) => s.confident > 0 && s.right / s.confident >= 0.99 && s.confident / s.n >= 0.2 && s.safety === 0;
const summary = (s: Score) => ({ lines: s.n, coverage: Math.round((s.confident / s.n) * 1000) / 1000, accuracy: s.confident ? Math.round((s.right / s.confident) * 10000) / 10000 : 0, safetyMistakes: s.safety });

// 5-fold cross-validation over the real names: each fold trained on the generator's words and the other four folds.
const cv = score();
for (let k = 0; k < 5; k++) {
  const test = LABELED_NAMES.filter((_, i) => i % 5 === k);
  const train = [...LABELED_NAMES.filter((_, i) => i % 5 !== k), ...generatorLabels()];
  const m = trainLineModel(train);
  for (const [label, kind] of test) {
    const r = predictLine(m, label);
    judge(cv, label, kind, r.label, r.p);
  }
}
// The real test papers' lines, never trained on, against the model as deployed.
const deployed = trainLineModel(trainingSet());
const papers = score();
for (const [label, kind] of corpusLines) {
  const r = predictLine(deployed, label);
  judge(papers, label, kind, r.label, r.p);
}
const passed = pass(cv) && pass(papers);
const dataHash = createHash("sha256").update(JSON.stringify([trainingSet(), corpusLines, CONFIDENT])).digest("hex").slice(0, 16);

describe("the dealer-line model (trained and scored every run)", () => {
  it("writes its gate when asked to train, and otherwise matches the gate on file", () => {
    const result = { passed, dataHash, crossValidation: summary(cv), realPapers: summary(papers), confidence: CONFIDENT, trainedOn: trainingSet().length };
    if (process.env.TRAIN_ML === "1") {
      writeFileSync("src/lib/ml/gate.json", `${JSON.stringify({ ...gate, dealerLines: result }, null, 2)}\n`);
      return;
    }
    expect((gate.dealerLines as { dataHash?: string }).dataHash, "The training data changed: retrain with TRAIN_ML=1 npx vitest run src/lib/ml/ml.test.ts").toBe(dataHash);
    expect(gate.dealerLines.passed).toBe(passed);
  });

  it("is never shown before it passes, and never makes a safety mistake when it does", () => {
    if (passed) {
      expect(cv.safety + papers.safety).toBe(0);
    }
  });

  afterAll(() => {
    // Where the model and the rules disagree on real papers' lines: candidates for new rules (or model data).
    const disagree = corpusLines.filter(([l]) => {
      const r = predictLine(deployed, l);
      return r.p >= CONFIDENT && r.label !== classify(l).kind;
    });
    console.log(
      `\nDealer-line model: ${passed ? "PASSED (in use as a second opinion)" : "not passed (shadow mode)"}\n` +
        `  cross-validation on ${cv.n} real names: ${JSON.stringify(summary(cv))}\n` +
        `  real test papers' ${papers.n} lines: ${JSON.stringify(summary(papers))}\n` +
        `  confident mistakes: ${[...cv.mistakes, ...papers.mistakes].slice(0, 12).join("; ") || "none"}\n` +
        `  model vs rules disagreements on real lines: ${disagree.length}${disagree.length ? ` (${disagree.slice(0, 6).map(([l, k]) => `${l} is ${k}`).join("; ")})` : ""}\n`,
    );
  });
});
