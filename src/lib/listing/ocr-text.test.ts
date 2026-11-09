import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanOcrText } from "./ocr-text";
import { parseListing } from "./parse";

describe("cleanOcrText", () => {
  it("fixes the misreads that change prices and miles", () => {
    expect(cleanOcrText("S9,000 · Princeton, NJ")).toBe("$9,000 · Princeton, NJ");
    expect(cleanOcrText("Price: §12500")).toBe("Price: $12500");
    expect(cleanOcrText("Driven 100.000 miles")).toBe("Driven 100,000 miles");
    expect(cleanOcrText("$9.000")).toBe("$9,000");
  });

  it("leaves other text alone", () => {
    expect(cleanOcrText("2.5L 4-cylinder, SE trim, Model S")).toBe("2.5L 4-cylinder, SE trim, Model S");
    expect(cleanOcrText("Call 732.555.0100")).toBe("Call 732.555.0100");
  });

  it("turns a misread Facebook screenshot into a listing the parser understands", () => {
    const ocr = `< Marketplace
2017 Honda Accord EX-L Sedan 4D
S9,000
Listed 3 days ago in Princeton, NJ
Details
Driven 100.000 miles
Automatic transmission
Exterior color: Black · Interior color: Gray
Clean title
This vehicle has no significant damage or problems.
Seller's description
One owner, all service records. Selling my car because I’m moving.`;
    expect(parseListing(cleanOcrText(ocr))).toMatchObject({
      year: 2017, make: "Honda", model: "Accord", price: 9000, miles: 100000,
      titleStatus: "clean", accident: "none", sellerType: "private", exteriorColor: "black",
    });
  });
});

describe("real OCR output", () => {
  // tesseract.js (as the app runs it) on a dark-mode, phone-sized Marketplace-style screenshot.
  const raw = readFileSync(join(__dirname, "fixtures", "ocr-facebook-dark.txt"), "utf8");

  it("joins the VIN the OCR split and parses everything", () => {
    expect(raw).toContain("4T1BF1FK2GU 123459");
    const p = parseListing(cleanOcrText(raw));
    expect(p).toMatchObject({
      vin: "4T1BF1FK2GU123459", year: 2016, make: "Toyota", model: "Camry", price: 11500, miles: 84500,
      transmission: "automatic", titleStatus: "clean", accident: "none", exteriorColor: "silver",
      ownerCount: 2, sellerType: "private", zip: "08817",
    });
  });

  it("joins a VIN broken across lines after its label", () => {
    expect(cleanOcrText("VIN: 1HGCR2F8XHA\n000123")).toBe("VIN: 1HGCR2F8XHA000123");
    expect(cleanOcrText("see 1HGCR2F8X HA000123 here")).toBe("see 1HGCR2F8XHA000123 here");
    expect(cleanOcrText("CALL NOW 555 TODAY")).toBe("CALL NOW 555 TODAY");
  });
});
