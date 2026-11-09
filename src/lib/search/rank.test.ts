import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { parseSearchListings, rankResults, resultAsListing } from "./rank";

const listing = (vin: string, price: number, miles: number, extra: Record<string, unknown> = {}) => ({
  vin, price, miles, heading: `2019 Toyota Camry LE`, vdp_url: `https://dealer.example/${vin}`, dom_active: 12,
  build: { year: 2019, make: "Toyota", model: "Camry", trim: "LE", transmission: "Automatic" },
  dealer: { name: "Edison Toyota", city: "Edison", state: "NJ" }, base_ext_color: "Black", ...extra,
});

// A market around $19k at 50k miles, ~6% less per 10k miles, plus one bargain and one overpriced car.
const body = {
  listings: [
    ...Array.from({ length: 12 }, (_, i) => listing(`4T1B11HK${String(i).padStart(9, "0")}`.slice(0, 17), Math.round(19_000 * Math.exp(-0.06 * ((30_000 + i * 5_000) - 50_000) / 10_000)), 30_000 + i * 5_000)),
    listing("4T1B11HK0KU999991", 15_000, 50_000),
    listing("4T1B11HK0KU999994", 9_000, 50_000), // too cheap to be true
    listing("4T1B11HK0KU999992", 24_000, 50_000),
    listing("4T1B11HK0KU999993", 14_000, 50_000, { build: { year: 2019, make: "Toyota", model: "Camry", trim: "SE", transmission: "6-Speed Manual" } }),
    listing("4T1B11HK0KU999991", 15_500, 50_000), // same VIN again, pricier
    { vin: "x", price: null, miles: 1 },
  ],
};

describe("search ranking", () => {
  const parsed = parseSearchListings(body, "dealer");

  it("parses listings and skips ones without a price", () => {
    expect(parsed).toHaveLength(17);
    expect(parsed[0]).toMatchObject({ make: "Toyota", model: "Camry", sellerType: "dealer", sellerName: "Edison Toyota", daysOnMarket: 12, color: "Black" });
  });

  it("drops manuals and duplicate VINs, and puts the bargain first", () => {
    const ranked = rankResults(parsed, { automaticOnly: true });
    expect(ranked.find((r) => /manual/i.test(r.transmission ?? ""))).toBeUndefined();
    expect(ranked.filter((r) => r.vin === "4T1B11HK0KU999991")).toHaveLength(1);
    expect(ranked[0].vin).toBe("4T1B11HK0KU999991");
    expect(ranked[0].price).toBe(15_000);
    expect(ranked[0].label).toBe("great");
    expect(ranked.at(-1)!.vin).toBe("4T1B11HK0KU999992");
    expect(ranked.at(-1)!.label).toBe("over");
    const cheap = ranked.find((r) => r.vin === "4T1B11HK0KU999994")!;
    expect(cheap.suspicious).toBe(true);
    expect(ranked.indexOf(cheap)).toBeGreaterThan(0);
  });

  it("hands a result to the checker as text the parser understands", () => {
    const r = rankResults(parsed, { automaticOnly: true })[0];
    const p = parseListing(resultAsListing(r));
    expect(p).toMatchObject({ vin: r.vin, price: 15_000, miles: 50_000, year: 2019, make: "Toyota", model: "Camry", sellerType: "dealer", exteriorColor: "black" });
  });
});
