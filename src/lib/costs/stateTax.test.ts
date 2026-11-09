import { describe, expect, it } from "vitest";
import { STATES, type StateCode } from "@/lib/geo/zip";
import { STATE_TAX, vehicleTax, type TaxInput } from "./stateTax";

const NOW = new Date("2026-11-08T12:00:00Z");
const base = (o: Partial<TaxInput> = {}): TaxInput => ({ taxable: 20000, price: 20000, seller: "dealer", modelYear: 2018, localPct: 0, now: NOW, ...o });
const total = (st: StateCode, o: Partial<TaxInput> = {}) => vehicleTax(st, base(o)).lines.reduce((s, l) => s + l.amount, 0);

describe("STATE_TAX", () => {
  it("has a rule with https sources for every state + DC", () => {
    for (const st of Object.keys(STATES) as StateCode[]) {
      const r = STATE_TAX[st];
      expect(r, st).toBeDefined();
      expect(r.source.startsWith("https://"), st).toBe(true);
      expect(r.dmv.startsWith("https://"), st).toBe(true);
      expect(Number.isFinite(total(st)), st).toBe(true);
    }
  });

  it("flat state rates on $20,000", () => {
    expect(total("NJ")).toBe(1325);
    expect(total("TX")).toBe(1250);
    expect(total("NY")).toBe(800);
    expect(total("NC")).toBe(600);
    expect(total("CA")).toBe(1450);
    expect(total("MN")).toBe(1375);
    expect(total("MD")).toBe(1300);
    expect(total("DE")).toBe(1050);
  });

  it("no-tax states", () => {
    for (const st of ["MT", "NH", "OR", "AK"] as const) expect(total(st), st).toBe(0);
  });

  it("adds the local rate the buyer typed, capped where the state caps it", () => {
    expect(total("NY", { localPct: 4.875 })).toBe(1775); // 4% + 4.875%
    expect(total("FL", { localPct: 1 })).toBe(1250); // 1200 + 1% of first 5,000
    expect(total("NJ", { localPct: 5 })).toBe(1325); // NJ has no local car tax
    expect(vehicleTax("FL", base({ localPct: 1 })).lines[1].label).toBe("County surtax (1%)");
    expect(vehicleTax("NY", base({ localPct: 4.875 })).lines[1].label).toBe("City/county tax (4.875%)");
  });

  it("caps and minimums", () => {
    expect(total("SC")).toBe(500);
    expect(total("SC", { taxable: 5000, price: 5000 })).toBe(250);
    expect(total("VA", { taxable: 1000, price: 1000 })).toBe(75);
    expect(total("CT", { taxable: 60000, price: 60000 })).toBe(4650);
    expect(total("CT", { taxable: 50000, price: 50000 })).toBe(3175);
  });

  it("private-party exemptions", () => {
    expect(total("AZ", { seller: "private" })).toBe(0);
    expect(total("NV", { seller: "private" })).toBe(0);
    expect(total("HI", { seller: "private" })).toBe(0);
    expect(total("AZ")).toBe(1120);
    expect(total("MS", { seller: "private", modelYear: 2015 })).toBe(0);
    expect(total("MS", { seller: "private", modelYear: 2020 })).toBe(1000);
  });

  it("Arkansas used-car tiers", () => {
    expect(total("AR", { taxable: 3500 })).toBe(0);
    expect(total("AR", { taxable: 8000 })).toBe(280);
    expect(total("AR", { taxable: 12000 })).toBe(780);
  });

  it("Illinois private sales use the RUT-50 tables", () => {
    expect(total("IL", { seller: "private", taxable: 9000, modelYear: 2023 })).toBe(290); // age 3
    expect(total("IL", { seller: "private", taxable: 9000, modelYear: 2010 })).toBe(100); // 11+
    expect(total("IL", { seller: "private", taxable: 22000 })).toBe(1100);
    expect(total("IL", { seller: "dealer", taxable: 22000 })).toBe(1375);
  });

  it("Tennessee single-article tax and the $1,600 local cap", () => {
    // 7% of 20,000 + 2.75% of 1,600 + 2.25% of 1,600
    expect(total("TN", { localPct: 2.25 })).toBe(1400 + 44 + 36);
  });

  it("Minnesota $10 tax for cheap old cars", () => {
    expect(total("MN", { taxable: 2500, modelYear: 2014 })).toBe(10);
    expect(total("MN", { taxable: 2500, modelYear: 2020 })).toBe(171.88);
  });

  it("Oklahoma excise + sales tax", () => {
    expect(total("OK", { taxable: 10000 })).toBe(20 + 276.25 + 125);
  });

  it("Washington adds the 0.5% motor vehicle tax", () => {
    expect(total("WA", { localPct: 3.6 })).toBe(1300 + 100 + 720);
  });

  it("DC needs the excise rate typed in", () => {
    expect(total("DC")).toBe(0);
    expect(total("DC", { localPct: 6 })).toBe(1200);
  });
});
