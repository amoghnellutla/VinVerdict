import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { evaluateScamRules } from "@/lib/scam/rules";
import { SCAM_AD, scamAdText } from "./scam-ad";

describe("the practice scam ad", () => {
  it("every flagged phrase is caught by the real rules, and nothing else is", () => {
    const text = scamAdText();
    const r = evaluateScamRules({ text, listing: parseListing(text), valuePct: (17_200 - SCAM_AD.price) / 17_200 });
    const ids = r.hits.map((h) => h.id);
    const flagged = SCAM_AD.parts.filter((p) => p.rule).map((p) => p.rule!);
    for (const id of [...flagged, SCAM_AD.priceRule]) expect(ids).toContain(id);
    // The innocent parts don't add other deal-breakers.
    const extra = r.hits.filter((h) => h.action === "hide" && !flagged.includes(h.id) && h.id !== SCAM_AD.priceRule && h.id !== "no-vin");
    expect(extra.map((h) => h.id)).toEqual([]);
  });
});
