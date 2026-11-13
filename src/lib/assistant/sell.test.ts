import { describe, expect, it } from "vitest";
import { routeMessage } from "./route";
import { SELL_STARTERS, buyerMessageReply, buyerScams, draftAd, sellAnswer, sellFollowUps, type SellContext } from "./sell";

const VIN = "2T2BZMCA2GC041915";
const s: SellContext = { car: "2016 Lexus RX 350", private: { low: 14_800, high: 18_000, fair: 16_400, listAt: 17_400, confidence: "medium" }, dealerAsk: 19_900, unpriced: null, recalls: 3, historyRead: false, carfax: "https://www.carfax.com/x" };

describe("selling: the questions a seller asks", () => {
  it("every seller quick start and follow-up reaches a page answer, not the AI", () => {
    const want: Record<string, string> = { "What's it worth?": "price", "What should I list it at?": "price", "How do I sell it safely?": "scam", "What's next?": "next", "What will buyers ask?": "seller", "Write my ad": "ad" };
    const all = new Set([...SELL_STARTERS, ...["price", "next", "scam", "seller", "visit", "ad"].flatMap(sellFollowUps)]);
    for (const q of all) expect(routeMessage(q, VIN), q).toEqual({ kind: "intent", intent: want[q] });
  });

  it("what it's worth: the page's private value, where to list, and the dealer comparison (no invented numbers)", () => {
    const r = sellAnswer("price", s);
    expect(r.text).toBe("Worth about $14,800–$18,000 to a private buyer, most likely $16,400. List it at about $17,400.");
    expect(r.points.join(" ")).toContain("A dealer would ask about $19,900");
    for (const n of `${r.text} ${r.points.join(" ")}`.match(/\$[\d,]+/g) ?? []) expect(["$14,800", "$18,000", "$16,400", "$17,400", "$19,900"]).toContain(n);
  });

  it("not priced yet: the price check or a quoted KBB value", () => {
    expect(sellAnswer("price", { ...s, private: null }).points.join(" ")).toContain("KBB private party");
  });

  it("what's next: price, the report, free recall fixes, paperwork, safe selling", () => {
    const r = sellAnswer("next", s).points.join(" ");
    expect(r).toContain("list at about $17,400");
    expect(r).toContain("open recalls fixed first");
    expect(r).toContain("title (in your name");
  });
});

