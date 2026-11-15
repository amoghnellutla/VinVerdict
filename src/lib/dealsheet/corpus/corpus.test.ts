/**
 * Deal-sheet accuracy suite: dealer papers in different layouts (dotted lines, colons, tabs, two pairs per line,
 * columns flattened by PDF text extraction, OCR misreads), each with the answers VinVerdict must give.
 * "Clean" papers have every line right: VinVerdict must call nothing wrong, find nothing to remove and raise
 * nothing to ask about on them (the false-alarm bar is 0). Every paper is also pasted differently: a verdict may
 * become "check this", never a new "wrong".
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { StateCode } from "@/lib/geo/zip";
import { checkDealSheet, type AdFacts, type DealCheck } from "../check";
import { negotiationPlan } from "../negotiate";
import { parseDealSheet, type LineKind } from "../parse";
import { redactDealSheet } from "../redact";

type Spec = {
  note: string;
  state: StateCode;
  ad: AdFacts | null;
  modelYear: number;
  /** "new" for a new car (default used). */
  condition?: "new" | "used";
  myAprPct: number | null;
  clean: boolean;
  expect: {
    lines: { label: string; kind: LineKind; amount: number }[];
    confirmed: boolean;
    loan: "right" | "wrong" | "check" | null;
    verdicts?: Record<string, string>;
    hiddenTotal?: number;
    /** A lease worksheet: no loan check, its own note. */
    lease?: boolean;
    /** Payoff above the trade-in: the old loan's amount carried into this deal. */
    negativeEquity?: number;
    /** A worksheet with several payment options. */
    paymentOptions?: number;
    /** Text the tax row's note must contain (the local rate it implies). */
    taxNote?: string;
  };
};

const DIR = join(__dirname, "cases");
const NOW = new Date("2026-11-14T12:00:00Z");
const cases = readdirSync(DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort()
  .map((f) => ({ name: f.replace(/\.txt$/, ""), text: readFileSync(join(DIR, f), "utf8"), spec: JSON.parse(readFileSync(join(DIR, f.replace(/\.txt$/, ".json")), "utf8")) as Spec }));

function run(text: string, s: Spec): DealCheck {
  const sheet = parseDealSheet(redactDealSheet(text).text);
  return checkDealSheet({ sheet, ad: s.ad, state: s.state, modelYear: s.modelYear, condition: s.condition, myAprPct: s.myAprPct, now: NOW });
}

const score = { lines: 0, linesRead: 0, verdicts: 0, verdictsRight: 0, cleanFalseAlarms: 0 };

describe("deal-sheet corpus", () => {
  it("has cases", () => expect(cases.length).toBeGreaterThanOrEqual(15));

  for (const c of cases) {
    it(c.name, () => {
      const problems: string[] = [];
      const red = redactDealSheet(c.text).text;
      if (/Pat Example|12 Sample St/.test(red)) problems.push("personal details were not removed");
      const sheet = parseDealSheet(red);
      const result = run(c.text, c.spec);

      for (const want of c.spec.expect.lines) {
        score.lines++;
        const got = sheet.lines.find((l) => Math.abs(l.amount - want.amount) < 0.005 && l.kind === want.kind);
        if (got) score.linesRead++;
        else problems.push(`line "${want.label}" ${want.kind} ${want.amount} not read [read: ${sheet.lines.map((l) => `${l.label}=${l.kind}:${l.amount}`).join(" | ")}]`);
      }
      if (result.confirmed !== c.spec.expect.confirmed) problems.push(`confirmed: expected ${c.spec.expect.confirmed}, got ${result.confirmed}`);
      if ((result.loan?.verdict ?? null) !== c.spec.expect.loan) problems.push(`loan: expected ${c.spec.expect.loan}, got ${result.loan?.verdict ?? null} (${result.loan?.note ?? "no loan read"})`);
      for (const [label, verdict] of Object.entries(c.spec.expect.verdicts ?? {})) {
        score.verdicts++;
        const row = result.rows.find((r) => r.line.label.toLowerCase() === label.toLowerCase()) ?? result.rows.find((r) => r.line.label.toLowerCase().includes(label.toLowerCase()));
        if (row?.verdict === verdict) score.verdictsRight++;
        else problems.push(`"${label}": expected ${verdict}, got ${row?.verdict ?? "no row"} (${row?.note ?? ""})`);
      }
      if (c.spec.expect.hiddenTotal != null && Math.abs(result.hiddenTotal - c.spec.expect.hiddenTotal) > 1) {
        problems.push(`hidden total: expected ${c.spec.expect.hiddenTotal}, got ${result.hiddenTotal} [${result.hidden.map((h) => `${h.what} ${h.amount}`).join("; ")}]`);
      }
      const e = c.spec.expect;
      if (e.lease !== undefined && result.lease !== e.lease) problems.push(`lease: expected ${e.lease}, got ${result.lease}`);
      if (e.negativeEquity !== undefined && result.negativeEquity !== e.negativeEquity) problems.push(`negative equity: expected ${e.negativeEquity}, got ${result.negativeEquity}`);
      if (e.paymentOptions !== undefined && result.paymentOptions.length !== e.paymentOptions) problems.push(`payment options: expected ${e.paymentOptions}, got ${result.paymentOptions.length}`);
      if (e.taxNote && !result.rows.find((r) => r.line.kind === "tax")?.note.includes(e.taxNote)) problems.push(`tax note should mention ${e.taxNote}: ${result.rows.find((r) => r.line.kind === "tax")?.note}`);
      if (c.spec.clean) {
        const alarms = result.rows.filter((r) => r.verdict === "wrong" || r.verdict === "remove" || r.verdict === "check");
        score.cleanFalseAlarms += alarms.length + (result.loan && result.loan.verdict !== "right" ? 1 : 0);
        for (const a of alarms) problems.push(`clean paper, but "${a.line.label}" is ${a.verdict}: ${a.note}`);
        if (result.hiddenTotal) problems.push(`clean paper, but ${result.hiddenTotal} to take off`);
      }
      // The plan's message never asks to remove something that isn't on the paper.
      const plan = negotiationPlan({ sheet, check: result, ad: c.spec.ad, state: c.spec.state, modelYear: c.spec.modelYear, now: NOW });
      for (const r of result.rows.filter((x) => x.verdict === "remove")) {
        if (!plan.message.includes(r.line.name ?? r.line.label)) problems.push(`message doesn't ask to remove ${r.line.label}`);
      }
      expect(problems, `${c.name}\n  ${problems.join("\n  ")}`).toEqual([]);
    });
  }

  afterAll(() => {
    console.log(`\nDeal-sheet corpus (${cases.length} papers): lines read ${score.linesRead}/${score.lines}, verdicts ${score.verdictsRight}/${score.verdicts}, false alarms on clean papers ${score.cleanFalseAlarms}\n`);
  });
});

// Misreads the reader repairs: every amount must read exactly as before.
const REPAIRED: Record<string, (t: string) => string> = {
  "OCR: $ read as S": (t) => t.replace(/\$(\d{1,3}(?:,\d{3})*\.\d{2})/g, "S$1"),
  "OCR: $ doubled": (t) => t.replace(/\$(?=\d)/g, "$$$$"),
  "OCR: cents point read as a comma": (t) => t.replace(/\$(\d{1,3}(?:,\d{3})*)\.(\d{2})(?!\d)/g, "$$$1,$2"),
  "PDF: no space before $": (t) => t.replace(/(?<=[A-Za-z:)]) \$/g, "$$"),
  "ALL CAPS": (t) => t.toUpperCase(),
  "tabs for wide gaps": (t) => t.replace(/ {3,}/g, "\t"),
};

