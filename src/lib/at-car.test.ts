import { describe, expect, it } from "vitest";
import { checkDash, dashHits, dashMiles } from "@/lib/ai/dash-read";
import { areaOf, severityOf } from "@/lib/decision";
import { barcodeVin, matchVins, vinsInText } from "@/lib/vin-read";

const VIN = "4T1B11HK8JU145889";
const OTHER = "1HGCR2F8XHA000123";

describe("reading the VIN off the car", () => {
  it("door-sticker barcodes: the import 'I' and spaces are dropped, the check digit must work", () => {
    expect(barcodeVin(`I${VIN}`)).toBe(VIN);
    expect(barcodeVin(` ${VIN.slice(0, 8)} ${VIN.slice(8)} `)).toBe(VIN);
    expect(barcodeVin("4T1B11HK9JU145889")).toBeNull();
    expect(barcodeVin("123456")).toBeNull();
  });

  it("photos read on the device: O/0 and I/1 mix-ups and spaces are fixed, misreads are rejected", () => {
    expect(vinsInText(`VEHICLE IDENTIFICATION NO.\n4T1B 11HK 8JU1 45889`)).toEqual([VIN]);
    expect(vinsInText("4T1B11HK8JU145BB9")).toEqual([]);
    expect(vinsInText(`VIN: 4T1B1IHK8JU145889`)).toEqual([VIN]);
    expect(vinsInText(`MFD BY TOYOTA 06/18 GVWR 4510 LB\nVIN 4T1B11HK8JU145889 TYPE PASS CAR`)).toEqual([VIN]);
    expect(vinsInText("no vin here at all")).toEqual([]);
  });
});

describe("VIN match (anti-clone)", () => {
  it("all the same: good evidence; one place alone: nothing yet", () => {
    expect(matchVins({ plate: VIN, door: VIN, title: VIN, ad: VIN })[0]).toMatchObject({ id: "proof-vin-match", title: "VIN matches on the windshield plate, door sticker, title and ad" });
    expect(matchVins({ plate: VIN })).toEqual([]);
    expect(matchVins({ ad: VIN })).toEqual([]);
  });

  it("any difference is a serious warning naming each place", () => {
    const h = matchVins({ plate: VIN, door: OTHER, ad: VIN })[0];
    expect(h.id).toBe("proof-vin-mismatch");
    expect(h.reason).toContain(`windshield plate ${VIN}; door sticker ${OTHER}; ad ${VIN}`);
    expect(severityOf(h.id)).toBe("stop");
    expect(areaOf(h.id)).toBe("listing");
    expect(severityOf("proof-vin-match")).toBe("note");
  });
});

describe("dashboard photo check", () => {
  it("accepts only the fixed list of lights and a whole-number odometer", () => {
    expect(checkDash({ readable: true, odometer: 126410, unit: "mi", lights: ["check_engine", "made_up", "airbag", "check_engine"] })).toEqual({ readable: true, odometer: 126410, unit: "mi", lights: ["check_engine", "airbag"] });
    expect(checkDash({ readable: true, odometer: "126k", unit: "mi", lights: [] })?.odometer).toBeNull();
    expect(checkDash({ readable: false, odometer: 5, lights: ["abs"] })).toEqual({ readable: false, odometer: null, unit: null, lights: [] });
    expect(checkDash({ odometer: 5 })).toBeNull();
    expect(dashMiles({ readable: true, odometer: 100_000, unit: "km", lights: [] })).toBe(62_137);
  });

  it("lights are 'check this'; fewer miles than an earlier reading is serious; a different ad number is a question", () => {
    const lit = dashHits({ readable: true, odometer: 126_410, unit: "mi", lights: ["check_engine"] }, { adMiles: 126_360, earlier: null });
    expect(lit.map((h) => h.id)).toEqual(["proof-dash-check_engine"]);
    expect(severityOf("proof-dash-check_engine")).toBe("verify");
    expect(areaOf("proof-dash-check_engine")).toBe("car");
    const back = dashHits({ readable: true, odometer: 98_000, unit: "mi", lights: [] }, { adMiles: 98_000, earlier: { miles: 126_357, source: "Carfax" } });
    expect(back.map((h) => h.id)).toEqual(["proof-dash-rollback", "proof-dash-clear"]);
    expect(severityOf("proof-dash-rollback")).toBe("stop");
    expect(dashHits({ readable: true, odometer: 140_000, unit: "mi", lights: [] }, { adMiles: 126_000, earlier: null }).map((h) => h.id)).toEqual(["proof-dash-miles-differ", "proof-dash-clear"]);
    expect(dashHits({ readable: false, odometer: null, unit: null, lights: [] }, { adMiles: 1, earlier: null })).toEqual([]);
  });
});

describe("walking a lot: the scanned cars, ranked", async () => {
  const { rankLot, upsertLot } = await import("@/lib/lot");
  it("best verdict first, then fewer recalls, then cheaper; a re-scan updates instead of duplicating", () => {
    const cars = [
      { vin: "A".repeat(17), at: 1, level: "stop" as const, recalls: 0, price: 5_000 },
      { vin: "B".repeat(17), at: 2, level: "investigate" as const, recalls: 3, price: 15_000 },
      { vin: "C".repeat(17), at: 3, level: "investigate" as const, recalls: 1, price: 16_000 },
      { vin: "D".repeat(17), at: 4 },
    ];
    expect(rankLot(cars).map((c) => c.vin[0])).toEqual(["C", "B", "A", "D"]);
    const next = upsertLot(cars, { vin: "D".repeat(17), at: 9, level: "verify", car: "2019 Honda Civic" });
    expect(next).toHaveLength(4);
    expect(next[0]).toMatchObject({ vin: "D".repeat(17), at: 4, level: "verify", car: "2019 Honda Civic" });
  });
});
