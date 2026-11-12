/**
 * Answers VinVerdict gives from the page itself, with no AI: what's still open, the
 * price, the message to the seller, recalls, the history report, the auction. Pure.
 * Each answer carries actions (buttons) that take the person to the next step.
 */

export type Action =
  | { kind: "go"; label: string; target: "#price-check" | "#check-yourself" | "#history-report" | "#before-you-buy" | "#listing-history" | "#safety" | "#costs" }
  | { kind: "link"; label: string; href: string }
  | { kind: "attach"; label: string };

export type Reply = { text: string; points: string[]; actions: Action[] };

/** What the page knows right now (built in Result from the same state the sections use). */
export type PageContext = {
  car: string;
  vin: string | null;
  make: string | null;
  verdict: { title: string; text: string };
  stops: string[];
  checks: string[];
  unknowns: string[];
  price: number | null;
  /** Price estimate, when the price check ran. */
  estimate: { low: number; high: number; label: string | null; open: number | null; walk: number | null } | null;
  auctionSold: number | null;
  priced: boolean;
  historyRead: boolean;
  /** The dealer's free Carfax link, if there is one. */
  carfax: string | null;
  recalls: number | null;
  recallLookup: string | null;
  sellerMessage: string;
  dealer: boolean;
  /** Out the door, as the costs section works it out now. */
  otd: { total: number; state: string; inspection: number } | null;
  /** EPA fuel economy and yearly fuel + upkeep, as the costs section shows it. */
  fuel: { label: string; mpg: string; perYear: number; perMonth: number } | null;
};

const $ = (n: number) => `$${n.toLocaleString("en-US")}`;

function nextSteps(c: PageContext): { points: string[]; actions: Action[] } {
  const points: string[] = [];
  const actions: Action[] = [];
  if (!c.historyRead) {
    points.push(c.carfax ? "Open the dealer's free Carfax and add it here (paste it or attach a screenshot): accidents, owners and title change everything." : "Get the Carfax or AutoCheck and add it here (paste it or attach a screenshot).");
    if (c.carfax) actions.push({ kind: "link", label: "Open the free Carfax", href: c.carfax });
    actions.push({ kind: "attach", label: "Add a history report" });
  }
  if (!c.priced && c.vin) {
    points.push("Run the price check for an estimate from similar cars nearby.");
    actions.push({ kind: "go", label: "Run the price check", target: "#price-check" });
  }
  if (c.recalls && c.recallLookup) {
    points.push(`Check which of the ${c.recalls} recalls for this model year are still open on this exact car.`);
    actions.push({ kind: "link", label: "Open the recall lookup", href: c.recallLookup });
  }
  points.push("Send the seller the questions VinVerdict wrote, then have your own mechanic inspect it before you pay.");
  actions.push({ kind: "go", label: "See the questions to ask", target: "#before-you-buy" });
  return { points: points.slice(0, 4), actions: actions.slice(0, 4) };
}

