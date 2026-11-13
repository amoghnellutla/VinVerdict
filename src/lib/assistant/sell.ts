/**
 * The assistant when the person is selling their own car ("It's mine: what's it worth?"). Pure.
 * Answers come from the selling values on the page (no invented numbers), and a buyer's
 * messages are checked for the scams that target sellers, each with a reply to send.
 */

import type { Reply } from "./answers";

export type SellContext = {
  car: string;
  /** What a private buyer pays (the page's selling estimate), or null when not priced. */
  private: { low: number; high: number; fair: number; listAt: number; confidence: string } | null;
  /** What a dealer would ask for a car like this (retail). */
  dealerAsk: number | null;
  /** A reason it can't be priced from listing data (severe damage). */
  unpriced: string | null;
  recalls: number | null;
  historyRead: boolean;
  carfax: string | null;
  /** For the draft ad: only what the page knows (anything else is a blank to fill in). */
  miles?: number | null;
  vin?: string | null;
  /** What an added history report says ("No accidents or damage", "Clean title"), when one was read. */
  history?: { damage: string; title: string } | null;
  /** Bad news from listing data ("History shows 1 accident"): said up front in the ad. */
  feedHistory?: string[];
};

const $ = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Getting paid and handing over the car without being robbed, in plain steps. */
export const SAFE_SELL = [
  "Get paid at the buyer's bank, in person: watch the cashier's check being made, or take cash there. A check or money order handed to you can be fake and bounce days later.",
  "Never accept more than the price and \"send back the difference\": that's the overpayment scam.",
  "Sign the title over only once the money is in your account (not \"pending\"). Keep a bill of sale with the date, price, miles and both names.",
  "Never share a code sent to your phone, and don't trust a \"payment pending\" email from Zelle, PayPal or Venmo: check the app or your bank yourself.",
];

export function sellAnswer(intent: string, s: SellContext): Reply {
  switch (intent) {
    case "offer":
    case "price": {
      if (s.unpriced) return { text: s.unpriced, points: ["Get an in-person appraisal or a few free instant offers: they inspect it and make a firm offer."], actions: [{ kind: "go", label: "See what it's worth", target: "#price-check" }] };
      if (!s.private) {
        return {
          text: "It isn't priced yet.",
          points: [
            "Run the price check for what similar cars sell for near you.",
            "Or, with no lookup: get a private-party value from Edmunds or KBB and tell me (\"KBB private party 13,200\"). It's priced from that straight away.",
          ],
          actions: [{ kind: "go", label: "Run the price check", target: "#price-check" }],
        };
      }
      const p = s.private;
      return {
        text: `Worth about ${$(p.low)}–${$(p.high)} to a private buyer, most likely ${$(p.fair)}. List it at about ${$(p.listAt)}.`,
        points: [
          "Buyers usually talk the price down a few percent, so the listing price leaves room for that.",
          ...(s.dealerAsk ? [`A dealer would ask about ${$(s.dealerAsk)} for a car like yours, and pays you less than that when they buy it: selling privately usually gets more, trading in is quicker.`] : []),
          `Confidence: ${p.confidence}. Free instant offers (under "What your car is worth") give you a firm floor to compare.`,
        ],
        actions: [{ kind: "go", label: "See what it's worth", target: "#price-check" }],
      };
    }
    case "next":
    case "overview":
      return {
        text: "To sell it well and safely:",
        points: [
          s.private ? `Price it: list at about ${$(s.private.listAt)} (most likely sells near ${$(s.private.fair)}).` : "Price it: run the price check, or tell me a KBB or Edmunds private-party value.",
          s.historyRead ? "Have the history report ready to show buyers: it answers their first question." : s.carfax ? "Get your free Carfax (link below) ready to show buyers: it answers their first question." : "Get a Carfax or AutoCheck to show buyers: a clean report is worth showing, and a known accident is better said up front.",
          ...(s.recalls ? [`Get any open recalls fixed first: free at a dealer of the brand, and buyers ask (${s.recalls} on record for this model year).`] : []),
          "Gather the title (in your name; if there's a loan, ask your lender how they release it), service records, both keys and the manual.",
          "Then: photos in daylight, an honest ad, and meet buyers in a safe public place (\"How do I sell it safely?\").",
        ],
        actions: [
          ...(s.carfax ? [{ kind: "link" as const, label: "Open the free Carfax", href: s.carfax }] : []),
          { kind: "go", label: "See what it's worth", target: "#price-check" },
        ],
      };
    case "scam":
      return { text: "Selling safely: how buyers scam sellers, and how to avoid it.", points: SAFE_SELL, actions: [] };
    case "visit":
      return {
        text: "Showing the car and the test drive:",
        points: [
          "Meet in daylight in a busy public place, or at your bank (handy for the payment too). Bring someone if you can.",
          "Before a test drive, see the buyer's license and photograph it with your phone; go along on the drive.",
          "Let them have it inspected by their mechanic if they ask: serious buyers do, and it's normal.",
          "Don't hand over keys, title or plates until the money has cleared.",
        ],
        actions: [],
      };
    case "ad": {
      const ad = draftAd(s);
      return {
        text: "A draft ad from what VinVerdict knows. Fill in each [bracket] honestly before you post it:",
        points: [
          "Say known problems up front: buyers find them on the history report or at the inspection anyway, and it saves wasted visits.",
          "Photos in daylight: all four corners, the interior, the odometer, the tires and any damage.",
        ],
        quote: ad,
        actions: [{ kind: "copy", label: "Copy the draft ad", text: ad }],
      };
    }
    case "seller":
      return {
        text: "What buyers will ask, so you have answers ready:",
        points: [
          "Is the title in your name and clean? Is there a loan on it (and how is it released)?",
          "Any accidents? (They'll check the history report anyway: say it first.)",
          "Service records: oil changes, brakes, tires, anything major.",
          "Have the recalls been done? Why are you selling? Can my mechanic inspect it?",
        ],
        actions: [],
      };
    default:
      return { text: "Ask about selling it: what it's worth, what to list it at, what's next, or how to get paid safely.", points: [], actions: [] };
  }
}

