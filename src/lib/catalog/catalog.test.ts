import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG, findModel, loadMake, searchCatalog } from "./catalog";
import { bodyText, engineText, fuelText, performanceFacts } from "./describe";
import type { ModelYear } from "./types";

const YEAR: ModelYear = {
  variants: 3, body: "suv", size: "small", classes: ["Small Sport Utility Vehicle 4WD"], drive: ["AWD", "FWD"], power: ["gas", "hybrid"],
  cylinders: [4], displacementL: [2.5, 2.5], turbo: false, supercharged: false, manual: false, premiumFuel: false,
  fuelCostYear: { min: 1300, median: 1450, max: 1700 }, mpg: [27, 40], epaIds: [1],
};

describe("catalog data", () => {
  it("covers every year from 2000 and the famous makes", () => {
    const names = CATALOG.makes.map((m) => m.name);
    for (const n of ["Toyota", "Honda", "Ford", "Chevrolet", "Land Rover", "BMW", "Mercedes-Benz", "Porsche", "Tesla", "Hyundai", "Kia", "Jeep"]) expect(names).toContain(n);
    const years = new Set(CATALOG.makes.flatMap((m) => m.models.flatMap((x) => x.years)));
    for (let y = 2000; y <= 2025; y++) expect(years.has(y), String(y)).toBe(true);
  });

  it("has unique, URL-safe slugs and a data file for every make", () => {
    const files = new Set(readdirSync(join(process.cwd(), "src/data/catalog/makes")).map((f) => f.replace(/\.json$/, "")));
    expect(new Set(CATALOG.makes.map((m) => m.slug)).size).toBe(CATALOG.makes.length);
    for (const m of CATALOG.makes) {
      expect(m.slug).toMatch(/^[a-z0-9-]+$/);
      expect(files.has(m.slug), m.slug).toBe(true);
      expect(new Set(m.models.map((x) => x.slug)).size, m.name).toBe(m.models.length);
      for (const x of m.models) expect(x.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("splits vehicles EPA groups together (Range Rover, Sport, Velar, Evoque)", () => {
    for (const s of ["range-rover", "range-rover-sport", "range-rover-velar", "range-rover-evoque"]) expect(findModel("land-rover", s), s).not.toBeNull();
    expect(findModel("porsche", "911")?.model.years[0]).toBe(2000);
    expect(findModel("porsche", "carrera-2-coupe")).toBeNull();
  });

  it("only labels with an https Wikipedia source and a sentence that says so", () => {
    for (const m of CATALOG.makes) {
      if (m.luxury) {
        expect(m.luxury.source).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
        expect(m.luxury.reason).toMatch(/luxury|premium/i);
      }
      for (const x of m.models) if (x.sporty) expect(x.sporty.source).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
    }
    // A sports-car maker's SUV isn't labelled a sports car.
    expect(findModel("lamborghini", "urus")?.model.sporty).toBeUndefined();
    expect(findModel("mazda", "mx-5-miata")?.model.sporty).toBeDefined();
  });

  it("loads a make's year data and refuses odd slugs", async () => {
    const lr = await loadMake("land-rover");
    expect(lr?.models["range-rover"].years["2016"].cylinders).toEqual([6, 8]);
    expect(await loadMake("../index")).toBeNull();
    expect(await loadMake("not-a-make")).toBeNull();
  });
});

describe("search", () => {
  it("finds models by name, with or without the make", () => {
    expect(searchCatalog("camry").map((h) => `${h.make.name} ${h.model.name}`)).toContain("Toyota Camry");
    expect(searchCatalog("range rover sport").map((h) => h.model.slug)).toContain("range-rover-sport");
    expect(searchCatalog("crv").map((h) => h.model.slug)).toContain("cr-v");
    expect(searchCatalog("")).toEqual([]);
    expect(searchCatalog("zzzz")).toEqual([]);
  });
});

describe("describe", () => {
  it("writes the facts plainly", () => {
    expect(bodyText(YEAR)).toBe("Small SUV");
    expect(bodyText({ body: "car", size: "two-seater" })).toBe("Two-seater car");
    expect(engineText(YEAR)).toBe("4 cylinders, 2.5 L");
    expect(engineText({ ...YEAR, cylinders: [6, 8], displacementL: [3, 5], turbo: true })).toBe("6 or 8 cylinders, 3.0–5.0 L, turbo");
    expect(fuelText(YEAR)).toEqual({ year: "$1,300–$1,700", month: "$108–$142" });
    expect(fuelText({ ...YEAR, fuelCostYear: null })).toBeNull();
    expect(performanceFacts({ ...YEAR, size: "two-seater", drive: ["RWD"], manual: true })).toEqual(["two seats", "rear-wheel drive available", "manual transmission available"]);
  });
});
