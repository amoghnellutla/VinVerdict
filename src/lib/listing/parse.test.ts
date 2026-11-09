import { describe, expect, it } from "vitest";
import { parseListing } from "./parse";
import { hasUnnegated } from "./text";

// Realistic (made-up) listings in the formats the analyzer will see.

const FACEBOOK = `2017 Honda Accord EX-L Sedan 4D
$9,000
Princeton, NJ
Driven 100,000 miles
Automatic transmission
Exterior color: Black · Interior color: Gray
Fuel type: Gasoline
Clean title
This vehicle has no significant damage or problems.
Seller's description
One owner, all service records. Selling my car because I'm moving. VIN 1HGCR2F8XHA000123`;

const CRAIGSLIST = `2016 toyota camry se - $11,500 (Edison)
condition: excellent
cylinders: 4 cylinders
fuel: gas
odometer: 84500
paint color: silver
title status: clean
transmission: automatic
type: sedan
2 owners, no accidents. Text 732-555-0100. Edison, NJ 08817`;

const DEALER = `Certified Pre-Owned 2019 Toyota RAV4 XLE AWD. Stock # T1234. Mileage: 45,210.
Price $21,995 + doc fee $499. We finance! Clean Carfax, 1-owner. Midnight Black Metallic exterior.`;

describe("parseListing", () => {
  it("parses a Facebook Marketplace listing", () => {
    expect(parseListing(FACEBOOK)).toMatchObject({
      kind: "text",
      vin: "1HGCR2F8XHA000123",
      year: 2017, make: "Honda", model: "Accord",
      price: 9000, miles: 100000,
      transmission: "automatic",
      titleStatus: "clean", accident: "none",
      exteriorColor: "black", ownerCount: 1, sellerType: "private", docFee: null,
    });
  });

  it("parses a Craigslist listing", () => {
    expect(parseListing(CRAIGSLIST)).toMatchObject({
      vin: null,
      year: 2016, make: "Toyota", model: "Camry",
      price: 11500, miles: 84500,
      transmission: "automatic",
      titleStatus: "clean", accident: "none",
      exteriorColor: "silver", ownerCount: 2, zip: "08817",
    });
  });

  it("parses a dealer listing and ignores the doc fee as a price", () => {
    expect(parseListing(DEALER)).toMatchObject({
      year: 2019, make: "Toyota", model: "RAV4",
      price: 21995, miles: 45210,
      titleStatus: "clean", ownerCount: 1, sellerType: "dealer", exteriorColor: "black", docFee: 499,
    });
  });

  it("handles 'k' shorthand and a model with no make", () => {
    const p = parseListing("2015 civic lx, 120k miles, asking 6.5k obo, cvt");
    expect(p).toMatchObject({ year: 2015, make: "Honda", model: "Civic", miles: 120000, price: 6500, transmission: "automatic" });
  });

  it("recognizes a bare VIN and a bare URL", () => {
    expect(parseListing("  1hgcr2f8xha000123 ")).toMatchObject({ kind: "vin", vin: "1HGCR2F8XHA000123" });
    expect(parseListing("https://www.facebook.com/marketplace/item/123/")).toMatchObject({
      kind: "url",
      sourceHost: "facebook.com",
    });
  });

  it("doesn't mistake mileage or price for the model year", () => {
    const p = parseListing("Honda Accord 2,018 miles $2015");
    expect(p.year).toBeNull();
  });

  it("detects branded titles, accidents and manual transmissions", () => {
    expect(parseListing("2014 Corolla rebuilt title runs great").titleStatus).toBe("rebuilt");
    expect(parseListing("2014 Corolla, rebuilt transmission, clean title").titleStatus).toBe("clean");
    expect(parseListing("no flood, no salvage, clean title").titleStatus).toBe("clean");
    expect(parseListing("minor fender bender last year").accident).toBe("reported");
    expect(parseListing("no rust, minor accident on bumper").accident).toBe("reported");
    expect(parseListing("never been in an accident").accident).toBe("none");
    expect(parseListing("6-speed manual transmission").transmission).toBe("manual");
  });

  it("keeps a VIN that fails the check digit so the scam rules can flag it", () => {
    expect(parseListing("VIN: 1HGCR2F81HA000123").vin).toBe("1HGCR2F81HA000123");
  });

  it("caps very long input", () => {
    expect(() => parseListing("a ".repeat(100_000))).not.toThrow();
  });
});

describe("hasUnnegated", () => {
  it("respects nearby negation but not across punctuation", () => {
    expect(hasUnnegated("no accidents", /accident/)).toBe(false);
    expect(hasUnnegated("never been in an accident", /accident/)).toBe(false);
    expect(hasUnnegated("no rust, minor accident", /accident/)).toBe(true);
  });
});
