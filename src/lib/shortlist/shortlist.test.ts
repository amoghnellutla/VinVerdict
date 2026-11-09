import { describe, expect, it } from "vitest";
import { searchLinks } from "@/lib/search-links";
import { rateYears, shortlist } from "./shortlist";

const NOW = new Date("2026-11-09");

describe("shortlist", () => {
  it("compares years by complaints per year on the road, within one model", () => {
    const rows = [2016, 2017, 2018, 2019, 2020].map((year) => ({ year, complaints: 100, crashes: 1, top: [] }));
    rows[2].complaints = 400; // 2018: many
    rows[4].complaints = 10; // 2020: fewer
    const r = rateYears(rows, "Honda", "Civic", NOW);
    expect(r.find((y) => y.year === 2018)!.rating).toBe("many");
    expect(r.find((y) => y.year === 2020)!.rating).toBe("fewer");
    // Older years have had longer to collect complaints: 100 over 11 years is "typical", not "fewer".
    expect(r.find((y) => y.year === 2016)!.rating).toBe("typical");
  });

  it("marks known-issue years from the inspection list", () => {
    const r = rateYears([{ year: 2017, complaints: 50, crashes: 0, top: [] }, { year: 2020, complaints: 50, crashes: 0, top: [] }], "Honda", "Civic", NOW);
    expect(r[0].knownIssues[0].title).toMatch(/fuel in the oil/i);
    expect(r[1].knownIssues).toEqual([]);
  });

  it("builds every model from the data file", () => {
    const s = shortlist(NOW);
    expect(s.length).toBeGreaterThanOrEqual(10);
    expect(s.find((m) => m.make === "Lexus")!.model).toBe("ES");
    for (const m of s) for (const y of m.best) expect(m.careful).not.toContain(y);
  });
});

describe("searchLinks", () => {
  it("pre-fills AutoTempest and Facebook", () => {
    const [at, fb] = searchLinks({ make: "Toyota", model: "Camry", zip: "08540", minYear: 2018, maxYear: 2021, maxPrice: 15000 });
    const u = new URL(at.href);
    expect(Object.fromEntries(u.searchParams)).toEqual({ make: "toyota", model: "camry", zip: "08540", radius: "100", minyear: "2018", maxyear: "2021", maxprice: "15000" });
    expect(new URL(fb.href).searchParams.get("query")).toBe("Toyota Camry 2018-2021");
  });
});

describe("shortlist data gaps", () => {
  it("drops years with no complaints and never calls a suspiciously low year 'best'", () => {
    const rows = [2014, 2015, 2016, 2017, 2018].map((year) => ({ year, complaints: 200, crashes: 0, top: [] }));
    rows[0].complaints = 0; // not sold
    rows[1].complaints = 12; // data gap
    const r = rateYears(rows, "Toyota", "Camry", new Date("2026-11-09"));
    expect(r.map((y) => y.year)).not.toContain(2014);
    expect(r.find((y) => y.year === 2015)!.sparse).toBe(true);
  });
});
