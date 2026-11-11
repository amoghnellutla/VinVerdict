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
    // Craigslist's attribute box, pasted: the fields run together, so the next field's name follows the value.
    expect(parseListing("2019 Nissan Altima - $14,995\ncondition: good\nodometer: 61500\ntitle status: rebuilt\ntransmission: automatic").titleStatus).toBe("rebuilt");
    expect(parseListing("2012 Honda Civic - $2,500\ntitle status: parts only\ntransmission: manual").titleStatus).toBe("branded");
    expect(parseListing("2015 Honda Fit - $6,000\ntitle status: clean\ntransmission: automatic\nrebuilt transmission last year").titleStatus).toBe("clean");
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

describe("title and accident wording (probe 2026-11-10)", () => {
  it("reads more title brands", () => {
    expect(parseListing("2016 Civic, salvaged title, runs great").titleStatus).toBe("salvage");
    expect(parseListing("never salvaged, clean title").titleStatus).toBe("clean");
    expect(parseListing("junk title, parts car").titleStatus).toBe("branded");
    expect(parseListing("lemon law buyback, all fixed").titleStatus).toBe("lemon");
    expect(parseListing("manufacturer buyback").titleStatus).toBe("lemon");
    expect(parseListing("not a lemon, clean title").titleStatus).toBe("clean");
  });
  it("doesn't read a lemon color or air freshener as a lemon title", () => {
    expect(parseListing("lemon yellow paint, clean title").titleStatus).toBe("clean");
    expect(parseListing("comes with a lemon tree air freshener lol").titleStatus).toBe("unknown");
  });
  it("reads clean-title variants, but not 'clear title' (that means no lien)", () => {
    expect(parseListing("clean blue title").titleStatus).toBe("clean");
    expect(parseListing("clean and clear title").titleStatus).toBe("clean");
    expect(parseListing("title is clear").titleStatus).toBe("unknown");
  });
  it("reads wrecks and hit-a-deer as accidents", () => {
    expect(parseListing("was in a wreck last year, repaired").accident).toBe("reported");
    expect(parseListing("hit a deer, hood and bumper replaced").accident).toBe("reported");
    expect(parseListing("never been wrecked").accident).toBe("none");
    expect(parseListing("no wrecks, garage kept").accident).toBe("none");
  });
});

describe("more makes, and Autotrader's footer menu (real case 27)", () => {
  it("reads common non-Japanese makes and models when the make is named", () => {
    expect(parseListing("Certified 2024 BMW X5 sDrive40i RWD $43,191")).toMatchObject({ make: "BMW", model: "X5" });
    expect(parseListing("2019 Mercedes-Benz GLC 300 4MATIC $24,900")).toMatchObject({ make: "Mercedes-Benz", model: "GLC" });
    expect(parseListing("2018 jeep grand cherokee limited")).toMatchObject({ make: "Jeep", model: "Grand Cherokee" });
    expect(parseListing("2021 Tesla Model 3 long range")).toMatchObject({ make: "Tesla", model: "Model 3" });
  });
  it("doesn't take their model names as plain words", () => {
    expect(parseListing("2017 Accord, compass display, model 3 years old tires").make).toBe("Honda");
    expect(parseListing("built-in compass, 120k miles, $6,000").make).toBeNull();
  });
  it("doesn't read the footer's 'For Sale By Owner' link as a private seller", () => {
    expect(parseListing("2024 BMW X5 $43,191 Stock#: R9T70371 Used Cars for Sale Certified Cars for Sale New Cars for Sale For Sale By Owner Car Deals").sellerType).toBe("dealer");
    expect(parseListing("2015 Civic for sale by owner, $9,000").sellerType).toBe("private");
  });
});

describe("expensive cars and dealer fees (real case 28)", () => {
  it("reads a price over $250,000 instead of an option's price", () => {
    expect(parseListing("2026 Porsche 911 Turbo S. Sport Tailpipes $630. Listing Price $435,640").price).toBe(435640);
    expect(parseListing("Listing Price $1,250,000").price).toBeNull();
  });
  it("adds up the dealer's own fees from Autotrader's price box, not the state's (cases 28, 29)", () => {
    expect(parseListing("Listing Price $435,640 Dealer Fee + $995 Electronic Filing Fee + $499 Total Price $437,134 Dealer fees ($1,494) included.").docFee).toBe(1494);
    expect(parseListing("Listing Price $11,995 Title Fee + $18 Temp Tag Fee + $23 Doc Fee + $398 Total Price $12,434 Dealer fees ($439) included.").docFee).toBe(398);
    // Only state fees in the box: no dealer fee to report.
    expect(parseListing("Listing Price $9,995 Title Fee + $18 Registration Fee + $40 Total Price $10,053").docFee).toBeNull();
    // The box's mixed total alone isn't used: it can include state fees.
    expect(parseListing("2019 Kia Forte $11,995 Dealer fees ($439) included.").docFee).toBeNull();
    expect(parseListing("Doc fee $499").docFee).toBe(499);
  });
});

describe("rebuilt salvage titles, auction cars and links that aren't the listing (real case 29)", () => {
  it("reads a rebuilt salvage title as rebuilt, a plain salvage title as salvage", () => {
    expect(parseListing("This Vehicle Holds a Rebuilt Salvage Title").titleStatus).toBe("rebuilt");
    expect(parseListing("rebuilt from salvage, drives great").titleStatus).toBe("rebuilt");
    expect(parseListing("previously salvaged, now has a rebuilt title").titleStatus).toBe("rebuilt");
    expect(parseListing("salvage title, needs work").titleStatus).toBe("salvage");
  });
  it("reads the exterior colour, not a part's colour or the interior line", () => {
    expect(parseListing("Gravity Grey Exterior Black Interior Exterior Black Grille w/Chrome Surround").exteriorColor).toBe("gray");
    expect(parseListing("Exterior color: White").exteriorColor).toBe("white");
    expect(parseListing("Exterior Black Sapphire Metallic Rear Spoiler").exteriorColor).toBe("black");
  });
  it("doesn't take the seller's video, a Carfax link or a map as the listing's address", () => {
    expect(parseListing("2019 Kia Forte <a href=https://www.youtube.com/watch?v=abc>walk-around</a>")).toMatchObject({ url: null, sourceHost: null });
    expect(parseListing("Free report https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=1 and https://www.cars.com/vehicledetail/123/").sourceHost).toBe("cars.com");
  });
});

describe("Land Rover and other two-word makes (real case 31)", () => {
  it("reads the make and the right Range Rover", () => {
    expect(parseListing("Used 2025 Land Rover Range Rover SE AWD $114,999")).toMatchObject({ make: "Land Rover", model: "Range Rover" });
    expect(parseListing("2019 Land Rover Range Rover Sport HSE")).toMatchObject({ make: "Land Rover", model: "Range Rover Sport" });
    expect(parseListing("2020 Land Rover Discovery Sport SE")).toMatchObject({ make: "Land Rover", model: "Discovery Sport" });
    expect(parseListing("2018 Alfa Romeo Giulia Ti")).toMatchObject({ make: "Alfa Romeo", model: "Giulia" });
    expect(parseListing("2022 Genesis GV70 2.5T")).toMatchObject({ make: "Genesis", model: "GV70" });
  });
  it("reads a 1-mile odometer exactly as listed", () => {
    expect(parseListing("Used 2025 Land Rover Range Rover SE (308 mi away) 1 mi").miles).toBe(1);
  });
});
