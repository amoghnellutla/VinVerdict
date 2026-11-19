import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/analyze";
import { accidentText, cleanRecord, mpgText, powertrainText, titleText } from "./display";
import { cleanUrl, draftFields, parseBase, parseFields, powertrainOf, toSaveInput, withBadNews, withReport, type SaveFields } from "./draft";

type A = Pick<Analysis, "decoded" | "fuel" | "listing">;
const listing = (over: Partial<A["listing"]> = {}) =>
  ({ url: "https://www.cars.com/vehicledetail/abc/", price: 21298, miles: 31450, titleStatus: "clean", accident: "none", model: "RAV4", ...over }) as A["listing"];
const vehicle = (comb: number, atvType: string | null = null, fuel = "regular") => ({ id: comb, label: "RAV4", comb, city: comb - 3, hwy: comb + 5, kwhPer100: null, fuel, atvType });
const a = (over: Partial<A> = {}): A => ({ decoded: null, fuel: null, listing: listing(), ...over }) as A;

describe("what Save to My cars drafts from a check", () => {
  it("the link, price, miles, MPG and record, each with where it came from", () => {
    const d = draftFields(a({ fuel: { vehicles: [vehicle(30)], prices: null } as A["fuel"] }));
    expect(d.fields).toEqual({ sourceUrl: "https://www.cars.com/vehicledetail/abc/", price: 21298, miles: 31450, mpgCity: 27, mpgHwy: 35, mpgComb: 30, powertrain: "gas", titleStatus: "clean", accident: "none" });
    expect(d.from).toMatchObject({ sourceUrl: "the listing", mpg: "FuelEconomy.gov", powertrain: "FuelEconomy.gov", titleStatus: "the listing says", accident: "the listing says" });
    expect(d.mpgRange).toBeNull();
  });

  it("variants that disagree on MPG: the best match is drafted and the range is said", () => {
    const d = draftFields(a({ fuel: { vehicles: [vehicle(30), vehicle(40, "Hybrid")], prices: null } as A["fuel"] }));
    expect(d.fields.mpgComb).toBe(30);
    expect(d.mpgRange).toEqual({ low: 30, high: 40 });
    // Hybrid and gas versions: not decided from FuelEconomy.gov.
    expect(d.fields.powertrain).toBeNull();
  });

  it("nothing read stays empty, never a likely value", () => {
    const d = draftFields(a({ listing: listing({ url: null, price: null, miles: null, titleStatus: "unknown", accident: "unknown" }) }));
    expect(d.fields).toMatchObject({ sourceUrl: null, price: null, miles: null, mpgComb: null, powertrain: null, titleStatus: "unknown", accident: "unknown" });
    expect(d.from).toEqual({});
  });

  it("hybrid or not: the VIN first, then FuelEconomy.gov when every version agrees, then the ad's words", () => {
    expect(powertrainOf(a({ decoded: { electrification: "Strong HEV (Hybrid Electric Vehicle)", fuel: "Gasoline" } as A["decoded"] }))).toEqual({ value: "hybrid", from: "the VIN" });
    expect(powertrainOf(a({ decoded: { electrification: "PHEV (Plug-in Hybrid Electric Vehicle)", fuel: "Gasoline" } as A["decoded"] })).value).toBe("plug-in hybrid");
    expect(powertrainOf(a({ decoded: { electrification: "BEV (Battery Electric Vehicle)", fuel: "Electric" } as A["decoded"] })).value).toBe("electric");
    expect(powertrainOf(a({ decoded: { electrification: null, fuel: "Gasoline" } as A["decoded"] }))).toEqual({ value: "gas", from: "the VIN" });
    expect(powertrainOf(a({ fuel: { vehicles: [vehicle(40, "Hybrid"), vehicle(39, "Hybrid")], prices: null } as A["fuel"] }))).toEqual({ value: "hybrid", from: "FuelEconomy.gov" });
    expect(powertrainOf(a({ listing: listing({ model: "RAV4 Hybrid" }) }))).toEqual({ value: "hybrid", from: "the listing" });
    expect(powertrainOf(a()).value).toBeNull();
  });

  it("the owner's history report: bad news wins over the listing; a clean report fills only what's unknown", () => {
    const d = { fields: draftFields(a()).fields, from: draftFields(a()).from };
    const branded = withReport(d, { title: "branded", damage: "moderate" });
    expect(branded.fields).toMatchObject({ titleStatus: "branded", accident: "reported" });
    expect(branded.from).toMatchObject({ titleStatus: "your history report", accident: "your history report" });
    const unknown = { fields: { ...d.fields, titleStatus: "unknown" as const, accident: "unknown" as const }, from: {} };
    expect(withReport(unknown, { title: "clean", damage: "none" }).fields).toMatchObject({ titleStatus: "clean", accident: "none" });
    // A clean report never overrides a salvage title in the ad.
    expect(withReport({ fields: { ...d.fields, titleStatus: "salvage" }, from: {} }, { title: "clean", damage: "unknown" }).fields.titleStatus).toBe("salvage");
  });
});

