/**
 * "What should I offer?": the negotiation picture from what's on the page, and a message
 * ready to send. Pure. Every number is one the page already has (the asking price, the
 * auction sale, the estimate and its suggested offer, another dealer's price); the only
 * arithmetic is the gap between two of them. No markup, fee or "fair margin" is invented.
 */

export type DealInput = {
  car: string;
  asking: number | null;
  auctionSold: number | null;
  auctionDate: string | null;
  estimate: { low: number; high: number; open: number | null; walk: number | null } | null;
  /** The cheapest other listing of the same VIN, if the listing history shows one. */
  otherListing: { seller: string; price: number } | null;
  /** Findings that give the buyer leverage (accident, branded title, high miles, price cut…). */
  leverage: string[];
  dealer: boolean;
};

export type DealAnswer = { text: string; points: string[]; message: string };

const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function dealAnswer(input: DealInput): DealAnswer {
  // The auction sale is its own point, so a finding that only says "went through an auction" isn't repeated.
  const d = input.auctionSold ? { ...input, leverage: input.leverage.filter((x) => !/\bauction\b/i.test(x)) } : input;
  const points: string[] = [];
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
    points.push(`Similar cars nearby: ${$(d.estimate.low)}–${$(d.estimate.high)}${d.asking ? ` (asking ${$(d.asking)})` : ""}.`);
    if (d.estimate.open && d.estimate.walk) points.push(`VinVerdict's suggestion: open at ${$(d.estimate.open)}, walk away above ${$(d.estimate.walk)}.`);
  }
  if (d.otherListing && (!d.asking || d.otherListing.price < d.asking)) points.push(`${d.otherListing.seller} lists the same VIN for ${$(d.otherListing.price)}${d.asking ? `, ${$(d.asking - d.otherListing.price)} less` : ""}.`);
  if (d.leverage.length) points.push(`Your leverage: ${d.leverage.slice(0, 3).join("; ")}.`);

  const offer = d.estimate?.open ?? null;
  const reasons = [
    d.auctionSold ? `it sold at a dealer auction for ${$(d.auctionSold)}${d.auctionDate ? ` on ${d.auctionDate}` : ""}` : null,
    d.otherListing && (!d.asking || d.otherListing.price < d.asking) ? `${d.otherListing.seller} lists the same car for ${$(d.otherListing.price)}` : null,
    ...d.leverage.slice(0, 2).map((x) => x.charAt(0).toLowerCase() + x.slice(1)),
  ].filter((x): x is string => !!x);
  const message = [
    `Hi, I'm interested in the ${d.car}${d.asking ? ` listed at ${$(d.asking)}` : ""}.`,
    reasons.length ? `Before I come in: ${reasons.join(", and ")}.` : null,
    offer ? `Would you take ${$(offer)}${d.dealer ? " out the door" : ""}?` : `What's your best ${d.dealer ? "out-the-door " : ""}price, with every fee listed?`,
    "I'd like my own mechanic to inspect it before I buy. Thanks!",
  ].filter(Boolean).join(" ");

  const text = !d.asking && !d.estimate && !d.auctionSold
    ? "To work out an offer, VinVerdict needs the asking price (say \"they're asking 14,500\") and ideally the price check."
    : offer
      ? `Start at ${$(offer)} and stay below ${$(d.estimate!.walk ?? d.estimate!.high)}. Here's why, and a message you can send:`
      : "Here's where you stand, and a message that asks for their best price:";
  return { text, points, message };
}
