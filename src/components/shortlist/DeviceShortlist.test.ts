import { describe, expect, it } from "vitest";
import type { SavedCar } from "@/lib/workspace/local";
import { ymmOf } from "./DeviceShortlist";

const car = (o: Partial<SavedCar>): SavedCar => ({ id: "a", savedAt: "2026-11-19T00:00:00.000Z", title: "2019 Honda Civic EX", text: "", vin: null, price: null, miles: null, level: "thin", verdict: "", areas: [], unknown: 0, warnings: [], note: "", ...o });

describe("a visitor's saved car on the Shortlist", () => {
  it("uses the year, make and model they confirmed", () => {
    expect(ymmOf(car({ details: { sourceUrl: null, mpg: null, powertrain: null, titleStatus: "unknown", accident: "unknown", year: 2018, make: "Toyota", model: "RAV4" } }))).toEqual({ year: 2018, make: "Toyota", model: "RAV4" });
  });
  it("reads them off the title for a car saved before the details existed", () => {
    expect(ymmOf(car({}))).toEqual({ year: 2019, make: "Honda", model: "Civic EX" });
    expect(ymmOf(car({ title: "VIN 1HGCR2F8XHA000123" }))).toEqual({ year: null, make: null, model: null });
  });
});