describe("bad news found elsewhere on the page", () => {
  it("an accident in the VIN's history data or a washed title is drafted, never left Not sure or Clean", () => {
    const d = { fields: { ...draftFields(a()).fields, accident: "unknown" as const, titleStatus: "clean" as const }, from: {} };
    const r = withBadNews(d, { accident: "the VIN's history data", branded: "the title's history" });
    expect(r.fields).toMatchObject({ accident: "reported", titleStatus: "branded" });
    expect(r.from).toMatchObject({ accident: "the VIN's history data", titleStatus: "the title's history" });
    // A salvage title in the ad stays salvage; nothing found leaves the draft as it was.
    expect(withBadNews({ fields: { ...d.fields, titleStatus: "salvage" }, from: {} }, { accident: null, branded: "x" }).fields.titleStatus).toBe("salvage");
    expect(withBadNews(d, { accident: null, branded: null }).fields).toEqual(d.fields);
  });
});

describe("what the browser sends back is checked before it's stored", () => {
  const good: SaveFields = { sourceUrl: "https://www.cars.com/x", price: 21298, miles: 31450, mpgCity: 27, mpgHwy: 35, mpgComb: 30, powertrain: "hybrid", titleStatus: "clean", accident: "none" };
  it("accepts the reviewed fields, with numbers typed as text", () => {
    expect(parseFields(good)).toEqual(good);
    expect(parseFields({ ...good, price: "$21,298", miles: "31,450", sourceUrl: "", powertrain: "" })).toMatchObject({ price: 21298, miles: 31450, sourceUrl: null, powertrain: null });
  });
  it("refuses a link that isn't http(s), and anything out of range", () => {
    for (const bad of [{ sourceUrl: "javascript:alert(1)" }, { sourceUrl: "https://a b.com" }, { price: -5 }, { miles: 2_000_000 }, { mpgComb: 500 }, { powertrain: "rocket" }, { titleStatus: "great" }, { accident: "maybe" }]) {
      expect(parseFields({ ...good, ...bad }), JSON.stringify(bad)).toBeNull();
    }
    expect(cleanUrl("https://www.cars.com/x?y=1")).toBe("https://www.cars.com/x?y=1");
  });
  it("checks the check's part too (VIN, verdict, risk, facts)", () => {
    const base = { vin: "2T3P1RFV3MW000000", title: "2021 Toyota RAV4", sourceHost: "cars.com", verdict: "clear", risk: 12, facts: { year: 2021, make: "Toyota", model: "RAV4", zip: "08540", phones: ["6095550100", "x"] }, listingText: "ad" };
    expect(parseBase(base)?.facts).toMatchObject({ year: 2021, make: "Toyota", zip: "08540", phones: ["6095550100"] });
    for (const bad of [{ vin: "BAD" }, { verdict: "great" }, { risk: 101 }, { title: "" }]) expect(parseBase({ ...base, ...bad }), JSON.stringify(bad)).toBeNull();
  });
  it("the stored row: the reviewed fields in the facts, and the site from the corrected link", () => {
    const base = parseBase({ vin: null, title: "2021 Toyota RAV4", sourceHost: "cars.com", verdict: "clear", risk: 12, facts: {}, listingText: null })!;
    const row = toSaveInput(base, { ...good, sourceUrl: "https://www.autotrader.com/cars-for-sale/123" });
    expect(row.sourceHost).toBe("autotrader.com");
    expect(row.facts).toMatchObject({ title: "clean", accident: "none", mpg: { comb: 30, city: 27, hwy: 35 }, powertrain: "hybrid" });
    expect(toSaveInput(base, { ...good, mpgCity: null, mpgHwy: null, mpgComb: null }).facts.mpg).toBeNull();
  });
});

describe("how a saved car's details read", () => {
  it("MPG, hybrid or not, and the record", () => {
    expect(mpgText({ mpg: { comb: 30, city: 27, hwy: 35 } })).toBe("30 mpg (27 city / 35 hwy)");
    expect(mpgText({ mpg: { comb: 30, city: null, hwy: null } })).toBe("30 mpg");
    expect(mpgText({})).toBeNull();
    expect(powertrainText({ powertrain: "plug-in hybrid" })).toBe("Plug-in hybrid");
    expect(cleanRecord({ title: "clean", accident: "none" })).toBe(true);
    expect(cleanRecord({ title: "clean", accident: "unknown" })).toBe(false);
    expect(`${titleText({ title: "salvage" })}, ${accidentText({ accident: "reported" })}`).toBe("Salvage title, Accident reported");
  });
});
