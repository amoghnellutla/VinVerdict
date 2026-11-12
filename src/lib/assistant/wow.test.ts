import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/analyze";
import { readProof } from "@/lib/evidence/parse";
import { parseListing } from "@/lib/listing/parse";
import { answerIntent, starters, type PageContext } from "./answers";
import { applyTold, type Told } from "./apply";
import { factsFromSentence } from "./facts";
import { knowsList, type KnowsInput } from "./knows";
import { milesAgree } from "./odometer";
import { routeMessage } from "./route";

const VIN = "4T1B11HK8JU145889";

const ctx: PageContext = {
  car: "2018 Toyota Camry LE", vin: VIN, make: "Toyota", verdict: { title: "Worth investigating", text: "Nothing wrong found in what was checked." },
  auctionDate: "10/14/2026", otherListing: null, leverage: [], stops: [], checks: [], unknowns: [], price: 14_995,
  estimate: { low: 14_000, high: 15_700, label: "Fair", open: 13_400, walk: 15_200 }, auctionSold: 9_100, priced: true, historyRead: false,
  carfax: null, recalls: 3, recallLookup: "https://www.toyota.com/recall", sellerMessage: "Hi", dealer: true, otd: null, fuel: null,
};

describe("What VinVerdict knows (the checklist under the verdict)", () => {
  const empty: KnowsInput = {
    car: null, vin: null, price: null, miles: null, history: null, carfax: null, estimate: null, listings: null,
    recallsChecked: false, recalls: null, recallLookup: null, sellerAnswers: 0, auctionSold: null,
  };

  it("with nothing known, every item says what to do next", () => {
    const k = knowsList(empty);
    expect(k.filter((x) => x.done)).toHaveLength(0);
    expect(k.find((x) => x.key === "price")?.action).toMatchObject({ kind: "tell", prefill: "They're asking $" });
    expect(k.find((x) => x.key === "history")?.action).toMatchObject({ kind: "attach" });
    // No VIN: the price check can't run, so it isn't offered.
    expect(k.find((x) => x.key === "estimate")?.action).toBeNull();
  });

  it("fills in from the page, and a known auction sale is said without pretending it's an estimate", () => {
    const k = knowsList({ ...empty, car: "2018 Toyota Camry LE", vin: VIN, price: 14_995, miles: 126_357, auctionSold: 9_100, history: { damage: "No accidents reported", title: "Clean title", owners: 2 } });
    expect(k.filter((x) => x.done).map((x) => x.key)).toEqual(["vin", "price", "miles", "history"]);
    expect(k.find((x) => x.key === "history")?.detail).toBe("No accidents reported, Clean title, 2 owners");
    expect(k.find((x) => x.key === "estimate")).toMatchObject({ done: false, detail: "Sold at auction for $9,100; not compared yet", action: { kind: "go", target: "#price-check" } });
    // The inspection is never ticked by VinVerdict: only the buyer's mechanic can do it.
    expect(k.find((x) => x.key === "inspection")?.done).toBe(false);
  });
});

describe("miles agree across independent sources", () => {
  it("says so when the listing, auction record and Carfax line up", () => {
    const hit = milesAgree([{ source: "This listing", miles: 126_360 }, { source: "Auction record", miles: 126_360 }, { source: "Carfax", miles: 126_357 }]);
    expect(hit).toMatchObject({ id: "miles-agree", action: "info", title: "Miles agree across 3 sources (126,357–126,360 miles)" });
    expect(hit?.reason).toContain("Still check the dashboard matches");
  });

  it("needs two different sources; one source said twice isn't agreement", () => {
    expect(milesAgree([{ source: "This listing", miles: 126_360 }])).toBeNull();
    expect(milesAgree([{ source: "Carfax", miles: 126_360 }, { source: "Carfax", miles: 126_360 }])).toBeNull();
  });

  it("stays quiet when readings are far apart (other checks raise that) or missing", () => {
    expect(milesAgree([{ source: "This listing", miles: 98_000 }, { source: "Auction record", miles: 126_360 }])).toBeNull();
    expect(milesAgree([{ source: "This listing", miles: 0 }, { source: "Carfax", miles: 126_357 }])).toBeNull();
  });

  it("normal driving between readings still agrees (within 3% or 1,000 miles)", () => {
    expect(milesAgree([{ source: "Auction record", miles: 120_000 }, { source: "This listing", miles: 123_500 }])?.id).toBe("miles-agree");
    expect(milesAgree([{ source: "Auction record", miles: 20_000 }, { source: "This listing", miles: 20_900 }])?.id).toBe("miles-agree");
    expect(milesAgree([{ source: "Auction record", miles: 20_000 }, { source: "This listing", miles: 21_500 }])).toBeNull();
  });
});

describe("the dealer's Carfax page (case 34)", () => {
  it("reads the odometer from the header line (126,357 mi | VIN)", () => {
    const read = readProof(readFileSync("src/lib/assistant/fixtures/carfax-case34.txt", "utf8"));
    expect(read.source).toBe("carfax");
    expect(read.odometer?.miles).toBe(126_357);
    expect(read.owners).toBe(2);
  });
});

describe("quick starts fit the page", () => {
  it("offers the negotiation question once there's a price and names the recall count", () => {
    expect(starters(ctx)).toEqual(["What's next?", "What should I offer?", "Is the price fair?", "What should I ask the seller?"]);
    expect(starters({ ...ctx, price: null, estimate: null, auctionSold: null })).toEqual(["What's next?", "Is the price fair?", "What should I ask the seller?", "Are the 3 recalls fixed?"]);
    expect(starters({ ...ctx, price: null, estimate: null, auctionSold: null, recalls: 1 })).toContain("Is the recall fixed?");
  });

  it("every quick start is answered from the page (never small talk, never the AI)", () => {
    for (const c of [ctx, { ...ctx, price: null, estimate: null, auctionSold: null }, { ...ctx, price: null, estimate: null, auctionSold: null, recalls: 1 }]) {
      for (const s of starters(c)) expect(routeMessage(s, VIN).kind, s).toBe("intent");
    }
  });

  it("'What should I offer?' gives an opening price, a walk-away price and a message to copy", () => {
    const r = answerIntent("offer", ctx);
    expect(r.text).toContain("$13,400");
    expect(r.text).toContain("$15,200");
    expect(r.actions.find((a) => a.kind === "copy")).toBeTruthy();
  });
});

describe("a ZIP you tell VinVerdict is yours, not the car's", () => {
  it("doesn't move the car's location", () => {
    const base = { text: VIN, listing: { ...parseListing(VIN), zip: "19103" }, vinCheck: null, decoded: null } as unknown as Analysis;
    const told: Told[] = [{ id: "1", label: "zip", facts: factsFromSentence("my zip is 08540") }];
    expect(told[0].facts?.[0]).toMatchObject({ kind: "zip", value: "08540" });
    expect(applyTold(base, told).listing.zip).toBe("19103");
  });
});
