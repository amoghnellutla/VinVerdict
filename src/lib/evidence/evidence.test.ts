import { describe, expect, it } from "vitest";
import { summarizeProof, savedProof, type Proof } from "./combine";
import { classifyProof, readProof } from "./parse";

// Text as it reads off real pages Amogh checked on 2026-11-09 (screenshots of the
// 2010 Camry Hybrid 4T1BB3EK2AU119768 on NICB and AutoCheck, and the 2016 Lexus RX 350 Carfax).
const NICB = `Look up a VIN VINCheck® Results VIN: 4T1BB3EK2AU119768
VINCheck® Theft Record VIN: 4T1BB3EK2AU119768 has not been identified as a vehicle listed in the VINCheck® Theft Records.
VINCheck® is updated regularly as additional information is reported.
VINCheck® Total Loss Record VIN: 4T1BB3EK2AU119768 has not been identified as a vehicle listed in the VINCheck® Salvage Records.
Further information is available through CARFAX`;

const AUTOCHECK = `Used 2010 Toyota Camry Hybrid FWD $4,500 Experian AutoCheck Report Report run: 11/09/2026
2010 Toyota Camry Hybrid Base Sedan 4D (2.4L I4 FI Gas/Electric Hybrid) Owners - 3 AutoCheck Score
VIN: 4T1BB3EK2AU119768 Class: Car - Midsize 62 Vehicle Usage Lease Similar vehicles usually range between 23 and 38
Last Reported Odometer: 97,423 (08/28/2026)
Vehicle History at a Glance State Title Brand Auction Brand / Issues Accident / Damage No Accidents or Damage Reported
Clean No Issue No Issue Open Recall Check Insurance Loss / Transfer Odometer Check Last reported odometer: 97,423 (08/28/2026)
No Open Recalls No Issue No Issue Certified Pre-Owned Service / Repair Additional History Duplicate Title
No CPO Info Available No Issue Events Reported This vehicle is eligible for Buyback Protection
Due to the vehicle's history showing no reported major state title brands.`;

const CARFAX = `CARFAX Report US $49.99 2016 Lexus RX 350 94,988 mi VIN: 2T2BZMCA2GC041915 Vehicle Details
DAMAGE Minor Damage Minor Moderate Severe FAIR VALUE $21,734 4 Service History Records 3 Previous Owners
Types of Owners: Personal, Commercial Last Owned in New York 31 Detailed Records Available
Accident / Damage History Event 1 09/12/2025 Damage reported: minor damage Damage Severity Scale Minor Moderate Severe`;

const CAMRY = "4T1BB3EK2AU119768";

describe("reading proof", () => {
  it("sorts each page to its check", () => {
    expect(classifyProof(NICB)).toBe("nicb"); // mentions Carfax, still NICB
    expect(classifyProof(AUTOCHECK)).toBe("autocheck");
    expect(classifyProof(CARFAX)).toBe("carfax");
    expect(classifyProof("Copart Lot # 12345 Primary Damage: Front End")).toBe("auction");
    expect(classifyProof("my notes about the car")).toBe("unknown");
  });

  it("reads NICB's theft and total-loss lines", () => {
    const r = readProof(NICB);
    expect(r.kind).toBe("nicb");
    expect(r.vins).toEqual([CAMRY]);
    expect(r.findings.map((f) => [f.key, f.status])).toEqual([["theft", "good"], ["total-loss", "good"]]);
    const bad = readProof(NICB.replace("Theft Record VIN: 4T1BB3EK2AU119768 has not been", "Theft Record VIN: 4T1BB3EK2AU119768 has been"));
    expect(bad.findings.find((f) => f.key === "theft")?.status).toBe("bad");
  });

  it("reads an AutoCheck summary without mistaking 'No Accidents or Damage Reported' for damage", () => {
    const r = readProof(AUTOCHECK);
    expect(r.report).toEqual({ damage: "none", title: "clean", commercial: false });
    expect(r.odometer).toEqual({ miles: 97423, date: "08/28/2026" });
    expect(r.openRecalls).toBe(0);
    const labels = r.findings.map((f) => f.label).join(" | ");
    expect(labels).toMatch(/3 owners/);
    expect(labels).toMatch(/used as lease/);
    expect(labels).toMatch(/duplicate title/);
    expect(labels).toMatch(/AutoCheck score 62 \(similar cars score 23–38\)/);
  });

  it("reads Carfax's damage level, owners and commercial use", () => {
    const r = readProof(CARFAX);
    expect(r.report).toEqual({ damage: "minor", commercial: true });
    expect(r.findings.find((f) => f.key === "damage")).toMatchObject({ status: "bad", label: "Carfax: minor damage reported" });
    expect(r.findings.find((f) => f.key === "owners")?.label).toBe("Carfax: 3 owners");
  });

  it("leaves out what it can't read clearly", () => {
    const r = readProof("AutoCheck report. Some blurry text.");
    expect(r.report).toEqual({});
    expect(r.findings).toEqual([]);
  });
});

