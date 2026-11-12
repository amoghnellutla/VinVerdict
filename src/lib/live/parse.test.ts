import { describe, expect, it } from "vitest";
import { isSafeImageSrc, liveSeller } from "./parse";

describe("isSafeImageSrc", () => {
  it("allows listing photos from the approved host over https, and local previews", () => {
    expect(isSafeImageSrc("https://retail.photos.vin/2T2BZMCA2GC041915-1.jpg")).toBe(true);
    expect(isSafeImageSrc("blob:https://vinverdict.vercel.app/2b1c0d7e-1111-4c4c-9a9a-123456789abc")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "http://retail.photos.vin/x.jpg",
      "https://retail.photos.vin.evil.example/x.jpg",
      "https://evil.example/retail.photos.vin/x.jpg",
      "//retail.photos.vin/x.jpg",
      "not a url",
    ]) {
      expect(isSafeImageSrc(bad), bad).toBe(false);
    }
  });
});

describe("liveSeller (case 32: the feed named one dealer with another dealer's link)", () => {
  it("doesn't trust a seller name that isn't in the dealer site's address", () => {
    const dch = "https://www.dchwappingerstoyota.com/inventory/certified-used-2020-toyota-camry-fwd-4-door-xle-sedan-4t1f11ak9lu310542/";
    expect(liveSeller({ sellerName: "Fast Track Motors", url: dch })).toEqual({ name: null, mismatch: true });
    expect(liveSeller({ sellerName: "Dch Wappingers Falls Toyota", url: dch })).toEqual({ name: "Dch Wappingers Falls Toyota", mismatch: false });
    expect(liveSeller({ sellerName: "Fast Track Motors", url: "https://www.fasttrackmotors.com/2020-Toyota-Camry/used_car/x" }).mismatch).toBe(false);
    // Marketplaces list every seller, so their address proves nothing either way.
    expect(liveSeller({ sellerName: "Fast Track Motors", url: "https://www.autotrader.com/cars-for-sale/vehicle/123" }).mismatch).toBe(false);
    expect(liveSeller({ sellerName: null, url: dch })).toEqual({ name: null, mismatch: false });
  });
});
