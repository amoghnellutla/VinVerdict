import { describe, expect, it } from "vitest";
import { decide, evidenceOf, severityOf, type DecisionInput } from "./decision";
import { EMPTY_REPORT } from "./history-report";
import type { RuleHit } from "./scam/rules";

const hit = (id: string, action: RuleHit["action"] = "flag", title = id): RuleHit => ({ id, action, title, reason: "" });
const base: DecisionInput = {
  hits: [],
  kind: "text",
  hasVin: true,
  hasPrice: true,
  decoded: true,
  recalls: 2,
  report: EMPTY_REPORT,
  checklist: {},
  listingStatesHistory: false,
  priced: false,
  price: null,
};
const run = (o: Partial<DecisionInput>) => decide({ ...base, ...o });

describe("decide: the next step", () => {
  it("never calls a car safe: nothing found is 'worth investigating' with the unknowns listed", () => {
    const d = run({});
    expect(d.level).toBe("investigate");
    expect(d.title).not.toMatch(/safe|clear|clean/i);
    const car = d.areas.find((a) => a.area === "car")!;
    expect(car.unknown.join(" ")).toMatch(/Accident history: not checked/);
    expect(car.unknown.join(" ")).toMatch(/2 on record for the model year/);
    expect(car.unknown.join(" ")).toMatch(/mechanic/i);
  });

  it("stops on a known scam pattern, and says not to send money", () => {
    const d = run({ hits: [hit("deposit-first", "hide", "Deposit before viewing"), hit("rushed")] });
    expect(d.level).toBe("stop");
    expect(d.text).toMatch(/Don't send any money/);
    expect(d.findings[0].id).toBe("deposit-first");
  });

  it("a missing VIN means 'verify', not a scam", () => {
    expect(severityOf("no-vin")).toBe("verify");
    expect(evidenceOf("no-vin")).toBe("unknown");
    expect(run({ hasVin: false, hits: [hit("no-vin", "hide")] }).level).toBe("verify");
  });

  it("no VIN and no price is 'not enough information'", () => {
    const d = run({ hasVin: false, hasPrice: false, decoded: false, hits: [hit("no-vin", "hide"), hit("no-price", "hide")] });
    expect(d.level).toBe("thin");
  });

  it("a manual gearbox is a note, not a deal-breaker", () => {
    expect(run({ hits: [hit("manual", "hide")] }).level).toBe("investigate");
  });

  it("history-report damage: severe stops, minor or moderate means verify", () => {
    expect(run({ hits: [hit("report-damage", "hide")], report: { ...EMPTY_REPORT, damage: "severe" } }).level).toBe("stop");
    expect(run({ hits: [hit("report-damage", "hide")], report: { ...EMPTY_REPORT, damage: "minor" } }).level).toBe("verify");
  });

  it("a VIN-only check isn't a verdict on the deal", () => {
    const d = run({ kind: "vin", hasPrice: false });
    expect(d.level).toBe("investigate");
    expect(d.text).toMatch(/shows the car, not the deal/);
    expect(d.areas.find((a) => a.area === "listing")!.status).toBe("unchecked");
  });
});

describe("decide: the four areas", () => {
  it("labels where each finding's evidence comes from", () => {
    expect(evidenceOf("pay-gift-card")).toBe("ad");
    expect(evidenceOf("lien")).toBe("ad-or-seller");
    expect(evidenceOf("history-rollback")).toBe("feed");
    expect(evidenceOf("vin-mismatch")).toBe("record");
    expect(evidenceOf("too-good")).toBe("estimate");
    expect(evidenceOf("proof-stolen")).toBe("proof");
  });

  it("a listing that only claims no accidents isn't treated as checked", () => {
    const car = run({ listingStatesHistory: true }).areas.find((a) => a.area === "car")!;
    expect(car.unknown.join(" ")).toMatch(/only the listing's own claim/);
  });

  it("price: a too-good price asks for a reason; the estimate's basis is always stated", () => {
    const price = { label: "great" as const, low: 12000, high: 14000, confidence: "low" as const, unpriced: null };
    const d = run({ priced: true, price, hits: [hit("too-good")] });
    const row = d.areas.find((a) => a.area === "price")!;
    expect(row.status).toBe("verify");
    expect(row.line).toMatch(/Far below the estimated \$12,000–\$14,000/);
    expect(d.level).toBe("verify");
    const fair = run({ priced: true, price: { ...price, label: "fair" } }).areas.find((a) => a.area === "price")!;
    expect(fair.unknown.join(" ")).toMatch(/advertised prices, not what buyers paid/);
    expect(fair.unknown.join(" ")).toMatch(/rough/);
    const over = run({ priced: true, price: { ...price, label: "over" } }).areas.find((a) => a.area === "price")!;
    expect(over).toMatchObject({ status: "verify", line: "Above the estimated $12,000–$14,000: room to negotiate" });
  });

  it("ready to pay: counts the seller's answers, and a payment-app deposit stops it", () => {
    const d = run({ checklist: { titleInSellerName: true, lienOnTitle: false } });
    expect(d.areas.find((a) => a.area === "deal")!.line).toBe("2 of 4 seller questions answered");
    const all = run({ checklist: { titleInSellerName: true, lienOnTitle: false, allowsInspection: true, meetsInPersonLocally: true } });
    expect(all.areas.find((a) => a.area === "deal")!.status).toBe("ok");
    const pay = run({ hits: [hit("pay-app-upfront", "hide", "Payment-app deposit upfront")] });
    expect(pay.areas.find((a) => a.area === "deal")!.status).toBe("stop");
  });
});

describe("dealer listings and branded titles (real case 29)", () => {
  it("asks a dealer only the dealer questions, so a far-away dealer isn't pushed into 'Seller isn't local'", () => {
    const deal = (o: Partial<DecisionInput>) => run(o).areas.find((a) => a.area === "deal")!;
    expect(deal({ dealer: true }).line).toBe("0 of 2 seller questions answered");
    expect(deal({ dealer: true }).unknown.join(" ")).not.toMatch(/meet in person|title in the seller's name/);
    expect(deal({}).line).toBe("0 of 4 seller questions answered");
    expect(deal({ dealer: true, checklist: { lienOnTitle: false, allowsInspection: true } }).line).toBe("Dealer says: no lien, inspection allowed");
  });

  it("doesn't say the title wasn't checked as if the ad's own brand was missed", () => {
    const car = run({ hits: [hit("title-brand", "hide", "Rebuilt title")] }).areas.find((a) => a.area === "car")!;
    expect(car.unknown.join(" ")).toMatch(/Title records: not checked \(the ad says rebuilt title; NMVTIS confirms it\)/);
    expect(run({}).areas.find((a) => a.area === "car")!.unknown.join(" ")).toMatch(/Title brands \(salvage, flood, rebuilt\): not checked/);
  });
});
