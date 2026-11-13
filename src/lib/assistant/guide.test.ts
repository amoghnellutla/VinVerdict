import { describe, expect, it } from "vitest";
import { valueCar, type ValueInput } from "@/lib/value/estimate";
import { toldGuide } from "./apply";
import { factsFromSentence } from "./facts";
import { routeMessage } from "./route";

const car: ValueInput = { price: 14_995, miles: 126_000, sellerType: "dealer", accident: "unknown", titleStatus: "unknown", usage: "unknown" };
const only = (guide: { name: string; value: number; kind: "retail" | "private" | "unknown" }) => valueCar({ predicted: null, sold: null, active: null, zip: "08540", guide }, car);

describe("a price guide value you quote (no price check needed)", () => {
  it("reads KBB, Edmunds, J.D. Power and CarGurus values, with the kind of value", () => {
    expect(factsFromSentence("KBB says 13,200")).toMatchObject([{ kind: "guide", name: "KBB", value: 13_200, guide: "unknown" }]);
    expect(factsFromSentence("kelley blue book private party value is $12,500")).toMatchObject([{ kind: "guide", name: "KBB", value: 12_500, guide: "private" }]);
    expect(factsFromSentence("edmunds dealer retail 14k")).toMatchObject([{ kind: "guide", name: "Edmunds", value: 14_000, guide: "retail" }]);
    expect(factsFromSentence("KBB trade in is 9,000")).toMatchObject([{ kind: "guide", guide: "trade" }]);
    expect(factsFromSentence("cargurus instant market value $13,750")).toMatchObject([{ kind: "guide", name: "CarGurus", guide: "retail" }]);
    // A guide value isn't the asking price.
    expect(factsFromSentence("KBB says 13,200").some((f) => f.kind === "price")).toBe(false);
    expect(routeMessage("KBB says 13,200", null)).toMatchObject({ kind: "facts" });
  });

  it("a trade-in value is never used as a buying price; the latest usable value counts", () => {
    expect(toldGuide([{ id: "1", label: "x", facts: factsFromSentence("KBB trade in is 9,000") }])).toBeNull();
    expect(toldGuide([
      { id: "1", label: "x", facts: factsFromSentence("KBB says 13,200") },
      { id: "2", label: "y", facts: factsFromSentence("edmunds private party 12,000") },
    ])).toEqual({ name: "Edmunds", value: 12_000, kind: "private" });
  });

  it("alone, it gives a wide, low-confidence range that says where it came from", () => {
    const v = only({ name: "KBB", value: 13_200, kind: "unknown" })!;
    expect(v.confidence).toBe("low");
    expect(v.confidenceWhy).toContain("only the price guide value you quoted");
    expect((v.high - v.low) / 2 / v.fair).toBeGreaterThanOrEqual(0.095);
    expect(v.sources[0].name).toBe("KBB value you quoted");
    expect(v.sources[0].note).toContain("KBB tends to read high");
    expect(v.offer).not.toBeNull();
  });

  it("a private-party value is put on the dealer basis, so a dealer car isn't judged against a private price", () => {
    const priv = only({ name: "Edmunds", value: 12_000, kind: "private" })!;
    const retail = only({ name: "Edmunds", value: 12_000, kind: "retail" })!;
    expect(priv.fair).toBeGreaterThan(retail.fair);
    // A private seller's car comes back down to about the private-party value.
    const asPrivate = valueCar({ predicted: null, sold: null, active: null, zip: "", guide: { name: "Edmunds", value: 12_000, kind: "private" } }, { ...car, sellerType: "private" })!;
    expect(Math.abs(asPrivate.fair - 12_000)).toBeLessThanOrEqual(100);
  });
});
