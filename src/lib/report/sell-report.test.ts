import { describe, expect, it } from "vitest";
import type { Valuation } from "@/lib/value/estimate";
import { sellReport } from "./sell-report";

const full = ["---", "report: VinVerdict", "---", "# VinVerdict report: x", "## At a glance", "buyer stuff", "## 1. The answer", "Verify", "## 3. The car", "| VIN | x |", "## 4. History report (accidents, title, use)", "Not added", "## 9. Safety: recalls, crash tests, owner complaints", "3 recalls", "## 11. Buyer protection", "dealer", "## 12. Before you buy", "### Questions for the seller", "## 13. Sources", "1. NHTSA"].join("\n");
const v = { fair: 16_400, low: 14_300, high: 18_600, sources: [{ name: "Price model", value: 18_301, note: "MarketCheck" }], adjustments: [{ label: "Private seller (no dealer markup)", pct: -0.12 }], pctUnder: null, label: null, offer: null, confidence: "medium", confidenceWhy: "3 sources agree", assumesClean: false, unpriced: null } as Valuation;

describe("the seller's report", () => {
  it("keeps the shared facts, drops the buyer's parts, adds what it's worth and selling safely", () => {
    const r = sellReport(full, { name: "2016 Lexus RX 350", generated: "2026-11-13", site: "x", vin: "2T2BZMCA2GC041915", miles: 94_767, recalls: 3, historyKnown: null, sell: { private: v, dealer: null, listAt: 17_400, zip: "08540" } });
    const heads = r.split("\n").filter((l) => l.startsWith("## "));
    expect(heads).toEqual(["## At a glance", "## 1. What it's worth", "## 2. The car", "## 3. History report (accidents, title, use)", "## 4. Safety: recalls, crash tests, owner complaints", "## 5. Sources", "## 6. Selling safely", "## 7. Questions to ask your AI"]);
    expect(r).toContain("report_kind: selling");
    expect(r).toContain("List it at about $17,400");
    expect(r).not.toMatch(/Buyer protection|Before you buy|Questions for the seller|buyer stuff/);
  });
  it("not priced: says how to price it instead of inventing a number", () => {
    const r = sellReport(full, { name: "x", generated: "d", site: "x", vin: null, miles: null, recalls: null, historyKnown: null, sell: null });
    expect(r).toContain("private_sale_value_usd: null");
    expect(r).toContain("KBB or Edmunds private-party value");
  });
});
