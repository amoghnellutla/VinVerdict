import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { buildVerdict } from "@/lib/verdict";
import camry from "./fixtures/camry-4T1C11AK3MU436772.json";
import { parseMarketCheckHistory, type HistoryRecord } from "./parse";
import { historyHighlights, historyRuleHits, recentMiles, savedHistory, summarizeHistory } from "./summary";

// Real MarketCheck History reply (2026-11-09) for the AutoTrader Camry in corpus case 01.
const NOW = new Date("2026-11-09T12:00:00Z");
const records = parseMarketCheckHistory(camry);

const rec = (o: Partial<HistoryRecord>): HistoryRecord => ({
  firstSeen: "2026-01-01", lastSeen: "2026-01-05", price: 10_000, miles: 90_000, sellerType: "dealer",
  sellerName: "Some Motors", city: "Edison", state: "NJ", host: "somemotors.com", url: null, isNew: false, ...o,
});

describe("parseMarketCheckHistory", () => {
  it("reads the real reply, oldest first, with https links only", () => {
    expect(records).toHaveLength(11);
    expect(records[0]).toMatchObject({ isNew: true, sellerName: "Limbaugh Toyota", state: "AL", miles: null, price: 26279 });
    expect(records.at(-1)).toMatchObject({ price: 9900, miles: 183086, sellerType: "dealer", state: "AR" });
    expect(records.every((r) => r.url === null || r.url.startsWith("https://"))).toBe(true);
  });

  it("ignores junk", () => {
    expect(parseMarketCheckHistory({ listings: [] })).toEqual([]);
    expect(parseMarketCheckHistory([null, 3, { price: 5 }, { first_seen_at_date: "2025-02-03T00:00:00Z", vdp_url: "javascript:alert(1)", miles: 5 }])).toEqual([
      expect.objectContaining({ firstSeen: "2025-02-03", url: null, miles: null }),
    ]);
  });
});

describe("summarizeHistory on the real Camry", () => {
  const h = summarizeHistory(records, NOW);

  it("groups listings by seller and finds what's on sale now", () => {
    expect(h.stints.map((s) => s.seller)).toEqual(["Limbaugh Toyota", "Usa.autofreedom.biz", "Car World Arkansas", "Gwatney Buick Gmc", "Deandre Sells Cars"]);
    expect(h.active.map((s) => s.seller).sort()).toEqual(["Deandre Sells Cars", "Gwatney Buick Gmc"]);
    expect(h.forSaleSince).toBe("2026-10-11");
    expect(h.daysListed).toBe(29);
    expect(h.salePeriods).toHaveLength(2);
    expect(h.states).toEqual(["AL", "IL", "AR"]);
  });

  it("sees the $10,900 → $9,900 cut and no rollback", () => {
    expect(h.priceCut).toEqual({ from: 10900, to: 9900, since: "2026-10-11" });
    expect(h.rollback).toBeNull();
    expect(h.maxMiles?.miles).toBe(183086);
  });

  it("explains it in plain words", () => {
    const lines = historyHighlights(h).join(" ");
    expect(lines).toContain("Sold new around Feb 2021 in Birmingham, AL");
    expect(lines).toContain("for sale as a used car once before now");
    expect(lines).toContain("AL → IL → AR");
  });

  it("adds price-cut and two-sellers notes, not red flags, to the dealer listing", () => {
    const hits = historyRuleHits(parseListing("2021 Toyota Camry LE $9,900 183,086 mi Gwatney Buick GMC dealer"), h, NOW);
    expect(hits.map((x) => [x.id, x.action])).toEqual([["history-price-cut", "info"], ["history-two-sellers", "info"]]);
  });
});

