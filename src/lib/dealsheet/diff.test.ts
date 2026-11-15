import { describe, expect, it } from "vitest";
import { checkDealSheet } from "./check";
import { diffPapers, parseSaved, snapshot } from "./diff";
import { monthlyPayment } from "./loan";
import { parseDealSheet } from "./parse";

const check = (text: string) => {
  const sheet = parseDealSheet(text);
  return { sheet, c: checkDealSheet({ sheet, ad: null, state: null, modelYear: 2021 }) };
};
const snap = (text: string, at: string) => {
  const { sheet, c } = check(text);
  return snapshot(sheet, c, { car: "2021 Toyota RAV4", from: "a paper", at: new Date(at) });
};

const ORDER = "Vehicle Price $22,000.00\nDoc Fee $699.00\nTitle & Registration $166.50\nTotal Price $22,865.50";
const FINAL = "Cash Price of Vehicle $22,000.00\nDocumentation Fee $699.00\nService Contract $2,895.00\nTitle & Registration $166.50\nTotal Price $25,760.50";

describe("what changed since the earlier paper", () => {
  it("finds a product slipped into the final contract, even when the other lines are worded differently", () => {
    const d = diffPapers(snap(ORDER, "2026-11-14T10:00:00Z"), snap(FINAL, "2026-11-14T12:00:00Z"));
    expect(d.changes).toEqual([{ type: "added", line: { label: "Service Contract", kind: "loanProduct", amount: 2895, declined: false } }]);
    expect(d.worse).toHaveLength(1);
    expect(d.total).toEqual({ from: 22865.5, to: 25760.5 });
  });

  it("a price that went up and a discount that went away are both flagged; a lower charge isn't", () => {
    const before = snap("Vehicle Price $22,000.00\nDealer Discount $500.00\nDoc Fee $699.00\nTotal Price $22,199.00", "2026-11-14T10:00:00Z");
    const after = snap("Vehicle Price $22,400.00\nDoc Fee $499.00\nTotal Price $22,899.00", "2026-11-14T12:00:00Z");
    const d = diffPapers(before, after);
    expect(d.worse.map((c) => c.type)).toEqual(["changed", "removed"]);
    expect(d.changes.find((c) => c.type === "changed" && c.kind === "docFee")).toBeTruthy();
    expect(d.worse.some((c) => c.type === "changed" && c.kind === "docFee")).toBe(false);
  });

  it("the same add-ons worded differently on the final paper aren't new, and a real new one still is", () => {
    const before = snap("Vehicle Price $22,000.00\nVIN Etch $399.00\nNitrogen $199.00\nDoc Fee $699.00\nTotal Price $23,297.00", "2026-11-14T10:00:00Z");
    const after = snap("Vehicle Price $22,000.00\nEtching $399.00\nNitro-Fill $199.00\nWindow Tint $499.00\nDoc Fee $699.00\nTotal Price $23,796.00", "2026-11-14T12:00:00Z");
    const d = diffPapers(before, after);
    expect(d.changes).toEqual([{ type: "added", line: { label: "Window Tint", kind: "addOn", amount: 499, declined: false } }]);
    // Renamed and repriced: still one line that changed, not one removed and one added.
    const raised = diffPapers(before, snap("Vehicle Price $22,000.00\nTheft Etch $599.00\nNitrogen $199.00\nDoc Fee $699.00\nTotal Price $23,497.00", "2026-11-14T12:00:00Z"));
    expect(raised.changes).toEqual([{ type: "changed", label: "Theft Etch", kind: "addOn", from: 399, to: 599 }]);
  });

  it("a paper kept before a wording was learned still lines up (an old dealer-fee reading of a government fee)", () => {
    const before = snap("Vehicle Price $22,000.00\nReg Fee $210.00\nTotal Price $22,210.00", "2026-11-14T10:00:00Z");
    const old = { ...before, lines: before.lines.map((l) => (l.label === "Reg Fee" ? { ...l, kind: "dealerFee" as const } : l)) };
    const after = snap("Vehicle Price $22,000.00\nReg Fee $210.00\nTotal Price $22,210.00", "2026-11-14T12:00:00Z");
    expect(diffPapers(old, after).changes).toEqual([]);
  });

  it("the same paper twice has no changes", () => {
    expect(diffPapers(snap(ORDER, "2026-11-14T10:00:00Z"), snap(ORDER, "2026-11-14T11:00:00Z")).changes).toEqual([]);
  });

  it("kept papers read back from the device are checked field by field", () => {
    const good = snap(ORDER, "2026-11-14T10:00:00Z");
    expect(parseSaved([good])).toEqual([good]);
    expect(parseSaved([{ ...good, at: "not a date" }, { id: "x", at: "2026-11-14T10:00:00Z", lines: [{ label: "<b>", kind: "hack", amount: 5 }] }, "junk"]))
      .toEqual([{ id: "x", at: "2026-11-14T10:00:00Z", car: null, from: "", lines: [], total: null, payment: null }]);
    expect(parseSaved("not a list")).toEqual([]);
  });
});

