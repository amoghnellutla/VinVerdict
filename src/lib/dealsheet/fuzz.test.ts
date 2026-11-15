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
import { makeLease, makeOptions, makePaper, rng, type Paper } from "./fuzz-gen";
import { diffPapers, snapshot } from "./diff";
import { negotiationPlan } from "./negotiate";
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
      if (/\d+ sample rd/i.test(redactDealSheet(p.text).text)) bad.push(`#${seed}: the buyer's street survived
${redactDealSheet(p.text).text}`);
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
      if (p.negativeEquity && !(c.negativeEquity > 0)) bad.push(`#${seed}: negative equity not reported\n${p.text}`);
      // The plan never asks the buyer to pay more than the paper's own total, and on a right paper it's that total.
      const sheet = parseDealSheet(redactDealSheet(p.text).text);
      const plan = negotiationPlan({ sheet, check: c, ad: p.ad, state: p.state, modelYear: 2021, now: new Date("2026-11-15") });
      const paperTotal = sheet.lines.find((l) => l.kind === "total" && !l.declined)?.amount;
      if (plan.target != null && paperTotal != null && !plan.plusTax && plan.target > paperTotal + 1) bad.push(`#${seed} (${p.problem}): target ${plan.target} above the paper's total ${paperTotal}\n${p.text}`);
      if (plan.target != null && plan.target < 0) bad.push(`#${seed}: negative target ${plan.target}`);
      if (p.problem === "none" && p.ad && plan.target != null && paperTotal != null && !plan.plusTax && Math.abs(plan.target - paperTotal) > 1) bad.push(`#${seed}: clean paper, target ${plan.target} vs total ${paperTotal}\n${p.text}`);
      if (p.problem === "none") {
        t.clean++;
        const checks = c.rows.filter((r) => r.verdict === "check" && !(p.condition === "new" && (r.line.name === "Destination charge" || r.line.kind === "docFee")) && !(p.negativeEquity && r.line.kind === "payoff")).map((r) => `${r.line.label}: ${r.note}`).concat(c.loan?.verdict === "check" ? [`loan: ${c.loan.note}`] : []);
        t.checksOnClean += checks.length;
        if (wrongs.length || loanWrong) bad.push(`#${seed}: clean paper called wrong: ${wrongs.join(",")}${loanWrong ? ` loan: ${c.loan!.note}` : ""}\n${p.text}`);
        const removes = c.rows.filter((r) => r.verdict === "remove");
        if (removes.length) bad.push(`#${seed}: clean paper, remove: ${removes.map((r) => r.line.label).join(", ")}\n${p.text}`);
        if (c.hiddenTotal > 0) bad.push(`#${seed}: clean paper, ${c.hiddenTotal} to take off`);
        if (checks.length) bad.push(`#${seed}: clean paper, check: ${checks.join(" | ")}\n${p.text}`);
      } else {
        t.planted++;
        const stray = c.rows.filter((r) => r.verdict === "wrong" && !((p.problem === "overAd" || p.problem === "combo") && r.line.kind === "price") && !(p.problem === "docOverCap" && r.line.kind === "docFee"));
        if (stray.length) bad.push(`#${seed} (${p.problem}): called wrong: ${stray.map((r) => `${r.line.label}: ${r.note}`).join(" | ")}\n${p.text}`);
        if (loanWrong && p.problem !== "packed") bad.push(`#${seed} (${p.problem}): loan called wrong: ${c.loan!.note}\n${p.text}`);
        const found =
          p.problem === "addOn" ? c.rows.filter((r) => r.verdict === "remove").length >= p.planted
            : p.problem === "combo" ? c.rows.filter((r) => r.verdict === "remove").length >= p.planted && (c.rows.some((r) => r.line.kind === "price" && (r.verdict === "wrong" || r.verdict === "check")) || !p.ad)
            : p.problem === "product" || p.problem === "padding" ? c.rows.some((r) => r.verdict === "remove")
            : p.problem === "overAd" ? c.rows.some((r) => r.line.kind === "price" && (r.verdict === "wrong" || r.verdict === "check")) || !p.ad
              : p.problem === "docOverCap" ? c.rows.some((r) => r.line.kind === "docFee" && (r.verdict === "wrong" || r.verdict === "check") && /legal maximum/.test(r.note))
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

describe("generated leases (seeded)", () => {
  it("lease worksheets and disclosures: no loan check, nothing wrong; add-ons refused; a padded payment asked about", () => {
    const bad: string[] = [];
    for (let seed = 5001; seed <= 5400; seed++) {
      const p = makeLease(seed);
      const c = checkDealSheet({ sheet: parseDealSheet(redactDealSheet(p.text).text), ad: p.ad, state: null, modelYear: 2026, condition: "new", now: new Date("2026-11-15") });
      if (redactDealSheet(p.text).text.includes(p.name)) bad.push(`#${seed}: name survived`);
      if (!c.lease) bad.push(`#${seed}: not read as a lease\n${p.text}`);
      if (c.loan) bad.push(`#${seed}: a lease was loan-checked\n${p.text}`);
      for (const r of c.rows) if (!p.printed.has(r.line.amount.toFixed(2))) bad.push(`#${seed}: shows ${r.line.amount} (${r.line.label}), not on the paper`);
      if (c.rows.some((r) => r.verdict === "wrong") || c.leaseMath?.verdict === "wrong") bad.push(`#${seed}: something called wrong on a lease\n${p.text}`);
      const removes = c.rows.filter((r) => r.verdict === "remove");
      if (p.problem === "addOn" ? removes.length !== 1 : removes.length) bad.push(`#${seed} (${p.problem}): ${removes.length} to remove\n${p.text}`);
      // A padded base payment (no tax in it) is asked about; a padded monthly payment may be tax, so at least "info".
      const base = /base monthly payment/i.test(p.text);
      if (p.problem === "padded" ? (base ? c.leaseMath?.verdict !== "check" : !c.leaseMath || c.leaseMath.verdict === "right") : c.leaseMath?.verdict !== "right") bad.push(`#${seed} (${p.problem}): lease math ${c.leaseMath?.verdict ?? "not done"}: ${c.leaseMath?.note ?? ""}\n${p.text}`);
    }
    expect(bad.slice(0, 6), `${bad.length} problems\n\n${bad.slice(0, 6).join("\n\n")}`).toEqual([]);
  });
});

describe("generated payment-options worksheets (seeded)", () => {
  it("every option is read, no single loan is checked, nothing is wrong, and add-ons are refused", () => {
    const bad: string[] = [];
    for (let seed = 6001; seed <= 6300; seed++) {
      const p = makeOptions(seed);
      const c = checkDealSheet({ sheet: parseDealSheet(p.text), ad: p.ad, state: null, modelYear: 2021, now: new Date("2026-11-15") });
      if (c.paymentOptions.length !== p.options) bad.push(`#${seed}: ${c.paymentOptions.length} options read of ${p.options}\n${p.text}`);
      if (c.loan) bad.push(`#${seed}: loan-checked\n${p.text}`);
      for (const r of c.rows) if (!p.printed.has(r.line.amount.toFixed(2))) bad.push(`#${seed}: shows ${r.line.amount} (${r.line.label}), not on the paper\n${p.text}`);
      if (c.rows.some((r) => r.verdict === "wrong")) bad.push(`#${seed}: something called wrong\n${p.text}`);
      const checks = c.rows.filter((r) => r.verdict === "check");
      if (checks.length) bad.push(`#${seed}: asked about: ${checks.map((r) => `${r.line.label}: ${r.note}`).join(" | ")}\n${p.text}`);
      const removes = c.rows.filter((r) => r.verdict === "remove").length;
      if (p.problem === "addOn" ? removes !== 1 : removes) bad.push(`#${seed} (${p.problem}): ${removes} to remove\n${p.text}`);
    }
    expect(bad.slice(0, 6), `${bad.length} problems\n\n${bad.slice(0, 6).join("\n\n")}`).toEqual([]);
  });
});

describe("generated paper pairs: what changed since the last paper (seeded)", () => {
  // The same deal in other words and another layout must show no change; one thing slipped in or raised must show
  // exactly that one thing, as worse for the buyer.
  const NAMES: Record<string, string[]> = {
    price: ["Vehicle Price", "Selling Price", "Cash Price of Vehicle", "Sale Price"],
    doc: ["Doc Fee", "Documentation Fee", "Documentary Fee", "Dealer Documentary Fee"],
    gov: ["Title & Registration", "DMV Fees", "Title/Reg Fees", "License and Title"],
    tax: ["Sales Tax", "State Sales Tax", "Tax"],
    total: ["Total Price", "Total", "Out the Door Price"],
    etch: ["VIN Etch", "VIN Etching", "Etching", "Theft Etch"],
    nitro: ["Nitrogen", "Nitrogen Tire Fill", "Nitro-Fill"],
    discount: ["Dealer Discount", "Discount", "Internet Savings"],
  };
  const LAYOUTS = [(l: string, a: string) => `${l} .......... ${a}`, (l: string, a: string) => `${l}: ${a}`, (l: string, a: string) => `${l.toUpperCase()}    ${a}`, (l: string, a: string) => `${l}\t${a}`];
  const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  it("rewording and re-laying-out show no change; one slipped-in or raised line shows exactly that", () => {
    const bad: string[] = [];
    for (let seed = 7001; seed <= 7300; seed++) {
      const rand = rng(seed);
      const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
      const price = Math.round(15000 + rand() * 25000);
      const doc = pick([299, 499, 699]);
      const gov = Math.round((80 + rand() * 300) * 100) / 100;
      const discount = rand() < 0.4 ? pick([500, 1000]) : 0;
      const addOns: [string, number][] = rand() < 0.5 ? [["etch", 399], ["nitro", 199]].slice(0, pick([1, 2])) as [string, number][] : [];
      const change = pick(["none", "none", "product", "price", "discountGone", "addOnRaised"] as const);
      const paper = (final: boolean) => {
        const name = (k: string) => pick(NAMES[k]);
        const lay = pick(LAYOUTS);
        const p2 = final && change === "price" ? price + 500 : price;
        const d2 = final && change === "discountGone" ? 0 : discount;
        const extras = addOns.map(([k, a], i) => [name(k), final && change === "addOnRaised" && i === 0 ? a + 200 : a] as [string, number]);
        const product: [string, number][] = final && change === "product" ? [["Service Contract", 2495]] : [];
        const taxBase = p2 - d2 + doc + extras.reduce((s, e) => s + e[1], 0);
        const tax = Math.round(taxBase * 0.06625 * 100) / 100;
        const total = Math.round((taxBase + gov + tax + product.reduce((s, e) => s + e[1], 0)) * 100) / 100;
        const rows: [string, number][] = [[name("price"), p2], ...(d2 ? [[name("discount"), d2] as [string, number]] : []), [name("doc"), doc], ...extras, ...product, [name("gov"), gov], [name("tax"), tax], [name("total"), total]];
        return rows.map(([l, a]) => lay(l, money(a))).join("\n");
      };
      const snap = (text: string, at: string) => {
        const sheet = parseDealSheet(text);
        return snapshot(sheet, checkDealSheet({ sheet, ad: null, state: "NJ", modelYear: 2021, now: new Date("2026-11-15") }), { car: null, from: "test", at: new Date(at) });
      };
      const before = paper(false);
      const after = paper(true);
      const d = diffPapers(snap(before, "2026-11-14T10:00:00Z"), snap(after, "2026-11-14T12:00:00Z"));
      // Tax moves with any change to what's taxed; it's never counted as worse, so only the other lines are compared.
      const changes = d.changes.filter((c) => (c.type === "changed" ? c.kind : c.line.kind) !== "tax");
      // (Raising an add-on or dropping a discount changes nothing on a paper without one.)
      const want = change === "none" || (change === "addOnRaised" && !addOns.length) || (change === "discountGone" && !discount) ? 0 : 1;
      if (changes.length !== want || d.worse.length !== want) {
        bad.push(`#${seed} (${change}): ${JSON.stringify(changes)} worse ${d.worse.length}\n--- before\n${before}\n--- after\n${after}`);
      }
    }
    expect(bad.slice(0, 5), `${bad.length} problems\n\n${bad.slice(0, 5).join("\n\n")}`).toEqual([]);
  });
});
