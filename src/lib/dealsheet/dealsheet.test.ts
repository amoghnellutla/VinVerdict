import { describe, expect, it } from "vitest";
import { checkDealSheet } from "./check";
import { checkPayment, monthlyPayment, savingAtRate, totalInterest } from "./loan";
import { negotiationPlan } from "./negotiate";
import { classify, parseDealSheet } from "./parse";
import { redactDealSheet } from "./redact";

describe("loan math", () => {
  it("matches standard amortization values", () => {
    expect(monthlyPayment(20_000, 6, 60)).toBe(386.66);
    expect(monthlyPayment(25_000, 7, 72)).toBe(426.23); // 426.225 exactly
    expect(monthlyPayment(12_000, 0, 48)).toBe(250);
    expect(totalInterest(20_000, 6, 60)).toBe(3199.6);
  });

  it("allows rounding but catches a packed payment", () => {
    expect(checkPayment(20_000, 6, 60, 388).ok).toBe(true);
    const packed = checkPayment(20_000, 6, 60, 423.66);
    expect(packed.ok).toBe(false);
    expect(packed.diff).toBe(37);
    expect(packed.overLoan).toBe(2220);
  });

  it("prices a lower rate", () => {
    expect(savingAtRate(20_000, 11.9, 72, 6.5)).toBeGreaterThan(3_500);
    expect(savingAtRate(20_000, 6, 72, 6)).toBe(0);
  });
});

describe("the buyer's details come out first", () => {
  it("removes labelled personal lines, SSNs, phones and emails, and keeps money lines that look similar", () => {
    const paper = [
      "Buyer: Pat Example",
      "Co-Buyer Name: Sam Example",
      "Address: 12 Sample St, Anytown NJ 07000",
      "Driver's License #: S1234 56789 01234",
      "DOB: 01/02/1990",
      "SSN 123-45-6789",
      "Cell Phone: (555) 555-0123",
      "Email: pat@example.com",
      "Customer Cash: $2,000.00",
      "City Tax $120.00",
      "Vehicle Price $21,998.00",
    ].join("\n");
    const out = redactDealSheet(paper).text;
    for (const secret of ["Pat Example", "Sam Example", "12 Sample St", "S1234", "01/02/1990", "123-45-6789", "555-0123", "pat@example.com"]) expect(out).not.toContain(secret);
    expect(out).toContain("Customer Cash: $2,000.00");
    expect(out).toContain("City Tax $120.00");
    expect(out).toContain("Vehicle Price $21,998.00");
  });
});

describe("what each line is", () => {
  it.each([
    ["VIN Etch", "addOn"], ["Nitrogen Filled Tires", "addOn"], ["Paint & Fabric Protection", "addOn"], ["Market Adjustment", "addOn"],
    ["Vehicle Service Contract", "loanProduct"], ["GAP Protection", "loanProduct"], ["Tire & Wheel Protection", "loanProduct"],
    ["Documentary Fee", "docFee"], ["Dealer Prep", "dealerFee"], ["Reconditioning Fee", "dealerFee"],
    ["Title & Registration", "stateFee"], ["State Sales Tax 6.25%", "tax"], ["Trade-In Allowance", "tradeIn"], ["Payoff on Trade", "payoff"],
    ["Total of Payments", "loan"], ["Amount Financed", "amountFinanced"], ["Total Price", "total"], ["Selling Price", "price"], ["Kelley Blue Book Value", "reference"],
  ])("%s → %s", (label, kind) => {
    expect(classify(label).kind).toBe(kind);
  });

  it("doesn't take a mileage, a monthly figure or a year for money", () => {
    const s = parseDealSheet("YEAR 2019 MILES 41,233\nPayments around $512/mo for 72 months\nSelling Price $18,495.00");
    expect(s.lines.map((l) => [l.kind, l.amount])).toEqual([["price", 18495]]);
  });
});

