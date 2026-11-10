import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateFromComps, type Comp } from "./comps";
import { dealLabel, revalue, valueCar, type PriceSources, type ValueInput } from "./estimate";
import { parseAutoDevComps, parseMarketCheckComps } from "./parse";

const comp = (price: number, miles: number, year = 2021, extra: Partial<Comp> = {}): Comp => ({
  price, miles, year, trim: "LE", sellerType: "dealer", sold: true, url: null, city: null, state: null, daysOnMarket: null, seen: null, ...extra,
});

// A clean synthetic market: $26k at 0 miles, about 6% less per 10k miles, $1.5k per model year.
const market: Comp[] = [];
for (let i = 0; i < 30; i++) {
  const miles = 10_000 + i * 5_000;
  const year = 2020 + (i % 3);
  market.push(comp(Math.round(26_000 * Math.exp(-0.06 * miles / 10_000) * (1 + 0.06 * (year - 2021)) * (1 + ((i * 7) % 5 - 2) / 100)), miles, year));
}

describe("estimateFromComps", () => {
  it("reads the value at this car's miles from a price-vs-miles fit", () => {
    const e = estimateFromComps(market, { year: 2021, miles: 80_000, trim: "LE" })!;
    const truth = 26_000 * Math.exp(-0.06 * 8);
    expect(e.method).toBe("regression");
    expect(Math.abs(e.value - truth) / truth).toBeLessThan(0.04);
    expect(e.low).toBeLessThan(e.value);
    expect(e.high).toBeGreaterThan(e.value);
    expect(e.perMile).toBeLessThan(0);
    expect(e.perYear).toBeGreaterThan(0);
    expect(e.extrapolated).toBe(false);
  });

  it("drops outliers and flags miles far outside the comps", () => {
    const e = estimateFromComps([...market, comp(1_500, 60_000), comp(95_000, 60_000)], { year: 2021, miles: 400_000, trim: null })!;
    expect(e.extrapolated).toBe(true);
    expect(e.n).toBe(market.length);
  });

  it("falls back to a median with few comps, and gives up with fewer than 3", () => {
    const few = [comp(20_000, 50_000), comp(21_000, 52_000), comp(19_000, 55_000), comp(22_000, 48_000)];
    expect(estimateFromComps(few, { year: 2021, miles: 50_000, trim: null })!.method).toBe("median");
    expect(estimateFromComps(few.slice(0, 2), { year: 2021, miles: 50_000, trim: null })).toBeNull();
  });
});

describe("valueCar", () => {
  const src: PriceSources = {
    predicted: 12_000,
    sold: { value: 12_400, low: 11_500, high: 13_200, n: 30, method: "regression", perMile: -0.07, perYear: 1_200, extrapolated: false, closest: [] },
    active: { value: 13_000, low: 12_000, high: 14_000, n: 15, method: "regression", perMile: -0.07, perYear: 1_100, extrapolated: false, closest: [] },
    zip: "08540",
  };
  const clean: ValueInput = { price: 11_000, miles: 120_000, sellerType: "dealer", accident: "none", titleStatus: "clean", usage: "personal" };

  it("combines three sources into a range with high confidence when they agree", () => {
    const v = valueCar(src, clean)!;
    expect(v.sources).toHaveLength(3);
    expect(v.fair).toBeGreaterThan(11_500);
    expect(v.fair).toBeLessThan(12_500);
    expect(v.low).toBeLessThan(v.fair);
    expect(v.confidence).toBe("high");
    expect(v.label).toBe("good");
  });

  it("takes an accident and a private seller off the value, and says why in the offer", () => {
    const v = valueCar(src, { ...clean, accident: "reported", sellerType: "private", daysOnMarket: 60 })!;
    expect(v.adjustments.map((a) => a.label)).toEqual(["Reported damage", "Private seller (no dealer markup)"]);
    expect(v.assumesClean).toBe(false);
    expect(v.label).toBe("over");
    expect(v.offer!.open).toBeLessThanOrEqual(v.offer!.max);
    expect(v.offer!.reasons.join(" ")).toMatch(/accident.*60 days/i);
  });

  it("prices damage as the 3–12% range, and doesn't price severe damage", () => {
    const cleanV = valueCar(src, { ...clean, price: null, damage: "none" })!;
    const minor = valueCar(src, { ...clean, price: null, damage: "minor" })!;
    expect(cleanV.assumesClean).toBe(false);
    expect(minor.fair).toBe(Math.round((cleanV.fair * 0.925) / 100) * 100);
    // The range covers the whole study range, wider than the clean car's.
    expect(minor.low).toBeLessThanOrEqual(Math.round(cleanV.low * 0.88 / 100) * 100 + 100);
    expect(minor.high).toBeGreaterThanOrEqual(Math.round(cleanV.high * 0.97 / 100) * 100 - 100);
    const severe = valueCar(src, { ...clean, damage: "severe" })!;
    expect(severe.label).toBeNull();
    expect(severe.offer).toBeNull();
    expect(severe.unpriced).toMatch(/Severe damage/);
  });

  it("says when it assumed a clean history", () => {
    expect(valueCar(src, { ...clean, accident: "unknown" })!.assumesClean).toBe(true);
    expect(valueCar(src, { ...clean, accident: "none" })!.assumesClean).toBe(false);
  });

  it("re-prices from the comps at new miles without a new lookup", () => {
    const comps = Array.from({ length: 12 }, (_, i) => ({ price: 20_000 - i * 500, miles: 40_000 + i * 8_000, year: 2019, trim: "LE", sellerType: "dealer" as const, sold: true, url: null, city: null, state: null, daysOnMarket: null, seen: null }));
    const base = { predicted: 18_000, sold: null, active: null, zip: "08540", comps: { sold: comps, active: [], target: { year: 2019, miles: 60_000, trim: "LE" } } };
    const low = revalue(base, { year: 2019, miles: 50_000, trim: "LE" });
    const high = revalue(base, { year: 2019, miles: 110_000, trim: "LE" });
    expect(low.sold!.value).toBeGreaterThan(high.sold!.value);
    expect(low.predicted).toBeNull(); // priced for 60k, not 50k
    expect(revalue(base, { year: 2019, miles: 60_000, trim: "LE" })).toBe(base);
  });

  it("is low confidence with one source and still works without a price", () => {
    const v = valueCar({ ...src, sold: null, active: null }, { ...clean, price: null })!;
    expect(v.confidence).toBe("low");
    expect(v.label).toBeNull();
    expect(v.offer).toBeNull();
    expect(valueCar({ predicted: null, sold: null, active: null, zip: "08540" }, clean)).toBeNull();
  });

  it("labels deals on a CarGurus-like scale", () => {
    expect([0.2, 0.1, 0, -0.08, -0.2].map(dealLabel)).toEqual(["great", "good", "fair", "high", "over"]);
  });
});