describe("historyRuleHits", () => {
  it("catches miles that went down between listings", () => {
    const h = summarizeHistory([
      rec({ firstSeen: "2024-01-01", lastSeen: "2024-01-20", miles: 120_000 }),
      rec({ firstSeen: "2024-02-01", lastSeen: "2024-02-20", miles: 120_500, sellerName: "Other Auto" }),
      rec({ firstSeen: "2026-09-01", lastSeen: "2026-11-08", miles: 78_000, sellerName: "Third Cars" }),
    ], NOW);
    expect(h.rollback).toMatchObject({ from: 120_500, to: 78_000, confirmed: true });
    const hits = historyRuleHits(parseListing("vin 1HGCR2F8XHA000123"), h, NOW);
    expect(hits.find((x) => x.id === "history-rollback")?.action).toBe("hide");
  });

  it("one odd reading is a question, not a deal-breaker", () => {
    const h = summarizeHistory([rec({ firstSeen: "2025-01-01", miles: 150_000 }), rec({ firstSeen: "2026-10-01", lastSeen: "2026-11-08", miles: 98_000, sellerName: "B" })], NOW);
    expect(historyRuleHits(parseListing("1HGCR2F8XHA000123"), h, NOW).find((x) => x.id === "history-rollback")?.action).toBe("flag");
  });

  it("flags pasted miles under what the car had before", () => {
    const h = summarizeHistory([rec({ firstSeen: "2025-05-01", lastSeen: "2025-06-01", miles: 140_000 }), rec({ firstSeen: "2025-05-10", lastSeen: "2025-06-01", miles: 140_200, sellerName: "B" })], NOW);
    const hits = historyRuleHits(parseListing("2016 Honda Accord, 95,000 miles, $9,500, selling my car"), h, NOW);
    expect(hits.find((x) => x.id === "history-miles-lower")?.action).toBe("hide");
  });

  it("flags a private seller whose car a dealer was selling a few months ago", () => {
    const h = summarizeHistory([rec({ firstSeen: "2026-06-01", lastSeen: "2026-08-15", price: 14_500, miles: 70_000 })], NOW);
    const hit = historyRuleHits(parseListing("2018 Honda Civic, 71,000 miles, $11,000. Selling my car, text me"), h, NOW).find((x) => x.id === "history-dealer-recent");
    expect(hit?.action).toBe("flag");
    expect(hit?.reason).toContain("until Aug 15, 2026");
    expect(hit?.reason).toContain("copied listing");
  });

  it("flags a car sold over and over", () => {
    const h = summarizeHistory([
      rec({ firstSeen: "2024-03-01", lastSeen: "2024-03-20" }),
      rec({ firstSeen: "2025-01-01", lastSeen: "2025-01-20", sellerName: "B" }),
      rec({ firstSeen: "2026-10-01", lastSeen: "2026-11-08", sellerName: "C" }),
    ], NOW);
    expect(historyRuleHits(parseListing("1HGCR2F8XHA000123"), h, NOW).map((x) => x.id)).toContain("history-turnover");
  });

  it("feeds the verdict, without doubling up live-listing flags", () => {
    const listing = parseListing("2018 Honda Civic, 71,000 miles, $11,000. Selling my car, text me");
    const h = summarizeHistory([rec({ firstSeen: "2026-06-01", lastSeen: "2026-08-15", price: 14_500, miles: 90_000 }), rec({ firstSeen: "2026-06-03", lastSeen: "2026-08-15", miles: 90_100, sellerName: "B" })], NOW);
    const v = buildVerdict({ text: "x", listing, decoded: null, history: h }, {}, NOW);
    expect(v.verdict).toBe("hide");
    expect(v.hits.map((x) => x.id)).toEqual(expect.arrayContaining(["history-miles-lower", "history-dealer-recent"]));
  });
});

describe("recentMiles and savedHistory", () => {
  it("fills unknown miles from a listing seen in the last 6 months only", () => {
    expect(recentMiles(records, NOW)).toEqual({ miles: 183086, date: "2026-11-09" });
    expect(recentMiles([rec({ firstSeen: "2025-01-01", lastSeen: "2025-02-01", miles: 50_000 })], NOW)).toBeNull();
  });

  it("keeps the red flags and a short summary for My cars", () => {
    const h = summarizeHistory(records, NOW);
    expect(savedHistory(h, historyRuleHits(parseListing("2021 Camry $9,900"), h, NOW))).toEqual({
      listings: 5, daysListed: 29, cutFrom: 10900, rollback: false, flags: [],
    });
    const bad = summarizeHistory([
      rec({ firstSeen: "2025-05-01", lastSeen: "2025-06-01", miles: 140_000 }),
      rec({ firstSeen: "2025-05-10", lastSeen: "2025-06-01", miles: 140_200, sellerName: "B" }),
    ], NOW);
    const kept = savedHistory(bad, historyRuleHits(parseListing("2016 Honda Accord, 95,000 miles, $9,500, selling my car"), bad, NOW));
    expect(kept.rollback).toBe(true);
    // The dealer listing ended over 6 months ago, so no "recently at a dealer" flag.
    expect(kept.flags).toEqual(["Fewer miles than the car had before"]);
  });
});