export const SELL_STARTERS = ["What's it worth?", "Write my ad", "How do I sell it safely?", "What's next?"];

/** An ad from the page's facts only. Nothing is claimed that the page doesn't know: the rest is a [blank]. */
export function draftAd(s: SellContext): string {
  const head = `${s.car}, ${s.miles ? `${s.miles.toLocaleString("en-US")} miles` : "[miles]"}, ${s.private ? $(s.private.listAt) : "$[price]"}`;
  const h = s.history;
  const title = h && h.title === "Clean title" ? "Clean title. [In your name? Any loan on it?]" : h && h.title !== "Not checked yet" ? `Title: [${h.title.toLowerCase()}: say which, and what was repaired].` : "[Title: clean and in your name? Any loan on it?]";
  const damage = h && h.damage === "No accidents or damage" ? "No accidents or damage on the history report." : h && h.damage !== "Not checked yet" ? `History report: ${h.damage.toLowerCase()}. [What was repaired, and where.]` : s.feedHistory?.length ? `[Accidents: listing data says "${s.feedHistory.join("; ")}". Say it here, with what was repaired.]` : "[Accidents: what the history report shows.]";
  return [
    head,
    "",
    `${title} ${damage}`,
    "[Condition: anything that doesn't work, warning lights, dents or scratches.]",
    "[Maintenance: recent service, tires and brakes, with records if you have them.]",
    "[Features and options.]",
    ...(s.recalls ? [`[Recalls: ${s.recalls} on record for this model year. Say they've been done, if they have.]`] : []),
    ...(s.vin ? [`VIN ${s.vin}: run your own Carfax or AutoCheck.`] : []),
    "",
    "Cash, or a cashier's check made at your bank. Test drives with a license; your mechanic is welcome to look it over.",
  ].join("\n");
}

export function sellFollowUps(intent: string): string[] {
  const f: Record<string, string[]> = {
    price: ["Write my ad", "How do I sell it safely?"],
    offer: ["Write my ad", "How do I sell it safely?"],
    ad: ["How do I sell it safely?", "What will buyers ask?"],
    next: ["What will buyers ask?", "How do I sell it safely?"],
    overview: ["What's it worth?", "How do I sell it safely?"],
    scam: ["What's it worth?", "What's next?"],
    seller: ["How do I sell it safely?", "What's it worth?"],
    visit: ["How do I sell it safely?", "What's next?"],
  };
  return f[intent] ?? ["What's it worth?", "How do I sell it safely?"];
}

export type BuyerScam = { id: string; title: string; why: string; reply: string; serious: boolean };

