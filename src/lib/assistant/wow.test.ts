import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/analyze";
import { readProof } from "@/lib/evidence/parse";
import { parseListing } from "@/lib/listing/parse";
import { answerIntent, followUps, smallTalk, starters, type PageContext } from "./answers";
import { checkReplies } from "@/lib/seller-replies";
import { applyTold, toldReplies, type Told } from "./apply";
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
  trust: { stops: [], checks: [] }, seller: { name: null, type: "dealer", place: null, listings: null, sellers: [] }, feedHistory: [], replyTips: [], problems: { complaints: 412, top: [{ area: "AIR BAGS", count: 90 }, { area: "ELECTRICAL SYSTEM", count: 61 }], known: [] },
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
    // A lean price check (no listing history) doesn't offer the same check again; no VIN, no lookup.
    expect(knowsList({ ...empty, vin: VIN, priced: true }).find((x) => x.key === "listings")).toMatchObject({ detail: "Not looked up in this check", action: null });
    expect(knowsList(empty).find((x) => x.key === "listings")?.detail).toBe("Needs the VIN");
    expect(knowsList({ ...empty, feedHistory: ["History shows 1 accident"] }).find((x) => x.key === "history")?.detail).toBe("Known so far: History shows 1 accident; the report has the details");
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
    // A listing with serious warnings: no negotiating button, the scam question instead.
    expect(starters({ ...ctx, trust: { stops: ["Gift card payment"], checks: [] } }).slice(0, 2)).toEqual(["What's next?", "Is this a scam?"]);
  });

  it("every quick start is answered from the page (never small talk, never the AI)", () => {
    for (const c of [ctx, { ...ctx, price: null, estimate: null, auctionSold: null }, { ...ctx, price: null, estimate: null, auctionSold: null, recalls: 1 }]) {
      for (const s of starters(c)) expect(routeMessage(s, VIN).kind, s).toBe("intent");
    }
  });

  it("'What should I offer?' gives an opening price, a walk-away price and a message to copy", () => {
    const r = answerIntent("offer", ctx);
    expect(r.text).toContain("$13,400");
    expect(r.text).toContain("don't pay more than the asking price ($14,995)");
    expect(r.actions.find((a) => a.kind === "copy")).toBeTruthy();
  });
});

