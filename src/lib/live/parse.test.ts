import { describe, expect, it } from "vitest";
import { isSafeImageSrc } from "./parse";

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
