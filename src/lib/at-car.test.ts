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

describe("at-the-car results kept on the device", () => {
  it("come back after a reload; anything tampered with or expired is dropped", async () => {
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const { loadAtCar, saveAtCar } = await import("@/lib/assistant/store");
    saveAtCar("vv-told:X", { vins: { plate: VIN, door: VIN }, dash: { readable: true, odometer: 126_410, unit: "mi", lights: ["check_engine"] } }, 1_000);
    expect(loadAtCar("vv-told:X", 2_000)).toEqual({ vins: { plate: VIN, door: VIN }, dash: { readable: true, odometer: 126_410, unit: "mi", lights: ["check_engine"] } });
    // Tampered: a VIN that fails its check digit and a made-up light are dropped.
    mem.set("vv-told:X:atcar", JSON.stringify({ at: 1_000, vins: { plate: "4T1B11HK9JU145889", title: VIN }, dash: { readable: true, odometer: 5, lights: ["self_destruct"] } }));
    expect(loadAtCar("vv-told:X", 2_000)).toEqual({ vins: { title: VIN }, dash: { readable: true, odometer: 5, unit: "mi", lights: [] } });
    expect(loadAtCar("vv-told:X", 1_000 + 8 * 86_400_000)).toEqual({ vins: {}, dash: null });
    saveAtCar("vv-told:X", { vins: {}, dash: null });
    expect(mem.has("vv-told:X:atcar")).toBe(false);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe("no VIN out of thin air (a photo of anything that isn't a VIN)", () => {
  it("garbled text from random objects never yields a VIN", () => {
    // A seeded generator: the same 20,000 random 'OCR reads' every run.
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ||-.:,";
    let found = 0;
    for (let n = 0; n < 20_000; n++) {
      const len = 20 + Math.floor(rnd() * 120);
      let line = "";
      for (let i = 0; i < len; i++) line += CH[Math.floor(rnd() * CH.length)];
      found += vinsInText(line).length;
    }
    expect(found).toBe(0);
  });

  it("a real VIN is still found in the usual layouts", () => {
    expect(vinsInText(`VIN:${VIN}`)).toEqual([VIN]);
    expect(vinsInText(`VIN${VIN}`)).toEqual([VIN]);
    expect(vinsInText("4T1B 11HK 8JU1 45889")).toEqual([VIN]);
    expect(vinsInText("4T1B11HK8JU145889 TYPE PASS CAR GVWR 4510")).toEqual([VIN]);
    expect(vinsInText("4T1B11HK8JU1458890000")).toEqual([]); // inside longer text: not a VIN
  });

  it("the extra VIN rules: year code, serial digits", async () => {
    const { plausibleVin } = await import("@/lib/vin-read");
    expect(plausibleVin(VIN)).toBe(true);
    expect(plausibleVin(OTHER)).toBe(true);
  });
});

describe("a dashboard photo that didn't really read", () => {
  it("no odometer and no lights is never 'no warning lights seen'", () => {
    expect(dashHits({ readable: true, odometer: null, unit: null, lights: [] }, { adMiles: 100_000, earlier: null })).toEqual([]);
  });
});

describe("misreads of letter-spaced VINs", () => {
  it("a space read into the VIN, or one stray character, still gives the VIN", () => {
    expect(vinsInText("VIN: 1 HGCR2F16HA198010")).toEqual(["1HGCR2F16HA198010"]);
    // One stray character: every plausible way of dropping it is a candidate; NHTSA picks the real car.
    expect(vinsInText("VIN: 1THGCR2F16HA198010")).toContain("1HGCR2F16HA198010");
    expect(vinsInText("VIN1THGCR2F16HA198010")).toContain("1HGCR2F16HA198010");
    expect(vinsInText("VIN: 1THGCR2F16HA198010").length).toBeLessThanOrEqual(3);
  });
});
