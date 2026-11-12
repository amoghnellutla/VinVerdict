import { describe, expect, it } from "vitest";
import { ownershipCost } from "./ownership";

const base = { price: 10_000, taxAndFees: 900, years: 3, milesPerYear: 12_000, running: 2_500, marketValue: 10_500 };

describe("ownershipCost", () => {
  it("uses local sales to estimate value lost per year", () => {
    const o = ownershipCost({ ...base, perModelYear: 800, perMile: -0.05 });
    // loss/year = 800 + 0.05 × 12,000 = 1,400 → resale 10,500 − 4,200 = 6,300
    expect(o.method).toBe("local-sales");
    expect(o.resale).toBe(6_300);
    expect(o.lostPerYear).toBe(Math.round((10_000 - 6_300) / 3));
    expect(o.perYear).toBe(Math.round((10_000 - 6_300) / 3 + 300 + 2_500));
    expect(o.perMonth).toBe(Math.round(o.perYear / 12));
  });

  it("falls back to a typical decline without comps, and never goes below the floor", () => {
    const o = ownershipCost({ ...base, perModelYear: null, perMile: null });
    expect(o.method).toBe("typical");
    expect(o.resale).toBe(Math.round(10_500 * 0.88 ** 3));
    // Ten years at 1,080 a year (within 1.5× of typical) would go below zero: the floor holds.
    const old = ownershipCost({ ...base, years: 10, perModelYear: 600, perMile: -0.04 });
    expect(old.method).toBe("local-sales");
    expect(old.resale).toBe(Math.round(10_500 * 0.15));
  });

  it("doesn't trust a comps fit far from a typical decline (case 32: a 2020 Camry 'worth $7,535' in 3 years)", () => {
    const o = ownershipCost({ ...base, price: 20_167, marketValue: 16_700, perModelYear: 1_600, perMile: -0.121 });
    expect(o.compsUnusual).toBe(true);
    expect(o.method).toBe("typical");
    expect(o.resale).toBe(Math.round(16_700 * 0.88 ** 3));
    expect(ownershipCost({ ...base, perModelYear: 800, perMile: -0.05 }).compsUnusual).toBe(false);
  });

  it("ignores a backwards fit and leaves running costs out when unknown", () => {
    const o = ownershipCost({ ...base, running: null, perModelYear: -100, perMile: -0.05 });
    expect(o.method).toBe("typical");
    expect(o.running).toBeNull();
  });
});