const MUTATIONS: Record<string, (t: string) => string> = {
  "Windows line ends": (t) => t.replace(/\n/g, "\r\n"),
  "blank lines between": (t) => t.replace(/\n/g, "\n\n"),
  "dots instead of spaces": (t) => t.replace(/ \.{10} /g, " ....................... "),
  "OCR: comma read as a period": (t) => t.replace(/\$(\d{1,3}),(\d{3})/g, "$$$1.$2"),
  "lines joined": (t) => t.replace(/\n+/g, " "),
  ...REPAIRED,
};

describe("deal sheets with misreads the reader repairs", () => {
  for (const [how, mutate] of Object.entries(REPAIRED)) {
    it(`${how}: every amount reads the same`, () => {
      const bad: string[] = [];
      const amounts = (t: string, s: Spec) => parseDealSheet(redactDealSheet(t).text).lines.map((l) => `${l.kind}:${l.amount}`).join(" | ");
      for (const c of cases) {
        const want = amounts(c.text, c.spec);
        const got = amounts(mutate(c.text), c.spec);
        if (got !== want) bad.push(`${c.name}\n    was: ${want}\n    now: ${got}`);
      }
      expect(bad, `${how}\n  ${bad.join("\n  ")}`).toEqual([]);
    });
  }
});

describe("deal sheets, pasted differently", () => {
  for (const [how, mutate] of Object.entries(MUTATIONS)) {
    it(`${how}: never a new "wrong", never more to take off`, () => {
      const bad: string[] = [];
      for (const c of cases) {
        const base = run(c.text, c.spec);
        const got = run(mutate(c.text), c.spec);
        const baseWrong = new Set(base.rows.filter((r) => r.verdict === "wrong").map((r) => r.line.label.toLowerCase()));
        for (const r of got.rows) if (r.verdict === "wrong" && !baseWrong.has(r.line.label.toLowerCase())) bad.push(`${c.name}: "${r.line.label}" became wrong: ${r.note}`);
        if (got.loan?.verdict === "wrong" && base.loan?.verdict !== "wrong") bad.push(`${c.name}: loan became wrong`);
        if (got.hiddenTotal > base.hiddenTotal + 1) bad.push(`${c.name}: ${got.hiddenTotal} to take off, was ${base.hiddenTotal}`);
      }
      expect(bad, `${how}\n  ${bad.join("\n  ")}`).toEqual([]);
    });
  }
});
