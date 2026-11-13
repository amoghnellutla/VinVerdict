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
  transmissionKind: "automatic", fuel: "Gasoline", curbWeightLb: 3605, displacementL: 2.4, cylinders: 4, electrification: null, errorCode: "0", errorText: "", clean: true,
};

function run(text: string, extra: Partial<ScamInput> = {}) {
  return evaluateScamRules({ text, listing: parseListing(text), now: NOW, ...extra });
}
const ids = (r: ReturnType<typeof run>) => r.hits.map((h) => h.id);

describe("evaluateScamRules", () => {
  it("flags problems the seller admits, but not denials, repairs already done or review summaries", () => {
    const p = (s: string) => run(`${GOOD_TEXT} ${s}`).hits.find((x) => x.id === "seller-problem");
    expect(p("Check engine light is on, needs transmission work.")?.title).toBe("Seller mentions a problem: check engine light on, transmission problem");
    expect(p("Check engine light is on.")?.action).toBe("flag");
    expect(p("Won't start since last week.")?.title).toContain("doesn't start or run");
    for (const s of ["No check engine light.", "Check engine light: off.", "New head gasket last year.", "Never overheated, no oil leaks.", "Rebuilt transmission at 90k.", "Runs and drives great, needs nothing.", "Sold as is.",
      "The vehicle has mixed feedback. Some report electronic problems, transmission issues, and excessive oil consumption."]) expect(p(s), s).toBeUndefined();
  });

  it("notes a new Facebook account (this year or last), as a note only", () => {
    const fb = (y: number) => `${GOOD_TEXT}\nSeller information\nSeller details\nJoined Facebook in ${y}`;
    for (const y of [2026, 2025]) {
      const h = run(fb(y)).hits.find((x) => x.id === "new-account");
      expect(h?.action).toBe("info");
      expect(h?.title).toBe(`Seller's Facebook account is new (joined ${y})`);
    }
    expect(ids(run(fb(2024)))).not.toContain("new-account");
    expect(ids(run(fb(2012)))).not.toContain("new-account");
    expect(ids(run(fb(2026)))).not.toContain("too-good-plus-flags");
  });

  it("catches the title-not-in-my-name phrasings, but not a seller whose title is in their name", () => {
    for (const s of ["Title isn't in my name yet.", "title is not in my name", "The title isnt in my name", "Selling for my cousin."]) {
      expect(ids(run(`${GOOD_TEXT} ${s}`, { decoded: DECODED })), s).toContain("curbstoning");
    }
    expect(ids(run(`${GOOD_TEXT} Title is in my name.`, { decoded: DECODED }))).not.toContain("curbstoning");
  });

  it("a seller who won't meet in person locally counts, even when the ad doesn't say so", () => {
    expect(ids(run(GOOD_TEXT, { decoded: DECODED, checklist: { meetsInPersonLocally: false } }))).toContain("seller-remote");
    expect(ids(run(GOOD_TEXT, { decoded: DECODED, checklist: { meetsInPersonLocally: true } }))).not.toContain("seller-remote");
  });

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

describe("odometer the seller says is wrong", () => {
  it("catches TMU, not-actual-miles and broken-odometer wording", () => {
    for (const s of ["TMU, priced to sell.", "Miles are not actual.", "Not actual mileage on the title.", "Odometer is broken, around 150k.",
      "odometer stopped working last year", "Title says exceeds mechanical limits.", "true mileage unknown"]) {
      expect(ids(run(`${GOOD_TEXT} ${s}`, { decoded: DECODED })), s).toContain("odometer-unknown");
    }
  });
  it("doesn't fire on a working odometer or a legally mileage-exempt older car", () => {
    for (const s of ["Odometer works fine.", "1999 Camry, mileage exempt on the title.", "Not TMU, actual miles with records.", "Actual miles, service records."]) {
      expect(ids(run(`${GOOD_TEXT} ${s}`, { decoded: DECODED })), s).not.toContain("odometer-unknown");
    }
  });
});

describe("auction-sourced cars (real case 29)", () => {
  it("counts auction photos and 'bought at auction', not an auction-free mention", () => {
    for (const s of ["Auction photos documenting the vehicle's condition prior to repairs are available.", "I bought it at an auction last year."]) {
      expect(ids(run(`${GOOD_TEXT} ${s}`, { decoded: DECODED })), s).toContain("auction");
    }
    expect(ids(run(`${GOOD_TEXT} Never been to an auction lot, one owner.`, { decoded: DECODED }))).not.toContain("auction");
  });
});

describe("the seller's description names a different model (real case 30)", () => {
  const RENEGADE = "Used 2015 Jeep Renegade Trailhawk $9,675 91,000 mi VIN ZACCJBCT5FPB88593. ";
  it("flags 'Selling a … 2015 Jeep Cherokee' and 'Make/Model: Jeep Cherokee' on a Renegade listing", () => {
    for (const s of ["Selling a beautifully maintained, clean-title 2015 Jeep Cherokee Trailhawk with 91,000 miles.", "Make/Model: Jeep Cherokee Trailhawk"]) {
      const r = run(RENEGADE + s);
      expect(ids(r), s).toContain("model-conflict");
      expect(r.hits.find((h) => h.id === "model-conflict")?.title).toBe("Listed as a Renegade, described as a Cherokee");
    }
  });
  it("doesn't fire on the same model, an unknown word, or a dealer's similar-cars list", () => {
    expect(ids(run(RENEGADE + "Selling my 2015 Jeep Renegade Trailhawk, one owner."))).not.toContain("model-conflict");
    expect(ids(run(RENEGADE + "Selling a 2015 Jeep with new tires."))).not.toContain("model-conflict");
    expect(ids(run("Certified 2024 BMW X5 $43,191 33,703 mi. Similar: Used 2024 BMW X4 xDrive30i 31K mi Used 2024 BMW X3 M40i"))).not.toContain("model-conflict");
    // Grand Cherokee and Cherokee are different models.
    expect(ids(run("2016 Jeep Cherokee Latitude $11,000 80,000 miles. Make/Model: Jeep Grand Cherokee"))).toContain("model-conflict");
  });
});

describe("almost no miles (real case 31)", () => {
  it("notes a used car listed with under 100 miles, as good-to-know only", () => {
    const r = run("Used 2025 Land Rover Range Rover SE $114,999 1 mi VIN SALKP9E97SA339506");
    const h = r.hits.find((x) => x.id === "miles-near-zero");
    expect(h).toMatchObject({ action: "info", title: "Listed with only 1 mile" });
    expect(ids(run(`${GOOD_TEXT}`, { decoded: DECODED }))).not.toContain("miles-near-zero");
  });
});

describe("check engine light: off isn't on; cleared codes are worth a look (sweep 2026-11-13)", () => {
  const AD = "2018 Toyota Camry LE 4T1B11HK8JU145889 $16,995 62,000 miles clean title. Private seller in Edison NJ. ";
  const problem = (ph: string) => run(AD + ph).hits.find((h) => h.id === "seller-problem")?.title ?? null;
  it.each(["Check engine light is off, passed NJ inspection.", "Check engine light went off after new gas cap.", "Check engine light never comes on.", "CEL light: off", "No check engine light."])("%s → no problem", (ph) => {
    expect(problem(ph)).toBeNull();
  });
  it.each(["Check engine light is on.", "Check engine light on, needs O2 sensor.", "The check engine light keeps coming on."])("%s → light on", (ph) => {
    expect(problem(ph)).toMatch(/check engine light on/);
  });
  it("codes cleared just before the sale", () => {
    expect(problem("check engine light was cleared yesterday")).toMatch(/codes recently cleared/);
    expect(problem("I reset the codes and it's fine now")).toMatch(/codes recently cleared/);
  });
});