const SCAMS: { id: string; re: RegExp; title: string; why: string; reply: string; serious: boolean }[] = [
  { id: "overpay", serious: true, re: /\b(?:more than|extra|over ?pay|overpaid|above)\b[^.?!]{0,60}\b(?:refund|send (?:it |me )?back|return|the (?:rest|difference|balance)|shipper|agent)\b|\b(?:send|refund|wire) (?:back )?the (?:difference|balance|rest|extra)\b|\$?\d[\d,]*\s?k? (?:more|extra|over)\b(?! miles)[^.?!]{0,60}\b(?:refund|send (?:it |me )?back|return|the (?:rest|difference|balance)|shipper|agent)\b/i,
    title: "Overpayment: they'll pay more and want the difference back", why: "The check or transfer is fake and bounces days later, after you've sent the \"difference\" from your own money.",
    reply: "I can only accept the exact price, paid at your bank in person. Let me know a time." },
  { id: "shipper", serious: true, re: /\b(?:shipper|shipping (?:agent|company)|transport(?:er| company)|car hauler|my (?:agent|mover|driver)|pick(?:-| )?up agent)\b[^.?!]{0,60}\b(?:pick|collect|come (?:get|for)|take)\b|\b(?:can'?t|cannot|won'?t be able to) (?:come|see|meet)\b[^.?!]{0,40}\b(?:ship|send|pick)/i,
    title: "A buyer who won't come: \"my shipper will pick it up\"", why: "A buyer who never sees the car but sends a shipper is almost always setting up an overpayment or fake-payment scam.",
    reply: "I only sell in person: you're welcome to come see it and pay at your bank." },
  { id: "code", serious: true, re: /\b(?:verification|security|confirmation|one[- ]time|\d[- ]?digit|google|otp)\s+code\b|\bcode\b[^.?!]{0,40}\b(?:i|we|they|google) (?:just )?(?:sent|texted)\b|\bcode\b[^.?!]{0,30}\b(?:sent|texted|went) to (?:your|ur) (?:phone|number)\b|\b(?:send|text|tell|give|read|share)\b[^.?!]{0,30}\bcode\b[^.?!]{0,30}\b(?:you (?:just )?(?:got|get|received)|on your phone|i (?:just )?sent)\b|\b(?:send|text)(?:s|ing)? you (?:a|the) code\b|\bgoogle voice\b/i,
    title: "They ask for a code sent to your phone", why: "That code lets them take over your number or an account (often to set up a Google Voice number in your name). No real buyer needs it.",
    reply: "I don't share codes. Happy to answer questions about the car, or meet so you can see it." },
  { id: "pending", serious: true, re: /\b(?:zelle|paypal|venmo|cash ?app|bank)\b[^.?!]{0,80}\b(?:pending|upgrade|business account|limit|on hold|released (?:once|when|after)|email (?:from|confirm))\b|\b(?:payment|funds|money) (?:is |are )?(?:pending|on hold)\b/i,
    title: "A \"payment pending\" message or \"upgrade your account to receive\"", why: "Those emails are fake: the real app never asks you to upgrade or to send money to release a payment. Check the app or your bank yourself.",
    reply: "I'll check my own bank app: I hand over the car once the money has actually arrived." },
  { id: "escrow", serious: false, re: /\bescrow\b/i,
    title: "They want to use \"escrow\"", why: "Fake escrow websites are common. Only use one you find yourself (not a link they send), or meet at a bank instead.",
    reply: "I'd rather meet at your bank: we can do the payment and the title together." },
  { id: "check", serious: false, re: /\b(?:cashier'?s check|certified check|money order|personal check|mobile deposit)\b/i,
    title: "Paying by check or money order", why: "Fake cashier's checks look real and can show as \"available\" before they bounce. Go with the buyer to their bank and watch it being made, or wait until your bank confirms it has truly cleared.",
    reply: "If it's a cashier's check, let's meet at your bank so I can see it issued." },
  { id: "unseen", serious: false, re: /\b(?:no need|don'?t need|won'?t need) to (?:see|inspect|test ?drive|look at)\b|\bsight unseen\b|\bwithout (?:seeing|inspecting|a test drive)\b|\bbuy it (?:as is )?(?:now|today) without\b/i,
    title: "They'll buy it without seeing it", why: "Real buyers want to see and drive a car. Not caring is a red flag for a payment scam.",
    reply: "You're welcome to see and drive it first: when suits you?" },
  { id: "remote", serious: false, re: /\b(?:overseas|out of (?:the )?country|deployed|offshore|on a (?:ship|rig|base)|abroad|out of state for work)\b/i,
    title: "A buyer who's far away", why: "Combined with a shipper or a check, this is the classic setup. Sell only to someone who can meet you.",
    reply: "I only sell in person. If you can come by, I'm happy to show it." },
];

/** The scams in a buyer's message (or a pasted chat), worst first. */
export function buyerScams(text: string): BuyerScam[] {
  return SCAMS.filter((s) => s.re.test(text))
    .map(({ id, title, why, reply, serious }) => ({ id, title, why, reply, serious }))
    .sort((a, b) => Number(b.serious) - Number(a.serious));
}

/** The assistant's reply to a buyer's message when selling. */
export function buyerMessageReply(text: string): Reply {
  const found = buyerScams(text);
  if (!found.length) {
    return {
      text: "No common buyer-scam signs in that. Still, get paid the safe way:",
      points: SAFE_SELL.slice(0, 3),
      actions: [],
    };
  }
  const top = found[0];
  return {
    text: found.some((f) => f.serious) ? "This buyer is showing scam signs. Don't hand over the car, the title or any code:" : "Be careful with this buyer:",
    points: found.map((f) => `${f.title}. ${f.why}`),
    quote: top.reply,
    actions: [{ kind: "copy", label: "Copy this reply", text: top.reply }],
  };
}