describe("combining proof", () => {
  const p = (id: string, text: string): Proof => {
    const read = readProof(text);
    return { id, kind: read.kind ?? "google", read };
  };

  it("rates each check and turns a clean AutoCheck into confirmed answers", () => {
    const s = summarizeProof([p("a", NICB), p("b", AUTOCHECK)], CAMRY, 97_300);
    expect(s.report).toEqual({ damage: "none", title: "clean", commercial: false });
    expect(s.from.damage).toBe("AutoCheck");
    expect(s.rating.nicb).toBe("clear");
    expect(s.rating.history).toBe("clear");
    expect(s.rating.nhtsa).toBe("none");
    expect(s.hits).toEqual([]);
  });

  it("flags miles lower than the report's last reading", () => {
    const s = summarizeProof([p("b", AUTOCHECK)], CAMRY, 60_538);
    expect(s.hits.map((h) => h.id)).toContain("proof-miles-lower");
  });

  it("the worse report wins, and the disagreement is shown", () => {
    const lexus = "2T2BZMCA2GC041915";
    const clean = AUTOCHECK.replace(CAMRY, lexus);
    const s = summarizeProof([p("a", CARFAX), p("b", clean)], lexus, null);
    expect(s.report.damage).toBe("minor");
    expect(s.from.damage).toBe("Carfax");
    expect(s.hits.map((h) => h.id)).toContain("proof-reports-differ");
    expect(s.rating.history).toBe("problem");
  });

  it("ignores proof for a different car, and saves only labels", () => {
    const s = summarizeProof([p("a", NICB)], "2T2BZMCA2GC041915", null);
    expect(s.otherVin).toHaveLength(1);
    expect(s.rating.nicb).toBe("none");
    const saved = savedProof([p("a", NICB), p("b", AUTOCHECK)], CAMRY);
    expect(saved[0]).toEqual({ source: "NICB VINCheck", findings: [{ label: "NICB: no theft record", status: "good" }, { label: "NICB: no insurance total-loss record", status: "good" }] });
    expect(JSON.stringify(saved)).not.toMatch(/97,423|Report run/);
  });

  it("bad NICB and auction proof become deal-breakers", () => {
    const stolen = NICB.replace(/has not been identified/g, "has been identified");
    const s = summarizeProof([p("a", stolen), p("c", "Copart lot sale. Primary Damage: Front End Secondary Damage: Side VIN 4T1BB3EK2AU119768")], CAMRY, null);
    expect(s.hits.map((h) => h.id)).toEqual(expect.arrayContaining(["proof-stolen", "proof-total-loss", "proof-auction"]));
  });
});

describe("saved proof payload (server check)", () => {
  it("accepts the page's shape and nothing else", async () => {
    const { parseSavedProof } = await import("./validate");
    const good = JSON.stringify([{ source: "NICB VINCheck", findings: [{ label: "NICB: no theft record", status: "good" }] }]);
    expect(parseSavedProof(good)).toEqual(JSON.parse(good));
    expect(parseSavedProof(JSON.stringify([{ source: "x", findings: [{ label: "y", status: "evil" }] }]))).toBeNull();
    expect(parseSavedProof(JSON.stringify([{ source: "x".repeat(41), findings: [] }]))).toBeNull();
    expect(parseSavedProof("{not json")).toBeNull();
    expect(parseSavedProof("a".repeat(12_001))).toBeNull();
    expect(parseSavedProof(JSON.stringify(Array(13).fill({ source: "x", findings: [] })))).toBeNull();
  });
});

describe("merging your answers with proof", () => {
  it("bad news wins either way", async () => {
    const { mergeAnswers, EMPTY_REPORT } = await import("@/lib/history-report");
    expect(mergeAnswers({ damage: "none", title: "clean", commercial: false }, { damage: "minor", commercial: true })).toEqual({ damage: "minor", title: "clean", commercial: true });
    expect(mergeAnswers({ damage: "severe", title: "unknown", commercial: null }, { damage: "none", title: "clean" })).toEqual({ damage: "severe", title: "clean", commercial: null });
    expect(mergeAnswers(EMPTY_REPORT, {})).toEqual(EMPTY_REPORT);
  });
});
