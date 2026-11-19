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

  it("takes out personal details on a Spanish paper (accents or not), and keeps its money lines", () => {
    const paper = [
      "Comprador: María Ejemplo",
      "Co-comprador:     José Muestra",
      "Dirección: 45 Sample Ave, Fresno, CA 93701",
      "Teléfono: (559) 555-0144",
      "Correo electrónico: maria@example.com",
      "Licencia de conducir: D1234567",
      "Fecha de nacimiento: 02/03/1985",
      "Empleador: Ejemplo Farms",
      "VENDIDO A:",
      "ANA EJEMPLO",
      "Precio de contado del vehículo $19,995.00",
      "Pago inicial $3,000.00",
    ].join("\n");
    const out = redactDealSheet(paper).text;
    for (const secret of ["María", "Ejemplo", "José Muestra", "45 Sample Ave", "555-0144", "maria@example.com", "D1234567", "02/03/1985", "ANA EJEMPLO"]) expect(out, secret).not.toContain(secret);
    expect(out).toContain("Precio de contado del vehículo $19,995.00");
    expect(out).toContain("Pago inicial $3,000.00");
  });

  it("takes out personal details in columns, under headings, and in other forms' words", () => {
    const paper = [
      "Stock # 24689      Buyer: Pat Example",
      "Date: 11/15/2026\tCustomer Name: Lee Sample\tSalesperson: Chris",
      "Buyer Name and Address: Jordan Tester, 9 Elm Road, Anytown, NJ 07001",
      "SOLD TO:",
      "ALEX SAMPLE",
      "BUYER",
      "Morgan Example",
      "Co-Signer:     Casey Example",
      "Bank Account #: 000123456789   Routing #: 021000021",
      "Insurance Policy No: ABC-99887",
      "Employer: Acme Widgets",
      "Lessee: Robin Lessee-Name",
      "Co-Lessee:     Dana Example",
      "Mailing to 44 Oak Avenue Apt 3, Springfield, IL 62701",
      "Customer Cash: $2,000.00",
      "Owner Loyalty Rebate $500.00",
      "Vehicle Price $21,998.00      Doc Fee $799.00",
      "72 payments of $468.51",
    ].join("\n");
    const out = redactDealSheet(paper).text;
    for (const secret of ["Pat Example", "Lee Sample", "Jordan Tester", "9 Elm Road", "ALEX SAMPLE", "Morgan Example", "Casey Example", "000123456789", "021000021", "ABC-99887", "Acme Widgets", "Robin Lessee-Name", "Dana Example", "44 Oak Avenue", "Springfield, IL 62701", "07001"]) expect(out, secret).not.toContain(secret);
    for (const keep of ["Stock # 24689", "Salesperson: Chris", "Customer Cash: $2,000.00", "Owner Loyalty Rebate $500.00", "Vehicle Price $21,998.00      Doc Fee $799.00", "72 payments of $468.51"]) expect(out, keep).toContain(keep);
    // And the money still reads the same.
    expect(parseDealSheet(out).lines.map((l) => [l.kind, l.amount])).toEqual(parseDealSheet(paper.split("\n").slice(12).join("\n")).lines.map((l) => [l.kind, l.amount]));
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
    // A note in brackets doesn't override the words outside it (California's contract line).
    ["Cash Price (including any accessories, services and taxes)", "price"], ["Finance Cash", "rebate"], ["Document Preparation Fee", "docFee"],
    ["Lien Recording Fee", "stateFee"], ["Lien Fee", "stateFee"], ["Excess Wear and Use", "loanProduct"], ["Excess Wear & Tear Protection", "loanProduct"],
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

  it("a loan product's note names it plainly (no brackets inside brackets; GAP stays GAP)", () => {
    const c = checkDealSheet({ sheet: parseDealSheet("Vehicle Price $20,000.00\nService Contract $2,195.00\nGAP Protection $895.00"), ad: null, state: null, modelYear: 2021 });
    expect(c.rows[1].note).toMatch(/^Optional: service contract \(extended warranty\)\. /);
    expect(c.rows[2].note).toMatch(/^Optional: GAP\. /);
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

  it("loan terms written many ways are read, and a final payment is part of the math", () => {
    const head = "Vehicle Price $25,000.00\nAmount Financed $25,998.58\n";
    const loan = (t: string) => checkDealSheet({ sheet: parseDealSheet(head + t), ad: null, state: null, modelYear: 2021 }).loan;
    for (const t of [
      "Annual Percentage Rate 8.99%\nYour payment schedule will be: 71 payments of $468.51 monthly and 1 final payment of $469.10",
      "APR 8.99%\nNumber of Payments 71   Amount of Payments $468.51\n1 final payment $469.10",
      "APR: 8.990 %\nTerm: 72\nPayment: $468.51",
      "72 mo @ 8.99% = $468.51/mo",
      "Interest Rate 8.99 (simple)\nTerm 72 months\nMonthly Payment $468.51",
      "Payment $468.51 per month for 72 months at 8.99% APR",
      "APR 8.99%\nTerm 6 years\nMonthly Payment $468.51",
    ]) {
      const l = loan(t);
      expect(l?.verdict, t).toBe("right");
      expect(l?.months, t).toBe(72);
    }
    expect(loan("APR 8.99%\n71 payments of $468.51 and 1 final payment of $469.10")?.note).toContain("with a final payment of $469.10");
    // A balloon: the regular payment is checked with the balloon taken into account, never as a 71-month loan.
    const b = loan("APR 8.99%\n71 payments of $388.37 and a final balloon payment of $8,000.00");
    expect(b?.verdict).toBe("right");
    expect(b?.note).toContain("balloon payment of $8,000.00");
  });

  it("a payment to the lienholder or a down payment is never the monthly payment", () => {
    const s = parseDealSheet("Vehicle Price $25,000.00\nDown Payment $3,000.00\nPayment to ABC Bank (trade lien) $12,000.00\nAmount Financed $22,000.00\nAPR 7.9%\nTerm 60 months");
    expect(s.loan.payment).toBeNull();
    expect(checkDealSheet({ sheet: s, ad: null, state: null, modelYear: 2021 }).loan).toBeNull();
  });

  it("a lease disclosure with a rent charge and no money factor: the base payment is checked and the rate it implies is shown", () => {
    const paper = "Lease Agreement\nMonthly Payments: Your first monthly payment of $439.66 is due at signing, followed by 35 payments of $439.66\nAdjusted capitalized cost $34,450.00\nResidual value $21,870.00\nRent charge $2,264.40\nLease term 36 months\nBase monthly payment $412.34\nMonthly sales/use tax $27.32";
    const s = parseDealSheet(paper);
    expect(s.lines.some((l) => /followed by/.test(l.label))).toBe(false);
    // Beside another amount, "Due at Signing" is still a line.
    expect(parseDealSheet("Lease Worksheet\nMonthly Payment $489.00        Due at Signing $2,983.00").lines.map((l) => [l.label, l.amount])).toEqual([["Due at Signing", 2983]]);
    const c = checkDealSheet({ sheet: s, ad: null, state: "NJ", modelYear: 2026, now: new Date("2026-11-15") });
    expect(c.leaseMath?.verdict).toBe("right");
    expect(c.leaseMath?.note).toContain("money factor of about 0.001117 (about 2.68% as an interest rate)");
    // Padded: $25 a month more than the lease math is asked about.
    const padded = checkDealSheet({ sheet: parseDealSheet(paper.replace("Base monthly payment $412.34", "Base monthly payment $462.34")), ad: null, state: null, modelYear: 2026 });
    expect(padded.leaseMath?.verdict).toBe("check");
  });

  it("with local tax, the taxable amount that gives a real local rate is the one named (2.25%, not 2.452%)", () => {
    const paper = "Cash Price $18,450.00\nDoc Fee $85.00\nDealer Prep $395.00\nSales Tax $1,798.35\nReg Fee $212.00\nTotal $21,140.35";
    const c = checkDealSheet({ sheet: parseDealSheet(paper), ad: null, state: "CA", modelYear: 2020, now: new Date("2026-11-15") });
    const tax = c.rows.find((r) => r.line.kind === "tax")!;
    expect(tax.note).toContain("about 2.25% local tax on the price, plus the doc fee and other fees and add-ons");
  });

  it("a subtotal that the lines above add up to is confirmed (Texas Trade Difference)", () => {
    const paper = "MSRP $36,450.00\nFloor Liners $329.00\nSubtotal $36,779.00\nTrade Allowance $12,000.00\nTrade Difference $24,779.00\nSales Tax $1,548.69\nTotal $26,327.69";
    const c = checkDealSheet({ sheet: parseDealSheet(paper), ad: null, state: "TX", modelYear: 2026, condition: "new", now: new Date("2026-11-15") });
    expect(c.rows.find((r) => r.line.label === "Trade Difference")?.verdict).toBe("right");
    expect(c.rows.find((r) => r.line.label === "Subtotal")?.verdict).toBe("right");
  });

  it("the loan's principal is the Amount Financed line, never an unpaid balance printed before other charges", () => {
    const paper = "Cash Price $19,995.00\nDoc Fee $85.00\nTotal $20,080.00\nDown Payment $3,000.00\nUnpaid Balance $17,080.00\nService Contract $2,195.00\nAmount Financed $19,275.00\nAPR 9.49%\nTerm 60 months\nMonthly Payment $404.73";
    const c = checkDealSheet({ sheet: parseDealSheet(paper), ad: null, state: null, modelYear: 2019 });
    expect(c.loan?.principal).toBe(19275);
    expect(c.loan?.verdict).toBe("right");
  });

  it("a price that includes the doc fee is compared with the ad after taking the fee off; the fee isn't counted twice", () => {
    const ad = { price: 21298, docFee: 799, sellerType: "dealer" as const };
    for (const paper of [
      "Vehicle Price (includes $799 doc fee) $22,097.00\nSales Tax $1,463.93\nTitle & Registration $310.00\nTotal $23,870.93",
      "Vehicle Price $22,097.00 (doc fee of $799.00 included)\nSales Tax $1,463.93\nTitle & Registration $310.00\nTotal $23,870.93",
      "Selling Price incl. Doc Fee $22,097.00\nSales Tax $1,463.93\nTitle & Registration $310.00\nTotal $23,870.93",
    ]) {
      const sheet = parseDealSheet(paper);
      const c = checkDealSheet({ sheet, ad, state: "NJ", modelYear: 2021, now: new Date("2026-11-15") });
      expect(c.rows.filter((r) => r.verdict === "wrong"), paper).toEqual([]);
      expect(c.hiddenTotal, paper).toBe(0);
      expect(c.confirmed, paper).toBe(true);
      const price = c.rows.find((r) => r.line.kind === "price")!;
      expect(price.verdict, paper).toBe("right");
      expect(price.note, paper).toContain("once the $799 doc fee it includes is taken off");
      const plan0 = negotiationPlan({ sheet, check: c, ad, state: "NJ", modelYear: 2021, now: new Date("2026-11-15") });
      expect(plan0.message, paper).not.toContain("honor the advertised price");
      const plan = negotiationPlan({ sheet, check: c, ad, state: "NJ", modelYear: 2021, now: new Date("2026-11-15") });
      expect(plan.target, paper).toBe(23870.93);
    }
    // Over the ad by $300 with the fee inside: still found.
    const over = checkDealSheet({ sheet: parseDealSheet("Vehicle Price (includes $799 doc fee) $22,397.00\nTotal $22,397.00"), ad, state: null, modelYear: 2021 });
    expect(over.rows.find((r) => r.line.kind === "price")?.note).toContain("$300 more than the ad's price");
  });

  it("a note in brackets explains a line; the line's own amount is the one outside", () => {
    const one = (t: string) => parseDealSheet(t).lines.map((l) => [l.kind, l.amount]);
    expect(one("Trade-In Allowance (payoff $5,000.00) $8,000.00")).toEqual([["tradeIn", 8000]]);
    expect(one("Protection Package (VIN etch $299, nitrogen $199, wheel locks $89) $587.00")).toEqual([["addOn", 587]]);
    expect(one("Vehicle Price $21,998.00 (was $23,500.00)")).toEqual([["price", 21998]]);
    expect(one("Down Payment (cash $2,000 + rebate $1,000) $3,000.00")).toEqual([["downPayment", 3000]]);
    expect(one("Sales Tax (on $23,000.00) $1,523.75")).toEqual([["tax", 1523.75]]);
    expect(one("Doc Fee (max allowed by law $85) $85.00")).toEqual([["docFee", 85]]);
    // A negative amount in brackets is still an amount, and a note with no amount outside stays as it was.
    expect(one("Rebate ($1,000.00)")).toEqual([["rebate", 1000]]);
  });

  it("a worked line gives its result; equity beside a trade-in and payoff isn't a second credit; stray marks leave labels", () => {
    const one = (t: string) => parseDealSheet(t).lines.map((l) => [l.label, l.kind, l.amount]);
    expect(one("Vehicle Price $23,500.00 - $1,500.00 discount = $22,000.00")).toEqual([["Vehicle Price", "price", 22000]]);
    expect(one("Sales Tax 6.625% x $23,000.00 = $1,523.75")).toEqual([["Sales Tax 6.625%", "tax", 1523.75]]);
    expect(one("2 x Floor Mats @ $99.00 = $198.00")).toEqual([["2 x Floor Mats", "addOn", 198]]);
    expect(one("Trade-In: $8,000.00   Payoff: $5,000.00   Equity: $3,000.00")).toEqual([["Trade-In", "tradeIn", 8000], ["Payoff", "payoff", 5000], ["Equity", "subtotal", 3000]]);
    // "Net Trade" on its own is the credit.
    expect(one("Net Trade-In $3,000.00")).toEqual([["Net Trade-In", "tradeIn", 3000]]);
    expect(one("Rebate $1,000.00 / Loyalty $500.00").map((l) => l[0])).toEqual(["Rebate", "Loyalty"]);
    expect(one("Selling Price $22,000.00 -> Total $23,523.75").map((l) => l[0])).toEqual(["Selling Price", "Total"]);
    expect(one("Total Price = $23,523.75")).toEqual([["Total Price", "total", 23523.75]]);
  });

  it("a Total Savings line that repeats the discounts above it isn't a second credit", () => {
    const ad = { price: 27500, docFee: 499, sellerType: "dealer" as const };
    for (const paper of [
      "MSRP $30,000.00\nDealer Discount $1,500.00\nFactory Rebate $1,000.00\nTotal Savings $2,500.00\nSelling Price $27,500.00\nDoc Fee $499.00\nTotal $27,999.00",
      "Vehicle Price $30,000.00\nDealer Discount $1,500.00\nFactory Rebate $1,000.00\nYou Save $2,500.00\nDoc Fee $499.00\nTotal $27,999.00",
    ]) {
      const c = checkDealSheet({ sheet: parseDealSheet(paper), ad, state: null, modelYear: 2026, condition: "new" });
      expect(c.confirmed, paper).toBe(true);
      const price = c.rows.find((r) => r.line.kind === "price")!;
      expect(price.note, paper).toMatch(/^Matches/);
    }
    // On its own, "Total Savings" is the credit.
    expect(parseDealSheet("Vehicle Price $30,000.00\nTotal Savings $2,500.00").lines.map((l) => l.kind)).toEqual(["price", "discount"]);
  });

  it("a was, list or plain price beside a lower sale price is what it's marked down from", () => {
    const c = checkDealSheet({ sheet: parseDealSheet("Price: $21,998.00   Sale: $20,998.00\nDoc Fee $499.00\nTotal $21,497.00"), ad: { price: 20998, docFee: 499, sellerType: "dealer" }, state: null, modelYear: 2021 });
    expect(c.rows.find((r) => r.line.label === "Price")?.line.kind).toBe("reference");
    expect(c.rows.find((r) => r.line.label === "Sale")?.verdict).toBe("right");
    expect(c.confirmed).toBe(true);
  });

  it("tax in a state that taxes a value, or has no sales tax, gets the reason instead of a bare mismatch", () => {
    const tax = (state: "GA" | "OR", amount: string) =>
      checkDealSheet({ sheet: parseDealSheet(`Vehicle Price $20,000.00\nSales Tax $${amount}`), ad: null, state, modelYear: 2021 }).rows.find((r) => r.line.kind === "tax")!;
    expect(tax("GA", "1,400.00").verdict).toBe("right");
    const ga = tax("GA", "1,512.00");
    expect(ga.verdict).toBe("check");
    expect(ga.note).toContain("the state's own value for the car");
    const or = tax("OR", "1,200.00");
    expect(or.verdict).toBe("check");
    expect(or.note).toContain("Oregon has no sales tax on used cars");
  });

  it("an emailed quote in sentences: 'and MVC fees ($310)' is a line, and 'out the door: price 18,500' is the price", () => {
    const one = parseDealSheet("As discussed, $21,998 plus our $799 doc fee. Out the door that comes to $24,617.30 with NJ tax ($1,510.30) and MVC fees ($310).");
    // The $24,617.30 is the out-the-door total, never a doc fee; the $799 is the doc fee.
    expect(one.lines.map((l) => [l.kind, l.amount])).toEqual(expect.arrayContaining([["docFee", 799], ["total", 24617.3], ["tax", 1510.3], ["stateFee", 310]]));
    expect(one.lines.some((l) => l.kind === "docFee" && l.amount > 1000)).toBe(false);
    const two = parseDealSheet("Pat - here's your out the door: price 18,500, doc 499, tax 1,258.68, title/reg 166.50, total 20,424.18.");
    expect(two.lines.map((l) => [l.kind, l.amount])).toEqual([["price", 18500], ["docFee", 499], ["tax", 1258.68], ["stateFee", 166.5], ["total", 20424.18]]);
    const c = checkDealSheet({ sheet: two, ad: { price: 18500, docFee: null, sellerType: "dealer" }, state: "NJ", modelYear: 2021, now: new Date("2026-11-15") });
    expect(c.confirmed).toBe(true);
    expect(c.rows.find((r) => r.line.kind === "tax")?.verdict).toBe("right");
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

  it("money OCR and PDFs mangle is still read: no space before $, $ read as S, a doubled $, a comma for the cents point", () => {
    for (const t of [
      "Vehicle Price$21,998.00\nDoc Fee$799.00\nTotal$22,797.00",
      "Vehicle Price S21,998.00\nDoc Fee S799.00\nTotal S22,797.00",
      "Vehicle Price $$21,998.00\nDoc Fee $$799.00\nTotal $$22,797.00",
      "Vehicle Price $21,998,00\nDoc Fee $799,00\nTotal $22,797,00",
      "Vehicle Price: $21,998.00\nDoc Fee:$799.00\nTotal Price (OTD)$22,797.00",
    ]) expect(parseDealSheet(t).lines.map((l) => l.amount), t).toEqual([21998, 799, 22797]);
    // Words and plain numbers are untouched: "STOCK S1234", "Plan S2" and "$1,000" stay as they are.
    expect(parseDealSheet("Stock S1234\nPlan S2 $1,000.00").lines.map((l) => l.amount)).toEqual([1000]);
  });

  it("a dash whose gap was lost isn't a minus on a total; on a balance the paper's arithmetic decides", () => {
    const s = parseDealSheet("Vehicle Price - $21,998.00\nDoc Fee - $799.00\nTotal Cash Price -$22,797.00\nDown Payment - $2,000.00\nAmount Due -$20,797.00\nAmount Financed -$20,797.00");
    expect(s.lines.map((l) => l.amount)).toEqual([21998, 799, 22797, 2000, 20797, 20797]);
    // A real negative balance (the down payment was more than the price) stays negative.
    expect(parseDealSheet("Vehicle Price $1,000.00\nDown Payment $2,051.46\nAmount Due -$1,051.46").lines.at(-1)?.amount).toBe(-1051.46);
  });

  it("an emailed quote keeps a $85 doc fee and 'lic & reg', and never takes '3 year' for money", () => {
    expect(parseDealSheet("Hi, here's your quote: purchase price $ 10,138, doc fee $ 85, lic & reg $ 229.40, 3 year maintenance plan $ 1,295, total $ 11,747.40.").lines.map((l) => [l.kind, l.amount])).toEqual([["price", 10138], ["docFee", 85], ["stateFee", 229.4], ["loanProduct", 1295], ["total", 11747.4]]);
  });

  it("an emailed quote keeps a balance's minus sign (the dealer owes the buyer)", () => {
    const s = parseDealSheet("Hi, here's your quote: sale price $9,526.00, total $9,526.00, trade-in value $6,860.00, down payment $3,000.00, balance due $-334.00.");
    expect(s.lines.at(-1)).toMatchObject({ kind: "balanceDue", amount: -334 });
    expect(s.lines.find((l) => l.kind === "downPayment")?.amount).toBe(3000);
  });

  it("an emailed quote keeps its small amounts and TT&L", () => {
    expect(parseDealSheet("Thanks for coming in. The selling price is $26,426.00. The wheel locks is $89.00. The registration fee is $68.98. The tt&l is $280.47.").lines.map((l) => [l.kind, l.amount])).toEqual([["price", 26426], ["addOn", 89], ["stateFee", 68.98], ["stateFee", 280.47]]);
    expect(parseDealSheet("Hi, here's your quote: purchase price $10,648.00, doc fee $85.00, reg fee $61.52, total $10,794.52.").lines.map((l) => [l.kind, l.amount])).toEqual([["price", 10648], ["docFee", 85], ["stateFee", 61.52], ["total", 10794.52]]);
  });

  it("a comma read as a period is repaired at the end of a sentence and in whole dollars", () => {
    expect(parseDealSheet("The vehicle price is $9.780.00. The doc fee is $899.00. The total is $10.679.00.").lines.map((l) => l.amount)).toEqual([9780, 899, 10679]);
    expect(parseDealSheet("Hi, here's your quote: cash price $11.610, doc fee $699, total $12.309.").lines.map((l) => l.amount)).toEqual([11610, 699, 12309]);
  });

  it("a spreadsheet export reads: CSV (with a quoted label), tabs, and amounts before their labels", () => {
    const want = [21998, 799, 89, 22886];
    expect(parseDealSheet('Vehicle Price,21998.00\nDoc Fee,799.00\n"Wheel Locks, set of 4",89.00\nTotal,22886.00').lines.map((l) => l.amount)).toEqual(want);
    expect(parseDealSheet("Vehicle Price\t21998.00\nDoc Fee\t799.00\nWheel Locks\t89.00\nTotal\t22886.00").lines.map((l) => l.amount)).toEqual(want);
    expect(parseDealSheet("$21,998.00    Vehicle Price\n$799.00    Doc Fee\n$89.00    Wheel Locks\n$22,886.00    Total").lines.map((l) => l.amount)).toEqual(want);
  });

  it("list numbering and a currency word aren't part of the label", () => {
    expect(parseDealSheet("1. Vehicle Price $23,000.00\nB. Doc Fee $799.00\n(c) Title Fee $60.00\nTotal USD 23,859.00").lines.map((l) => l.label)).toEqual(["Vehicle Price", "Doc Fee", "Title Fee", "Total"]);
  });

  it("the paper's own reference numbers are never money: contract, lot, key tag, customer and licence numbers, weight", () => {
    const head = [
      "Deal # 10,234   Date 11/15/2026   Salesperson: Chris",
      "Contract No. 12,345",
      "Odometer: 41,233",
      "Lot 3,456   Key Tag 1,234",
      "Weight 3,370 lbs   Engine: 203 hp",
      "Customer # 55,123",
      "Dealer License # 1,234,567",
      "Trade VIN 1HGCV1F30LA012345  Trade Miles 88,412",
      "Dealer Invoice $20,100.00",
      "Vehicle Price $21,998.00",
      "Title & Tag 95.00",
      "Service Contract 2,895.00",
      "Grabado del VIN 399.00",
      "GAP Policy 895.00",
    ].join("\n");
    expect(parseDealSheet(head).lines.map((l) => [l.label, l.kind, l.amount])).toEqual([["Dealer Invoice", "reference", 20100], ["Vehicle Price", "price", 21998], ["Title & Tag", "stateFee", 95], ["Service Contract", "loanProduct", 2895], ["Grabado del VIN", "addOn", 399], ["GAP Policy", "loanProduct", 895]]);
  });

  it("a prepaid finance charge or loan origination fee is a line of the amount financed, asked about", () => {
    const paper = "Cash Price $20,000.00\nDoc Fee $499.00\nTotal Cash Price $20,499.00\nDown Payment $2,000.00\nUnpaid Balance $18,499.00\nPrepaid Finance Charge $395.00\nAmount Financed $18,894.00\nAPR 7.9%\nTerm 60 months\nMonthly Payment $382.20";
    const s = parseDealSheet(paper);
    expect(s.lines.find((l) => /prepaid/i.test(l.label))).toMatchObject({ kind: "dealerFee", name: "Loan fee", amount: 395 });
    expect(s.loan.financeCharge).toBeNull();
    const c = checkDealSheet({ sheet: s, ad: null, state: null, modelYear: 2021 });
    expect(c.rows.find((r) => r.line.label === "Amount Financed")?.verdict).toBe("right");
    expect(c.rows.find((r) => /prepaid/i.test(r.line.label))?.verdict).toBe("check");
    expect(c.loan?.verdict).toBe("right");
    expect(classify("Loan Origination Fee")).toEqual({ kind: "dealerFee", name: "Loan fee" });
  });

  it("a trade-in's ACV and over-allowance are how the allowance is made up, not more credit", () => {
    const c = checkDealSheet({ sheet: parseDealSheet("Vehicle Price $25,000.00\nTrade Allowance $10,000.00\nTrade ACV $8,500.00\nOver-Allowance $1,500.00\nDoc Fee $499.00\nTotal $15,499.00"), ad: { price: 25000, docFee: 499, sellerType: "dealer" }, state: null, modelYear: 2021 });
    expect(c.rows.map((r) => r.line.kind)).toEqual(["price", "tradeIn", "reference", "reference", "docFee", "total"]);
    expect(c.confirmed).toBe(true);
    expect(c.rows.some((r) => r.verdict === "check")).toBe(false);
    expect(parseDealSheet("Trade-In Actual Cash Value $8,500.00\nTrade Allowance $8,500.00").lines.map((l) => l.kind)).toEqual(["reference", "tradeIn"]);
  });

  it("a tick box decides whether a product was taken, not the words beside it", () => {
    const declined = (t: string) => parseDealSheet(t).lines[0].declined;
    expect(declined("GAP Protection  [X] Accept  [ ] Decline  $895.00")).toBe(false);
    expect(declined("GAP Protection  [ ] Accept  [X] Decline  $895.00")).toBe(true);
    expect(declined("Service Contract  ☒ Accept  ☐ Decline  $2,895.00")).toBe(false);
    expect(declined("Service Contract  ☐ Accept  ☒ Decline  $2,895.00")).toBe(true);
    expect(declined("Optional GAP: (X) Yes ( ) No $895.00")).toBe(false);
    expect(declined("Optional GAP: ( ) Yes (X) No $895.00")).toBe(true);
    expect(declined("Credit Life Insurance  Yes [X]  No [ ]  $412.00")).toBe(false);
    expect(declined("Service Contract ✓ Purchased $2,895.00")).toBe(false);
    // Without boxes, the words still decide.
    expect(declined("VIN Etch DECLINED $399.00")).toBe(true);
    expect(declined("Paint Protection $795.00 - declined by customer")).toBe(true);
    // An accepted product is something to refuse; a declined one isn't charged.
    const c = checkDealSheet({ sheet: parseDealSheet("Vehicle Price $20,000.00\nGAP Protection  [X] Accept  [ ] Decline  $895.00\nService Contract  [ ] Accept  [X] Decline  $2,895.00"), ad: null, state: null, modelYear: 2021 });
    expect(c.rows.map((r) => r.verdict)).toEqual(["info", "remove", "right"]);
    expect(c.hiddenTotal).toBe(895);
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
    const fl = checkDealSheet({ sheet: parseDealSheet(paper.replace("$175.00", "$999.00").replace("$22,175.00", "$22,999.00")), ad: null, state: "FL", modelYear: 2021 });
    expect(fl.rows.find((r) => r.line.kind === "docFee")?.verdict).not.toBe("wrong"); // no confirmed cap and no ad: never wrong
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

  it("California $85, Oregon $250 and Iowa $180, each with the lower limit or extra rule named", () => {
    const doc = (state: "CA" | "OR" | "IA", fee: string) =>
      checkDealSheet({ sheet: parseDealSheet(`Vehicle Price $20,000.00\nDocument Processing Charge $${fee}\nTotal Price $1.00`), ad: null, state, modelYear: 2021 }).rows.find((r) => r.line.kind === "docFee")!;
    const ca = doc("CA", "399.00");
    expect(ca.verdict).toBe("check"); // the total doesn't add up here, so the reading isn't confirmed: asked, not "wrong"
    expect(ca.note).toContain("$314 more than California's legal maximum of $85");
    expect(ca.source?.href).toContain("dmv.ca.gov");
    expect(doc("CA", "85.00").verdict).not.toMatch(/wrong|check/);
    expect(doc("OR", "250.00").verdict).not.toMatch(/wrong|check/);
    expect(doc("OR", "300.00").note).toContain("Oregon's legal maximum of $250");
    expect(doc("IA", "180.00").verdict).not.toMatch(/wrong|check/);
    const confirmed = checkDealSheet({ sheet: parseDealSheet("Vehicle Price $20,000.00\nDocumentary Fee $299.00\nTotal Price $20,299.00"), ad: null, state: "IA", modelYear: 2021 }).rows.find((r) => r.line.kind === "docFee")!;
    expect(confirmed.verdict).toBe("wrong");
    expect(confirmed.note).toContain("$119 more than Iowa's legal maximum of $180");
    expect(confirmed.note).toContain("included in the advertised price");
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
