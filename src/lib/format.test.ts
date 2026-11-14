import { describe, expect, it } from "vitest";
import { makeName } from "./format";

describe("makeName (real case 31: 'Land rover' in the result title)", () => {
  it("writes NHTSA's capitals the way people do", () => {
    expect(makeName("LAND ROVER")).toBe("Land Rover");
    expect(makeName("MERCEDES-BENZ")).toBe("Mercedes-Benz");
    expect(makeName("ROLLS-ROYCE")).toBe("Rolls-Royce");
    expect(makeName("BMW")).toBe("BMW");
    expect(makeName("GMC")).toBe("GMC");
    expect(makeName("KIA")).toBe("Kia");
    expect(makeName("TOYOTA")).toBe("Toyota");
    expect(makeName(null)).toBeNull();
  });
});

describe("priceWithFee (real case 34: Autotrader's $21,298 + $799 dealer fee = $22,097)", () => {
  it("shows the ad's total with the fee broken out, only for a dealer's fee", async () => {
    const { dealerFee, priceWithFee } = await import("./format");
    expect(priceWithFee({ price: 21298, docFee: 799, sellerType: "dealer" })).toBe("$22,097 ($21,298 + $799 dealer fee)");
    expect(priceWithFee({ price: 21298, docFee: null, sellerType: "dealer" })).toBe("$21,298");
    expect(priceWithFee({ price: 9000, docFee: 300, sellerType: "private" })).toBe("$9,000");
    expect(priceWithFee({ price: null, docFee: 799, sellerType: "dealer" })).toBeNull();
    expect(dealerFee({ docFee: 799, sellerType: "dealer" })).toBe(799);
    expect(dealerFee({ docFee: 799, sellerType: "unknown" })).toBe(0);
  });
});

describe("notSure: an ad that gives two answers is shown as two answers, never one", () => {
  it("lists the ad's choices for the field, and nothing for a field it's sure of", async () => {
    const { adSays, notSure } = await import("./format");
    const l = { unsure: [{ field: "price" as const, values: [15990, 14990] }, { field: "miles" as const, values: [86000, 68000] }, { field: "exteriorColor" as const, values: ["silver", "black"] }] };
    expect(notSure(l, "price")).toBe("Not sure: the ad shows $15,990 or $14,990");
    expect(adSays(l, "miles")).toBe("86,000 mi or 68,000 mi");
    expect(adSays(l, "exteriorColor")).toBe("silver or black");
    expect(notSure(l, "year")).toBeNull();
    expect(notSure({}, "price")).toBeNull();
  });
});
