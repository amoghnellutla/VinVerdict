/**
 * Scam and safety rules (PLAN.md §6, feature I). Pure: give it the parsed
 * listing, the raw text, and optionally the VIN decode, value % and seller
 * checklist answers. It returns every rule that fired, each with a reason.
 *
 *   hide   → don't buy (the app hides it from results)
 *   flag   → be careful; ask about it
 *   info   → missing information to check
 *
 * Not implemented here because they need saved data (Phase 8):
 * "same phone on several listings" and "same VIN at different prices".
 */

import type { DecodedVin } from "@/lib/nhtsa/parse";
import type { ParsedListing } from "@/lib/listing/parse";
import { hasUnnegated, normalizeText } from "@/lib/listing/text";
import { checkVin } from "@/lib/vin";

export type RuleAction = "hide" | "flag" | "info";

export type RuleHit = {
  id: string;
  action: RuleAction;
  title: string;
  reason: string;
};

/** Seller question checklist (feature G). null/undefined = not asked yet. */
export type SellerChecklist = {
  titleInSellerName?: boolean | null;
  lienOnTitle?: boolean | null;
  anyAccidents?: boolean | null;
  allowsInspection?: boolean | null;
  meetsInPersonLocally?: boolean | null;
};

export type ScamInput = {
  text: string;
  listing: ParsedListing;
  decoded?: DecodedVin | null;
  /** (expected − asking) ÷ expected, from Phase 4 comps. 0.3 = 30% below market. */
  valuePct?: number | null;
  checklist?: SellerChecklist;
  now?: Date;
};

export type Verdict = "hide" | "verify" | "caution" | "clear";

export type ScamResult = {
  verdict: Verdict;
  /** 0 (no warning signs) – 100 (walk away). */
  risk: number;
  hits: RuleHit[];
};

const TOO_GOOD_PCT = 0.3;
const HIGH_MILES_PER_YEAR = 20_000;
const FAR_AWAY_MILES = 300;

const sameName = (a: string, b: string) => {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  return x === y || x.includes(y) || y.includes(x);
};

