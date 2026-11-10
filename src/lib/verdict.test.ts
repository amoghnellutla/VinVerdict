import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { rateLimit } from "@/lib/rate-limit";
import { accidentHistoryConfirmed, EMPTY_REPORT } from "@/lib/history-report";
import { mergeLive } from "@/lib/live/merge";
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

describe("history report and listing feeds", () => {
  const VIN = "2T2BZMCA2GC041915";
  // The recorded 2016 RX 350: Auto.dev said 0 accidents and 1 owner; the dealer's Carfax showed minor damage and 3 owners.
  const feed = {
    source: "Auto.dev" as const, vin: VIN, year: 2016, make: "Lexus", model: "RX", trim: null, price: 21559, miles: 94767,
    sellerType: "dealer" as const, sellerName: "Westchester Motors", city: "Yonkers", state: "NY", zip: "10704", url: null, carfaxUrl: null,
    exteriorColor: "Brown", accidentCount: 0, ownerCount: 1, usage: "personal" as const, certified: false, cleanTitle: null, daysOnMarket: null, removedAt: null,
  };
  const base = { text: VIN, listing: parseListing(VIN), decoded: null, live: feed };

  it("a feed's 0 accidents doesn't clear the car, and says why", () => {
    const r = buildVerdict(base, {}, NOW);
    const unknown = r.hits.find((h) => h.id === "accident-unknown");
    expect(unknown?.reason).toMatch(/listing feeds often miss damage/);
    expect(accidentHistoryConfirmed(mergeLive(base.listing, feed), EMPTY_REPORT)).toBe(false);
  });

  it("minor damage on the report is a deal-breaker for a buyer with a no-accidents rule", () => {
    const r = buildVerdict({ ...base, report: { damage: "minor", title: "clean", commercial: true } }, {}, NOW);
    const ids = r.hits.map((h) => h.id);
    expect(r.verdict).toBe("hide");
    expect(ids).toContain("report-damage");
    expect(ids).toContain("report-commercial");
    expect(ids).not.toContain("accident-unknown");
  });

  it("a clean report confirms the history", () => {
    const report = { damage: "none" as const, title: "clean" as const, commercial: false };
    const r = buildVerdict({ ...base, report }, {}, NOW);
    expect(r.hits.map((h) => h.id)).not.toContain("accident-unknown");
    expect(accidentHistoryConfirmed(base.listing, report)).toBe(true);
  });

  it("a seller who admits an accident wins over a clean report", () => {
    const r = buildVerdict({ ...base, report: { damage: "none", title: "clean", commercial: null } }, { anyAccidents: true }, NOW);
    expect(r.verdict).toBe("hide");
  });
});