describe("the negotiation plan", () => {
  const paper = "Vehicle Price $21,998.00\nDoc Fee $799.00\nVIN Etching $399.00\nNitrogen $199.00\nTitle & Registration $310.00\nSales Tax $1,549.92\nTotal Price $25,254.92";
  const ad = { price: 21298, docFee: 799, sellerType: "dealer" as const };

  it("aims for the advertised price, the ad's fee, government fees and tax, with every add-on refused", () => {
    const sheet = parseDealSheet(paper);
    const check = checkDealSheet({ sheet, ad, state: "NJ", modelYear: 2021, now: new Date("2026-11-14") });
    expect(check.confirmed).toBe(true);
    expect(check.rows.find((r) => r.line.kind === "tax")?.verdict).toBe("right");
    const plan = negotiationPlan({ sheet, check, ad, state: "NJ", modelYear: 2021, car: "2021 Toyota RAV4", now: new Date("2026-11-14") });
    // 21,298 + 799 + 310 + 6.625% of (21,298 + 799)
    expect(plan.target).toBe(Math.round((21298 + 799 + 310 + 22097 * 0.06625) * 100) / 100);
    expect(plan.message).toContain("advertised at $21,298");
    expect(plan.message).toContain("VIN etching ($399)");
    expect(plan.message).toContain("Nitrogen tires ($199)");
    expect(plan.steps[0]).toMatch(/out-the-door price first/);
  });

  it("without a tax it can check, it says 'plus tax' instead of a number", () => {
    const sheet = parseDealSheet("Vehicle Price $21,298.00\nDoc Fee $799.00\nSales Tax $2,000.00\nTotal $24,097.00");
    const check = checkDealSheet({ sheet, ad, state: "NJ", modelYear: 2021 });
    expect(check.rows.find((r) => r.line.kind === "tax")?.verdict).toBe("check");
    const plan = negotiationPlan({ sheet, check, ad, state: "NJ", modelYear: 2021 });
    expect(plan.plusTax).toBe(true);
    expect(plan.message).toContain("plus tax");
  });
});

describe("PDF text back into lines", async () => {
  const { linesFromPieces } = await import("./pdf-lines");
  it("joins pieces at the same height, left to right, with a gap between columns", () => {
    const lines = linesFromPieces([
      { str: "$799.00", x: 400, y: 680, width: 40, height: 10 },
      { str: "Doc", x: 50, y: 680.5, width: 18, height: 10 },
      { str: "Fee", x: 70, y: 680, width: 16, height: 10 },
      { str: "Vehicle Price", x: 50, y: 700, width: 60, height: 10 },
      { str: "$21,998.00", x: 400, y: 700.4, width: 50, height: 10 },
    ]);
    expect(lines).toEqual(["Vehicle Price    $21,998.00", "Doc Fee    $799.00"]);
    const sheet = parseDealSheet(lines.join("\n"));
    expect(sheet.lines.map((l) => [l.kind, l.amount])).toEqual([["price", 21998], ["docFee", 799]]);
  });
});

describe("a misread payment is never stated as fact", () => {
  it("when the payment and the paper's total of payments disagree, the loan is 'check this', with both numbers", () => {
    const paper = "Vehicle Price $21,998.00\nTotal Price $21,998.00\nAmount Financed $21,998.00\nAnnual Percentage Rate 7.90%\nTerm 72 months\nMonthly Payment $450.00\nTotal of Payments $32,414.40";
    const c = checkDealSheet({ sheet: parseDealSheet(paper), ad: null, state: null, modelYear: 2021 });
    expect(c.loan?.verdict).toBe("check");
    expect(c.loan?.note).toContain("$450.00");
    expect(c.loan?.note).toContain("$450.20 a month");
    expect(c.hidden.some((h) => h.what.startsWith("Payment"))).toBe(false);
  });
});

describe("OCR repairs on dealer papers", () => {
  it("reads '$26 635.71' and '$21.998.00' as thousands", () => {
    const s = parseDealSheet("Total Price $26 635.71\nVehicle Price $21.998.00");
    expect(s.lines.map((l) => [l.kind, l.amount])).toEqual([["total", 26635.71], ["price", 21998]]);
  });
});

