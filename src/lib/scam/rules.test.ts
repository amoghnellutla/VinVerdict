import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import type { DecodedVin } from "@/lib/nhtsa/parse";
import { evaluateScamRules, type ScamInput } from "./rules";

const NOW = new Date("2026-11-08T12:00:00Z");

const GOOD_TEXT = `2017 Honda Accord EX-L, $9,000, 100,000 miles, automatic, clean title, no accidents,
one owner, service records. Selling my car because I'm moving. Happy to meet at your mechanic. VIN 1HGCR2F8XHA000123`;

const DECODED: DecodedVin = {
  vin: "1HGCR2F8XHA000123", year: 2017, make: "HONDA", model: "Accord", trim: "EX-L",
  body: "Sedan/Saloon", driveType: "4x2", transmission: "Continuously Variable Transmission (CVT)",
  transmissionKind: "automatic", fuel: "Gasoline", curbWeightLb: 3605, errorCode: "0", errorText: "", clean: true,
};

function run(text: string, extra: Partial<ScamInput> = {}) {
  return evaluateScamRules({ text, listing: parseListing(text), now: NOW, ...extra });
}
const ids = (r: ReturnType<typeof run>) => r.hits.map((h) => h.id);

describe("evaluateScamRules", () => {
  it("clears a clean, complete private listing", () => {
    const r = run(GOOD_TEXT, { decoded: DECODED });
    expect(r.hits).toEqual([]);
    expect(r).toMatchObject({ verdict: "clear", risk: 0 });
  });

  it("hides the classic deposit-by-Zelle shipping scam", () => {
    const r = run(`2018 Toyota Camry $4,500 clean title no accidents VIN 1HGCR2F8XHA000123.
      I'm deployed overseas so the car is at a shipping company. Send a $500 deposit by Zelle to hold it.`);
    expect(r.verdict).toBe("hide");
    expect(ids(r)).toEqual(expect.arrayContaining(["pay-app-upfront", "shipping-only", "seller-remote"]));
  });

  it("hides gift cards, wire transfers and auction cars", () => {
    expect(ids(run("pay with gift cards"))).toContain("pay-gift-card");
    expect(ids(run("wire transfer only"))).toContain("pay-wire");
    expect(ids(run("priced below market, auction pricing"))).toContain("auction");
  });

  it("only flags a payment app with no upfront ask", () => {
    const r = run(GOOD_TEXT + " Zelle or cash at pickup.", { decoded: DECODED });
    expect(r.hits.map((h) => [h.id, h.action])).toEqual([["pay-app", "flag"]]);
    expect(r.verdict).toBe("caution");
  });

  it("hides missing or invalid VINs and missing prices", () => {
    expect(ids(run("2017 Honda Accord 100k miles clean title"))).toEqual(expect.arrayContaining(["no-vin", "no-price"]));
    expect(ids(run("2017 Honda Accord $9,000 VIN 1HGCR2F81HA000123"))).toContain("vin-invalid");
  });

  it("hides a VIN that decodes to a different car", () => {
    const r = run("2019 Toyota Camry $9,000 clean title VIN 1HGCR2F8XHA000123", { decoded: DECODED });
    const hit = r.hits.find((h) => h.id === "vin-mismatch");
    expect(hit?.action).toBe("hide");
    expect(hit?.reason).toContain("year 2019 vs 2017");
  });

  it("matches model names loosely (CR-V vs CRV)", () => {
    const r = run("2018 Honda CR-V $15,000 VIN 1HGCR2F8XHA000123", { decoded: { ...DECODED, year: 2018, model: "CRV" } });
    expect(ids(r)).not.toContain("vin-mismatch");
  });

  it("hides branded titles, reported accidents and manuals", () => {
    expect(ids(run("salvage title"))).toContain("title-brand");
    expect(ids(run("small accident last year"))).toContain("accident-reported");
    expect(ids(run("5-speed manual transmission"))).toContain("manual");
  });

  it("notes unknown accident history as info only", () => {
    const text = GOOD_TEXT.replace("no accidents,", "");
    const r = run(text, { decoded: DECODED });
    expect(r.hits.map((h) => [h.id, h.action])).toEqual([["accident-unknown", "info"]]);
    expect(r.verdict).toBe("clear");
    // Answering the checklist clears it.
    expect(run(text, { decoded: DECODED, checklist: { anyAccidents: false } }).hits).toEqual([]);
  });

  it("flags curbstoning, title washing, liens and rushed sales", () => {
    expect(ids(run("selling it for my uncle"))).toContain("curbstoning");
    expect(ids(run("out of state title from Florida"))).toContain("title-washing");
    expect(ids(run("still financed, about $3k payoff"))).toContain("lien");
    expect(ids(run("lien-free, no lien"))).not.toContain("lien");
    expect(ids(run("must sell today, cash only"))).toContain("rushed");
  });

  it("uses checklist answers", () => {
    const r = run(GOOD_TEXT, {
      decoded: DECODED,
      checklist: { titleInSellerName: false, lienOnTitle: true, allowsInspection: false },
    });
    expect(ids(r)).toEqual(expect.arrayContaining(["curbstoning", "lien", "no-inspection"]));
    expect(r.verdict).toBe("hide");
  });

  it("flags impossibly low miles on an older car", () => {
    const r = run("2012 Toyota Corolla $8,000 2,000 miles");
    expect(ids(r)).toContain("mileage-low");
  });

  it("says 'verify in person' for a big discount with nothing else wrong", () => {
    const r = run(GOOD_TEXT, { decoded: DECODED, valuePct: 0.5 });
    expect(r.verdict).toBe("verify");
    expect(r.hits.find((h) => h.id === "too-good")?.reason).toContain("50% below market");
  });

  it("hides a big discount combined with any red flag", () => {
    const r = run(GOOD_TEXT + " Must sell today.", { decoded: DECODED, valuePct: 0.4 });
    expect(ids(r)).toContain("too-good-plus-flags");
    expect(r.verdict).toBe("hide");
  });
});