describe("selling: a buyer's message checked for the scams that target sellers", () => {
  const cases: [string, string][] = [
    ["I'll send a cashier's check for $2,000 more than the price, just send the difference back to my shipper", "overpay"],
    ["I'm out of the country but my shipping agent will pick up the car once paid", "shipper"],
    ["Before we meet I need to verify you're real, please text me the 6 digit code I just sent", "code"],
    ["I sent the money on Zelle, it's pending until you upgrade to a business account", "pending"],
    ["Let's use escrow, here's the site link", "escrow"],
    ["I'll pay with a cashier's check", "check"],
    ["No need to see it, I'll take it sight unseen", "unseen"],
    ["I'm deployed overseas right now", "remote"],
  ];
  it.each(cases)("%s → %s", (msg, id) => {
    expect(buyerScams(msg).map((x) => x.id)).toContain(id);
  });

  it("the serious ones come first and the reply is ready to copy", () => {
    const r = buyerMessageReply("I'll pay with a cashier's check for more and my shipper will pick it up, send back the rest");
    expect(r.text).toMatch(/^This buyer is showing scam signs/);
    expect(r.actions[0]).toMatchObject({ kind: "copy" });
    expect(r.points[0]).toMatch(/^Overpayment|^A buyer who won't come/);
  });

  it("an ordinary buyer's message raises nothing, but still gets the safe way to be paid", () => {
    const r = buyerMessageReply("Hi, is it still available? Could I see it Saturday morning and bring my mechanic?");
    expect(r.text).toMatch(/^No common buyer-scam signs/);
  });

  it("a buyer's message is recognised as one (the buyer said…)", () => {
    expect(routeMessage("the buyer wants to pay with a cashier's check for more and have his shipper pick it up", VIN).kind).toBe("said");
  });
});

describe("selling: more phrasings", () => {
  it("'for $2,000 more' is the overpayment scam; '2,000 more miles' isn't", () => {
    expect(buyerScams("I'll pay with a cashier's check for $2,000 more and have my shipper pick it up").map((x) => x.id)).toContain("overpay");
    expect(buyerScams("it only has 2,000 more miles than the ad said").map((x) => x.id)).not.toContain("overpay");
  });
  it("showing the car to a buyer gets the showing-safely answer, not the AI", () => {
    expect(routeMessage("how do I show the car to a buyer?", VIN)).toEqual({ kind: "intent", intent: "visit" });
    expect(sellAnswer("visit", s).text).toBe("Showing the car and the test drive:");
  });
});

describe("selling: ordinary buyers aren't called scammers", () => {
  const ordinary = [
    "Hi, is this still available?",
    "My zip code is 08540, can you send more photos of the interior?",
    "Can you send me the code for the radio? It says code on the screen",
    "Can you text me the VIN so I can run a Carfax?",
    "I can pay cash, can we meet at my bank Saturday?",
    "Would you take 12k? I can come today",
    "I'll bring cash, $500 more than your last offer is the max I can do",
    "What's the lowest you'll go? I've seen others listed for 1,000 more",
    "I paid 2k over for my last car, not doing that again lol",
    "Can my mechanic take a look? He's at the shop on Main St",
    "Will you hold it until Friday if I put a deposit down?",
    "Text me at this number, I'll send you my address",
    "Can you send a video of it starting cold?",
  ];
  it.each(ordinary)("%s → nothing", (m) => expect(buyerScams(m)).toEqual([]));

  const scams: [string, string][] = [
    ["Google will send you a code, just read it back to me so I know you're not a bot", "code"],
    ["what's the verification code you got?", "code"],
    ["send me the code that went to your phone", "code"],
    ["I will overpay by 1500 and you refund the rest to my agent", "overpay"],
  ];
  it.each(scams)("%s → %s", (m, id) => expect(buyerScams(m).map((x) => x.id)).toContain(id));
});

describe("selling: a draft ad from the page's facts only", () => {
  it("nothing the page doesn't know is claimed: unknowns are [blanks]", () => {
    const ad = draftAd({ ...s, miles: 94_767, vin: VIN });
    expect(ad.split("\n")[0]).toBe("2016 Lexus RX 350, 94,767 miles, $17,400");
    expect(ad).toContain("[Title: clean and in your name? Any loan on it?]");
    expect(ad).toContain("[Accidents: what the history report shows.]");
    expect(ad).toContain(`VIN ${VIN}`);
    expect(ad).not.toMatch(/clean title\./i);
    expect(ad).not.toMatch(/no accidents/i);
  });
  it("a read history report is said as it is; bad news from listing data is said up front", () => {
    expect(draftAd({ ...s, history: { damage: "No accidents or damage", title: "Clean title" } })).toMatch(/Clean title\. .*No accidents or damage on the history report\./);
    expect(draftAd({ ...s, history: { damage: "Minor damage", title: "Clean title" } })).toContain("History report: minor damage. [What was repaired, and where.]");
    expect(draftAd({ ...s, feedHistory: ["History shows 1 accident"] })).toContain('[Accidents: listing data says "History shows 1 accident". Say it here, with what was repaired.]');
  });
  it("not priced and no miles: blanks, not numbers", () => {
    expect(draftAd({ ...s, private: null, miles: null }).split("\n")[0]).toBe("2016 Lexus RX 350, [miles], $[price]");
  });
  it.each(["write my ad", "help me write a listing", "write a description for it", "draft an ad", "what should my ad say"])("%s → ad", (q) => {
    expect(routeMessage(q, VIN)).toEqual({ kind: "intent", intent: "ad" });
  });
  it.each(["make sure the listing is real", "is the ad legit?", "write a message to the seller"])("%s → not ad", (q) => {
    const r = routeMessage(q, VIN) as { intent?: string };
    expect(r.intent).not.toBe("ad");
  });
});
