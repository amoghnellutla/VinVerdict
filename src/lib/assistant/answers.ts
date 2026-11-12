/**
 * Answers VinVerdict gives from the page itself, with no AI: what's still open, the
 * price, the message to the seller, recalls, the history report, the auction. Pure.
 * Each answer carries actions (buttons) that take the person to the next step.
 */

import { dealAnswer, type Lever } from "./deal";

export type Action =
  | { kind: "go"; label: string; target: "#verdict" | "#price-check" | "#check-yourself" | "#history-report" | "#before-you-buy" | "#listing-history" | "#safety" | "#costs" }
  | { kind: "link"; label: string; href: string }
  | { kind: "attach"; label: string }
  | { kind: "copy"; label: string; text: string };

export type Reply = { text: string; points: string[]; actions: Action[]; quote?: string };

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
  auctionDate: string | null;
  /** The cheapest other listing of this VIN (listing history), for negotiating. */
  otherListing: { seller: string; price: number } | null;
  /** Findings that give the buyer leverage (id for how to say it to the seller, title for the buyer). */
  leverage: Lever[];
  /** Can the listing be trusted, and is it safe to pay? Serious warnings (scam patterns) and things to check. */
  trust: { stops: string[]; checks: string[] };
  /** Who's selling, from the ad and the listing data. */
  seller: { name: string | null; type: "dealer" | "private" | "unknown"; place: string | null; listings: number | null; sellers: string[] };
  /** Bad news about the car's history from listing data (an accident, fleet use…), before any report. */
  feedHistory: string[];
  /** Owner complaints to NHTSA for this model year, and known issues for this year and engine. */
  problems: { complaints: number | null; top: { area: string; count: number }[]; known: string[] };
  /** What the seller's replies showed (pasted or told), with a safe reply to send for each. */
  replyTips: { title: string; suggest: string | null }[];
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

/** Quick-start questions that fit what this page knows (each one is answered from the page, no AI). */
export function starters(c: PageContext): string[] {
  const out = ["What's next?"];
  if (c.price || c.auctionSold || c.estimate) out.push("What should I offer?");
  out.push("Is the price fair?", "What should I ask the seller?");
  if (c.recalls) out.push(c.recalls === 1 ? "Is the recall fixed?" : `Are the ${c.recalls} recalls fixed?`);
  return out.slice(0, 4);
}

/** The safe way to pay for a used car, said the same way everywhere. */
const SAFE_PAY = [
  "Don't send any money, deposit or gift card before you've seen the car.",
  "See the car, its title and the seller's ID in person; the names must match.",
  "Pay at a bank (cashier's check) or at the dealer's office, never by gift card, wire or payment app.",
];

function nextSteps(c: PageContext): { points: string[]; actions: Action[] } {
  const points: string[] = [];
  const actions: Action[] = [];
  if (c.trust.stops.length) {
    return {
      points: [SAFE_PAY[0], "Report the ad to the site it's on, and don't share your personal details.", "If you still want this model, check another listing here instead."],
      actions: [{ kind: "go", label: "See the warnings", target: "#verdict" }],
    };
  }
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
    points.push(c.recalls === 1 ? "Check whether the recall for this model year is still open on this exact car." : `Check which of the ${c.recalls} recalls for this model year are still open on this exact car.`);
    actions.push({ kind: "link", label: "Open the recall lookup", href: c.recallLookup });
  }
  points.push("Send the seller the questions VinVerdict wrote, then have your own mechanic inspect it before you pay.");
  actions.push({ kind: "go", label: "See the questions to ask", target: "#before-you-buy" });
  return { points: points.slice(0, 4), actions: actions.slice(0, 4) };
}

