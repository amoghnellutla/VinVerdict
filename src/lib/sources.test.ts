import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { sellerMessage } from "@/lib/seller-message";
import { ON_PAGE, raw, REF, RULE_SOURCE, verifyLinks } from "@/lib/sources";

const ruleIds = (file: string, pattern: RegExp) => [...readFileSync(join(__dirname, file), "utf8").matchAll(pattern)].map((m) => m[1]);

describe("sources", () => {
  it("every cited rule exists, and every link is https", () => {
    const ids = new Set([
      ...ruleIds("scam/rules.ts", /add\("([a-z-]+)"/g),
      ...ruleIds("live/merge.ts", /id: "([a-z-]+)"/g),
      ...ruleIds("history/summary.ts", /id: "([a-z-]+)"/g),
      ...ruleIds("verdict.ts", /id: "([a-z-]+)"/g),
    ]);
    for (const id of [...Object.keys(RULE_SOURCE), ...Object.keys(ON_PAGE)]) expect(ids, id).toContain(id);
    for (const r of Object.values(REF)) expect(r.href).toMatch(/^https:\/\//);
  });

  it("builds raw NHTSA links with encoded values", () => {
    expect(raw.recalls({ year: 2016, make: "Lexus", model: "RX350" })).toBe(
      "https://api.nhtsa.gov/recalls/recallsByVehicle?make=Lexus&model=RX350&modelYear=2016",
    );
    expect(raw.complaints({ year: 2019, make: "Honda", model: "CR-V & more" })).toContain("model=CR-V%20%26%20more");
    expect(raw.decode("4T1C11AK3MU436772")).toBe("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/4T1C11AK3MU436772?format=json");
  });

  it("adds the maker's recall lookup for Toyota and Honda brands only", () => {
    expect(verifyLinks("4T1C11AK3MU436772", "TOYOTA").map((l) => l.name)).toContain("Toyota recall lookup");
    expect(verifyLinks("19XFC2F50HE012345", "Honda").map((l) => l.name)).toContain("Honda recall lookup");
    expect(verifyLinks("1FTEW1EP0JFA00000", "Ford").some((l) => /recall lookup$/.test(l.name) && l.name !== "NHTSA recall lookup")).toBe(false);
    const google = verifyLinks("4T1C11AK3MU436772", null).find((l) => l.name.startsWith("Search"));
    expect(google?.href).toBe("https://www.google.com/search?q=%224T1C11AK3MU436772%22");
  });
});

describe("sellerMessage", () => {
  it("asks a private seller for what's missing, and stops at 7 questions", () => {
    const listing = parseListing("2017 Honda Accord EX-L, 98,000 miles, $14,500. Private seller.");
    const text = sellerMessage({
      carName: "2017 Honda Accord EX-L", listing, hits: [{ id: "no-vin", action: "hide", title: "No VIN", reason: "" }],
      checklist: {}, recallCount: 3, topComplaint: "ELECTRICAL SYSTEM",
    });
    expect(text).toMatch(/^Hi, I'm interested in your 2017 Honda Accord EX-L listed at \$14,500\./);
    expect(text).toContain("1. What's the full VIN?");
    expect(text).toContain("Is the title in your name");
    expect(text).toContain("There are 3 for this model and year");
    expect(text.match(/^\d\. /gm)).toHaveLength(7);
  });

  it("skips questions the buyer already answered", () => {
    const listing = parseListing("2019 Toyota Camry LE 4T1B11HK5KU000000 45,000 miles $18,000");
    const text = sellerMessage({
      carName: "2019 Toyota Camry LE", listing, hits: [],
      checklist: { titleInSellerName: true, anyAccidents: false, lienOnTitle: false, allowsInspection: true }, recallCount: 0, topComplaint: null,
    });
    expect(text).not.toMatch(/title in your name|any accident|loan on it|pre-purchase inspection|full VIN/);
    expect(text).toContain("service records");
  });
});
