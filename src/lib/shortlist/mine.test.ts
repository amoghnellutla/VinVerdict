import { describe, expect, it } from "vitest";
import { isActiveRoute, NAV_ROUTES } from "@/lib/routes";
import { guideModelFor } from "./mine";
import { shortlist } from "./shortlist";

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
