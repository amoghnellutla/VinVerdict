import { describe, expect, it } from "vitest";
import { basisText, priceBasis } from "./basis";
import type { Comp } from "./comps";

const comp = (o: Partial<Comp>): Comp => ({
  price: 10000, miles: 90000, year: 2016, trim: "EX-L", sellerType: "dealer", sold: true, url: null, city: null, state: null, daysOnMarket: null, seen: "2026-10-01", ...o,
});

describe("priceBasis", () => {
  it("says how many, how close and how recent", () => {
    const b = priceBasis({
      sold: [comp({ year: 2015, miles: 61000, seen: "2026-08-28" }), comp({ year: 2017, miles: 132000, trim: "LX", seen: "2026-11-10" })],
      active: [comp({ sold: false, seen: null, trim: "EX-L Navi" }), comp({ sold: false, seen: null, trim: null }), comp({ sold: false, seen: null })],
      target: { year: 2016, miles: 98000, trim: "EX-L" },
    });
    expect(b).toMatchObject({ ended: 2, current: 3, years: [2015, 2017], miles: [61000, 132000], sameTrim: 3, seen: ["2026-08-28", "2026-11-10"], cautions: [] });
    expect(basisText(b)).toBe(
      "Found 2 ended and 3 current listings within 100 miles: 2015–2017 models, 61k–132k miles, 3 with the same trim, ended listings last seen Aug 28, 2026 – Nov 10, 2026 (the estimate leaves out outliers).",
    );
  });

  it("warns when the sample is thin, the miles are out of range, or no trim matches", () => {
    const b = priceBasis({ sold: [comp({ miles: 40000, trim: "LX" })], active: [comp({ sold: false, miles: 50000, trim: "Sport" })], target: { year: 2016, miles: 150000, trim: "EX-L" } });
    expect(b.cautions).toEqual([
      "fewer than 5 similar cars, so treat the range as rough",
      "this car's miles are outside the range of the similar cars",
      "none of the similar cars has the same trim",
    ]);
  });

  it("leaves out the trim count when this car's trim isn't known", () => {
    const b = priceBasis({ sold: [], active: [comp({ sold: false })], target: { year: null, miles: null, trim: null } });
    expect(b.sameTrim).toBeNull();
    expect(basisText(b)).toBe("Found 1 current listing within 100 miles: 2016 models, 90k miles (the estimate leaves out outliers).");
  });
});
