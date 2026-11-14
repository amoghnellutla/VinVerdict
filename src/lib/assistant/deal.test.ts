import { describe, expect, it } from "vitest";
import { dealAnswer, type DealInput } from "./deal";

const base: DealInput = {
  car: "2018 Toyota Camry LE", asking: 14_995, auctionSold: 9_100, auctionDate: "10/14/2026",
  estimate: { low: 14_000, high: 15_700, open: 13_400, walk: 15_200 },
  otherListing: { seller: "Fast Track Motors", price: 13_995 }, leverage: [{ id: "dealer-auction", title: "Went through a dealer auction" }, { id: "live-accident", title: "History shows 1 accident" }], dealer: true,
};

describe("What should I offer? (numbers only from the page)", () => {
  it("lays out the auction gap, the estimate, the cheaper listing and the leverage, then a message", () => {
    const d = dealAnswer(base);
    // The walk-away ($15,200) is above the asking price, so the asking price is the ceiling.
    expect(d.text).toBe("Start at $13,400, and don't pay more than the asking price ($14,995). Here's why, and a message you can send:");
    expect(dealAnswer({ ...base, asking: 16_500 }).text).toBe("Start at $13,400 and stay below $15,200. Here's why, and a message you can send:");
    expect(d.points[0]).toContain("Asking $14,995 is $5,895 above what it sold for at a dealer auction ($9,100, 10/14/2026)");
    expect(d.points[0]).toContain("aren't known, so not all of that is profit");
    expect(d.points.join(" ")).toContain("Fast Track Motors lists the same VIN for $13,995, $1,000 less");
    expect(d.message).toContain("it sold at a dealer auction for $9,100 on 10/14/2026, and Fast Track Motors lists the same car for $13,995");
    expect(d.message).toContain("Would you take $13,400 for the car, before tax and fees? Please send the out-the-door price with every fee listed.");
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
    expect(d.message).toContain("the history shows an accident");
  });

  it("never negotiates with a scam ad: no offer, no message", () => {
    const d = dealAnswer({ ...base, scam: ["Gift card payment", "Shipping only"] });
    expect(d.message).toBeNull();
    expect(d.text).toMatch(/^Don't make an offer/);
    expect(d.points.join(" ")).toContain("Gift card payment; Shipping only");
    expect(`${d.text} ${d.points.join(" ")}`).not.toMatch(/\$\d/);
  });

  it("a price already below the estimate: no lower offer, find out why it's cheap", () => {
    const d = dealAnswer({ ...base, asking: 9_500, auctionSold: null, otherListing: null, estimate: { low: 12_300, high: 14_500, open: 9_500, walk: 9_500 }, concerns: ["Title not in seller's name", "Lien on the title"] });
    expect(d.text).toContain("$9,500 is already at or below what similar cars sell for");
    expect(d.text).not.toMatch(/stay below/);
    expect(d.points.join(" ")).toContain("Check first: Title not in seller's name; Lien on the title");
    expect(d.message).toContain("why is it priced below similar cars");
    expect(d.message).not.toMatch(/Would you take/);
  });

  it("the same fact isn't said twice, and 'unknown' isn't leverage in a message", () => {
    const d = dealAnswer({ ...base, auctionSold: null, otherListing: null, leverage: [
      { id: "accident-reported", title: "Accident reported" }, { id: "live-accident", title: "History shows 1 accident" },
      { id: "history-price-cut", title: "Price already cut from $10,900 to $9,900" }, { id: "accident-unknown", title: "Accident history unknown" },
    ] });
    expect(d.message).toContain("Before I come in: the history shows an accident, and the price has already been cut once.");
    expect(d.message).not.toMatch(/unknown/i);
    expect(d.points.join(" ")).toContain("Your leverage: Accident reported; Price already cut from $10,900 to $9,900; Accident history unknown.");
  });

  it("with nothing to go on, it asks for the price", () => {
    expect(dealAnswer({ ...base, asking: null, auctionSold: null, estimate: null, otherListing: null }).text).toContain("needs the asking price");
  });
});

describe("a dealer fee on top of the price (real case 34)", () => {
  it("names the ad's total in the message and keeps the offer a price for the car", () => {
    const d = dealAnswer({ car: "2024 Chevrolet Trax 2RS", asking: 21_298, dealerFee: 799, auctionSold: null, auctionDate: null, estimate: { low: 20_000, high: 23_000, open: 20_500, walk: 22_000 }, otherListing: null, leverage: [], dealer: true });
    expect(d.message).toContain("listed at $22,097 ($21,298 + $799 dealer fee)");
    expect(d.message).toContain("Would you take $20,500 for the car, before tax and fees?");
    expect(d.message).not.toMatch(/\$20,500 out the door/);
  });
});