export function answerIntent(intent: string, c: PageContext): Reply {
  const steps = nextSteps(c);
  switch (intent) {
    case "offer": {
      const d = dealAnswer({
        car: c.car, asking: c.price, auctionSold: c.auctionSold, auctionDate: c.auctionDate,
        estimate: c.estimate ? { low: c.estimate.low, high: c.estimate.high, open: c.estimate.open, walk: c.estimate.walk } : null,
        otherListing: c.otherListing, leverage: c.leverage, dealer: c.dealer,
        scam: c.trust.stops, concerns: c.trust.checks,
      });
      if (!d.message) return { text: d.text, points: d.points, actions: [{ kind: "go", label: "See the warnings", target: "#verdict" }] };
      return {
        text: d.text,
        points: d.points,
        quote: d.message,
        actions: [{ kind: "copy", label: "Copy the message", text: d.message }, ...(!c.priced && c.vin ? [{ kind: "go" as const, label: "Run the price check", target: "#price-check" as const }] : [])],
      };
    }
    case "price": {
      const points: string[] = [];
      if (c.estimate) {
        points.push(`Estimate from similar cars: ${$(c.estimate.low)}–${$(c.estimate.high)}${c.estimate.label ? ` (${c.estimate.label})` : ""}.`);
        if (c.estimate.open && c.estimate.walk) points.push(`Open at ${$(c.estimate.open)}; walk away above ${$(c.estimate.walk)}.`);
      }
      if (c.auctionSold) points.push(`It sold at a dealer auction for ${$(c.auctionSold)}: that's a wholesale price, what a dealer paid before fees and reconditioning, not a retail price you can expect to pay.`);
      if (c.estimate && c.price && c.trust.stops.length) {
        return {
          text: c.price < c.estimate.low
            ? `${$(c.price)} is far below similar cars (${$(c.estimate.low)}–${$(c.estimate.high)}), and there are serious warning signs: a price this low is the bait. Don't pay anything.`
            : `Similar cars: ${$(c.estimate.low)}–${$(c.estimate.high)}. But the price doesn't matter yet: there are serious warning signs, so don't pay anything.`,
          points: [`What VinVerdict found: ${c.trust.stops.slice(0, 4).join("; ")}.`],
          actions: [{ kind: "go", label: "See the warnings", target: "#verdict" }],
        };
      }
      if (c.estimate && c.price) {
        const e = c.estimate;
        const where = c.price > e.high ? `${$(c.price - e.high)} above similar cars (${$(e.low)}–${$(e.high)})`
          : c.price < e.low ? `${$(e.low - c.price)} below similar cars (${$(e.low)}–${$(e.high)})`
          : `within what similar cars ask (${$(e.low)}–${$(e.high)})`;
        const head = `${e.label ? `${e.label}: ` : ""}${$(c.price)} is ${where}.`;
        const rest = points.filter((x) => !x.startsWith("Estimate from"));
        if (c.price < e.low) rest.push("Below the range usually has a reason: check the history and get an inspection before you pay.");
        return { text: head, points: rest, actions: [{ kind: "go", label: "See the price details", target: "#price-check" }] };
      }
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
              "Not your state? Tell me your ZIP (\"my zip is 08540\") and it updates.",
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
        : {
            text: c.feedHistory.length
              ? `Already known from the ad and listing data: ${c.feedHistory.join("; ")}. The history report has the details (when, how bad, owners, title).`
              : "Accidents, owners and the title only show on a history report, and VinVerdict can't open Carfax for you.",
            points: [
              ...(c.feedHistory.length ? ["Listing data can add bad news but never clears a car: no accident there doesn't mean no accident."] : []),
              ...(c.seller.listings ? [`${c.seller.listings} online listing${c.seller.listings > 1 ? "s" : ""} of this VIN on record (see where it's been listed).`] : []),
              ...steps.points.filter((x) => /Carfax|AutoCheck/.test(x)).slice(0, 1),
            ],
            actions: [
              ...(c.carfax ? [{ kind: "link" as const, label: "Open the free Carfax", href: c.carfax }] : []),
              { kind: "attach", label: "Add a history report" },
              ...(c.seller.listings ? [{ kind: "go" as const, label: "See where it's been listed", target: "#listing-history" as const }] : []),
            ],
          };
    case "problems": {
      const p = c.problems;
      const points = [
        ...p.known.map((k) => `Known for this model year: ${k}. It's on your inspection list.`),
        ...(p.complaints != null
          ? [p.complaints === 0
              ? "No owner complaints to NHTSA for this model year."
              : `${p.complaints.toLocaleString("en-US")} owner complaint${p.complaints === 1 ? "" : "s"} to NHTSA for this model year${p.top.length ? `, most about ${p.top.slice(0, 3).map((t) => `${t.area.toLowerCase()} (${t.count})`).join(", ")}` : ""}. More cars sold means more complaints, so compare the years side by side under Safety.`]
          : []),
        "How long a used car lasts depends mostly on how it was looked after: ask for the service records, and have your mechanic check these areas.",
      ];
      return {
        text: p.known.length || p.top.length ? `What's known about the ${c.car}:` : `Nothing specific is known about the ${c.car}${p.complaints == null ? " yet (complaints weren't checked)" : ""}.`,
        points,
        actions: [{ kind: "go", label: "See complaints and recalls", target: "#safety" }, { kind: "go", label: "See the inspection list", target: "#before-you-buy" }],
      };
    }
    case "visit":
      return {
        text: c.trust.stops.length ? "Don't go yet: this ad shows a scam pattern. If you still meet, meet somewhere public and bring no money." : "Before you go and while you're there:",
        points: [
          "Bring your license and proof of insurance, and if you can, your mechanic (or book a pre-purchase inspection).",
          c.vin ? `Match the VIN on the dashboard and on the driver's door sticker to ${c.vin}.` : "Read the VIN off the dashboard and the driver's door sticker, and add it here: it unlocks the recall and title checks.",
          "Start it cold: listen at startup, then on the drive check the brakes, the steering (no pull), smooth shifts and no warning lights.",
          c.dealer ? "Ask for the out-the-door price in writing, every fee listed, before you sign anything." : "See the title: the name on it must match the seller's ID, with no salvage, rebuilt or flood brand.",
          "Don't pay anything until the inspection is done.",
        ],
        actions: [{ kind: "go", label: "See the inspection list", target: "#before-you-buy" }],
      };
    case "scam":
      return c.trust.stops.length
        ? {
            text: `Treat it as a scam until it's proven otherwise. VinVerdict found ${c.trust.stops.length === 1 ? "a serious warning sign" : "serious warning signs"}: ${c.trust.stops.slice(0, 4).join("; ")}.`,
            points: [SAFE_PAY[0], "Report the ad to the site it's on, and don't share your personal details."],
            actions: [{ kind: "go", label: "See the warnings", target: "#verdict" }],
          }
        : {
            text: c.trust.checks.length
              ? `No known scam pattern, but check these before you pay: ${c.trust.checks.slice(0, 3).join("; ")}.`
              : "No scam signs in what was checked. That isn't proof, so pay the safe way:",
            points: SAFE_PAY,
            actions: [{ kind: "go", label: "See the buying-day steps", target: "#before-you-buy" }],
          };
    case "who": {
      const s = c.seller;
      const kind = s.type === "dealer" ? "a dealer" : s.type === "private" ? "a private seller" : "a seller (dealer or private isn't clear)";
      const points = [
        ...(s.sellers.length > 1 ? [`Listing data shows ${s.sellers.length} sellers for this VIN: ${s.sellers.slice(0, 4).join(", ")}${s.sellers.length > 4 ? ` and ${s.sellers.length - 4} more` : ""}.`] : []),
        ...c.trust.checks.filter((x) => /seller|title|dealer|curb|lien/i.test(x)).slice(0, 2).map((x) => `To check: ${x}.`),
        s.type === "dealer"
          ? "Look the dealer up before you go: its state dealer license and recent reviews (the steps are under Before you buy)."
          : "Ask to see the title and their ID: the names must match. A seller with several cars for sale is often an unlicensed dealer.",
      ];
      return {
        text: `${s.name ? `${s.name}, ` : "It's "}${kind}${s.place ? ` in ${s.place}` : ""}.`,
        points,
        actions: [{ kind: "go", label: "See the seller checks", target: "#before-you-buy" }, ...(s.listings ? [{ kind: "go" as const, label: "See where it's been listed", target: "#listing-history" as const }] : [])],
      };
    }
    case "overview":
    case "next":
    default:
      return {
        text: `${c.verdict.title}. ${c.verdict.text}${c.stops.length ? ` Serious: ${c.stops.join("; ")}.` : ""}${c.checks.length ? ` To check: ${c.checks.slice(0, 3).join("; ")}.` : ""}`,
        points: [
          ...(c.trust.stops.length ? steps.points : []),
          ...(c.estimate ? [`Price: ${c.price ? `${$(c.price)} asked; ` : ""}similar cars ${$(c.estimate.low)}–${$(c.estimate.high)}${c.trust.stops.length ? ": far below, which is part of the warning" : c.estimate.label ? ` (${c.estimate.label})` : ""}.`] : []),
          ...(c.auctionSold ? [`It sold at a dealer auction for ${$(c.auctionSold)} (wholesale): a dealer's asking price above that includes their markup, fees and reconditioning.`] : []),
          ...(c.trust.stops.length ? [] : steps.points),
        ],
        actions: steps.actions,
      };
  }
}

/** "thanks", "ok", "great": a short reply instead of the help text. */
export function smallTalk(text: string): Reply {
  if (/\b(?:i |we )?(?:bought|purchased|got) (?:it|the car)\b|\bdeal (?:is )?done\b/i.test(text)) {
    return {
      text: "Congratulations. Three things for the first week:",
      points: [
        "Keep the bill of sale, the signed title (or the dealer's paperwork) and the odometer statement together.",
        "Check the recalls by VIN and book any open ones at a dealer: recall repairs are free.",
        "Register it and get the plates within your state's deadline, and put it on your insurance before you drive it.",
      ],
      actions: [],
    };
  }
  if (/^\s*(?:thanks?|thank you|thx|ty|ok(?:ay)?|cool|great|got it|perfect|nice|awesome|sounds good)\b/i.test(text)) {
    return { text: "You're welcome. When you hear back from the seller or get the Carfax, paste it here and the page updates.", points: [], actions: [] };
  }
  return SMALL_TALK;
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