describe("scam, seller and everyday questions are answered from the page", () => {
  const scamCtx: PageContext = { ...ctx, auctionSold: null, price: 4_500, estimate: { low: 15_100, high: 19_300, label: "Great deal", open: 4_500, walk: 4_500 }, trust: { stops: ["Gift card payment", "Shipping only"], checks: [] } };

  it("routes scam, seller and thanks messages without the AI", () => {
    for (const q of ["is this a scam?", "is it legit", "is the seller legit?", "is this a fake listing"]) expect(routeMessage(q, VIN), q).toEqual({ kind: "intent", intent: "scam" });
    for (const q of ["who is the seller?", "who's selling it", "tell me about the dealer", "is it a dealer or private seller?"]) expect(routeMessage(q, VIN), q).toEqual({ kind: "intent", intent: "who" });
    expect(smallTalk("thanks!").text).toMatch(/^You're welcome/);
    expect(smallTalk("hello").text).toMatch(/^Tell VinVerdict anything/);
  });

  it("a scam ad: every answer says don't pay, and the price isn't called a deal", () => {
    expect(answerIntent("scam", scamCtx).text).toBe("Treat it as a scam until it's proven otherwise. VinVerdict found serious warning signs: Gift card payment; Shipping only.");
    expect(answerIntent("offer", scamCtx).quote).toBeUndefined();
    expect(answerIntent("offer", scamCtx).text).toMatch(/^Don't make an offer/);
    expect(answerIntent("price", scamCtx).text).toContain("a price this low is the bait");
    const next = answerIntent("next", scamCtx);
    expect(next.points[0]).toContain("Don't send any money");
    expect(next.points.join(" ")).not.toMatch(/Great deal|Carfax/);
  });

  it("no scam signs: says so without calling it safe, and gives the safe way to pay", () => {
    const r = answerIntent("scam", ctx);
    expect(r.text).toBe("No scam signs in what was checked. That isn't proof, so pay the safe way:");
    expect(r.points.join(" ")).toContain("cashier's check");
  });

  it("the price answer answers the question first", () => {
    expect(answerIntent("price", { ...ctx, price: 21_734, estimate: { low: 16_200, high: 21_200, label: "Overpriced", open: 18_000, walk: 21_200 } }).text).toBe("Overpriced: $21,734 is $534 above similar cars ($16,200–$21,200).");
    expect(answerIntent("price", ctx).text).toBe("Fair: $14,995 is within what similar cars ask ($14,000–$15,700).");
  });

  it("who is the seller, and what listing data already shows about its history", () => {
    const c = { ...ctx, seller: { name: "Piazza Honda", type: "dealer" as const, place: "Philadelphia, PA", listings: 3, sellers: ["Piazza Honda", "Fast Track Motors"] }, feedHistory: ["History shows 1 accident"] };
    expect(answerIntent("who", c).text).toBe("Piazza Honda, a dealer in Philadelphia, PA.");
    expect(answerIntent("who", c).points[0]).toBe("Listing data shows 2 sellers for this VIN: Piazza Honda, Fast Track Motors.");
    expect(answerIntent("history", c).text).toMatch(/^Already known from the ad and listing data: History shows 1 accident\./);
    expect(answerIntent("history", c).points[0]).toContain("never clears a car");
  });

  it("one recall reads as one recall", () => {
    expect(answerIntent("next", { ...ctx, recalls: 1 }).points.join(" ")).toContain("Check whether the recall for this model year is still open");
  });
});

describe("common problems and reliability, from NHTSA and the known-issue list", () => {
  it("routes the everyday phrasings here instead of to the AI", () => {
    for (const q of ["what are common problems with this car", "is the camry reliable?", "how long will it last?", "what should I watch out for", "known issues?"]) expect(routeMessage(q, VIN), q).toEqual({ kind: "intent", intent: "problems" });
  });

  it("answers with the complaint count and areas, the known issues, and no promise about lifespan", () => {
    const r = answerIntent("problems", { ...ctx, problems: { complaints: 412, top: [{ area: "AIR BAGS", count: 90 }, { area: "ELECTRICAL SYSTEM", count: 61 }], known: ["Oil burning (2.4 L 2AZ engine)"] } });
    expect(r.text).toBe("What's known about the 2018 Toyota Camry LE:");
    expect(r.points[0]).toBe("Known for this model year: Oil burning (2.4 L 2AZ engine). It's on your inspection list.");
    expect(r.points[1]).toMatch(/^412 owner complaints to NHTSA for this model year, most about air bags \(90\), electrical system \(61\)\. More cars sold/);
    expect(r.points.join(" ")).not.toMatch(/\d+ (?:years|more miles)/);
  });
});

describe("facts a buyer hears from the seller", () => {
  it("the latest price counts, and a deposit or an amount off is never the price", () => {
    expect(factsFromSentence("asking 14,995 but they said 14,500 cash").find((f) => f.kind === "price")?.value).toBe(14_500);
    expect(factsFromSentence("she said she'd take 13,500")[0]).toMatchObject({ kind: "price", value: 13_500 });
    expect(factsFromSentence("they'd take $500 off").filter((f) => f.kind === "price")).toEqual([]);
    expect(factsFromSentence("he wants $500 deposit").filter((f) => f.kind === "price")).toEqual([]);
    expect(factsFromSentence("he wants 12000 cash")[0]).toMatchObject({ kind: "price", value: 12_000 });
  });

  it("doc fee, rental use, and accident wording", () => {
    expect(factsFromSentence("the dealer added a $899 doc fee")).toMatchObject([{ kind: "docFee", value: 899 }]);
    expect(factsFromSentence("it was a rental")).toMatchObject([{ kind: "usage", value: "rental" }]);
    expect(factsFromSentence("it's not a rental")).toEqual([]);
    expect(factsFromSentence("accident-free, one owner").find((f) => f.kind === "accident")?.value).toBe("none");
    expect(factsFromSentence("carfax says 1 accident").find((f) => f.kind === "accident")?.value).toBe("reported");
  });

  it("a doc fee and rental use change the car the page shows", () => {
    const base = { text: VIN, listing: parseListing(VIN), vinCheck: null, decoded: null } as unknown as Analysis;
    const a = applyTold(base, [{ id: "1", label: "x", facts: [...factsFromSentence("doc fee is 499"), ...factsFromSentence("it was a rental")] }]);
    expect(a.listing).toMatchObject({ docFee: 499, usage: "rental" });
  });

  it("what the seller said is checked like their reply (chips carry it, Undo drops it)", () => {
    const told: Told[] = [{ id: "1", label: "Seller", reply: "he won't let my mechanic inspect it" }, { id: "2", label: "Seller", reply: "the title is in his brother's name" }];
    const hits = checkReplies(toldReplies(told), parseListing("2018 Toyota Camry LE $14,995")).map((h) => h.id);
    expect(hits).toEqual(expect.arrayContaining(["msg-no-inspection", "msg-curbstoning"]));
    expect(toldReplies(told.slice(1))).not.toContain("mechanic");
  });

  it("visiting the car: a checklist with this VIN, and a warning first for a scam ad", () => {
    const r = answerIntent("visit", ctx);
    expect(r.points.join(" ")).toContain(`Match the VIN on the dashboard and on the driver's door sticker to ${VIN}`);
    expect(answerIntent("visit", { ...ctx, trust: { stops: ["Gift card payment"], checks: [] } }).text).toMatch(/^Don't go yet/);
    expect(smallTalk("I bought it!").text).toBe("Congratulations. Three things for the first week:");
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

describe("the conversation is kept on this device", () => {
  it("saves and loads the last messages per car, without screenshot links, and expires after 7 days", async () => {
    const mem = new Map<string, string>();
    const ls = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    const { loadThread, saveThread } = await import("./store");
    saveThread("vv-told:X", [{ id: "1", who: "you", text: "is it a scam?" }, { id: "2", who: "vv", text: "No scam signs", read: { text: "r", label: "l", thumb: "blob:x" } }], 1_000);
    const back = loadThread("vv-told:X", 2_000);
    expect(back.map((m) => m.text)).toEqual(["is it a scam?", "No scam signs"]);
    expect(back[1]).not.toHaveProperty("read");
    expect(loadThread("vv-told:X", 1_000 + 8 * 86_400_000)).toEqual([]);
    saveThread("vv-told:X", [], 3_000);
    expect(mem.has("vv-told:X:thread")).toBe(false);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe("follow-up questions", () => {
  const intents = ["overview", "next", "price", "offer", "seller", "scam", "who", "history", "recalls", "problems", "visit", "costs", "fuel", "auction"];
  it("every suggestion is answered from the page by the intent it's meant for", () => {
    for (const i of intents) for (const q of followUps(i, ctx)) {
      const want: Record<string, string> = {
        "What should I offer?": "offer", "Is this a scam?": "scam", "How much out the door?": "costs", "What should I ask the seller?": "seller",
        "What should I check when I see it?": "visit", "What's next?": "next", "Who is the seller?": "who", "Any recalls?": "recalls",
        "What are common problems?": "problems", "What's the gas mileage?": "fuel",
      };
      expect(routeMessage(q, VIN), `${i}: ${q}`).toEqual({ kind: "intent", intent: want[q] });
    }
  });
  it("never suggests negotiating on a listing with serious warnings, or an offer with no price at all", () => {
    const scam = { ...ctx, trust: { stops: ["Gift card payment"], checks: [] } };
    for (const i of intents) expect(followUps(i, scam), i).not.toContain("What should I offer?");
    expect(followUps("price", { ...ctx, price: null, estimate: null, auctionSold: null })).not.toContain("What should I offer?");
  });
});

describe("the message to the seller", () => {
  it("can be copied right in the conversation, and on a listing with serious warnings it says not to pay first", () => {
    const r = answerIntent("seller", { ...ctx, sellerMessage: "Hi, is the title in your name?" });
    expect(r.quote).toBe("Hi, is the title in your name?");
    expect(r.actions[0]).toEqual({ kind: "copy", label: "Copy the message", text: "Hi, is the title in your name?" });
    expect(answerIntent("seller", { ...ctx, trust: { stops: ["Gift card payment"], checks: [] } }).text).toMatch(/^Don't send money/);
  });
});