describe("comp parsers", () => {
  it("reads MarketCheck and Auto.dev listings, skipping ones without a price", () => {
    const mc = parseMarketCheckComps({ listings: [
      { price: 12500, miles: 96663, build: { year: 2021, trim: "SE" }, seller_type: "dealer", vdp_url: "https://d.example/1", dom: 78, last_seen_at_date: "2026-10-31T00:00:00Z", dealer: { city: "Edison", state: "NJ", phone: "x" } },
      { price: null, miles: 202765, build: { year: 2020 } },
    ] }, true);
    expect(mc).toHaveLength(1);
    expect(mc[0]).toMatchObject({ price: 12500, year: 2021, trim: "SE", sold: true, daysOnMarket: 78, seen: "2026-10-31", city: "Edison" });
    const ad = parseAutoDevComps({ data: [{ vehicle: { year: 2021, trim: "LE" }, retailListing: { price: 13999, miles: 88000, dealer: "X", vdp: "javascript:x" } }], user: { email: "me@x" } });
    expect(ad).toEqual([expect.objectContaining({ price: 13999, miles: 88000, url: null, sold: false })]);
  });
});

// Accuracy check on real saved replies (only on a machine that has them in .tmp/).
const TMP = ".tmp";
const soldFile = existsSync(TMP) ? readdirSync(TMP).find((f) => f.startsWith("marketcheck_recents_sold")) : undefined;
describe.skipIf(!soldFile)("backtest on real sold listings", () => {
  it("leave-one-out error of the comps estimate", () => {
    const raw = JSON.parse(readFileSync(`${TMP}/${soldFile}`, "utf8"));
    const comps = parseMarketCheckComps(raw.body, true);
    const errs: number[] = [];
    let inRange = 0;
    comps.forEach((c, i) => {
      const rest = comps.filter((_, j) => j !== i);
      const e = estimateFromComps(rest, { year: c.year, miles: c.miles, trim: c.trim });
      if (!e) return;
      errs.push(Math.abs(e.value - c.price) / c.price);
      if (c.price >= e.low && c.price <= e.high) inRange++;
    });
    errs.sort((a, b) => a - b);
    const med = errs[errs.length >> 1];
    const within10 = errs.filter((e) => e <= 0.1).length / errs.length;
    console.log(`backtest: n=${errs.length} median error ${(med * 100).toFixed(1)}%, within 10%: ${(within10 * 100).toFixed(0)}%, inside range: ${((inRange / errs.length) * 100).toFixed(0)}%`);
    expect(med).toBeLessThan(0.2);
  });
});

const accordFile = existsSync(`${TMP}/search_accord.json`) ? `${TMP}/search_accord.json` : null;
describe.skipIf(!accordFile)("backtest on real Accord listings (asking prices)", () => {
  it("leave-one-out error of the comps estimate", () => {
    const rows = JSON.parse(readFileSync(accordFile!, "utf8")) as { price: number; miles: number; year: number; trim: string | null }[];
    const comps: Comp[] = rows.map((r) => ({ price: r.price, miles: r.miles, year: r.year, trim: r.trim, sellerType: "dealer", sold: false, url: null, city: null, state: null, daysOnMarket: null, seen: null }));
    const errs: number[] = [];
    comps.forEach((c, i) => {
      const e = estimateFromComps(comps.filter((_, j) => j !== i), { year: c.year, miles: c.miles, trim: c.trim });
      if (e) errs.push(Math.abs(e.value - c.price) / c.price);
    });
    errs.sort((a, b) => a - b);
    const med = errs[errs.length >> 1];
    console.log(`backtest (Accord asking): n=${errs.length} median error ${(med * 100).toFixed(1)}%, within 10%: ${((errs.filter((e) => e <= 0.1).length / errs.length) * 100).toFixed(0)}%`);
    expect(med).toBeLessThan(0.25);
  });
});

describe("days to sell", () => {
  it("uses how fast similar cars sell to judge a long listing", () => {
    const src: PriceSources = { predicted: 12_000, sold: null, active: null, zip: "08540", marketDays: 30 };
    const car: ValueInput = { price: 12_000, miles: 80_000, sellerType: "dealer", accident: "none", titleStatus: "clean", usage: "personal" };
    expect(valueCar(src, { ...car, daysOnMarket: 70 })!.offer!.reasons.join(" ")).toMatch(/70 days.*about 30/);
    expect(valueCar(src, { ...car, daysOnMarket: 40 })!.offer!.reasons.join(" ")).not.toMatch(/days/);
  });
});