describe("what the extras cost inside the loan", () => {
  it("shows the payment without them and what they cost with interest", () => {
    const paper = "Vehicle Price $21,000.00\nVIN Etching $400.00\nGAP $1,000.00\nTotal Price $22,400.00\nAmount Financed $22,400.00\nAnnual Percentage Rate 7.9%\nTerm 72 months\n" +
      `Monthly Payment $${monthlyPayment(22400, 7.9, 72).toFixed(2)}\nTotal of Payments $${(monthlyPayment(22400, 7.9, 72) * 72).toFixed(2)}`;
    const { c } = check(paper);
    expect(c.loan?.verdict).toBe("right");
    expect(c.loan?.without?.amount).toBe(1400);
    expect(c.loan?.without?.payment).toBe(monthlyPayment(21000, 7.9, 72));
    expect(c.loan?.without?.drop).toBeCloseTo(monthlyPayment(22400, 7.9, 72) - monthlyPayment(21000, 7.9, 72), 2);
    expect(c.loan?.without?.withInterest).toBeGreaterThan(1400);
  });
});

describe("the lease payment", () => {
  const lease = (payment: string) => `LEASE WORKSHEET\nVehicle Selling Price $31,450.00\nAdjusted Capitalized Cost $30,644.00\nResidual Value $18,241.00\nMoney Factor .00210\nTerm 36 months\nMonthly Payment ${payment}`;

  it("matches the lease math before tax: right", () => {
    expect(check(lease("$447.19")).c.leaseMath?.verdict).toBe("right");
  });
  it("a few percent more may be tax on the payment: said, not judged", () => {
    const m = check(lease("$489.00")).c.leaseMath!;
    expect(m.verdict).toBe("info");
    expect(m.base).toBe(447.19);
    expect(m.note).toContain("9.3% more"); // 489 / 447.19 = 1.0935
  });
  it("far more than tax would add: check what's in the payment, never 'wrong'", () => {
    const m = check(lease("$560.00")).c.leaseMath!;
    expect(m.verdict).toBe("check");
    expect(check(lease("$560.00")).c.loan).toBeNull();
  });
});

describe("money hidden in the payment isn't counted twice", () => {
  it("the payment-without line covers the lines to take off only, against the loan math's payment", () => {
    const principal = 23635.71;
    const paper = [
      "Vehicle Price $21,998.00", "VIN Etching $399.00", "Nitrogen $199.00", "Paint & Fabric Protection $1,295.00", "Total Price $23,891.00",
      "Amount Financed $23,635.71", "Annual Percentage Rate 7.9%", "Term 72 months", "Monthly Payment $450.20", "Total of Payments $32,414.40",
    ].join("\n");
    const { c } = check(paper);
    expect(c.loan?.verdict).toBe("wrong");
    expect(c.loan?.without?.amount).toBe(1893);
    expect(c.loan?.without?.drop).toBeCloseTo(monthlyPayment(principal, 7.9, 72) - monthlyPayment(principal - 1893, 7.9, 72), 2);
  });
});
