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
    // Government fees in short forms, never dealer padding.
    ["Reg Fee", "stateFee"], ["Lic & Reg", "stateFee"], ["Lic/Title", "stateFee"], ["TT&L", "stateFee"], ["Doc Stamps", "stateFee"], ["Lemon Law Fee", "stateFee"],
    ["License Fees", "stateFee"], ["BMV Fees", "stateFee"], ["Safety Inspection Fee", "stateFee"], ["Documentary Stamp Tax", "stateFee"],
    // Add-ons and loan products in the words of real addendums.
    ["Undercoating", "addOn"], ["Rustproofing", "addOn"], ["Clear Bra", "addOn"], ["Nitro-Fill", "addOn"], ["Dealer Addendum", "addOn"],
    ["Service Agreement", "loanProduct"], ["Platinum Warranty", "loanProduct"], ["Prepaid Maintenance", "loanProduct"], ["Tire Protection", "loanProduct"], ["Accident & Health", "loanProduct"],
    ["Dealer Handling", "docFee"], ["Doc & Handling", "docFee"],
    // Real contract and addendum wording.
    ["Prior Credit or Lease Balance paid by Seller", "payoff"], ["Paid to Public Officials", "stateFee"], ["Trade Difference", "subtotal"],
    ["Pre-Delivery Inspection Fee", "dealerFee"], ["Dealer Inspection Fee", "dealerFee"], ["PDI", "dealerFee"], ["State Inspection Fee", "stateFee"],
    ["Floor Mats", "addOn"], ["Remote Start", "addOn"], ["Spray-in Bedliner", "addOn"], ["Window Film", "addOn"], ["Ghost Immobilizer", "addOn"],
    ["Roadside Assistance", "addOn"], ["Paintless Dent Repair", "addOn"], ["Lifetime Powertrain", "loanProduct"], ["Oil Change Package", "loanProduct"],
    ["Vehicle Insurance", "loanProduct"], ["Deputy Service Fee", "dealerFee"],
  ])("%s → %s", (label, kind) => {
    expect(classify(label).kind).toBe(kind);
  });

  it("Toyota's Delivery, Processing and Handling Fee is its destination charge; a state emissions fee isn't a CPO fee", () => {
    expect(classify("Delivery, Processing and Handling Fee")).toEqual({ kind: "dealerFee", name: "Destination charge" });
    expect(classify("Destination & Handling")).toEqual({ kind: "dealerFee", name: "Destination charge" });
    expect(classify("State Emissions Certification Fee")).toEqual({ kind: "dealerFee", name: "Smog or emissions" });
    const paper = "Vehicle Price $31,000.00\nDelivery, Processing and Handling Fee $1,395.00\nAll-Weather Floor Liners $329.00\nVehicle Insurance $1,140.00\nTotal $33,864.00";
    const c = checkDealSheet({ sheet: parseDealSheet(paper), ad: { price: 32395, docFee: null, sellerType: "dealer" }, state: null, modelYear: 2026, condition: "new" });
    const v = Object.fromEntries(c.rows.map((r) => [r.line.label, r.verdict]));
    expect(v).toMatchObject({ "Vehicle Price": "right", "Delivery, Processing and Handling Fee": "check", "All-Weather Floor Liners": "check", "Vehicle Insurance": "check" });
    expect(c.hiddenTotal).toBe(0);
    const u = checkDealSheet({ sheet: parseDealSheet(paper), ad: { price: 31000, docFee: null, sellerType: "dealer" }, state: null, modelYear: 2021, condition: "used" });
    expect(Object.fromEntries(u.rows.map((r) => [r.line.label, r.verdict]))).toMatchObject({ "All-Weather Floor Liners": "remove", "Vehicle Insurance": "check" });
  });

  it("a fee it can't place, a smog fee or an e-filing fee is asked about, never refused", () => {
    const c = checkDealSheet({ sheet: parseDealSheet("Vehicle Price $20,000.00\nSmog Certification $50.00\nElectronic Filing Fee $35.00\nLemon Law Fee $5.00\nBattery Fee $8.00\nDealer Prep $499.00\nTotal $20,597.00"), ad: { price: 20000, docFee: null, sellerType: "dealer" }, state: "CA", modelYear: 2021 });
    const v = Object.fromEntries(c.rows.map((r) => [r.line.label, r.verdict]));
    expect(v).toMatchObject({ "Smog Certification": "check", "Electronic Filing Fee": "check", "Lemon Law Fee": "info", "Battery Fee": "check", "Dealer Prep": "remove" });
    expect(c.hiddenTotal).toBe(499);
    // The fees asked about stay in the target, and the message asks what they are.
    const sheet = parseDealSheet("Vehicle Price $20,000.00\nSmog Certification $50.00\nDealer Prep $499.00\nTotal $20,549.00");
    const ad = { price: 20000, docFee: null, sellerType: "dealer" as const };
    const plan = negotiationPlan({ sheet, check: checkDealSheet({ sheet, ad, state: null, modelYear: 2021 }), ad, state: null, modelYear: 2021 });
    expect(plan.target).toBe(20050);
    expect(plan.message).toContain("what the Smog Certification is for");
    expect(plan.message).toContain("Dealer Prep");
  });

  it("tax is matched however the state works it out: credits already in a selling price, before a rebate, with destination, less a trade-in", () => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const d = (n: number) => `$${r2(n).toFixed(2)}`;
    const tax = (paper: string, state: "NJ" | "TX", condition: "new" | "used" = "used") =>
      checkDealSheet({ sheet: parseDealSheet(paper), ad: null, state, modelYear: 2025, condition, now: new Date("2026-11-15") }).rows.find((r) => r.line.kind === "tax")!;
    expect(tax(`MSRP $32,900.00\nDealer Discount $1,500.00\nSelling Price $31,400.00\nDoc Fee $599.00\nSales Tax ${d((31400 + 599) * 0.06625)}`, "NJ").verdict).toBe("right");
    const tx = tax(`Selling Price $30,000.00\nManufacturer Rebate $2,000.00\nTrade Allowance $8,000.00\nDoc Fee $225.00\nSales Tax ${d((30000 - 8000) * 0.0625)}`, "TX");
    expect(tx.verdict).toBe("right");
    expect(tx.note).toContain("before the maker's rebate, less the trade-in");
    expect(tax(`Vehicle Price $32,900.00\nDestination $1,395.00\nNitrogen $199.00\nDoc Fee $599.00\nSales Tax ${d((32900 + 1395 + 599) * 0.06625)}`, "NJ", "new").note).toContain("plus the destination charge and doc fee");
    expect(tax(`Vehicle Price $30,000.00\nDealer Discount $1,000.00\nFactory Rebate $1,500.00\nDoc Fee $599.00\nSales Tax ${d((29000 + 599) * 0.06625)}`, "NJ").verdict).toBe("right");
  });

  it("the target's tax is worked out the way the paper's was (less the trade-in)", () => {
    const paper = "Selling Price $30,000.00\nTrade Allowance $8,000.00\nDoc Fee $225.00\nSales Tax $1,375.00\nTitle & Registration $93.00\nTotal $23,693.00";
    const sheet = parseDealSheet(paper);
    const ad = { price: 29000, docFee: 225, sellerType: "dealer" as const };
    const check = checkDealSheet({ sheet, ad, state: "TX", modelYear: 2021, now: new Date("2026-11-15") });
    expect(check.taxRule).toMatchObject({ lessTrade: true, withDoc: false });
    const plan = negotiationPlan({ sheet, check, ad, state: "TX", modelYear: 2021, now: new Date("2026-11-15") });
    expect(plan.parts.find((p) => p.label === "Tax")?.amount).toBe(1312.5);
  });

  it("a tax line that shows its base gives the tax, not the base", () => {
    for (const t of ["Sales Tax 6.625% of $23,000.00 $1,523.75", "Sales Tax (6.625% x $23,000.00) $1,523.75", "Sales Tax @ 6.625% on $23,000.00 $1,523.75"]) {
      const s = parseDealSheet(`Vehicle Price $23,000.00\n${t}\nTotal $24,523.75`);
      expect(s.lines.find((l) => l.kind === "tax")).toMatchObject({ amount: 1523.75, label: expect.stringMatching(/^Sales Tax/) });
      const c = checkDealSheet({ sheet: s, ad: { price: 23000, docFee: null, sellerType: "dealer" }, state: "NJ", modelYear: 2021 });
      expect(c.confirmed).toBe(true);
    }
  });

  it("a dash between the label and the amount isn't a minus; a minus sign touching it is", () => {
    const s = parseDealSheet("Vehicle Price - $23,000.00\nDoc Fee \u2013 $799.00\nTotal - $23,799.00");
    expect(s.lines.map((l) => l.amount)).toEqual([23000, 799, 23799]);
    expect(parseDealSheet("Amount Due \u2212$1,051.46").lines[0].amount).toBe(-1051.46);
    expect(parseDealSheet("Amount Due -$1,051.46").lines[0].amount).toBe(-1051.46);
    expect(parseDealSheet("Dealer Discount \u2212$1,000.00").lines[0].label).toBe("Dealer Discount");
  });

  it("list numbering and a currency word aren't part of the label", () => {
    expect(parseDealSheet("1. Vehicle Price $23,000.00\nB. Doc Fee $799.00\n(c) Title Fee $60.00\nTotal USD 23,859.00").lines.map((l) => l.label)).toEqual(["Vehicle Price", "Doc Fee", "Title Fee", "Total"]);
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
    expect(ca.rows.find((r) => r.line.kind === "docFee")?.verdict).not.toBe("wrong"); // no confirmed cap and no ad: never wrong
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

describe("the Truth-in-Lending box on a finance contract", () => {
  it("pairs the headings with the values row, in order, and reads the payment schedule table", async () => {
    const { tilaBox } = await import("./parse");
    const lines = [
      "ANNUAL PERCENTAGE RATE  FINANCE CHARGE  Amount Financed  Total of Payments  Total Sale Price",
      "The cost of your credit as a yearly rate.  The dollar amount the credit will cost you.  (and so on)",
      "7.90%  $8,778.69  $23,635.71  $32,414.40  $35,414.40",
      "Your Payment Schedule Will Be:",
      "Number of Payments  Amount of Payments  When Payments Are Due",
      "72  $450.20  Monthly beginning 12/15/2026",
      "Vehicle  $21,998.00",
    ];
    const box = tilaBox(lines);
    expect(box.loan).toEqual({ aprPct: 7.9, financeCharge: 8778.69, amountFinanced: 23635.71, totalOfPayments: 32414.4, months: 72, payment: 450.2 });
    expect([...box.skip].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    // The item lines are still read.
    expect(parseDealSheet(lines.join("\n")).lines.map((l) => [l.kind, l.amount])).toEqual([["price", 21998]]);
  });

  it("a tax included in the cash price in brackets is its own line, and the cash price is a subtotal", () => {
    const s = parseDealSheet("1. Cash Price (including $1,510.30 sales tax)  $24,307.30\n   Vehicle  $21,998.00\n   Documentary Fee  $799.00");
    expect(s.lines.map((l) => [l.kind, l.amount])).toEqual([["tax", 1510.3], ["subtotal", 24307.3], ["price", 21998], ["docFee", 799]]);
  });
});

describe("found by the generated papers", () => {
  it("a negative balance keeps its sign: 'Amount Due $-1,051.46' means the dealer owes the buyer", () => {
    const s = parseDealSheet("Cash Price of Vehicle $9,828.00\nTitle Fee $161.43\nSales Tax $651.11\nTotal Cash Price $10,640.54\nTrade-In Value $9,692.00\nCash Down $2,000.00\nAmount Due $-1,051.46");
    expect(s.lines.find((l) => l.kind === "balanceDue")?.amount).toBe(-1051.46);
    expect(checkDealSheet({ sheet: s, ad: null, state: null, modelYear: 2018 }).rows.find((r) => r.line.kind === "balanceDue")?.verdict).toBe("right");
  });

  it("in a flattened column, 'Down Payment / Amount Due' is never read as a payment amount", () => {
    const paper = ["ITEMIZATION", "Sale Price", "Down Payment", "Amount Due", "Amount Financed", "$17,605.00", "$2,000.00", "$15,605.00", "$15,605.00",
      "Annual Percentage Rate 9.99%", "Term 84 months", "Monthly Payment $258.98"].join("\n");
    const s = parseDealSheet(paper);
    expect(s.loan.payment).toBe(258.98);
    expect(s.loan.amountFinanced).toBe(15605);
  });
});
