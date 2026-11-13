import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikeCar } from "./looks-like-car";

const DIR = "src/lib/listing/corpus/cases";

describe("is it a car at all? (before a check is spent)", () => {
  it("every real listing page in the corpus passes", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".txt"));
    expect(files.length).toBeGreaterThan(30);
    for (const f of files) expect(looksLikeCar(readFileSync(`${DIR}/${f}`, "utf8")), f).toBe(true);
  });

  it("short real inputs pass: a VIN, a mistyped VIN, a link, a few words about the car", () => {
    for (const t of ["4T1B11HK8JU145889", "4T1B11HK9JU145889", "https://www.autotrader.com/cars-for-sale/vehicle/123", "2017 Accord EX-L 100k miles $9,000", "honda civic 2019", "Toyota Camry LE"]) expect(looksLikeCar(t), t).toBe(true);
  });

  it("junk and photos of other things are refused", () => {
    for (const t of ["asdkj qwe 9981 zzkx lorem ipsum dolor 774 kkk", "hello there", "MORNING ROAST 12 OZ 340 G BEST BY 0827 2026 LOT 4471B 22K9", "!!!! ???", "Thanks for your interest in the car"]) expect(looksLikeCar(t), t).toBe(false);
  });
});
