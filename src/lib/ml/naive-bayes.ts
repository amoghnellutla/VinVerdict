/**
 * A multinomial naive Bayes text classifier: small, fast to train (milliseconds), deterministic and easy to inspect,
 * which suits VinVerdict's rule "accuracy over completeness": every prediction carries its probability, and callers
 * only use confident ones. Pure: no network, no randomness, free.
 */

export type NBModel = {
  classes: string[];
  /** log P(class). */
  logPrior: number[];
  /** feature → count per class. */
  counts: Map<string, number[]>;
  /** Total feature count per class (for the smoothed likelihood). */
  totals: number[];
  vocabSize: number;
  alpha: number;
};

export type Example = { features: string[]; label: string };

export function trainNB(examples: Example[], alpha = 0.3): NBModel {
  const classes = [...new Set(examples.map((e) => e.label))].sort();
  const idx = new Map(classes.map((c, i) => [c, i]));
  const docs = classes.map(() => 0);
  const totals = classes.map(() => 0);
  const counts = new Map<string, number[]>();
  for (const e of examples) {
    const c = idx.get(e.label)!;
    docs[c]++;
    for (const f of e.features) {
      let row = counts.get(f);
      if (!row) counts.set(f, (row = classes.map(() => 0)));
      row[c]++;
      totals[c]++;
    }
  }
  const n = examples.length;
  return { classes, logPrior: docs.map((d) => Math.log(d / n)), counts, totals, vocabSize: counts.size, alpha };
}

/** The most likely class and its probability (softmax of the log scores). Features never seen in training are ignored. */
export function predictNB(m: NBModel, features: string[]): { label: string; p: number; ranked: { label: string; p: number }[] } {
  const known = features.filter((f) => m.counts.has(f));
  const scores = m.classes.map((_, c) => {
    let s = m.logPrior[c];
    const denom = Math.log(m.totals[c] + m.alpha * m.vocabSize);
    for (const f of known) s += Math.log(m.counts.get(f)![c] + m.alpha) - denom;
    return s;
  });
  const max = Math.max(...scores);
  const exp = scores.map((s) => Math.exp(s - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  const ranked = m.classes.map((label, c) => ({ label, p: exp[c] / sum })).sort((a, b) => b.p - a.p);
  // With no known feature the model knows nothing: say so with a flat, low probability.
  if (!known.length) return { label: ranked[0].label, p: 0, ranked };
  return { label: ranked[0].label, p: ranked[0].p, ranked };
}
