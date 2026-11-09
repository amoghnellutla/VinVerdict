import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { buildVerdict } from "@/lib/verdict";
import { liveRuleHits, mergeLive } from "./merge";
import { parseAutoDevListing, parseMarketCheckListing, safeHttpsUrl, type LiveListing } from "./parse";

// Shapes copied from the real Phase 1 replies in .tmp/ (values changed).
const VIN = "4T1C11AK3MU436772";
const AUTODEV = {
  data: {
    "@id": `https://api.auto.dev/listings/${VIN}`,
    vin: VIN,
    vehicle: { year: 2021, make: "Toyota", model: "Camry", trim: "LE", exteriorColor: "Blueprint", vin: VIN },
    retailListing: {
      carfaxUrl: `https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=${VIN}`,
      city: "Sherwood", state: "AR", zip: "72120", cpo: false, dealer: "Gwatney Buick GMC",
      miles: 183086, price: 9900, vdp: "https://www.gwatney.com/used/2021-toyota-camry",
    },
    history: { accidentCount: 1, accidents: true, oneOwner: false, ownerCount: 3, personalUse: false, usageType: "Fleet" },
  },
  // Auto.dev also describes our own account. None of it may be copied.
  user: { email: "me@example.com", ip: "203.0.113.9" },
};
const MARKETCHECK = {
  num_found: 1,
  listings: [{
    vin: VIN, price: 10450, miles: 182900, seller_type: "dealer", vdp_url: "javascript:alert(1)", carfax_1_owner: false,
    carfax_clean_title: true, is_certified: 0, dom: 41, exterior_color: "Blue",
    build: { year: 2021, make: "Toyota", model: "Camry", trim: "LE" },
    dealer: { name: "Gwatney Buick GMC", city: "Sherwood", state: "AR", zip: "72120", phone: "501-555-0100", seller_email: "sales@example.com" },
  }],
};

const autoDev = () => parseAutoDevListing(AUTODEV, VIN)!;

describe("live listing parsers", () => {
  it("reads an Auto.dev listing and keeps only listing facts", () => {
    const l = autoDev();
    expect(l).toMatchObject({
      source: "Auto.dev", vin: VIN, year: 2021, make: "Toyota", model: "Camry", price: 9900, miles: 183086,
      sellerType: "dealer", sellerName: "Gwatney Buick GMC", accidentCount: 1, ownerCount: 3, usage: "fleet", removedAt: null,
    });
    expect(JSON.stringify(l)).not.toMatch(/me@example|203\.0\.113/);
  });

  it("reads a MarketCheck listing, drops non-https links and dealer contact details", () => {
    const l = parseMarketCheckListing(MARKETCHECK, VIN)!;
    expect(l).toMatchObject({ source: "MarketCheck", price: 10450, miles: 182900, accidentCount: null, cleanTitle: true, ownerCount: null, daysOnMarket: 41 });
    expect(l.url).toBeNull();
    expect(JSON.stringify(l)).not.toMatch(/sales@example|501-555/);
  });

  it("returns null for another VIN or a malformed reply", () => {
    expect(parseAutoDevListing(AUTODEV, "1HGCR2F8XHA000123")).toBeNull();
    expect(parseAutoDevListing("nope", VIN)).toBeNull();
    expect(parseMarketCheckListing({ listings: "x" }, VIN)).toBeNull();
    expect(parseMarketCheckListing({ num_found: 0, listings: [] }, VIN)).toBeNull();
  });

  it("allows only https links", () => {
    expect(safeHttpsUrl("https://dealer.example/car")).toBe("https://dealer.example/car");
    expect(safeHttpsUrl("http://dealer.example/car")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("merging a live listing into the check", () => {
  it("turns a bare VIN into a full check: price, miles and the accident from history", () => {
    const text = `VIN: ${VIN}`;
    const listing = parseListing(text);
    const before = buildVerdict({ text, listing, decoded: null }, {});
    expect(before.verdict).toBe("clear");

    const live = autoDev();
    expect(mergeLive(listing, live)).toMatchObject({ price: 9900, miles: 183086, accident: "reported", sellerType: "dealer", usage: "fleet" });
    const after = buildVerdict({ text, listing, decoded: null, live }, {}, new Date("2026-11-09"));
    const ids = after.hits.map((h) => h.id);
    expect(after.verdict).toBe("hide");
    expect(ids).toEqual(expect.arrayContaining(["live-accident", "high-miles", "fleet", "vin-only"]));
    expect(ids).not.toContain("no-price");
    expect(ids).not.toContain("accident-reported"); // shown once, with its source named
  });

  it("flags a private copy of a dealer's car offered far cheaper (cloned listing)", () => {
    const pasted = parseListing(`2021 Toyota Camry LE, 150,000 miles, $6,500. Selling my car, moving abroad soon. VIN ${VIN}`);
    const hits = liveRuleHits(pasted, autoDev()).map((h) => h.id);
    expect(hits).toContain("live-cloned");
    expect(hits).toContain("live-miles-lower");
  });

  it("flags the same VIN at a different price between two dealers", () => {
    const pasted = parseListing(`Used 2021 Toyota Camry LE $11,900 183,086 mi Dealer VIN ${VIN}`);
    expect(liveRuleHits(pasted, autoDev()).map((h) => h.id)).toContain("live-price-differs");
  });

  it("notes a listing that has ended", () => {
    const ended: LiveListing = { ...autoDev(), removedAt: "2026-10-02T00:00:00Z", accidentCount: 0 };
    const hits = liveRuleHits(parseListing(`VIN ${VIN}`), ended);
    expect(hits.map((h) => h.id)).toEqual(["live-ended"]);
    expect(mergeLive(parseListing(`VIN ${VIN}`), ended).accident).toBe("none");
  });

  it("keeps the pasted facts when they exist", () => {
    const pasted = parseListing(`2021 Toyota Camry, $9,800, 183,500 miles, no accidents. Dealer. VIN ${VIN}`);
    const m = mergeLive(pasted, { ...autoDev(), accidentCount: 0 });
    expect(m).toMatchObject({ price: 9800, miles: 183500, accident: "none" });
  });
});
