import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/analyze";
import { parseListing } from "@/lib/listing/parse";
import { parseAuctionRecord } from "@/lib/listing/auction";
import { evaluateScamRules } from "@/lib/scam/rules";
import { answerIntent, SMALL_TALK, type PageContext } from "./answers";
import { applyTold, auctionHits, toldAuction, type Told } from "./apply";
import { factsFromSentence } from "./facts";
import { routeMessage } from "./route";

const VIN = "4T1B11HK8JU145889";
// Amogh's real session on vinverdict.vercel.app (2026-11-12), message by message.
const SAID = {
  buying: "I am thinking of buying this car",
  auction: "It is a auction sale and it is priced for 9,100",
  record: `2018 Toyota Camry LE FWD 4 Door Sedan 2.5 4cyl. Gasoline 1 of 9 Run: C-080 VIN: ${VIN} MMR: N/A PMR: N/A Odometer: 126,360 (Actual) Light(s): CR: Grade: N/A Announcements: N/A Scan VIN More Like This PDF Consignor: Piazza Auto Group VEHICLE DETAILS Trim LE VIN ${VIN} Color`,
  carfax: readFileSync("src/lib/assistant/fixtures/carfax-case34.txt", "utf8"),
};

describe("the router: what each message is, without AI (Amogh's real session)", () => {
  it("'thinking of buying' is answered from the page, not sent to an AI", () => {
    expect(routeMessage(SAID.buying, VIN)).toEqual({ kind: "intent", intent: "overview" });
  });

  it("'auction sale … priced for 9,100' is a fact that updates the car", () => {
    const r = routeMessage(SAID.auction, VIN);
    expect(r).toMatchObject({ kind: "facts", question: false, facts: [{ kind: "auctionSold", value: 9100 }] });
  });

  it("the pasted auction record is read as one, not summarised", () => {
    const r = routeMessage(SAID.record, VIN);
    expect(r.kind).toBe("auction");
    if (r.kind === "auction") expect(r.record).toMatchObject({ vin: VIN, run: "C-080", odometer: 126360, odometerActual: true, consignor: "Piazza Auto Group", crGrade: null, announcements: null });
  });

  it("the Carfax becomes proof for this car", () => {
    expect(routeMessage(SAID.carfax, VIN)).toEqual({ kind: "proof", source: "carfax" });
  });

  it("another car's pages are caught, and a dealer listing that mentions a free Carfax isn't a Carfax", () => {
    expect(routeMessage(SAID.record.replaceAll(VIN, "1HGCR2F8XHA000123"), VIN)).toEqual({ kind: "other-car", vin: "1HGCR2F8XHA000123" });
    const listing = `2018 Toyota Camry LE Listing Price $14,995 126,360 mi Free Carfax Report Contact Dealer VIN ${VIN} Piazza Honda of Springfield`;
    expect(routeMessage(listing, VIN).kind).toBe("listing");
  });

  it("small talk and vague messages cost nothing; open questions go to AI", () => {
    for (const s of ["hi", "thanks!", "what's the weather tomorrow", "ok"]) expect(routeMessage(s, VIN).kind, s).toBe("small-talk");
    expect(routeMessage("Is the price fair?", VIN)).toEqual({ kind: "intent", intent: "price" });
    expect(routeMessage("What should I ask the dealer?", VIN)).toEqual({ kind: "intent", intent: "seller" });
    // A fact inside an open question: the miles are applied, then the question goes to AI.
    expect(routeMessage("Will a 2018 Camry with 126k miles be fine for 5 more years of commuting?", VIN)).toMatchObject({ kind: "facts", question: true, intent: null, facts: [{ kind: "miles", value: 126000 }] });
    expect(routeMessage("Will this engine last another 5 years of commuting?", VIN).kind).toBe("ai");
  });
});

