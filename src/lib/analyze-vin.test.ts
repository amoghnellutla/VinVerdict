import { describe, expect, it, vi } from "vitest";

// NHTSA mocked: the decode of the VIN in the ad, and which car the recalls were asked for.
const asked: string[] = [];
vi.mock("next/cache", () => ({ cacheLife: () => {} }));
vi.mock("@/lib/nhtsa/client", () => ({
  decodeVin: async () => ({ vin: "x", year: 2012, make: "TOYOTA", model: "Camry", trim: null, body: null, driveType: null, transmission: null, transmissionKind: "unknown", fuel: null, curbWeightLb: null, displacementL: null, cylinders: null, electrification: null, errorCode: "1", clean: false }),
  getRecalls: async (v: { year: number; make: string; model: string }) => { asked.push(`${v.year} ${v.make} ${v.model}`); return []; },
  getSafetyRatings: async () => [],
  getComplaintSummary: async () => ({ total: 0, crashes: 0, fires: 0, injuries: 0, deaths: 0, topComponents: [], byPrefix: {} }),
  getYearRows: async () => [],
}));
vi.mock("@/lib/fuel/client", () => ({ findFuelEconomy: async () => null }));

describe("a VIN with a bad check digit doesn't replace the car in the ad", async () => {
  const { analyzeListing } = await import("./analyze");
  it("a mistyped VIN (check digit fails): the ad's 2015 Corolla is the car and gets the recalls, not the 2012 Camry it decodes to", async () => {
    asked.length = 0;
    const a = await analyzeListing("2015 Toyota Corolla LE - $8,200\nodometer: 126000\nVIN: 4T1BF1FK6CU234567");
    expect(a.vinCheck?.ok).toBe(false);
    expect(a.vehicle).toMatchObject({ year: 2015, make: "Toyota", model: "Corolla" });
    expect(asked[0]).toBe("2015 Toyota Corolla");
  });
});

describe("a valid VIN for a different car than the ad", async () => {
  const { analyzeListing } = await import("./analyze");
  it("the VIN is the physical truth: its car is named (and the mismatch is a warning elsewhere)", async () => {
    // Same decode mock (a 2012 Camry), but now the check digit passes.
    const a = await analyzeListing("2015 Toyota Corolla LE - $8,200\nVIN: 4T1BF1FK5CU234567");
    expect(a.vinCheck?.ok).toBe(true);
    expect(a.vehicle).toMatchObject({ year: 2012, model: "Camry" });
  });
});
