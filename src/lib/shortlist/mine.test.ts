import { describe, expect, it } from "vitest";
import { isActiveRoute, NAV_ROUTES } from "@/lib/routes";
import { guideModelFor } from "./mine";
import { allModels, shortlist } from "./shortlist";

const models = shortlist(new Date("2026-11-19"));
const name = (m: ReturnType<typeof guideModelFor>) => (m ? `${m.make} ${m.model}` : null);

describe("the owner's Shortlist: only the models of the cars they've checked", () => {
  it("matches a car to its guide model however the model is written", () => {
    expect(name(guideModelFor(models, { make: "Toyota", model: "RAV4" }))).toBe("Toyota RAV4");
    expect(name(guideModelFor(models, { make: "TOYOTA", model: "RAV4 XLE Premium" }))).toBe("Toyota RAV4");
    expect(name(guideModelFor(models, { make: "Honda", model: "CRV" }))).toBe("Honda CR-V");
    expect(name(guideModelFor(models, { make: "Honda", model: "Accord Sport" }))).toBe("Honda Accord");
    expect(name(guideModelFor(models, { make: "Lexus", model: "ES 350" }))).toBe("Lexus ES");
    expect(name(guideModelFor(models, { make: "Lexus", model: "ES350" }))).toBe("Lexus ES");
    expect(name(guideModelFor(models, { make: "Mazda", model: "3" }))).toBe("Mazda Mazda3");
    expect(name(guideModelFor(models, { make: "Mazda", model: "CX-5 Touring" }))).toBe("Mazda CX-5");
  });

  it("never matches a different model or make by a near name", () => {
    expect(guideModelFor(models, { make: "Honda", model: "HR-V" })?.model).toBe("HR-V");
    // A different car that shares the name isn't given its years.
    expect(guideModelFor(models, { make: "Toyota", model: "Corolla Cross" })).toBeNull();
    expect(guideModelFor(models, { make: "Toyota", model: "Prius c" })).toBeNull();
    expect(guideModelFor(models, { make: "Toyota", model: "RAV4 Prime" })).toBeNull();
    expect(guideModelFor(models, { make: "Ford", model: "Escape" })).toBeNull();
    expect(guideModelFor(models, { make: "Lexus", model: "ESX" })).toBeNull();
    expect(guideModelFor(models, { make: "Toyota", model: null })).toBeNull();
  });
});

describe("every model with enough NHTSA data, not just the guide's 15", () => {
  const all = allModels(new Date("2026-11-19"));
  it("rates cars outside the guide, each as its own model", () => {
    expect(name(guideModelFor(all, { make: "Kia", model: "Soul" }))).toBe("Kia Soul");
    expect(name(guideModelFor(all, { make: "Ford", model: "Escape SE" }))).toBe("Ford Escape");
    expect(name(guideModelFor(all, { make: "Toyota", model: "Corolla Cross" }))).toBe("Toyota Corolla Cross");
    expect(name(guideModelFor(all, { make: "Hyundai", model: "Santa Fe Sport" }))).toBe("Hyundai Santa Fe Sport");
    expect(name(guideModelFor(all, { make: "Hyundai", model: "Santa Fe SE" }))).toBe("Hyundai Santa Fe");
    expect(name(guideModelFor(all, { make: "Ford", model: "F-150 XLT" }))).toBe("Ford F-150");
    expect(name(guideModelFor(all, { make: "Mercedes-Benz", model: "C 300" }))).toBe("Mercedes-Benz C300");
    // Not enough data for its own years: never given the Prius's.
    expect(guideModelFor(all, { make: "Toyota", model: "Prius c" })).toBeNull();
  });
  it("a hybrid gets NHTSA's hybrid model when it's on file, a plug-in never the regular hybrid's", () => {
    expect(name(guideModelFor(all, { make: "Toyota", model: "Camry", powertrain: "hybrid" }))).toBe("Toyota Camry Hybrid");
    expect(name(guideModelFor(all, { make: "Toyota", model: "Camry", powertrain: "gas" }))).toBe("Toyota Camry");
    expect(name(guideModelFor(all, { make: "Toyota", model: "Camry Hybrid XLE" }))).toBe("Toyota Camry Hybrid");
    expect(name(guideModelFor(all, { make: "Chrysler", model: "Pacifica", powertrain: "plug-in hybrid" }))).toBe("Chrysler Pacifica Plug-in Hybrid");
    expect(name(guideModelFor(all, { make: "Honda", model: "Accord", powertrain: "plug-in hybrid" }))).toBe("Honda Accord");
  });
});

describe("the owner's nav: one My cars item for the whole hub", () => {
  const myCars = NAV_ROUTES.find((r) => r.label === "My cars")!;
  it("has no Search, and My cars is lit on every hub page and a car's own page", () => {
    expect(NAV_ROUTES.map((r) => r.label)).toEqual(["Check a car", "Deal check", "My cars"]);
    for (const p of ["/checked", "/shortlist", "/compare", "/settings", "/car/12"]) expect(isActiveRoute(myCars, p), p).toBe(true);
    for (const p of ["/", "/deal", "/cars", "/carfax", "/shortlistx"]) expect(isActiveRoute(myCars, p), p).toBe(false);
    expect(isActiveRoute(NAV_ROUTES[0], "/")).toBe(true);
    expect(isActiveRoute(NAV_ROUTES[0], "/deal")).toBe(false);
  });
});
