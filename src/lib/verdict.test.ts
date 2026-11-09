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
