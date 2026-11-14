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
