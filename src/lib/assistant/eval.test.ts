/**
 * The assistant's labelled test set (like the listing corpus): what each kind of message must
 * become. Every miss found in use is added here, so it can't come back. Grouped by what a
 * buyer types. Expected:
 *   "intent:<x>"   answered from the page, no AI
 *   "facts:<k,…>"  applied to the car (the kinds of fact, in order); "+q" = also a question
 *   "small-talk"   local reply, no AI action spent
 *   "ai"           an open question for the free AI
 *   "listing" | "proof" | "auction" | "other-car"
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeMessage, type Route } from "./route";

const VIN = "4T1B11HK8JU145889";

function label(r: Route): string {
  if (r.kind === "intent") return `intent:${r.intent}`;
  if (r.kind === "facts") return `facts:${r.facts.map((f) => f.kind).join(",")}${r.question ? "+q" : ""}`;
  if (r.kind === "said") return `said${r.facts.length ? `:${r.facts.map((f) => f.kind).join(",")}` : ""}`;
  return r.kind;
}

const MESSAGES: [string, string][] = [
  // --- Amogh's real session (2026-11-12) ---
  ["I am thinking of buying this car", "intent:overview"],
  ["It is a auction sale and it is priced for 9,100", "facts:auctionSold"],

  // --- Should I buy it? ---
  ["should i buy this car", "intent:overview"],
  ["Should I buy it?", "intent:overview"],
  ["would you buy it", "intent:overview"],
  ["is this a good car to buy", "intent:overview"],
  ["any red flags?", "intent:overview"],
  ["any problems with this one", "intent:overview"],
  ["what do you think", "intent:overview"],
  ["i'm interested in this camry", "intent:overview"],

  // --- Price ---
  ["Is the price fair?", "intent:price"],
  ["is this a good deal", "intent:price"],
  ["good price?", "intent:price"],
  ["is it overpriced", "intent:price"],
  ["is 14500 too much?", "intent:price"],
  ["how much should i offer", "intent:offer"],
  ["can I negotiate", "intent:offer"],
  ["What should I offer?", "intent:offer"],
  ["make an offer for me", "intent:offer"],
  ["how low can I go", "intent:offer"],
  ["what should I pay for it", "intent:offer"],
  ["help me negotiate", "intent:offer"],
  ["whats a fair price", "intent:price"],
  ["what's it worth", "intent:price"],
  ["is it too expensive", "intent:price"],

  // --- Costs and fuel ---
  ["what will it cost me out the door", "intent:costs"],
  ["how much is tax", "intent:costs"],
  ["what are the fees", "intent:costs"],
  ["registration cost?", "intent:costs"],
  ["what's the mpg", "intent:fuel"],
  ["gas mileage?", "intent:fuel"],
  ["how much will fuel cost", "intent:fuel"],

  // --- Seller ---
  ["What should I ask the seller?", "intent:seller"],
  ["what should i ask the dealer", "intent:seller"],
  ["what do i say to the seller", "intent:seller"],
  ["write a message to the dealer", "intent:seller"],
  ["questions to ask?", "intent:seller"],

  // --- History, recalls ---
  ["what does the carfax say", "intent:history"],
  ["has it been in an accident?", "intent:history"],
  ["how many owners", "intent:history"],
  ["is the title clean?", "intent:history"],
  ["are there recalls", "intent:recalls"],
  ["what about recalls", "intent:recalls"],
  ["any open recalls on it?", "intent:recalls"],

  // --- What's next ---
  ["What's next?", "intent:next"],
  ["what is next", "intent:next"],
  ["whats next", "intent:next"],
  ["what's the next step", "intent:next"],
  ["where do i start", "intent:next"],
  ["what should i do now", "intent:next"],
  ["What else?", "intent:next"],

  // --- Auctions ---
  ["is a dealer auction bad", "intent:auction"],
  ["bid is at 8500 now", "intent:auction"],
  ["how much should I bid", "intent:auction"],

  // --- Statements: facts that update the page ---
  ["the dealer is asking 14500", "facts:price"],
  ["they want 14,500", "facts:price"],
  ["asking price is $14,995", "facts:price"],
  ["price is $14,995 with 126k miles", "facts:price,miles"],
  ["it's priced at 12k", "facts:price"],
  ["they're asking $12,500 and it has 98,000 miles", "facts:price,miles"],
  ["it has 2 owners and no accidents", "facts:owners,accident"],
  ["the carfax says no accidents", "facts:accident"],
  ["it was in an accident last year", "facts:accident"],
  ["clean title in hand", "facts:title"],
  ["it has a rebuilt title", "facts:title"],
  ["im in 08540", "facts:zip"],
  // --- What the seller said, as the buyer reports it (checked like their reply) ---
  ["the seller said no accidents", "said:accident"],
  ["dealer says it has 1 owner", "said:owners"],
  ["they said the timing belt was replaced", "said"],
  ["seller told me the title is clean", "said:title"],
  ["she said she'd take 13,500", "said:price"],
  ["asking 14,995 but they said 14,500 cash", "said:price"],
  ["the seller wants a deposit to hold it", "said"],
  ["he asked me to pay with zelle", "said"],
  ["seller is overseas and will ship", "said"],
  ["he won't let my mechanic inspect it", "said"],
  ["seller said I need to decide today", "said"],
  // A plain price stays a fact.
  ["he wants 12000 cash", "facts:price"],
  ["they came down to 14k", "facts:price"],
  // --- New facts ---
  ["the dealer added a $899 doc fee", "facts:docFee"],
  ["doc fee is 499", "facts:docFee"],
  ["it was a rental", "facts:usage"],
  ["carfax says 1 accident minor damage", "facts:accident"],
  // --- At the car ---
  ["i'm going to see it tomorrow", "intent:visit"],
  ["what should I check at the test drive?", "intent:visit"],
  ["what do I bring on buying day", "intent:visit"],
  ["find me a cheaper one", "intent:price"],
  // --- To the AI, not a canned answer ---
  ["is 126k miles too much?", "ai"],
  ["should I get an extended warranty?", "ai"],
  ["the check engine light is on", "ai"],
  ["i bought it!", "small-talk"],
  ["my zip is 07030", "facts:zip"],
  ["it's from a private seller", "facts:seller"],
  ["it's a dealer car", "facts:seller"],
  ["auction sold it for $9,100 last week", "facts:auctionSold"],
  ["It went for $9,100 at the Manheim auction", "facts:auctionSold"],
  ["The auction sold it for $9,100, is that good?", "facts:auctionSold+q"],
  ["odometer reads 126,360", "facts:miles"],
  ["it has 126k miles", "facts:miles"],

  // --- Questions that look like facts: never applied as facts ---
  ["Has it been in an accident?", "intent:history"],
  ["Does it have a clean title?", "intent:history"],
  ["is 126k miles a lot?", "ai"],
  ["Will a 2018 Camry with 126k miles be fine for 5 more years of commuting?", "ai"],
  ["Are 2 owners ok for a car this age?", "intent:history"],

  // --- Open questions: worth the AI ---
  ["is it reliable", "intent:problems"],
  ["will it last?", "ai"],
  ["Will this engine last another 5 years of commuting?", "ai"],
  ["is the transmission good", "ai"],
  ["timing belt or chain?", "ai"],
  ["what does CR grade mean", "ai"],
  ["insurance cost?", "ai"],
  ["what should i check when i see it", "intent:visit"],
  ["what to inspect on the test drive", "intent:visit"],
  ["is the 2018 camry known for oil problems", "ai"],
  ["can i trust a dealer that sent it to auction", "ai"],
  ["is rust a problem on this model", "ai"],

  // --- Small talk and off-topic: no AI action spent ---
  ["hi", "small-talk"],
  ["hello there", "small-talk"],
  ["thanks!", "small-talk"],
  ["thank you so much", "small-talk"],
  ["ok", "small-talk"],
  ["lol", "small-talk"],
  ["?", "small-talk"],
  ["help", "small-talk"],
  ["test", "small-talk"],
  ["what's the weather tomorrow", "small-talk"],
  ["who won the game last night", "small-talk"],
  ["tell me a joke", "small-talk"],
  ["asdfgh", "small-talk"],
];

// Real pages (the listing corpus) and report pages: each is what it is.
const corpusDir = "src/lib/listing/corpus/cases";
const CORPUS = readdirSync(corpusDir).filter((f) => f.endsWith(".txt")).map((f) => {
  const spec = JSON.parse(readFileSync(`${corpusDir}/${f.replace(/\.txt$/, ".json")}`, "utf8")) as { expect?: { vin?: string | null } };
  return { name: f, text: readFileSync(`${corpusDir}/${f}`, "utf8"), vin: spec.expect?.vin ?? null };
});

const PROOF_PAGES: [string, string][] = [
  ["carfax-case34", readFileSync("src/lib/assistant/fixtures/carfax-case34.txt", "utf8")],
  // (This one is the case 32 Camry's: checked against its own VIN below.)
  ["nicb", `Look up a VIN VINCheck® Results VIN: ${VIN}\nVINCheck® Theft Record VIN: ${VIN} has not been identified as a vehicle listed in the VINCheck® Theft Records.\nVINCheck® Total Loss Record VIN: ${VIN} has not been identified as a vehicle listed in the VINCheck® Salvage Records.\nFurther information is available through CARFAX`],
  ["autocheck", `Experian AutoCheck Report Report run: 11/09/2026 2018 Toyota Camry LE Sedan 4D Owners - 2 AutoCheck Score VIN: ${VIN} Class: Car - Midsize 81 Vehicle Usage Personal Similar vehicles usually range between 75 and 88 Last Reported Odometer: 126,357 (09/03/2026) Vehicle History at a Glance State Title Brand Auction Brand / Issues Accident / Damage No Accidents or Damage Reported Clean No Issue`],
];

const AUCTIONS: [string, string][] = [
  ["manheim-case34", `2018 Toyota Camry LE FWD 4 Door Sedan 2.5 4cyl. Gasoline 1 of 9 Run: C-080 VIN: ${VIN} MMR: N/A PMR: N/A Odometer: 126,360 (Actual) Light(s): CR: Grade: N/A Announcements: N/A Scan VIN More Like This PDF Consignor: Piazza Auto Group VEHICLE DETAILS Trim LE VIN ${VIN} Color`],
  ["manheim-mmr", `Manheim New Jersey Lane 12 Run 045 2018 Toyota Camry LE VIN ${VIN} Odometer: 126,360 (Actual) MMR: $11,250 CR Grade: 3.4 Announcements: Structural damage Consignor: Ally Financial`],
  ["adesa", `ADESA Boston 2018 TOYOTA CAMRY LE VIN: ${VIN} Run: 3-112 Odometer: 126,360 CR: 3.8 Announcements: Prior paint Seller: Toyota Financial Sold: $9,100`],
  ["acv", `ACV Auctions Condition Report 2018 Toyota Camry LE VIN ${VIN} CR Grade 4.1 Odometer 126,360 Consignor: Piazza Honda Winning bid $9,100`],
];

describe("the assistant's routing test set", () => {
  it.each(MESSAGES)("%s → %s", (text, want) => {
    expect(label(routeMessage(text, VIN))).toBe(want);
  });

  it.each(CORPUS.map((c) => [c.name, c] as const))("real page %s is a listing (never a fact or a question)", (_n, c) => {
    const kind = routeMessage(c.text, c.vin).kind;
    // A pasted VIN or link alone is "this car" or "paste the page instead", never sent to AI.
    if (/^\s*(?:vin:?\s*)?[A-HJ-NPR-Z0-9]{17}\s*$/i.test(c.text)) expect(kind).toBe("small-talk");
    else if (/^\s*https?:\/\/\S+\s*$/i.test(c.text)) expect(kind).toBe("link");
    else expect(["listing", "auction"]).toContain(kind);
  });

  it("a Carfax is proof for its own car, and another car for any other", () => {
    const cf = readFileSync("src/lib/ai/fixtures/carfax-like-case32.txt", "utf8");
    expect(routeMessage(cf, "4T1F11AK9LU310542")).toMatchObject({ kind: "proof", source: "carfax" });
    expect(routeMessage(cf, VIN)).toEqual({ kind: "other-car", vin: "4T1F11AK9LU310542" });
  });

  it("a bare VIN or a link", () => {
    expect(routeMessage(VIN, VIN).kind).toBe("small-talk");
    expect(routeMessage("VIN: 1HGCR2F8XHA000123", VIN)).toEqual({ kind: "other-car", vin: "1HGCR2F8XHA000123" });
    expect(routeMessage("https://www.autotrader.com/cars-for-sale/vehicle/793308375", VIN)).toEqual({ kind: "link", host: "autotrader.com" });
    expect(routeMessage("https://www.princetonhonda.com/used/Honda/2020-Honda-Accord-1hgcv1f35la054321.htm", VIN)).toEqual({ kind: "other-car", vin: "1HGCV1F35LA054321" });
  });

  it.each(PROOF_PAGES)("report page %s is proof", (_n, text) => {
    expect(routeMessage(text, VIN)).toMatchObject({ kind: "proof" });
  });

  it.each(AUCTIONS)("auction record %s is an auction record", (_n, text) => {
    expect(routeMessage(text, VIN).kind).toBe("auction");
  });

  it("someone else's page is never added to this car", () => {
    const other = "1HGCR2F8XHA000123";
    for (const [, t] of [...PROOF_PAGES.slice(0, 1), ...AUCTIONS.slice(0, 1)]) expect(routeMessage(t.replaceAll(VIN, other), VIN)).toEqual({ kind: "other-car", vin: other });
  });
});
