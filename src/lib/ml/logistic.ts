/**
 * Multinomial logistic regression (softmax) over sparse text features, trained by full-batch gradient descent with
 * L2 regularisation. Its probabilities are better calibrated than naive Bayes's (which counts overlapping features
 * many times and claims 100% too often), which matters because only confident predictions are ever shown.
 * Deterministic (no random start), pure and free.
 */

import type { Example } from "./naive-bayes";

export type LRModel = { classes: string[]; features: Map<string, number>; w: Float64Array[]; b: Float64Array };

export function trainLR(examples: Example[], opts: { epochs?: number; rate?: number; l2?: number } = {}): LRModel {
  const { epochs = 300, rate = 0.5, l2 = 1e-3 } = opts;
  const classes = [...new Set(examples.map((e) => e.label))].sort();
  const cIdx = new Map(classes.map((c, i) => [c, i]));
  const features = new Map<string, number>();
  for (const e of examples) for (const f of e.features) if (!features.has(f)) features.set(f, features.size);
  const X = examples.map((e) => [...new Set(e.features.map((f) => features.get(f)!))]);
  const y = examples.map((e) => cIdx.get(e.label)!);
  const K = classes.length;
  const w = classes.map(() => new Float64Array(features.size));
  const b = new Float64Array(K);
  const n = examples.length;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gw = classes.map(() => new Float64Array(features.size));
    const gb = new Float64Array(K);
    for (let i = 0; i < n; i++) {
      const z = new Float64Array(K);
      for (let k = 0; k < K; k++) {
        let s = b[k];
        for (const j of X[i]) s += w[k][j];
        z[k] = s;
      }
      const max = Math.max(...z);
      let sum = 0;
      for (let k = 0; k < K; k++) sum += (z[k] = Math.exp(z[k] - max));
      for (let k = 0; k < K; k++) {
        const g = z[k] / sum - (k === y[i] ? 1 : 0);
        gb[k] += g;
        for (const j of X[i]) gw[k][j] += g;
      }
    }
    for (let k = 0; k < K; k++) {
      b[k] -= (rate * gb[k]) / n;
      for (let j = 0; j < features.size; j++) w[k][j] -= rate * (gw[k][j] / n + l2 * w[k][j]);
    }
  }
  return { classes, features, w, b };
}

export function predictLR(m: LRModel, feats: string[]): { label: string; p: number; ranked: { label: string; p: number }[] } {
  const ids = [...new Set(feats.map((f) => m.features.get(f)).filter((j): j is number => j !== undefined))];
  const z = m.classes.map((_, k) => ids.reduce((s, j) => s + m.w[k][j], m.b[k]));
  const max = Math.max(...z);
  const e = z.map((v) => Math.exp(v - max));
  const sum = e.reduce((a, c) => a + c, 0);
  const ranked = m.classes.map((label, k) => ({ label, p: e[k] / sum })).sort((a, c) => c.p - a.p);
  return { label: ranked[0].label, p: ids.length ? ranked[0].p : 0, ranked };
}
