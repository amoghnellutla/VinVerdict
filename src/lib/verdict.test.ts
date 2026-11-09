import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { rateLimit } from "@/lib/rate-limit";
import { buildVerdict } from "./verdict";

const NOW = new Date("2026-11-08T12:00:00Z");
const verdictFor = (text: string, checklist = {}) =>
  buildVerdict({ text, listing: parseListing(text), decoded: null }, checklist, NOW);

describe("buildVerdict", () => {
  it("treats a bare VIN as a car lookup, not a listing missing its price", () => {
    const r = verdictFor("1HGCR2F8XHA000123");
    const ids = r.hits.map((h) => h.id);
    expect(ids).not.toContain("no-price");
    expect(ids).toContain("vin-only");
    expect(r.verdict).toBe("clear");
  });

  it("still hides a bare VIN that fails the check digit", () => {
    expect(verdictFor("1HGCR2F81HA000123").verdict).toBe("hide");
  });

  it("applies checklist answers", () => {
    const text = "2017 Honda Accord $9,000 100,000 miles clean title no accidents VIN 1HGCR2F8XHA000123";
    expect(verdictFor(text).verdict).toBe("clear");
    expect(verdictFor(text, { lienOnTitle: true }).verdict).toBe("caution");
    expect(verdictFor(text, { allowsInspection: false }).verdict).toBe("hide");
  });
});

describe("rateLimit", () => {
  it("allows up to the limit per window, then blocks until it passes", () => {
    const key = `test:${Math.random()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000, t0 + i)).toBe(true);
    expect(rateLimit(key, 3, 60_000, t0 + 10)).toBe(false);
    expect(rateLimit(key, 3, 60_000, t0 + 60_001)).toBe(true);
  });
});

describe("same phone on several listings", () => {
  it("flags a private seller whose number is on other saved cars, not a dealer", () => {
    const priv = "2016 Honda Civic $9,000 90,000 miles selling my car text 732-555-0100 VIN 19XFC2F52GE012345";
    const r = buildVerdict({ text: priv, listing: parseListing(priv), decoded: null, phoneMatches: [{ title: "2015 Toyota Corolla" }] }, {}, NOW);
    expect(r.hits.find((h) => h.id === "same-phone")?.reason).toMatch(/2015 Toyota Corolla/);
    const dealer = "2016 Honda Civic $9,000 90,000 miles. Stock # A12. Dealer. 732-555-0100 VIN 19XFC2F52GE012345";
    const d = buildVerdict({ text: dealer, listing: parseListing(dealer), decoded: null, phoneMatches: [{ title: "x" }] }, {}, NOW);
    expect(d.hits.map((h) => h.id)).not.toContain("same-phone");
  });
});
