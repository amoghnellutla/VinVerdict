import { describe, expect, it } from "vitest";
import { carId, importFile, MAX_CARS, merge, parseCar, parseWorkspace, remove, setNote, upsert, type SavedCar, type Workspace } from "./local";

const car = (o: Partial<SavedCar> = {}): SavedCar => ({
  id: "vin-1hgcr2f8xha000123", savedAt: "2026-11-10T08:00:00.000Z", title: "2017 Honda Accord EX-L", text: "2017 Honda Accord EX-L $9,000",
  vin: "1HGCR2F8XHA000123", price: 9000, miles: 98000, level: "investigate", verdict: "Worth investigating",
  areas: [{ area: "listing", status: "ok", line: "No scam warning signs in the ad" }], unknown: 5, warnings: [], note: "", ...o,
});
const empty: Workspace = { version: 1, cars: [] };

describe("workspace", () => {
  it("round-trips a saved car", () => {
    expect(parseCar(JSON.parse(JSON.stringify(car())))).toEqual(car());
  });

  it("refuses or cleans a tampered import", () => {
    expect(importFile("not json")).toBeNull();
    expect(importFile("x".repeat(1_000_001))).toBeNull();
    const w = importFile(JSON.stringify({
      cars: [
        car({ id: "bad id with spaces" }),
        { ...car({ id: "ad-1" }), level: "safe" },
        { ...car({ id: "ad-2" }), vin: "<script>alert(1)</script>", price: -5, miles: Number.MAX_SAFE_INTEGER, title: "x".repeat(5000), extra: "dropped" },
        "a string",
        null,
      ],
    }))!;
    expect(w.cars).toHaveLength(1);
    const c = w.cars[0] as SavedCar & { extra?: unknown };
    expect(c.id).toBe("ad-2");
    expect(c.vin).toBeNull();
    expect(c.price).toBeNull();
    expect(c.miles).toBeNull();
    expect(c.title).toHaveLength(300);
    expect(c.extra).toBeUndefined();
  });

  it("keeps the newest first, replaces the same car, keeps the note, and caps the list", () => {
    let w = upsert(empty, car());
    w = setNote(w, car().id, "Call Tuesday");
    w = upsert(w, car({ price: 8500 }));
    expect(w.cars).toHaveLength(1);
    expect(w.cars[0]).toMatchObject({ price: 8500, note: "Call Tuesday" });
    for (let i = 0; i < 30; i++) w = upsert(w, car({ id: `ad-${i}`, vin: null }));
    expect(w.cars).toHaveLength(MAX_CARS);
    expect(w.cars[0].id).toBe("ad-29");
    expect(remove(w, "ad-29").cars[0].id).toBe("ad-28");
  });

  it("merging an import keeps the current copy of a car", () => {
    const current = upsert(empty, car({ note: "mine" }));
    const merged = merge(current, parseWorkspace({ cars: [car({ note: "theirs" }), car({ id: "ad-9", vin: null })] }));
    expect(merged.cars.map((c) => c.note)).toEqual(["mine", ""]);
  });

  it("gives a car a stable id from its VIN, or from what was pasted", () => {
    expect(carId("1HGCR2F8XHA000123", "x")).toBe("vin-1hgcr2f8xha000123");
    expect(carId(null, "same text")).toBe(carId(null, "same text"));
    expect(carId(null, "same text")).not.toBe(carId(null, "other text"));
  });
});
