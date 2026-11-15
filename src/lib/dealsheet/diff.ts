/**
 * "What changed since the last paper": the classic trick is a product slipped into the final contract after the
 * price was agreed on the buyer's order. The buyer keeps a checked paper on their device (only its lines, with
 * personal details already taken out), and the final paper is compared with it, line by line.
 *
 * Pure (snapshots and the comparison) plus the device storage, wrapped so a blocked or private-mode storage just
 * means nothing is kept. Anything read back is checked field by field (storage can be edited by anyone).
 */

import type { DealCheck } from "./check";
import { classify, type DealLine, type DealSheet, type LineKind } from "./parse";

export type PaperLine = { label: string; kind: LineKind; amount: number; declined: boolean };
export type PaperSnapshot = { id: string; at: string; car: string | null; from: string; lines: PaperLine[]; total: number | null; payment: number | null };

export type PaperChange =
  | { type: "added"; line: PaperLine }
  | { type: "removed"; line: PaperLine }
  | { type: "changed"; label: string; kind: LineKind; from: number; to: number };

export type PaperDiff = {
  changes: PaperChange[];
  /** Charges added or raised since the earlier paper (to ask about), and credits lowered. */
  worse: PaperChange[];
  total: { from: number | null; to: number | null };
  payment: { from: number | null; to: number | null };
};

const CHARGES: readonly LineKind[] = ["price", "docFee", "dealerFee", "addOn", "loanProduct", "stateFee", "tax", "negativeEquity", "other", "leaseFee"];
const CREDITS: readonly LineKind[] = ["discount", "rebate", "tradeIn", "downPayment"];
const TOTALS: readonly LineKind[] = ["total", "balanceDue", "amountFinanced", "subtotal"];
const key = (l: { label: string; kind: LineKind }) => `${l.kind}:${l.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\(read by the ai\)/, "").trim()}`;
const live = (l: PaperLine) => !l.declined && l.amount > 0;
// Fees and add-ons are read again with today's rules, so a paper kept before a wording was learned ("Reg Fee" read
// as a dealer fee then, a government fee now) still lines up with the final one.
const FEE_KINDS: readonly LineKind[] = ["docFee", "dealerFee", "addOn", "loanProduct", "stateFee", "other"];
const today = (l: PaperLine): PaperLine => {
  if (!FEE_KINDS.includes(l.kind)) return l;
  const k = classify(l.label).kind;
  return FEE_KINDS.includes(k) ? { ...l, kind: k } : l;
};
// What a line is ("VIN etching" for "VIN Etch", "Etching" or "Theft Etch"), when the reader knows its name.
const nameOf = (l: PaperLine) => classify(l.label).name ?? null;

/** The paper's lines and headline numbers, ready to keep on the device. */
export function snapshot(sheet: DealSheet, check: DealCheck, meta: { car: string | null; from: string; at?: Date }): PaperSnapshot {
  const lines: PaperLine[] = sheet.lines.filter((l: DealLine) => !l.fromAi && l.kind !== "reference").map((l) => ({ label: l.label.slice(0, 80), kind: l.kind, amount: l.amount, declined: l.declined }));
  const total = lines.find((l) => l.kind === "total" && live(l))?.amount ?? null;
  const at = (meta.at ?? new Date()).toISOString();
  return { id: `${at}-${Math.round(total ?? 0)}`, at, car: meta.car, from: meta.from.slice(0, 80), lines, total, payment: check.loan?.stated ?? sheet.loan.payment ?? null };
}

