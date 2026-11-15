/**
 * Generated dealer papers, 1,200 of them, to find the checker's mistakes before a buyer does (fuzz-gen.ts builds
 * them, with the arithmetic done so each paper is right, then optionally one planted problem). The rules ("make
 * sure it doesn't do mistakes"):
 *   - a correct paper: nothing is "wrong", nothing to "remove", nothing to take off, no "check this";
 *   - a paper with one problem: no other line is called "wrong", and the problem is found;
 *   - every amount shown is one printed on the paper;
 *   - the buyer's name and address never survive.
 * The hard half adds ALL-CAPS, columns, OCR misreads, missing cents, declined add-ons, discounts and rebates, and
 * a page-2 header. Seeded, so a failure always reproduces.
 */

import { afterAll, describe, expect, it } from "vitest";
import { checkDealSheet, type DealCheck } from "./check";
import { makePaper, type Paper } from "./fuzz-gen";
import { parseDealSheet } from "./parse";
import { redactDealSheet } from "./redact";

const run = (p: Paper): DealCheck =>
  checkDealSheet({ sheet: parseDealSheet(redactDealSheet(p.text).text), ad: p.ad, state: p.state, modelYear: 2021, condition: p.condition, now: new Date("2026-11-15") });

const tallies: Record<string, { papers: number; confirmed: number; clean: number; checksOnClean: number; loansRead: number; loans: number; found: number; planted: number }> = {};

function suite(label: string, from: number, n: number, hard: boolean, condition: "new" | "used" = "used") {
  it(`${label}: no mistakes`, () => {
    const t = (tallies[label] = { papers: 0, confirmed: 0, clean: 0, checksOnClean: 0, loansRead: 0, loans: 0, found: 0, planted: 0 });
    const bad: string[] = [];
    for (let seed = from; seed < from + n; seed++) {
      const p = makePaper(seed, hard, condition);
      if (redactDealSheet(p.text).text.toLowerCase().includes(p.name.toLowerCase())) bad.push(`#${seed}: the buyer's name survived`);
      const c = run(p);
      t.papers++;
      if (c.confirmed) t.confirmed++;
      for (const r of c.rows) if (!p.printed.has(r.line.amount.toFixed(2))) bad.push(`#${seed}: shows ${r.line.amount} (${r.line.label}), not on the paper\n${p.text}`);
      const wrongs = c.rows.filter((r) => r.verdict === "wrong").map((r) => `${r.line.label}(${r.line.kind})`);
      const loanWrong = c.loan?.verdict === "wrong";
      if (p.hasLoan) {
        t.loans++;
        if (c.loan) t.loansRead++;
      }
      if (p.problem === "none") {
        t.clean++;
        const checks = c.rows.filter((r) => r.verdict === "check" && !(p.condition === "new" && (r.line.name === "Destination charge" || r.line.kind === "docFee"))).map((r) => `${r.line.label}: ${r.note}`).concat(c.loan?.verdict === "check" ? [`loan: ${c.loan.note}`] : []);
        t.checksOnClean += checks.length;
        if (wrongs.length || loanWrong) bad.push(`#${seed}: clean paper called wrong: ${wrongs.join(",")}${loanWrong ? ` loan: ${c.loan!.note}` : ""}\n${p.text}`);
        const removes = c.rows.filter((r) => r.verdict === "remove");
        if (removes.length) bad.push(`#${seed}: clean paper, remove: ${removes.map((r) => r.line.label).join(", ")}\n${p.text}`);
        if (c.hiddenTotal > 0) bad.push(`#${seed}: clean paper, ${c.hiddenTotal} to take off`);
        if (checks.length) bad.push(`#${seed}: clean paper, check: ${checks.join(" | ")}\n${p.text}`);
      } else {
        t.planted++;
        const stray = c.rows.filter((r) => r.verdict === "wrong" && !(p.problem === "overAd" && r.line.kind === "price"));
        if (stray.length) bad.push(`#${seed} (${p.problem}): called wrong: ${stray.map((r) => `${r.line.label}: ${r.note}`).join(" | ")}\n${p.text}`);
        if (loanWrong && p.problem !== "packed") bad.push(`#${seed} (${p.problem}): loan called wrong: ${c.loan!.note}\n${p.text}`);
        const found =
          p.problem === "addOn" || p.problem === "product" ? c.rows.some((r) => r.verdict === "remove")
            : p.problem === "overAd" ? c.rows.some((r) => r.line.kind === "price" && (r.verdict === "wrong" || r.verdict === "check")) || !p.ad
              : c.loan?.verdict === "wrong" || c.loan?.verdict === "check";
        if (found) t.found++;
        else bad.push(`#${seed} (${p.problem}): not found\n${p.text}`);
      }
    }
    expect(bad.slice(0, 6), `${bad.length} problems\n\n${bad.slice(0, 6).join("\n\n")}`).toEqual([]);
  });
}

describe("generated dealer papers (seeded)", () => {
  suite("plain", 1, 600, false);
  suite("hard", 1001, 600, true);
  suite("new car", 2001, 400, false, "new");
  suite("new car, hard", 3001, 400, true, "new");
  afterAll(() => {
    for (const [k, t] of Object.entries(tallies)) {
      console.log(`Generated papers (${k}): ${t.papers}; added up ${t.confirmed}; clean ${t.clean} with ${t.checksOnClean} "check this"; loans read ${t.loansRead}/${t.loans}; planted problems found ${t.found}/${t.planted}`);
    }
  });
});
