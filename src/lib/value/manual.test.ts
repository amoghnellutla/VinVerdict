import { describe, expect, it } from "vitest";
import { compareManually, parsePrice } from "./manual";

describe("compareManually", () => {
  it("needs an asking price and at least two plausible prices", () => {
    expect(compareManually(null, [9000, 9500])).toBeNull();
    expect(compareManually(9000, [9500])).toBeNull();
    expect(compareManually(9000, [9500, 12, null])).toBeNull();
  });

  it("compares with the median and says how rough it is", () => {
    expect(compareManually(7000, [9000, 9500, 10000])).toMatchObject({ n: 3, median: 9500, low: 9000, high: 10000, verdict: "far-below", confidence: "rough" });
    expect(compareManually(9400, [9000, 10000])).toMatchObject({ median: 9500, verdict: "in-line", confidence: "very rough" });
    expect(compareManually(11000, [9000, 9500, 10000, 10200, 9800])).toMatchObject({ verdict: "above", confidence: "fair" });
    expect(compareManually(8500, [9000, 9500, 10000])!.verdict).toBe("below");
  });

  it("reads prices the way people type them", () => {
    expect(parsePrice("$9,500")).toBe(9500);
    expect(parsePrice("9.5k")).toBe(9500);
    expect(parsePrice(" 12000 ")).toBe(12000);
    expect(parsePrice("call me")).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});
