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
    const old = ownershipCost({ ...base, years: 10, perModelYear: 3_000, perMile: -0.2 });
    expect(old.resale).toBe(Math.round(10_500 * 0.15));
  });

  it("ignores a backwards fit and leaves running costs out when unknown", () => {
    const o = ownershipCost({ ...base, running: null, perModelYear: -100, perMile: -0.05 });
    expect(o.method).toBe("typical");
    expect(o.running).toBeNull();
  });
});
