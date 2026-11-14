/**
 * "What should I offer?": the negotiation picture from what's on the page, and a message
 * ready to send. Pure. Every number is one the page already has (the asking price, the
 * auction sale, the estimate and its suggested offer, another dealer's price); the only
 * arithmetic is the gap between two of them. No markup, fee or "fair margin" is invented.
 *
 * Three cases come before any negotiating:
 *  - the ad shows a scam pattern: no offer, no message, don't pay anything;
 *  - the asking price is already at or below the suggested opening: don't push the price,
 *    find out why it's cheap;
 *  - the suggested walk-away is at or above the asking price: the asking price is the ceiling.
 */

export type Lever = { id: string; title: string };

export type DealInput = {
  car: string;
  asking: number | null;
  /** The dealer's fee the ad adds on top of the asking price, or 0. The offer is for the price before it. */
  dealerFee?: number;
  auctionSold: number | null;
  auctionDate: string | null;
  estimate: { low: number; high: number; open: number | null; walk: number | null; basis?: string } | null;
  /** The cheapest other listing of the same VIN, if the listing history shows one. */
  otherListing: { seller: string; price: number } | null;
  /** Findings that give the buyer leverage (accident, branded title, high miles, price cut…). */
  leverage: Lever[];
  dealer: boolean;
  /** Serious warnings about the listing itself (scam patterns). Any one means: don't negotiate. */
  scam?: string[];
  /** Things about the listing or the deal to check (title not in the seller's name, a loan on it…). */
  concerns?: string[];
  /** What the buyer's own mechanic found: the strongest reason there is, in the buyer's words. */
  inspection?: { status: "passed" | "issues"; note: string } | null;
};

export type DealAnswer = { text: string; points: string[]; message: string | null };

const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** How each kind of leverage reads in a message to the seller (null: not something to bring up). */
const SAY: [RegExp, string | null][] = [
  [/^(?:accident-reported|live-accident|report-damage)$/, "the history shows an accident"],
  [/^(?:title-brand|report-title)$/, "it has a branded title"],
  [/^history-price-cut$/, "the price has already been cut once"],
  [/^high-miles$/, "it has high miles for its age"],
  [/^(?:dealer-auction|auction|proof-auction|auction-broker)$/, "it went through an auction"],
  [/^history-two-sellers$/, "another seller is listing the same car"],
  [/^(?:accident-unknown|seller-problem|history-moved)$/, null],
];