describe("facts in a sentence", () => {
  it("reads prices, miles, ZIP, seller, owners, accidents and title, with the words they came from", () => {
    const f = factsFromSentence("They're asking $12,500 for it, 126k miles, 2 owners, no accidents, clean title, from a dealer. I'm in 08540.");
    expect(f.map((x) => [x.kind, x.value])).toEqual([["price", 12500], ["miles", 126000], ["zip", "08540"], ["seller", "dealer"], ["owners", 2], ["accident", "none"], ["title", "clean"]]);
    expect(f[0].quote).toBe("asking $12,500");
    expect(factsFromSentence("It went for $9,100 at the Manheim auction")).toMatchObject([{ kind: "auctionSold", value: 9100 }]);
    expect(factsFromSentence("price is 9100")).toMatchObject([{ kind: "price", value: 9100 }]);
    expect(factsFromSentence("what a nice car")).toEqual([]);
  });
});

describe("telling VinVerdict changes the car the whole page shows", () => {
  const base = { text: VIN, listing: parseListing(VIN), vinCheck: null, decoded: null } as unknown as Analysis;

  it("facts win over the ad, a pasted listing only fills gaps, and undo is just leaving an item out", () => {
    const told: Told[] = [
      { id: "1", label: "listing", listing: parseListing(`2018 Toyota Camry LE $14,995 126,360 miles dealer VIN ${VIN}`), text: "pasted listing" },
      { id: "2", label: "price", facts: factsFromSentence("they're asking 13,900") },
    ];
    const a = applyTold(base, told);
    expect(a.listing).toMatchObject({ price: 13900, miles: 126360, year: 2018, model: "Camry" });
    expect(a.text).toContain("pasted listing");
    expect(applyTold(base, told.slice(0, 1)).listing.price).toBe(14995);
    expect(applyTold(base, [])).toBe(base);
  });

  it("an auction record is kept apart from the asking price, fills unknown miles, and catches miles that went down", () => {
    const record = parseAuctionRecord(SAID.record)!;
    const told: Told[] = [{ id: "1", label: "auction", auction: record, text: SAID.record }, { id: "2", label: "said", facts: factsFromSentence(SAID.auction) }];
    const a = applyTold(base, told);
    expect(a.listing.price).toBeNull();
    expect(a.listing.miles).toBe(126360);
    expect(toldAuction(told)).toMatchObject({ soldPrice: 9100, record: { consignor: "Piazza Auto Group" } });
    expect(auctionHits(toldAuction(told), 98_000)[0]?.id).toBe("auction-miles-lower");
    expect(auctionHits(toldAuction(told), 126_400)).toEqual([]);
  });

  it("a dealer auction is worth knowing, not a Stop; a salvage auction still is", () => {
    const hits = (t: string) => evaluateScamRules({ text: t, listing: parseListing(t) }).hits.map((h) => h.id);
    expect(hits(SAID.record)).toContain("dealer-auction");
    expect(hits(SAID.record)).not.toContain("auction");
    expect(hits("2018 Camry sold at Copart, salvage auction, $3,000")).toContain("auction");
  });
});

describe("answers built from the page", () => {
  const ctx: PageContext = {
    car: "2018 Toyota Camry LE", vin: VIN, make: "Toyota", verdict: { title: "Worth investigating", text: "Nothing wrong found in what was checked." },
    stops: [], checks: ["Went through a dealer auction"], unknowns: [], price: null, estimate: null, auctionSold: 9100, priced: false, historyRead: false,
    carfax: `https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=${VIN}&partner=FRD_2`, recalls: 8, recallLookup: "https://www.toyota.com/recall", sellerMessage: "Hi, …", dealer: true,
  };

  it("'thinking of buying' gets the verdict and the next steps as buttons", () => {
    const r = answerIntent("overview", ctx);
    expect(r.text).toContain("Worth investigating");
    expect(r.actions.map((a) => a.label)).toEqual(["Open the free Carfax", "Add a history report", "Run the price check", "Open the recall lookup"]);
  });

  it("the price answer explains a wholesale auction price instead of guessing", () => {
    const r = answerIntent("price", ctx);
    expect(r.text).toBe("VinVerdict hasn't priced it yet.");
    expect(r.points.join(" ")).toContain("sold at a dealer auction for $9,100: that's a wholesale price");
  });

  it("small talk shows what you can do", () => {
    expect(SMALL_TALK.points.length).toBe(3);
  });
});