export function answerIntent(intent: string, c: PageContext): Reply {
  const steps = nextSteps(c);
  switch (intent) {
    case "price": {
      const points: string[] = [];
      if (c.estimate) {
        points.push(`Estimate from similar cars: ${$(c.estimate.low)}–${$(c.estimate.high)}${c.estimate.label ? ` (${c.estimate.label})` : ""}.`);
        if (c.estimate.open && c.estimate.walk) points.push(`Open at ${$(c.estimate.open)}; walk away above ${$(c.estimate.walk)}.`);
      }
      if (c.auctionSold) points.push(`It sold at a dealer auction for ${$(c.auctionSold)}: that's a wholesale price, what a dealer paid before fees and reconditioning, not a retail price you can expect to pay.`);
      if (c.price) points.push(`Asking price: ${$(c.price)}.`);
      return c.estimate
        ? { text: "Here's the price, from this page:", points, actions: [{ kind: "go", label: "See the price details", target: "#price-check" }] }
        : { text: "VinVerdict hasn't priced it yet.", points: [...points, "Run the price check for an estimate from similar cars nearby (it uses a small free daily quota)."], actions: [{ kind: "go", label: "Run the price check", target: "#price-check" }] };
    }
    case "costs":
      return c.otd
        ? {
            text: `Out the door in ${c.otd.state}: about ${$(Math.round(c.otd.total))}.`,
            points: [
              ...(c.otd.inspection ? [`That includes ${$(c.otd.inspection)} for your own mechanic's inspection (not paid to the dealer).`] : []),
              "It's tax, title and registration on the price. Dealer fees beyond the ones in the ad aren't known: ask for the out-the-door price in writing.",
              "Put your ZIP in the costs section for your own state's tax and fees.",
            ],
            actions: [{ kind: "go", label: "See the costs", target: "#costs" }],
          }
        : { text: "There's no price yet, so the out-the-door cost can't be worked out. Tell VinVerdict the asking price (\"they're asking 14,500\").", points: [], actions: [] };
    case "fuel":
      return c.fuel
        ? { text: `${c.fuel.label}: ${c.fuel.mpg} (EPA).`, points: [`Fuel and upkeep: about ${$(c.fuel.perYear)} a year (${$(c.fuel.perMonth)} a month) at 12,000 miles a year.`], actions: [{ kind: "go", label: "See the costs", target: "#costs" }] }
        : { text: "No EPA fuel-economy match for this car yet: check fueleconomy.gov with its year, model and engine.", points: [], actions: [{ kind: "link", label: "Open fueleconomy.gov", href: "https://www.fueleconomy.gov/feg/findacar.shtml" }] };
    case "auction":
      return {
        text: "About the auction:",
        points: [
          ...(c.auctionSold ? [`Sold at a dealer auction for ${$(c.auctionSold)}: a wholesale price.`] : []),
          "Dealer auctions are normal for trade-ins and cars that didn't sell, but ask why it went there and for the auction's condition report.",
          "Buying at an auction yourself usually means fees on top of the bid and no test drive: ask for the total and whether you can inspect it.",
        ],
        actions: steps.actions.slice(0, 2),
      };
    case "seller":
      return { text: "Send this first (it's built from what VinVerdict found):", points: [c.sellerMessage], actions: [{ kind: "go", label: "Open it to copy", target: "#before-you-buy" }] };
    case "recalls":
      return c.recalls
        ? { text: `${c.recalls} recall${c.recalls > 1 ? "s" : ""} on record for this model year. Not every car of the year is affected: the lookup shows which are still open on this VIN, and dealers fix them free.`, points: [], actions: [...(c.recallLookup ? [{ kind: "link" as const, label: "Open the recall lookup", href: c.recallLookup }] : []), { kind: "go", label: "See the recalls", target: "#safety" }] }
        : { text: c.recalls === 0 ? "No recalls on record for this model year." : "Recalls weren't checked (no year, make and model).", points: [], actions: [] };
    case "history":
      return c.historyRead
        ? { text: "The history report is in: see what it says under the history report section.", points: [], actions: [{ kind: "go", label: "Go to the history report", target: "#history-report" }] }
        : { text: "Accidents, owners and the title only show on a history report, and VinVerdict can't open Carfax for you.", points: steps.points.slice(0, 1), actions: steps.actions.filter((a) => a.kind !== "go").slice(0, 2) };
    case "overview":
    case "next":
    default:
      return {
        text: `${c.verdict.title}. ${c.verdict.text}${c.stops.length ? ` Serious: ${c.stops.join("; ")}.` : ""}${c.checks.length ? ` To check: ${c.checks.slice(0, 3).join("; ")}.` : ""}`,
        points: [
          ...(c.estimate ? [`Price: ${c.price ? `${$(c.price)} asked; ` : ""}similar cars ${$(c.estimate.low)}–${$(c.estimate.high)}${c.estimate.label ? ` (${c.estimate.label})` : ""}.`] : []),
          ...(c.auctionSold ? [`It sold at a dealer auction for ${$(c.auctionSold)} (wholesale): a dealer's asking price above that includes their markup, fees and reconditioning.`] : []),
          ...steps.points,
        ],
        actions: steps.actions,
      };
  }
}

export const SMALL_TALK: Reply = {
  text: "Tell VinVerdict anything about this car, or paste a page, and the whole result updates. For example:",
  points: [
    "\"It sold at auction for 9,100\" or \"they're asking 12,500\"",
    "Paste the full listing, the auction record, or the Carfax (or attach screenshots)",
    "Ask \"is the price fair?\", \"what should I ask the dealer?\" or \"what's next?\"",
  ],
  actions: [{ kind: "attach", label: "Attach screenshots" }],
};