/** The sentences of a text (split after . ! ? and at line breaks). */
const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/);
/** The seller invites the buyer to see or inspect the car in person. */
const CAN_SEE =
  /come (and |by )?see|see it (in person|first|any)|test drive|bring (a |your )?mechanic|(after|once) you('ve| have)? (seen|inspected|test)|welcome to come|for a viewing|come by/;

/** Chat shorthand spelled out, so "pay w/ zelle 1st" reads like "pay with zelle first". */
function expandShorthand(t: string): string {
  return t
    .replace(/\bw\/\s?/g, "with ")
    .replace(/\b1st\b/g, "first")
    .replace(/\bb4\b/g, "before")
    .replace(/\bthru\b/g, "through")
    .replace(/\b(shipping|transport|trucking) co\b\.?/g, "$1 company")
    .replace(/\bw (a|an|the|my) /g, "with $1 ")
    .replace(/\bim\b/g, "i'm");
}

export function evaluateScamRules(input: ScamInput): ScamResult {
  const { listing: l, decoded, checklist: c = {} } = input;
  const t = expandShorthand(normalizeText(input.text));
  const hits: RuleHit[] = [];
  const add = (id: string, action: RuleAction, title: string, reason: string) => hits.push({ id, action, title, reason });

  // --- Title and history ---
  if (["salvage", "rebuilt", "flood", "lemon", "branded"].includes(l.titleStatus)) {
    add("title-brand", "hide", `${l.titleStatus[0].toUpperCase()}${l.titleStatus.slice(1)} title`,
      "Branded titles mean major past damage or defects, lower resale value and harder insurance. Have it inspected by a body shop, and price it well below a clean-title car.");
  }
  if (l.accident === "reported" || c.anyAccidents === true) {
    add("accident-reported", "hide", "Accident reported",
      "The listing or seller mentions an accident. A repaired accident isn't a deal-breaker on its own: get the history report and repair records, have the repair inspected, and expect to pay less.");
  } else if (l.accident === "unknown" && c.anyAccidents !== false) {
    add("accident-unknown", "info", "Accident history unknown",
      "Nothing says whether it's been in an accident. Ask the seller, run the free NICB VINCheck, and get a Carfax if a dealer offers one.");
  }

  // --- Transmission ---
  if (l.transmission === "manual" || decoded?.transmissionKind === "manual") {
    add("manual", "hide", "Manual transmission", "Good to know: fewer buyers want a manual, so it can take longer to resell. No problem if you drive one.");
  }

  // --- VIN and price ---
  if (!l.vin) {
    add("no-vin", "hide", "No VIN",
      "Without a VIN nothing can be checked (title, recalls, history). Ask the seller for it before going further; a real seller will share it.");
  } else {
    const v = checkVin(l.vin);
    if (!v.ok) add("vin-invalid", "hide", "VIN is invalid", v.message);
  }
  if (l.price === null) {
    add("no-price", "hide", "No price", "The listing has no clear asking price.");
  }
  if (decoded) {
    const mismatches: string[] = [];
    if (l.year && decoded.year && l.year !== decoded.year) mismatches.push(`year ${l.year} vs ${decoded.year}`);
    if (l.make && decoded.make && !sameName(l.make, decoded.make)) mismatches.push(`make ${l.make} vs ${decoded.make}`);
    if (l.model && decoded.model && !sameName(l.model, decoded.model)) mismatches.push(`model ${l.model} vs ${decoded.model}`);
    if (mismatches.length) {
      add("vin-mismatch", "hide", "VIN doesn't match the listing",
        `NHTSA decodes this VIN differently (${mismatches.join("; ")}). The VIN may be copied from another car.`);
    }
    if (!decoded.clean && decoded.errorCode !== "1") {
      // Code 1 (bad check digit) is already covered by vin-invalid.
      add("vin-decode-warning", "flag", "VIN decode warning", `NHTSA: ${decoded.errorText || `error code ${decoded.errorCode}`}.`);
    }
  }

  // --- Payment and remote-sale scams ---
  // Gift cards as payment, not in passing ("the unused car wash gift card") or in a
  // warning ("scammers asking about gift cards, don't bother").
  const giftPay = sentences(t).some((x) => {
    const m = /\bgift ?cards?\b|\b(google play|itunes|steam|vanilla|razer gold) (gift )?cards?\b/.exec(x);
    if (!m || /scam/.test(x)) return false;
    const before = x.slice(0, m.index);
    return /\b(pay|payment|deposit|accept\w*|send|only|card numbers?)\b/.test(x) && !/\b(no|not|don'?t|won'?t|never|without)\b[^.!?]{0,25}$/.test(before);
  });
  if (giftPay) {
    add("pay-gift-card", "hide", "Gift card payment", "No real car seller asks for gift cards. This is a scam pattern.");
  }
  // Dealers take wires at signing; from a private seller, or before seeing the car, it's the scam.
  const wireAsked = /\bwire (transfer|the money|payment)/.test(t) && (l.sellerType !== "dealer" || /\b(before|in advance|upfront|up front)\b/.test(t));
  if (wireAsked || /western union|moneygram\b/.test(t)) {
    add("pay-wire", "hide", "Wire transfer", "Wired money can't be recovered. Pay only in person, at a bank, after seeing the car and title.");
  }
  // Dealers routinely ship cars and take refundable deposits through their own
  // site; from a private seller the same words are the classic scam.
  const dealer = l.sellerType === "dealer";
  // Money before seeing the car, however it's named: a deposit, a "refundable viewing fee", "send it first".
  const upfront =
    /\bdeposit\b|\bupfront\b|up front|in advance|before (you )?(see|view|come)|to hold (it|the car)|\b(viewing|showing|reservation|holding|hold) fee\b|fee[^.!?]{0,30}\bto (see|view|set up|schedule)|to (set up|schedule) a viewing|(cash ?app|zelle|venmo|paypal|chime)[^.!?]{0,15}\bfirst\b|\bholding (payment|deposit)\b|before i (give|send|text) you the address|\b(half|part)\b[^.!?]{0,25}\b(rest|balance|remainder)\b[^.!?]{0,15}\b(on|at|upon|after) (delivery|pickup)/.test(t);
  // "I don't take Zelle or Venmo, cash only" isn't a payment-app request.
  if (hasUnnegated(t, /\b(zelle|cash ?app|venmo|paypal|chime|apple (pay|cash)|crypto|bitcoin|usdt)\b/)) {
    if (upfront && !dealer) {
      add("pay-app-upfront", "hide", "Payment-app deposit upfront",
        "Asking for Zelle/Cash App/Venmo money before you see the car is the most common used-car scam.");
    } else {
      add("pay-app", "flag", "Payment app mentioned", "Payment apps have no buyer protection. Pay at a bank once the title is in hand.");
    }
  } else if (!dealer && /\b(deposit|payment)\b[^.]{0,30}\b(before|to hold|upfront|up front|in advance)\b/.test(t)) {
    add("deposit-first", "hide", "Deposit before viewing", "Never pay anything before seeing the car and the title in person.");
  }
  // These are scams whoever says them: the "eBay Motors buyer protection" and
  // "car is at a shipping company" stories.
  // Only in the scam story's sense: a "protection" plan or shipping company holding the
  // car, not "also listed on eBay Motors" or "in storage for the winter".
  const shippingStory =
    /ebay motors[^.!?]{0,80}(protection|escrow|agent|ship|warehouse|deliver)|(protection|escrow|agent|shipping company)[^.!?]{0,40}ebay motors/.test(t) ||
    /(buyer|purchase|vehicle) protection[^.!?]{0,30}\bebay\b|\bebay\b[^.!?]{0,30}(buyer|purchase|vehicle) protection/.test(t) ||
    /(car|vehicle) is (already )?(in|at|with) (a |an |the |their )?(shipping company|warehouse|transport company)/.test(t) ||
    (/\bstorage\b/.test(t) && /(transport|shipping) company|escrow|\bagent\b/.test(t));
  const shipsOnly = /\b(will|can|i'll|we'll|free) ship\b|shipping (only|included|available|is free)|delivery only/.test(t);
  // "I can ship it after you've inspected it" is a service, not the scam.
  // "My brother will drop it off after you pay", "shipped once payment clears", "send the money and I'll mail the title":
  // payment first, car delivered later, from someone who doesn't offer a viewing.
  const payThenDeliver =
    /(drop (it|the car) off|deliver(ed)?|bring (it|the car)|ship(ped)?|mail(ed)?)\b[^.!?]{0,40}\b(after|once|when) (you )?(pay|send|the payment|payment|the money|funds)/.test(t) ||
    /\b(after|once) (you )?(pay|send the money|payment (clears|is made|is complete))\b[^.!?]{0,40}\b(deliver|ship|drop|bring|mail)/.test(t) ||
    /\bsend (me )?(the )?(money|payment|funds)\b[^.!?]{0,40}\b(mail|ship|deliver|drop)/.test(t);
  if (shippingStory || (shipsOnly && !dealer && !CAN_SEE.test(t)) || (payThenDeliver && !dealer && !CAN_SEE.test(t))) {
    add("shipping-only", "hide", "Shipping only", "A seller who can only ship or drop off the car after payment (not show it) is a classic scam.");
  }
  // The seller is away *now* ("I am deployed overseas", "I'm out of the country"), not
  // "I'm stationed at Joint Base McGuire, see it any evening" or "moving out of state next month".
  const awayNow =
    /\b(i'?m|i am|we'?re|we are|currently|now) (currently |now )?(deployed|overseas|out of the country|abroad|stationed overseas|on (a )?(military )?(deployment|mission))\b|deployed overseas|stationed overseas|mission trip abroad|i('m| am) (currently )?(out of state|not local)|seller is (out of state|abroad)/;
  // "I'm a nurse working overseas" (first person only: "my daughter is stationed in Germany, I'm selling it here" is fine).
  const workingAway = /\bi('m| am) (a [a-z]+ )?(working|living|based|serving|stationed) (overseas|abroad|out of the country|in (germany|japan|korea|italy|alaska|hawaii|another state))\b/;
  // "I can't meet in person", "I won't be able to show it": never, not "can't meet until Saturday".
  const cantMeet = sentences(t).some((x) => {
    const m = /\b(can'?t|cannot|won'?t be able to|unable to|not able to) (meet( in person| up)?|show (it|the car|you the car)|do (any )?viewings?|let you see (it|the car))\b/.exec(x);
    return !!m && !/\b(until|till|before|today|tonight|tomorrow|this (week|weekend)|but|on (mon|tue|wed|thu|fri|sat|sun))/.test(x.slice(m.index + m[0].length, m.index + m[0].length + 40));
  });
  if (awayNow.test(t) || workingAway.test(t) || cantMeet || c.meetsInPersonLocally === false) {
    add("seller-remote", "hide", "Seller isn't local",
      "The seller is out of state, overseas or won't meet in person. That's the most common fake-listing story: you can't see the car or the title, so don't send money.");
  }

  // --- Auction source ---
  // "Auction photos documenting the vehicle's condition prior to repairs" says where it came from too.
  if (/auction pric|\bcopart\b|\biaai?\b|insurance auction|salvage auction|auction (car|vehicle|photos?|pictures?)|(bought|purchased) (it )?(at|from) (an |the )?auction/.test(t)) {
    add("auction", "hide", "Auction car", "Auction-sourced cars often have hidden damage or branded titles.");
  }

  // --- Inspection refusal ---
  if (c.allowsInspection === false ||
      /\b(no|not allowing|won'?t allow|will not allow|don'?t allow|doesn'?t allow) (an? )?(pre-?purchase )?(inspections?|mechanics?|ppi)\b|\bno test drives?\b(?! (without|unless|until))/.test(t)) {
    add("no-inspection", "hide", "Won't allow an inspection",
      "A seller who refuses a pre-purchase inspection may be hiding something. Don't buy without one.");
  }

  // --- Curbstoning, title washing, liens ---
  if (c.titleInSellerName === false ||
      /\bsell(ing)? (it )?for (my|a) (relative|friend|uncle|aunt|cousin|brother|sister|mom|mother|dad|father|grand\w*|neighbor|boss)\b|title (is |isn'?t )?(not )?in my name yet|title (is )?not in my name|title isn'?t in my name|\b(open|jumped|floating) title\b|\bno title\b(?! (issues?|problems?|brands?|damage|history))|title status:? (missing|parts only)|title (is )?(lost|coming|in the mail)/.test(t)) {
    add("curbstoning", "flag", "Title not in seller's name",
      "Unlicensed dealers (\"curbstoners\") pose as private sellers. The name on the title must match the seller's ID.");
  }
  if (/out[- ]of[- ]state title|title (from|in) (another|a different) state|recently (re-?)?titled|just got (the )?(new )?title|new title (from|in)/.test(t)) {
    add("title-washing", "flag", "Title recently moved from another state",
      "Moving a car between states can wash a salvage or flood brand off the title. Check its history with NICB VINCheck.");
  }
  // Dealers clear liens themselves, and their pages talk about paying off *your* trade-in loan.
  if (c.lienOnTitle === true || (!dealer && hasUnnegated(t, /\blien\b(?![- ]free)|still (owe|financed|paying)|\bpayoff\b|loan on (it|the car)/))) {
    add("lien", "flag", "Lien on the title",
      "A lender still owns part of the car. Pay the lender directly at a bank or through escrow, never in cash to the seller.");
  }

  // --- Pressure tactics ---
  if (/\b(must|need to|have to) sell (it )?(today|asap|fast|quickly|this week|immediately)|today only|first (\$|cash|person with)|\bcash only\b.*\btoday\b|meet (only )?(at|in) (a |the )?(parking lot|gas station|walmart)/.test(t)) {
    add("rushed", "flag", "Rushed sale",
      "Pressure to decide fast or meet in a random lot leaves no time for checks. Take your time and meet somewhere public and safe.");
  }

  // --- Odometer the seller says is wrong ---
  // "TMU" (true mileage unknown), "not actual miles", "exceeds mechanical limits" are title
  // brands; a broken odometer means the same. Not "mileage exempt": older cars are legally
  // exempt from odometer disclosure, which says nothing bad about this one.
  if (hasUnnegated(t, /\btmu\b|\btrue (miles|mileage) (is |are )?unknown\b|\bnot actual (miles|mileage)\b|\b(miles|mileage) (is |are )?not actual\b|\bexceeds mechanical limits?\b|\bodometer (is )?(broken|not working|doesn'?t work|does not work|stopped working)\b|\bbroken odometer\b/)) {
    add("odometer-unknown", "hide", "True miles unknown",
      "The seller says the odometer reading isn't the car's real mileage (TMU, not actual miles, or a broken odometer). Its wear and value can't be judged from the miles: price it well below similar cars and have it inspected.");
  }

  // --- Mileage sanity ---
  const year = l.year ?? decoded?.year ?? null;
  if (year && l.miles !== null) {
    const age = Math.max(1, (input.now ?? new Date()).getFullYear() - year);
    if (age >= 4 && l.miles / age < 500) {
      add("mileage-low", "flag", "Suspiciously low miles",
        `${l.miles.toLocaleString("en-US")} miles over ${age} years is under 500 a year. Possible odometer rollback; check service records and the NICB/Carfax history.`);
    }
    // US average is about 13,500 miles a year (FHWA). 20k+ usually means fleet, rideshare or delivery use.
    const perYear = l.miles / age;
    if (l.miles >= 40_000 && perYear >= HIGH_MILES_PER_YEAR) {
      add("high-miles", "flag", "Very high miles for its age",
        `${l.miles.toLocaleString("en-US")} miles in about ${age} years is ${Math.round(perYear / 1000)}k a year, versus about 13.5k for a typical car. That usually means rideshare, delivery or fleet use: expect more wear, check service records, and price it as a high-mileage car.`);
    }
  }

  // --- Former fleet or rental ---
  if (l.usage === "rental" || l.usage === "fleet") {
    add("fleet", "flag", l.usage === "rental" ? "Former rental car" : "Former fleet or commercial car",
      "Many drivers, often driven hard. Ask for maintenance records and get a pre-purchase inspection.");
  }

  // --- Far away ---
  if (l.distanceMiles !== null && l.distanceMiles >= FAR_AWAY_MILES) {
    add("far-away", "info", `${l.distanceMiles.toLocaleString("en-US")} miles away`,
      "Too far to see before buying without a trip. Get an independent inspection near the car before paying, and add travel or shipping to the cost. Never pay for a car you haven't had inspected.");
  }

  // --- Too good to be true (needs comps, Phase 4) ---
  if (input.valuePct != null && input.valuePct >= TOO_GOOD_PCT) {
    const others = hits.some((h) => h.action !== "info");
    const pct = Math.round(input.valuePct * 100);
    if (others) {
      add("too-good-plus-flags", "hide", "Far below market with red flags",
        `${pct}% below market plus other warning signs: a classic scam combination.`);
    } else {
      add("too-good", "flag", "Verify in person",
        `${pct}% below market is rare. It can be real (motivated seller, family sale) but see the car, title and seller ID in person first.`);
    }
  }

  return summarize(hits);
}

/** Risk score and verdict from a list of hits. */
export function summarize(hits: RuleHit[]): ScamResult {
  const hides = hits.filter((h) => h.action === "hide").length;
  const flags = hits.filter((h) => h.action === "flag").length;
  const risk = hides > 0 ? 100 : Math.min(90, flags * 25);
  const verdict: Verdict =
    hides > 0 ? "hide" : hits.some((h) => h.id === "too-good") ? "verify" : flags > 0 ? "caution" : "clear";
  return { verdict, risk, hits };
}
