import { describe, expect, it } from "vitest";
import { defaultMaintenance, yearlyRunningCost } from "@/lib/costs/running";
import { driveOf, fuelKind, parseMenu, parsePrices, parseVehicle, pickModels, pickOptions, type FuelTarget } from "./parse";

// Shapes captured from the live API on 2026-11-08.
const ACCORD_2017 = {
  id: "37626", comb08: "29", city08: "26", highway08: "34", combE: "0.0",
  fuelType: "Regular", atvType: "", trany: "Automatic (AV-S7)", displ: "2.4", cylinders: "4",
};
const CLARITY_EV = { id: "41185", comb08: "114", city08: "126", highway08: "103", combE: "29.5354", fuelType: "Electricity", atvType: "EV" };
const TOYOTA_2019 = ["4Runner 2WD", "Camry", "Camry Hybrid LE", "Camry Hybrid XLE/SE", "Camry LE/SE", "Camry XLE/XSE", "Corolla", "Corolla Hatchback", "RAV4 2WD", "RAV4 AWD", "RAV4 Hybrid AWD"];
const HONDA_2017 = ["Accord", "Accord Hybrid", "Civic 4Dr", "Civic Si 4Dr", "CR-V AWD", "CR-V FWD", "Clarity EV"];

const t = (o: Partial<FuelTarget>): FuelTarget => ({
  model: "Accord", displacementL: null, cylinders: null, transmission: "unknown", drive: null, hybrid: false, electric: false, ...o,
});

describe("parsers", () => {
  it("parseMenu handles array, single object and null", () => {
    expect(parseMenu({ menuItem: [{ text: "a", value: "1" }, { text: "b", value: "2" }] })).toHaveLength(2);
    expect(parseMenu({ menuItem: { text: "Auto (A1)", value: "41185" } })).toEqual([{ text: "Auto (A1)", value: "41185" }]);
    expect(parseMenu(null)).toEqual([]);
    expect(parseMenu({ menuItem: [{ text: 1 }] })).toEqual([]);
  });

  it("parseVehicle for gas and EV", () => {
    expect(parseVehicle(ACCORD_2017, "Accord · x")).toEqual({ id: 37626, label: "Accord · x", comb: 29, city: 26, hwy: 34, kwhPer100: null, fuel: "regular", atvType: null });
    expect(parseVehicle(CLARITY_EV, "Clarity EV")).toMatchObject({ comb: 114, kwhPer100: 29.5354, fuel: "electric", atvType: "EV" });
    expect(parseVehicle({ id: "1" }, "x")).toBeNull();
    expect(parseVehicle(null, "x")).toBeNull();
  });

  it("parsePrices", () => {
    const p = parsePrices({ cng: "3.1", diesel: "6.29", e85: "2.95", electric: "0.15", lpg: "3.55", midgrade: "4.76", premium: "5.16", regular: "4.15" });
    expect(p).toMatchObject({ regular: 4.15, premium: 5.16, diesel: 6.29, electric: 0.15 });
    expect(parsePrices({})).toBeNull();
  });

  it("fuelKind and driveOf", () => {
    expect(fuelKind("Premium Gasoline")).toBe("premium");
    expect(fuelKind("Regular Gas and Electricity")).toBe("regular");
    expect(fuelKind("Electricity")).toBe("electric");
    expect(driveOf("4WD/4-Wheel Drive/4x4")).toBe("awd");
    expect(driveOf("AWD/All-Wheel Drive")).toBe("awd");
    expect(driveOf("4x2")).toBe("2wd");
    expect(driveOf("FWD/Front-Wheel Drive")).toBe("2wd");
    expect(driveOf(null)).toBeNull();
  });
});

describe("matching", () => {
  it("picks the base model and skips hybrids for a gas car", () => {
    expect(pickModels(HONDA_2017, t({ model: "Accord" }))).toEqual(["Accord"]);
    expect(pickModels(HONDA_2017, t({ model: "Accord", hybrid: true }))).toEqual(["Accord Hybrid"]);
  });

  it("uses the drive to choose between AWD and 2WD names", () => {
    expect(pickModels(HONDA_2017, t({ model: "CR-V", drive: "awd" }))).toEqual(["CR-V AWD"]);
    expect(pickModels(HONDA_2017, t({ model: "CR-V", drive: "2wd" }))).toEqual(["CR-V FWD"]);
    expect(pickModels(HONDA_2017, t({ model: "CR-V" }))).toEqual(["CR-V AWD", "CR-V FWD"]);
    expect(pickModels(TOYOTA_2019, t({ model: "RAV4", drive: "awd" }))).toEqual(["RAV4 AWD"]);
    expect(pickModels(["RAV4", "RAV4 AWD", "RAV4 Hybrid AWD"], t({ model: "RAV4", drive: "awd" }))).toEqual(["RAV4 AWD"]);
    expect(pickModels(["RAV4", "RAV4 AWD"], t({ model: "RAV4", drive: "2wd" }))).toEqual(["RAV4"]);
    expect(pickModels(["Accord"], t({ model: "Accord", drive: "awd" }))).toEqual(["Accord"]);
  });

  it("keeps trim-named variants and doesn't match other models", () => {
    expect(pickModels(TOYOTA_2019, t({ model: "Camry" }))).toEqual(["Camry", "Camry LE/SE", "Camry XLE/XSE"]);
    expect(pickModels(TOYOTA_2019, t({ model: "Camry", hybrid: true }))).toEqual(["Camry Hybrid LE", "Camry Hybrid XLE/SE"]);
    expect(pickModels(HONDA_2017, t({ model: "Civic" }))).toEqual(["Civic 4Dr", "Civic Si 4Dr"]);
    expect(pickModels(HONDA_2017, t({ model: "Pilot" }))).toEqual([]);
  });

  it("narrows engine options by cylinders, size and transmission, never to zero", () => {
    const opts = [
      { text: "Auto (AV-S7), 4 cyl, 2.4 L", value: "37626" },
      { text: "Auto (S6), 6 cyl, 3.5 L", value: "37623" },
      { text: "Auto (variable gear ratios), 4 cyl, 2.4 L", value: "37625" },
      { text: "Man 6-spd, 4 cyl, 2.4 L", value: "37624" },
    ];
    expect(pickOptions(opts, t({ cylinders: 4, displacementL: 2.4, transmission: "automatic" })).map((o) => o.value)).toEqual(["37626", "37625"]);
    expect(pickOptions(opts, t({ cylinders: 4, transmission: "manual" })).map((o) => o.value)).toEqual(["37624"]);
    expect(pickOptions(opts, t({ cylinders: 8 }))).toHaveLength(4);
  });
});

describe("yearlyRunningCost", () => {
  it("gas: 12,000 mi at 29 MPG and $4.15 + AAA maintenance", () => {
    const m = defaultMaintenance(12000);
    expect(m).toBe(1325); // 12,000 × 11.04¢
    const r = yearlyRunningCost({ vehicle: { comb: 29, kwhPer100: null, fuel: "regular" }, milesPerYear: 12000, fuelPrice: 4.15, maintenancePerYear: m });
    expect(r.fuel).toBe(1717.24); // 12000 / 29 × 4.15
    expect(r.total).toBe(3042.24);
    expect(r.perMonth).toBe(253.52);
  });

  it("EV uses kWh per 100 miles", () => {
    const r = yearlyRunningCost({ vehicle: { comb: 114, kwhPer100: 29.5354, fuel: "electric" }, milesPerYear: 12000, fuelPrice: 0.15, maintenancePerYear: 0 });
    expect(r.fuel).toBe(531.64); // 12000 × 0.295354 × 0.15
  });
});
