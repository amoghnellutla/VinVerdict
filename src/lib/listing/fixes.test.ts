import { describe, expect, it } from "vitest";
import { applyFixes, parseFixes } from "./fixes";
import { parseListing } from "./parse";

describe("parseFixes: what the buyer corrects is checked on the server", () => {
  it("keeps valid values only", () => {
    expect(parseFixes(JSON.stringify({ price: 11995, miles: 98100, make: "nissan", model: "Altima", exteriorColor: "gray", titleStatus: "clean", sellerType: "dealer", year: 2016, docFee: 499 })))
      .toEqual({ price: 11995, miles: 98100, make: "Nissan", model: "Altima", exteriorColor: "gray", titleStatus: "clean", sellerType: "dealer", year: 2016, docFee: 499 });
  });

  it("drops anything out of range, of the wrong type, or not on the list", () => {
    expect(parseFixes(JSON.stringify({ price: 5, miles: -1, year: 1900, docFee: 9_999, make: "Yugo<script>", model: "<b>x</b>", exteriorColor: "javascript:", titleStatus: "unknown", sellerType: "robot" }))).toBeNull();
    expect(parseFixes(JSON.stringify({ price: "11995" }))).toBeNull();
    expect(parseFixes(JSON.stringify({ price: 11995.5 }))).toBeNull();
    expect(parseFixes("not json")).toBeNull();
    expect(parseFixes(JSON.stringify([1, 2]))).toBeNull();
    expect(parseFixes("x".repeat(2_000))).toBeNull();
    expect(parseFixes(null)).toBeNull();
  });
});

describe("applyFixes: the buyer's answer replaces 'not sure' and is marked as entered", () => {
  const ad = "2016 Nissan Altima 2.5 SV\nCash Price $11,995\nFinance Price $10,995\nMiles: 98,100\nExterior: Gun Metallic";

  it("settles a price the ad gave two answers for", () => {
    const l = parseListing(ad);
    expect(l.price).toBeNull();
    expect(l.unsure?.map((u) => u.field)).toEqual(["price"]);
    const fixed = applyFixes(l, { price: 11995 });
    expect(fixed.price).toBe(11995);
    expect(fixed.unsure).toBeUndefined();
    expect(fixed.fixed).toEqual(["price"]);
    expect(fixed.miles).toBe(98100);
  });

  it("a fee of 0 removes a fee that was read wrong; no fixes leave the listing as it was", () => {
    const l = parseListing("Used 2019 Mazda CX-5 Touring\nRetail Price $21,995\nDealer Prep Fee $699\nYour Price $22,694");
    expect(l.docFee).toBe(699);
    expect(applyFixes(l, { docFee: 0 }).docFee).toBeNull();
    expect(applyFixes(l, null)).toBe(l);
  });

  it("a different make clears the model read for the old one", () => {
    const l = parseListing("2018 Honda Accord EX $16,900 68,450 miles");
    const fixed = applyFixes(l, { make: "Toyota" });
    expect(fixed.make).toBe("Toyota");
    expect(fixed.model).toBeNull();
    expect(applyFixes(l, { make: "Toyota", model: "Camry" }).model).toBe("Camry");
  });
});