/** The later paper against the earlier one: lines added, removed or changed, and the ones that cost the buyer more. */
export function diffPapers(before: PaperSnapshot, after: PaperSnapshot): PaperDiff {
  const a = before.lines.filter((l) => !TOTALS.includes(l.kind)).map(today);
  const b = after.lines.filter((l) => !TOTALS.includes(l.kind)).map(today);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: [PaperLine, PaperLine][] = [];
  // Same kind and words first; then the same thing named differently ("VIN Etch" became "Etching"); then the same
  // kind and amount; then a kind that appears once on each paper ("Vehicle Price" became "Cash Price of Vehicle").
  const pairBy = (same: (x: PaperLine, y: PaperLine) => boolean) =>
    b.forEach((y, j) => {
      if (usedB.has(j)) return;
      const i = a.findIndex((x, k) => !usedA.has(k) && x.kind === y.kind && same(x, y));
      if (i >= 0) {
        usedA.add(i);
        usedB.add(j);
        pairs.push([a[i], y]);
      }
    });
  b.forEach((y, j) => {
    const i = a.findIndex((x, k) => !usedA.has(k) && key(x) === key(y));
    if (i >= 0) {
      usedA.add(i);
      usedB.add(j);
      pairs.push([a[i], y]);
    }
  });
  pairBy((x, y) => nameOf(x) != null && nameOf(x) === nameOf(y));
  pairBy((x, y) => Math.abs(x.amount - y.amount) < 0.01 && x.kind !== "other");
  b.forEach((y, j) => {
    if (usedB.has(j)) return;
    const sameKindA = a.map((x, k) => ({ x, k })).filter(({ x, k }) => !usedA.has(k) && x.kind === y.kind);
    const sameKindB = b.filter((z, m) => !usedB.has(m) && z.kind === y.kind);
    if (sameKindA.length === 1 && sameKindB.length === 1 && y.kind !== "other") {
      usedA.add(sameKindA[0].k);
      usedB.add(j);
      pairs.push([sameKindA[0].x, y]);
    }
  });
  const changes: PaperChange[] = [];
  for (const [x, y] of pairs) {
    const from = live(x) ? x.amount : 0;
    const to = live(y) ? y.amount : 0;
    if (Math.abs(from - to) >= 0.01) changes.push({ type: "changed", label: y.label, kind: y.kind, from, to });
  }
  b.forEach((y, j) => { if (!usedB.has(j) && live(y)) changes.push({ type: "added", line: y }); });
  a.forEach((x, k) => { if (!usedA.has(k) && live(x)) changes.push({ type: "removed", line: x }); });
  const worse = changes.filter((c) =>
    c.type === "added" ? CHARGES.includes(c.line.kind) && c.line.kind !== "tax" && c.line.kind !== "stateFee"
      : c.type === "removed" ? CREDITS.includes(c.line.kind)
        : CHARGES.includes(c.kind) ? c.to > c.from && c.kind !== "tax" : CREDITS.includes(c.kind) && c.to < c.from,
  );
  return { changes, worse, total: { from: before.total, to: after.total }, payment: { from: before.payment, to: after.payment } };
}

// ----- On the device -----

const STORE = "vinverdict.dealPapers";
const MAX = 6;
const KINDS: readonly LineKind[] = [...CHARGES, ...CREDITS, ...TOTALS, "payoff", "reference", "loan", "leaseTerm"];
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 10_000_000 ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export function parseSaved(raw: unknown): PaperSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX).flatMap((r): PaperSnapshot[] => {
    const o = r as Record<string, unknown>;
    const id = str(o?.id, 80);
    const at = str(o?.at, 40);
    if (!id || !at || Number.isNaN(Date.parse(at)) || !Array.isArray(o.lines)) return [];
    const lines = o.lines.slice(0, 80).flatMap((x): PaperLine[] => {
      const l = x as Record<string, unknown>;
      const label = str(l?.label, 80);
      const kind = KINDS.find((k) => k === l?.kind);
      const amount = num(l?.amount);
      return label != null && kind && amount != null ? [{ label, kind, amount, declined: l.declined === true }] : [];
    });
    return [{ id, at, car: str(o.car, 120), from: str(o.from, 80) ?? "", lines, total: num(o.total), payment: num(o.payment) }];
  });
}

export function loadPapers(): PaperSnapshot[] {
  try {
    return parseSaved(JSON.parse(localStorage.getItem(STORE) ?? "[]"));
  } catch {
    return [];
  }
}

/** Keeps a paper (newest first, at most six); false when the browser won't store it. */
export function keepPaper(p: PaperSnapshot): boolean {
  try {
    const next = [p, ...loadPapers().filter((x) => x.id !== p.id)].slice(0, MAX);
    localStorage.setItem(STORE, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function forgetPapers() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    // nothing kept anyway
  }
}