/** The same fact said twice (an accident in the ad and in listing data) counts once. */
function distinct(levers: Lever[]): Lever[] {
  const seen = new Set<string>();
  return levers.filter((l) => {
    const key = SAY.find(([re]) => re.test(l.id))?.[1] ?? l.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dealAnswer(input: DealInput): DealAnswer {
  const scam = input.scam ?? [];
  if (scam.length) {
    return {
      text: input.asking && input.estimate && input.asking < input.estimate.low
        ? "Don't make an offer. There are serious warning signs, and a price this low is how scams pull people in."
        : "Don't make an offer. There are serious warning signs about this seller or the deal.",
      points: [
        `What VinVerdict found: ${scam.slice(0, 4).join("; ")}.`,
        "Don't send any money, deposit or gift card, and don't share your personal details.",
        "A real seller lets you see the car, its title and their ID in person before you pay.",
      ],
      message: null,
    };
  }

  // The auction sale is its own point, and the same fact isn't repeated.
  let levers = distinct(input.leverage);
  if (input.auctionSold) levers = levers.filter((l) => !/auction/.test(l.id));
  if (input.otherListing) levers = levers.filter((l) => l.id !== "history-two-sellers");
  const d = { ...input, levers };
  const points: string[] = [];
  const cheap = !!(d.asking && d.estimate && d.asking <= (d.estimate.open ?? d.estimate.low));

  if (d.asking && d.auctionSold) {
    const gap = d.asking - d.auctionSold;
    points.push(
      gap > 0
        ? `Asking ${$(d.asking)} is ${$(gap)} above what it sold for at a dealer auction (${$(d.auctionSold)}${d.auctionDate ? `, ${d.auctionDate}` : ""}). The dealer also paid auction fees, transport and reconditioning, which aren't known, so not all of that is profit, but it shows there's room.`
        : `Asking ${$(d.asking)} is at or below its dealer-auction sale (${$(d.auctionSold)}): unusually low, so check why before anything else.`,
    );
  } else if (d.auctionSold) {
    points.push(`It sold at a dealer auction for ${$(d.auctionSold)}: that's roughly what a dealer paid, before their fees and reconditioning.`);
  }
  if (d.estimate) {
    const basis = d.estimate.basis && d.estimate.basis !== "similar cars" ? `From ${d.estimate.basis}` : "Similar cars nearby";
    points.push(`${basis}: ${$(d.estimate.low)}–${$(d.estimate.high)}${d.asking ? ` (asking ${$(d.asking)})` : ""}.`);
    if (!cheap && d.estimate.open && d.estimate.walk) points.push(`VinVerdict's suggestion: open at ${$(d.estimate.open)}, walk away above ${$(Math.min(d.estimate.walk, d.asking ?? d.estimate.walk))}.`);
  }
  if (d.otherListing && (!d.asking || d.otherListing.price < d.asking)) points.push(`${d.otherListing.seller} lists the same VIN for ${$(d.otherListing.price)}${d.asking ? `, ${$(d.asking - d.otherListing.price)} less` : ""}.`);
  const found = d.inspection?.status === "issues" ? d.inspection.note.replace(/[.!\s]+$/, "") : null;
  if (found) points.push(`Your mechanic's findings come first: ${found}. Ask for the repair cost off the price, or for it to be fixed before you buy (get the repair quote in writing).`);
  if (cheap && d.concerns?.length) points.push(`A price this low usually has a reason. Check first: ${d.concerns.slice(0, 3).join("; ")}.`);
  else if (cheap) points.push("A price this low usually has a reason: the history report and your mechanic's inspection are how you find it.");
  if (!cheap && d.levers.length) points.push(`Your leverage: ${d.levers.slice(0, 3).map((l) => l.title).join("; ")}.`);

  const offer = cheap ? null : d.estimate?.open ?? null;
  const said = d.levers.map((l) => SAY.find(([re]) => re.test(l.id))?.[1]).filter((x): x is string => !!x);
  const reasons = [
    found ? `my mechanic found ${found}` : null,
    d.auctionSold ? `it sold at a dealer auction for ${$(d.auctionSold)}${d.auctionDate ? ` on ${d.auctionDate}` : ""}` : null,
    d.otherListing && (!d.asking || d.otherListing.price < d.asking) ? `${d.otherListing.seller} lists the same car for ${$(d.otherListing.price)}` : null,
    ...said.slice(0, 2),
  ].filter((x): x is string => !!x);
  // The ad's own total when it adds a dealer fee: "listed at $22,097 ($21,298 + $799 dealer fee)".
  const fee = d.dealer && d.dealerFee ? d.dealerFee : 0;
  const listed = d.asking ? (fee ? `${$(d.asking + fee)} (${$(d.asking)} + ${$(fee)} dealer fee)` : $(d.asking)) : "";
  // Once the buyer's mechanic has seen it, the message is a follow-up, not a first contact.
  const inspected = !!d.inspection;
  const message = cheap
    ? [
        `Hi, ${inspected ? "about" : "I'm interested in"} the ${d.car} listed at ${listed}.`,
        found ? `My mechanic's inspection found this: ${found}. Would you fix it first, or take the repair cost off?` : "Before I come to see it: why is it priced below similar cars, and is there anything I should know about its history or title?",
        inspected ? "Thanks!" : "If my mechanic's inspection checks out, I'm ready to buy. Thanks!",
      ].join(" ")
    : [
        `Hi, ${inspected ? "about" : "I'm interested in"} the ${d.car}${d.asking ? ` listed at ${listed}` : ""}.`,
        reasons.length ? `${inspected ? "Having had it inspected" : "Before I come in"}: ${reasons.join(", and ")}.` : null,
        offer
          ? d.dealer
            ? `Would you take ${$(offer)} for the car, before tax and fees? Please send the out-the-door price with every fee listed.`
            : `Would you take ${$(offer)}?`
          : `What's your best ${d.dealer ? "out-the-door " : ""}price, with every fee listed?`,
        inspected ? "Thanks!" : "I'd like my own mechanic to inspect it before I buy. Thanks!",
      ].filter(Boolean).join(" ");

  const ceiling = d.estimate?.walk ?? d.estimate?.high ?? null;
  const text = !d.asking && !d.estimate && !d.auctionSold
    ? "To work out an offer, VinVerdict needs the asking price (say \"they're asking 14,500\") and ideally the price check."
    : cheap
      ? `${$(d.asking!)} is already at or below what similar cars sell for, so there's little to negotiate. Find out why it's cheap before you pay. A message for that:`
      : offer && ceiling && d.asking && ceiling >= d.asking
        ? `Start at ${$(offer)}, and don't pay more than the asking price (${$(d.asking)}). Here's why, and a message you can send:`
        : offer && ceiling
          ? `Start at ${$(offer)} and stay below ${$(ceiling)}. Here's why, and a message you can send:`
          : "Here's where you stand, and a message that asks for their best price:";
  return { text, points, message };
}
