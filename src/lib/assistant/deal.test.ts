import { describe, expect, it } from "vitest";
import { dealAnswer, type DealInput } from "./deal";

const base: DealInput = {
  car: "2018 Toyota Camry LE", asking: 14_995, auctionSold: 9_100, auctionDate: "10/14/2026",
  estimate: { low: 14_000, high: 15_700, open: 13_400, walk: 15_200 },
  otherListing: { seller: "Fast Track Motors", price: 13_995 }, leverage: ["Went through a dealer auction", "History shows 1 accident"], dealer: true,
};

describe("What should I offer? (numbers only from the page)", () => {
  it("lays out the auction gap, the estimate, the cheaper listing and the leverage, then a message", () => {
    const d = dealAnswer(base);
    expect(d.text).toBe("Start at $13,400 and stay below $15,200. Here's why, and a message you can send:");
    expect(d.points[0]).toContain("Asking $14,995 is $5,895 above what it sold for at a dealer auction ($9,100, 10/14/2026)");
    expect(d.points[0]).toContain("aren't known, so not all of that is profit");
    expect(d.points.join(" ")).toContain("Fast Track Motors lists the same VIN for $13,995, $1,000 less");
    expect(d.message).toContain("it sold at a dealer auction for $9,100 on 10/14/2026, and Fast Track Motors lists the same car for $13,995");
    expect(d.message).toContain("Would you take $13,400 out the door?");
    expect(d.message).toContain("my own mechanic to inspect it");
  });

  it("without an estimate it asks for their best price instead of inventing one", () => {
    const d = dealAnswer({ ...base, estimate: null, otherListing: null });
    expect(d.message).toContain("What's your best out-the-door price, with every fee listed?");
    expect(d.message).not.toMatch(/Would you take/);
    // Every dollar figure in the answer is one of the inputs or the gap between two of them.
    const allowed = new Set(["$14,995", "$9,100", "$5,895"]);
    for (const n of `${d.text} ${d.points.join(" ")} ${d.message}`.match(/\$\d{1,3}(?:,\d{3})*/g) ?? []) expect(allowed, n).toContain(n);
  });

  it("doesn't repeat the auction as 'leverage' once the sale itself is said", () => {
    const d = dealAnswer(base);
    expect(`${d.points.join(" ")} ${d.message}`).not.toMatch(/went through a dealer auction/i);
    expect(d.message).toContain("history shows 1 accident");
  });

  it("with nothing to go on, it asks for the price", () => {
    expect(dealAnswer({ ...base, asking: null, auctionSold: null, estimate: null, otherListing: null }).text).toContain("needs the asking price");
  });
});