describe("doc fee above a state's legal maximum", () => {
  it("New York caps it at $175: a confirmed $399 fee is $224 over, with the DMV's page linked", () => {
    const paper = "Vehicle Price $22,000.00\nDocumentation Fee $399.00\nDMV Fees $175.00\nTotal Price $22,574.00";
    const c = checkDealSheet({ sheet: parseDealSheet(paper), ad: { price: 22000, docFee: null, sellerType: "dealer" }, state: "NY", modelYear: 2021 });
    const row = c.rows.find((r) => r.line.kind === "docFee")!;
    expect(row.verdict).toBe("wrong");
    expect(row.note).toContain("$224 more than New York's legal maximum of $175");
    expect(row.source?.href).toContain("dmv.ny.gov");
    expect(c.hidden.some((h) => h.amount === 224)).toBe(true);
  });

  it("no cap is applied in a state whose cap isn't confirmed, and a fee within the cap is fine", () => {
    const paper = "Vehicle Price $22,000.00\nDocumentation Fee $175.00\nTotal Price $22,175.00";
    const ny = checkDealSheet({ sheet: parseDealSheet(paper), ad: null, state: "NY", modelYear: 2021 });
    expect(ny.rows.find((r) => r.line.kind === "docFee")?.verdict).not.toBe("wrong");
    const ca = checkDealSheet({ sheet: parseDealSheet(paper.replace("$175.00", "$399.00").replace("$22,175.00", "$22,399.00")), ad: null, state: "CA", modelYear: 2021 });
    expect(ca.rows.find((r) => r.line.kind === "docFee")?.verdict).toBe("check");
  });

  it("Maryland caps it at $800; Minnesota at $350 or 10% of the sale, whichever is less", () => {
    const md = checkDealSheet({ sheet: parseDealSheet("Vehicle Price $18,000.00\nDealer Processing Charge $899.00\nTotal Price $18,899.00"), ad: null, state: "MD", modelYear: 2020 });
    expect(md.rows.find((r) => r.line.kind === "docFee")?.note).toContain("$99 more than Maryland's legal maximum of $800");
    // A $2,500 car: 10% is $250, less than $350.
    const mn = checkDealSheet({ sheet: parseDealSheet("Vehicle Price $2,500.00\nDocumentary Fee $350.00\nTotal Price $2,850.00"), ad: null, state: "MN", modelYear: 2012 });
    const row = mn.rows.find((r) => r.line.kind === "docFee")!;
    expect(row.verdict).toBe("wrong");
    expect(row.note).toContain("$100 more than Minnesota's legal maximum of $250 (10% of the sale)");
    // A $20,000 car: $350 is the cap, and $350 is fine.
    const ok = checkDealSheet({ sheet: parseDealSheet("Vehicle Price $20,000.00\nDocumentary Fee $350.00\nTotal Price $20,350.00"), ad: null, state: "MN", modelYear: 2021 });
    expect(ok.rows.find((r) => r.line.kind === "docFee")?.verdict).not.toBe("wrong");
  });
});

describe("the example paper on /deal", () => {
  it("adds up, and shows the usual problems: over the ad, three add-ons, a packed payment", async () => {
    const { EXAMPLE_AD, EXAMPLE_PAPER, EXAMPLE_STATE } = await import("./example");
    const sheet = parseDealSheet(EXAMPLE_PAPER);
    const c = checkDealSheet({ sheet, ad: { ...EXAMPLE_AD, sellerType: "dealer" }, state: EXAMPLE_STATE, modelYear: 2021 });
    expect(c.confirmed).toBe(true);
    expect(c.rows.find((r) => r.line.kind === "tax")?.verdict).toBe("right");
    expect(c.rows.filter((r) => r.verdict === "remove")).toHaveLength(3);
    expect(c.loan?.verdict).toBe("wrong");
    expect(Math.round(c.hiddenTotal)).toBe(5253);
  });
});
