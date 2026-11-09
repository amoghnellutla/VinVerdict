import { describe, expect, it } from "vitest";
import { checkVin, isVinFormat, normalizeVin, vinCheckDigit, vinModelYears } from "./vin";

// Same synthetic VIN as tools/probe_nhtsa.py; NHTSA confirmed its check digit.
const GOOD = "1HGCR2F8XHA000123";

describe("vin", () => {
  it("normalizes spacing, dashes and case", () => {
    expect(normalizeVin(" 1hgcr2f8x-ha000123 ")).toBe(GOOD);
  });

  it("rejects I, O, Q and wrong lengths", () => {
    expect(isVinFormat(GOOD)).toBe(true);
    expect(isVinFormat("1HGCR2F8XHA00012")).toBe(false);
    expect(isVinFormat("1HGCR2F8XHA00012O")).toBe(false);
    expect(isVinFormat("IHGCR2F8XHA000123")).toBe(false);
  });

  it("computes the check digit, including X", () => {
    expect(vinCheckDigit(GOOD)).toBe("X");
    // Well-known valid example VIN from the NHTSA/SAE check-digit spec.
    expect(vinCheckDigit("11111111111111111")).toBe("1");
  });

  it("checkVin passes a good VIN and explains a bad one", () => {
    expect(checkVin(GOOD)).toEqual({ ok: true, vin: GOOD });
    const bad = checkVin("1HGCR2F81HA000123");
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("check-digit");
      expect(bad.message).toContain("should be X");
    }
    const short = checkVin("12345");
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toBe("format");
  });

  it("maps the model-year code", () => {
    expect(vinModelYears(GOOD)).toEqual([2017, 1987]);
  });
});
