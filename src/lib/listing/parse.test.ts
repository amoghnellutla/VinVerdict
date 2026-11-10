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

  it("stops a finished negation from reaching the next line of a pasted page", () => {
    expect(hasUnnegated("no title issues reported 1 accident reported", /accident/)).toBe(true);
    expect(hasUnnegated("no accident or damage reported", /accident/)).toBe(false);
  });
});

describe("parseListing edge cases from real pages", () => {
  it("reads labelled VINs and VINs inside dealer links as VIN lookups", () => {
    expect(parseListing("VIN: 4T1C11AK3MU436772").kind).toBe("vin");
    expect(parseListing("vin # 4T1C11AK3MU436772").kind).toBe("vin");
    expect(parseListing("https://dealer.example/used-2021-camry-4t1c11ak3mu436772").kind).toBe("vin");
    expect(parseListing("VIN: 4T1C11AK3MU436772 $9,900").kind).toBe("text");
  });

  it("ignores safety-feature names when looking for accidents", () => {
    expect(parseListing("Toyota Safety Sense with Pre-Collision System").accident).toBe("unknown");
    expect(parseListing("Honda Sensing: Collision Mitigation Braking System").accident).toBe("unknown");
    expect(parseListing("Forward collision warning. Was rear-ended last year").accident).toBe("reported");
  });

  it("reads history boxes", () => {
    expect(parseListing("Accidents or damage: None reported").accident).toBe("none");
    expect(parseListing("Accidents or damage\nNone reported").accident).toBe("none");
    expect(parseListing("At least 1 accident or damage reported").accident).toBe("reported");
    expect(parseListing("Clean title: No").titleStatus).toBe("branded");
    expect(parseListing("clean title no accidents").titleStatus).toBe("clean");
    expect(parseListing("1-owner vehicle: No").ownerCount).toBeNull();
  });

  it("skips service-history and distance mileage", () => {
    expect(parseListing("new tires at 90k miles, about 150k miles total").miles).toBe(150000);
    expect(parseListing("Sherwood, AR (969 mi away) 183,086 mi").miles).toBe(183086);
    expect(parseListing("3-year/36,000 miles warranty. Mileage: 31,200").miles).toBe(31200);
  });

  it("skips reference prices", () => {
    expect(parseListing("MSRP $31,450 Internet Price $25,495").price).toBe(25495);
    expect(parseListing("$1,431 under market $21,488").price).toBe(21488);
  });

  it("tells private sellers from dealers", () => {
    expect(parseListing("Serviced at the dealer. No dealers please.").sellerType).toBe("private");
    expect(parseListing("Selling my car, all maintenance done at the Toyota dealer").sellerType).toBe("private");
    expect(parseListing("Autotrader Private Seller Cars ... Contact Dealer").sellerType).toBe("dealer");
  });
});

describe("phone numbers", () => {
  it("finds US phone numbers in common formats, not VINs or post ids", () => {
    expect(parseListing("Call (732) 555-0100 or text 908.555.0142, +1 609-555-0199").phones).toEqual(["7325550100", "9085550142", "6095550199"]);
    expect(parseListing("VIN 1HGCR2F8XHA000123 post id: 7790123456, 0000000000").phones).toEqual([]);
  });
});

describe("short texts", () => {
  it("reads two-digit years, bare prices and 'k' miles", () => {
    expect(parseListing("selling my 08 accord 4cyl 165k, 4500 cash")).toMatchObject({ year: 2008, model: "Accord", price: 4500, miles: 165000, sellerType: "private" });
    expect(parseListing("'15 camry le 98k miles 9k obo")).toMatchObject({ year: 2015, price: 9000, miles: 98000 });
    expect(parseListing("2014 civic, new tires at 140k, asking 6500").miles).toBeNull();
  });
});

describe("prior use: police and taxi", () => {
  it("doesn't read safety advice as police or taxi use", () => {
    expect(parseListing("2017 Accord $13,900. Happy to meet at a bank or police station.").usage).toBe("unknown");
    expect(parseListing("2017 Accord $13,900. I'll take a taxi home after the sale.").usage).toBe("unknown");
  });
  it("still catches a car that was a police car or taxi", () => {
    expect(parseListing("2015 Ford Taurus police interceptor, 120k miles").usage).toBe("fleet");
    expect(parseListing("2016 Toyota Camry hybrid, former taxi, 300k miles").usage).toBe("fleet");
  });
});
