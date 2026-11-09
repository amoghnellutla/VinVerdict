import { describe, expect, it } from "vitest";
import { buildChecklist, checklistText, complaintChecks, knownIssuesFor, type CarForChecklist } from "./inspection";
import { buyerProtection, njDealerWarranty } from "./protection";

const car = (o: Partial<CarForChecklist>): CarForChecklist => ({
  year: 2017, make: "HONDA", model: "Accord", displacementL: null, cvt: false, complaintAreas: [], ...o,
});
const ids = (c: CarForChecklist) => knownIssuesFor(c).map((k) => k.id);

describe("knownIssuesFor", () => {
  it("matches make, model and year range per model", () => {
    expect(ids(car({ make: "TOYOTA", model: "Camry", year: 2008 }))).toEqual(["toyota-2az-oil"]);
    expect(ids(car({ make: "TOYOTA", model: "Camry", year: 2011 }))).toEqual([]);
    expect(ids(car({ make: "TOYOTA", model: "RAV4", year: 2007 }))).toEqual(["toyota-2az-oil"]);
    expect(ids(car({ make: "TOYOTA", model: "RAV4", year: 2009 }))).toEqual([]);
    expect(ids(car({ make: "Toyota", model: "Tacoma", year: 2006 }))).toEqual(["toyota-tacoma-frame"]);
  });

  it("skips an issue when the VIN shows a different engine, keeps it when unknown", () => {
    expect(ids(car({ make: "TOYOTA", model: "Camry", year: 2008, displacementL: 3.5 }))).toEqual([]);
    expect(ids(car({ model: "CR-V", year: 2017, displacementL: 2.4 }))).toEqual([]);
    expect(ids(car({ model: "CR-V", year: 2017, displacementL: 1.5 }))).toEqual(["honda-15t-oil-dilution"]);
    expect(ids(car({ model: "Civic", year: 2018 }))).toEqual(["honda-15t-oil-dilution"]);
    expect(ids(car({ model: "Accord", year: 2015, displacementL: 2.4 }))).toEqual(["honda-cvt-p1890"]);
    expect(ids(car({ model: "Accord", year: 2008, displacementL: 3.5 }))).toEqual([]);
  });

  it("needs year, make and model", () => {
    expect(ids(car({ year: null }))).toEqual([]);
    expect(ids(car({ model: null }))).toEqual([]);
  });
});

describe("checklist", () => {
  it("turns complaint areas into distinct checks", () => {
    const c = complaintChecks(["ELECTRICAL SYSTEM", "ENGINE", "FUEL/PROPULSION SYSTEM", "FUEL SYSTEM", "SERVICE BRAKES", "WHEELS"]);
    expect(c.map((x) => x.title)).toEqual(["Electrical system", "Engine", "Fuel/propulsion system", "Service brakes"]);
  });

  it("adds a CVT check and builds copyable text", () => {
    const c = buildChecklist(car({ model: "Accord", year: 2015, cvt: true, complaintAreas: ["POWER TRAIN"] }));
    expect(c.general.at(-1)?.title).toBe("CVT transmission");
    const text = checklistText("2015 Honda Accord", c);
    expect(text).toContain("Pre-purchase inspection: 2015 Honda Accord");
    expect(text).toContain("- CVT slipping at highway speed (code P1890):");
    expect(text).toContain("- Power train: Smooth shifts");
  });
});

describe("buyerProtection", () => {
  const base = { text: "", sourceHost: null, sellerType: "unknown" as const, year: 2021, price: 18000, miles: 40000, now: new Date("2026-11-09") };

  it("recognises the big used-car sellers", () => {
    expect(buyerProtection({ ...base, text: "2020 Camry at CarMax Edison" })).toMatchObject({ source: "carmax", level: "strong" });
    expect(buyerProtection({ ...base, sourceHost: "www.carvana.com" })).toMatchObject({ source: "carvana" });
    expect(buyerProtection({ ...base, text: "Enterprise Car Sales Union NJ" }).returns).toBe("7-day / 1,000-mile buyback");
    expect(buyerProtection({ ...base, text: "Hertz Certified, Rent2Buy" }).source).toBe("hertz");
  });

  it("private sellers get no protection", () => {
    expect(buyerProtection({ ...base, sellerType: "private" })).toMatchObject({ source: "private", level: "none", returns: null });
    expect(buyerProtection({ ...base, sourceHost: "newjersey.craigslist.org" }).level).toBe("none");
  });

  it("dealers get the Buyers Guide and NJ warranty tier", () => {
    const p = buyerProtection({ ...base, sellerType: "dealer" });
    expect(p.level).toBe("some");
    expect(p.notes.join(" ")).toContain("60 days or 2,000 miles");
  });

  it("NJ dealer warranty tiers and limits", () => {
    const now = new Date("2026-11-09");
    expect(njDealerWarranty({ year: 2024, price: 25000, miles: 20000, now })).toBe("90 days or 3,000 miles");
    expect(njDealerWarranty({ year: 2022, price: 15000, miles: 60000, now })).toBe("30 days or 1,000 miles");
    expect(njDealerWarranty({ year: 2018, price: 15000, miles: 50000, now })).toBeNull(); // over 7 model years
    expect(njDealerWarranty({ year: 2022, price: 2500, miles: 50000, now })).toBeNull(); // under $3,000
    expect(njDealerWarranty({ year: 2022, price: 9000, miles: 120000, now })).toBeNull(); // over 100k
  });
});
