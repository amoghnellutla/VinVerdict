import { describe, expect, it } from "vitest";
import { guessWeightClass, isRecentModel, njOutTheDoor } from "./nj";

const NOW = new Date("2026-11-08T12:00:00Z");

describe("njOutTheDoor", () => {
  it("adds tax, title, registration and inspection for a private sale", () => {
    const r = njOutTheDoor({ price: 9000, modelYear: 2017, weightClass: "heavy", financed: false, inspection: 175, now: NOW });
    // 9000 × 6.625% = 596.25; title 60; older car over 3,500 lb = 71.50
    expect(r.lines.map((l) => l.amount)).toEqual([9000, 596.25, 60, 71.5, 175]);
    expect(r.total).toBe(9902.75);
  });

  it("taxes a dealer doc fee and charges the lien title fee when financed", () => {
    const r = njOutTheDoor({ price: 21995, modelYear: 2019, weightClass: "light", financed: true, docFee: 499, inspection: 0, now: NOW });
    const byLabel = Object.fromEntries(r.lines.map((l) => [l.label, l.amount]));
    expect(byLabel["Dealer doc fee"]).toBe(499);
    expect(byLabel["NJ sales tax (6.625%)"]).toBe(1490.23); // (21995 + 499) × 0.06625 = 1490.2275
    expect(byLabel["Title (with a lien)"]).toBe(85);
    expect(byLabel["Registration, 1 year (plates included)"]).toBe(46.5);
  });

  it("uses the higher registration rate for a model within 2 years", () => {
    const r = njOutTheDoor({ price: 30000, modelYear: 2026, weightClass: "light", financed: false, inspection: 0, now: NOW });
    expect(r.lines.find((l) => l.label.startsWith("Registration"))?.amount).toBe(59);
  });
});

describe("helpers", () => {
  it("isRecentModel", () => {
    expect(isRecentModel(2027, NOW)).toBe(true);
    expect(isRecentModel(2025, NOW)).toBe(true);
    expect(isRecentModel(2024, NOW)).toBe(false);
    expect(isRecentModel(null, NOW)).toBe(false);
  });

  it("guessWeightClass prefers curb weight, then body type", () => {
    expect(guessWeightClass(3605, "Sedan/Saloon")).toEqual({ value: "heavy", estimated: false });
    expect(guessWeightClass(3100, "Sport Utility Vehicle")).toEqual({ value: "light", estimated: false });
    expect(guessWeightClass(null, "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)")).toEqual({ value: "heavy", estimated: true });
    expect(guessWeightClass(null, null)).toEqual({ value: "light", estimated: true });
  });
});
