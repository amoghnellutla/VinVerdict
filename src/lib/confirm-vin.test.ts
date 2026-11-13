import { describe, expect, it, vi } from "vitest";

const decode = vi.fn();
vi.mock("@/app/actions/decode", () => ({ decodeVinAction: (v: string) => decode(v) }));

const car = (o: Record<string, unknown>) => ({ ok: true, decoded: { vin: "x", year: 2018, make: "Toyota", model: "Camry", clean: true, errorCode: "0", ...o } });

describe("confirmVin: only a VIN NHTSA really knows is used", async () => {
  const { confirmVin } = await import("./confirm-vin");
  it("a real car: its year, make and model", async () => {
    decode.mockResolvedValue(car({}));
    expect(await confirmVin("4T1B11HK8JU145889")).toEqual({ status: "ok", name: "2018 Toyota Camry" });
  });
  it("NHTSA knows nothing: invalid", async () => {
    decode.mockResolvedValue(car({ make: null, year: null, model: null, clean: false, errorCode: "7" }));
    expect((await confirmVin("ZX9KR7TT8BH123456")).status).toBe("invalid");
  });
  it("a made-up VIN on a real maker's code (make and year, no model, not clean): invalid", async () => {
    decode.mockResolvedValue(car({ make: "DINA AUTOBUSES", year: 2012, model: null, clean: false, errorCode: "8" }));
    expect((await confirmVin("3AB7XKW21CM481203")).status).toBe("invalid");
  });
  it("a real car NHTSA decodes cleanly without a model name: accepted", async () => {
    decode.mockResolvedValue(car({ model: null }));
    expect((await confirmVin("4T1B11HK8JU145889")).status).toBe("ok");
  });
  it("too many lookups: wait and try again (no 'use it anyway')", async () => {
    decode.mockResolvedValue({ ok: false, message: "Too many lookups for now. Wait a minute and try again." });
    expect((await confirmVin("4T1B11HK8JU145889")).status).toBe("busy");
  });
  it("NHTSA down: the person decides (unreachable), never 'invalid'", async () => {
    decode.mockResolvedValue({ ok: false, message: "NHTSA didn't answer just now. Try again in a minute." });
    expect((await confirmVin("4T1B11HK8JU145889")).status).toBe("unreachable");
    decode.mockRejectedValue(new Error("offline"));
    expect((await confirmVin("4T1B11HK8JU145889")).status).toBe("unreachable");
  });
});

describe("resolveVins: NHTSA picks among candidates", async () => {
  const { resolveVins } = await import("./confirm-vin");
  it("keeps only the ones NHTSA knows", async () => {
    decode.mockReset().mockImplementation(async (v: string) => (v === "1HGCR2F16HA198010" ? car({ make: "Honda", model: "Accord", year: 2017 }) : car({ make: null, year: null, model: null, clean: false })));
    expect(await resolveVins(["1HGCR2F16HA198010", "1THGC2F16HA198010"])).toEqual({ real: [{ vin: "1HGCR2F16HA198010", name: "2017 Honda Accord" }], unsure: false, busy: null });
  });
  it("busy stops early with the message", async () => {
    decode.mockReset().mockResolvedValue({ ok: false, message: "Too many lookups for now." });
    expect((await resolveVins(["A", "B"])).busy).toMatch(/Too many/);
  });
});
