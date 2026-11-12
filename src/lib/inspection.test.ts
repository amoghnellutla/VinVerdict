import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildChecklist, checklistText, complaintChecks, KNOWN_ISSUES, knownIssuesFor, type CarForChecklist } from "./inspection";
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
    expect(buyerProtection({ ...base, sourceHost: "www.facebook.com" }).source).toBe("private");
    // Look-alike hosts aren't Facebook or Craigslist.
    expect(buyerProtection({ ...base, sourceHost: "notfacebook.com" }).source).not.toBe("private");
    expect(buyerProtection({ ...base, sourceHost: "craigslist.org.example.net" }).source).not.toBe("private");
  });

  it("a maker-certified car shows the warranty terms the ad lists, and how much of the mileage cover could be left (case 32)", () => {
    const text = readFileSync("src/lib/listing/corpus/cases/32-toyota-certified-camry-xle.txt", "utf8");
    const p = buyerProtection({ ...base, text, sellerType: "dealer", year: 2020, price: 20167, miles: 82633 });
    expect(p.source).toBe("certified");
    expect(p.name).toBe("Toyota Gold Certified (as the ad says)");
    expect(p.warranty).toBe("Limited comprehensive: 12 months/12,000 miles; Limited powertrain: 7 years/100,000 miles; Roadside assistance: 7 years/100,000 miles");
    expect(p.notes.join(" ")).toContain("its 100,000-mile limit leaves at most 17,367 miles of cover on this car (82,633 now)");
    expect(p.notes.join(" ")).toContain("FTC Buyers Guide");
    // A private seller saying "certified" isn't a maker program.
    expect(buyerProtection({ ...base, text, sellerType: "private" }).source).toBe("private");
    // Past the limit: says so, without inventing what's left.
    expect(buyerProtection({ ...base, text: "Honda Certified. Powertrain warranty 7-year/100,000-mile", sellerType: "dealer", miles: 104000 }).notes.join(" ")).toContain("has already passed (104,000 now)");
    expect(buyerProtection({ ...base, text: "Certified Pre-Owned", sellerType: "dealer" }).name).toBe("Certified Pre-Owned (as the ad says)");
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

// Each citation was checked against the document itself (the NHTSA-hosted PDF's
// "affected vehicles" list). Changing a source, or the years it's shown for,
// means re-reading the document and updating this table on purpose.
const VERIFIED: Record<string, { label: string; url: string; fits: Record<string, [number, number]> }> = {
  "toyota-2az-oil": {
    label: "Toyota warranty program ZE7",
    url: "https://static.nhtsa.gov/odi/tsbs/2015/MC-10134468-9999.pdf",
    fits: { camry: [2007, 2009], "camry solara": [2007, 2008], solara: [2007, 2008], corolla: [2009, 2011], "corolla matrix": [2009, 2013], matrix: [2009, 2013], rav4: [2006, 2008] },
  },
  "toyota-tacoma-frame": { label: "Toyota warranty program ZH6", url: "https://static.nhtsa.gov/odi/tsbs/2017/MC-10119399-9999.pdf", fits: { tacoma: [2005, 2010] } },
  "honda-15t-oil-dilution": {
    label: "Consumer Reports: Honda extends warranty",
    url: "https://www.consumerreports.org/car-recalls-defects/honda-extends-warranty-on-troubled-turbo-engines",
    fits: { civic: [2016, 2018], "cr-v": [2017, 2018] },
  },
  "honda-vtc-rattle": { label: "Honda service bulletin 09-010", url: "https://static.nhtsa.gov/odi/tsbs/2012/SB-10041669-7570.pdf", fits: { accord: [2008, 2009] } },
  // 16-053 covers 2015–16 Accord L4 CVT and 2015–16 CR-V CVT. (16-057 is only a 2015 CR-V follow-up.)
  "honda-cvt-p1890": { label: "Honda service bulletin 16-053", url: "https://static.nhtsa.gov/odi/tsbs/2016/SB-10086143-2280.pdf", fits: { accord: [2015, 2016], "cr-v": [2015, 2016] } },
};

describe("known-issue citations", () => {
  it("every known issue cites the verified document for the verified years", () => {
    expect(KNOWN_ISSUES.map((k) => k.id).sort()).toEqual(Object.keys(VERIFIED).sort());
    for (const k of KNOWN_ISSUES) {
      const v = VERIFIED[k.id];
      expect({ id: k.id, label: k.source.label, url: k.source.url, fits: k.fits }).toEqual({ id: k.id, ...v });
    }
  });
  it("a bulletin named in the advice matches the one cited", () => {
    for (const k of KNOWN_ISSUES) {
      const named = k.check.match(/\b\d{2}-\d{3}\b/g) ?? [];
      for (const n of named) expect(k.source.label, `${k.id} mentions ${n}`).toContain(n);
    }
    // The check above must actually see bulletin numbers (it once matched nothing and passed silently).
    expect(KNOWN_ISSUES.find((k) => k.id === "honda-cvt-p1890")!.check.match(/\b\d{2}-\d{3}\b/g)).toEqual(["16-053"]);
  });
});

describe("buyerProtection: Autotrader Private Seller Exchange (real case 30)", () => {
  const base = { sourceHost: null, year: 2015, price: 9675, miles: 91000 };
  it("isn't 'no protection': Autotrader verifies the seller, the title and pays the seller after delivery", () => {
    const p = buyerProtection({ ...base, sellerType: "private", text: "Private Seller ExchangeVerified Vehicle ... (Private Seller)" });
    expect(p).toMatchObject({ source: "psx", level: "some", returns: null, warranty: null });
    expect(p.notes.join(" ")).toMatch(/only protects you if you pay through Autotrader's checkout/);
    expect(p.links[0].url).toMatch(/^https:\/\/intercom\.help\/autotraderprivatesellerexchange\//);
  });
  it("a plain private sale is still 'no protection'", () => {
    expect(buyerProtection({ ...base, sellerType: "private", text: "Selling my Jeep, cash only" }).level).toBe("none");
  });
});
