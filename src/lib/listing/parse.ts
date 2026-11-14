/**
 * Pull structured facts out of pasted listing text (PLAN.md §8, paste flow
 * step 2). Pure and best-effort: every field can be null/"unknown", and the
 * VIN decode and seller checklist fill the gaps later.
 *
 * The text is only ever read with regexes; it is never rendered as HTML or
 * executed (PLAN.md §9).
 */

import { classifyTransmission, type TransmissionKind } from "@/lib/nhtsa/parse";
import { checkVin, normalizeVin, vinFromTypo } from "@/lib/vin";
import { hasUnnegated, normalizeText } from "./text";

export const MAX_LISTING_CHARS = 20_000;

export type TitleStatus = "clean" | "salvage" | "rebuilt" | "flood" | "lemon" | "branded" | "unknown";
export type AccidentStatus = "none" | "reported" | "unknown";
export type SellerType = "private" | "dealer" | "unknown";
/** How the car was used before, from history boxes ("Personal use only: Yes", "previous rental"). */
export type Usage = "personal" | "fleet" | "rental" | "unknown";

export type ParsedListing = {
  /** What the paste mostly was. */
  kind: "text" | "url" | "vin";
  url: string | null;
  sourceHost: string | null;
  vin: string | null;
  /** The VIN as typed, when it was read with O/I/Q as 0/1 ("4T1B11HK8JU14588O"). */
  vinTyped?: string;
  year: number | null;
  make: string | null;
  model: string | null;
  price: number | null;
  /** Dealer documentation fee mentioned in the text, if any. */
  docFee: number | null;
  miles: number | null;
  transmission: TransmissionKind;
  titleStatus: TitleStatus;
  accident: AccidentStatus;
  exteriorColor: string | null;
  ownerCount: number | null;
  sellerType: SellerType;
  usage: Usage;
  zip: string | null;
  /** "969 mi away" on sites that show distance from the buyer. */
  distanceMiles: number | null;
  /** US phone numbers in the text, as 10 digits (for the "same phone on several listings" check). */
  phones: string[];
  /** The dealer's name when the page shows it above its opening hours ("DCH Wappingers Falls Toyota / Open Today|9:00 AM"). */
  dealerName?: string | null;
  /**
   * Facts the ad gives two different answers for ("$29,995" and "$27,995" with nothing saying which is the
   * price). The field itself is then null: VinVerdict shows "not sure" and the ad's choices, never a guess.
   * Only present when there is at least one.
   */
  unsure?: Unsure[];
  /** Facts the buyer entered or picked on the result ("What we read from the ad"), shown as "you entered". */
  fixed?: FixField[];
};

export type FixField = "year" | "make" | "model" | "price" | "docFee" | "miles" | "exteriorColor" | "titleStatus" | "sellerType";
export type UnsureField = "price" | "miles" | "year" | "make" | "model" | "exteriorColor";
export type Unsure = { field: UnsureField; values: (number | string)[] };

// Brands in scope first (PLAN.md §1), then common others so text still parses.
const MODELS: Record<string, string[]> = {
  Toyota: ["Camry", "Corolla Cross", "Corolla", "RAV4", "Highlander", "Prius", "Avalon", "4Runner", "Tacoma", "Tundra", "Sienna", "Venza", "C-HR", "Yaris", "Sequoia", "bZ4X", "Crown", "Grand Highlander"],
  Honda: ["Accord", "Civic", "CR-V", "HR-V", "Pilot", "Odyssey", "Fit", "Insight", "Passport", "Ridgeline", "Clarity", "Prologue"],
  Lexus: ["ES", "IS", "GS", "LS", "RX", "NX", "UX", "GX", "LX", "RC", "TX"],
  Acura: ["TLX", "ILX", "RLX", "TSX", "RDX", "MDX", "Integra", "ZDX"],
  Mazda: ["Mazda3", "Mazda5", "Mazda6", "CX-30", "CX-3", "CX-5", "CX-50", "CX-70", "CX-7", "CX-9", "CX-90", "MX-5 Miata", "Tribute"],
  Subaru: ["Outback", "Forester", "Crosstrek", "Impreza", "Legacy", "Ascent", "WRX", "BRZ"],
  Hyundai: ["Elantra", "Sonata", "Tucson", "Santa Fe", "Kona", "Palisade", "Accent", "Venue", "Ioniq"],
  Kia: ["Optima", "K5", "Forte", "Rio", "Sorento", "Sportage", "Soul", "Telluride", "Niro", "Seltos"],
  Nissan: ["Altima", "Sentra", "Maxima", "Versa", "Rogue", "Murano", "Pathfinder", "Kicks", "Leaf"],
  Ford: ["Fusion", "Focus", "Escape", "Explorer", "Edge", "F-150", "Mustang", "Bronco"],
  Chevrolet: ["Malibu", "Cruze", "Impala", "Equinox", "Traverse", "Silverado", "Bolt", "Trax"],
  // Makes people paste even though the app is tuned for Toyota and Honda. Their model names
  // only count after the make ("Model 3", "Compass" and "Sierra" are ordinary words alone).
  // Not "Ram", "Mini" or "Lincoln": they're too common as plain words ("mini van", "Lincoln, NE").
  BMW: ["3 Series", "5 Series", "7 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "i4", "iX"],
  "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "CLA", "GLA", "GLB", "GLC", "GLE", "GLS"],
  Audi: ["A3", "A4", "A5", "A6", "Q3", "Q5", "Q7", "Q8", "e-tron"],
  Volkswagen: ["Jetta", "Passat", "Tiguan", "Atlas", "Golf", "Taos", "ID.4"],
  Jeep: ["Grand Cherokee", "Cherokee", "Wrangler", "Compass", "Renegade", "Gladiator"],
  Tesla: ["Model 3", "Model Y", "Model S", "Model X"],
  GMC: ["Sierra", "Terrain", "Acadia", "Yukon"],
  Dodge: ["Charger", "Challenger", "Durango", "Grand Caravan"],
  Volvo: ["XC40", "XC60", "XC90", "S60"],
  Buick: ["Encore", "Enclave", "Envision"],
  Cadillac: ["Escalade", "XT4", "XT5", "XT6", "CT5"],
  Infiniti: ["Q50", "QX50", "QX60"],
  Mitsubishi: ["Outlander", "Mirage", "Eclipse Cross"],
  Porsche: ["911", "718", "Cayenne", "Macan", "Panamera", "Taycan"],
  // Longest names first: "Range Rover Sport" must not read as "Range Rover" (real case 31).
  "Land Rover": ["Range Rover Sport", "Range Rover Velar", "Range Rover Evoque", "Range Rover", "Discovery Sport", "Discovery", "Defender", "LR4", "LR3", "LR2"],
  Jaguar: ["F-Pace", "E-Pace", "I-Pace", "F-Type", "XF", "XE", "XJ"],
  Genesis: ["GV80", "GV70", "GV60", "G90", "G80", "G70"],
  "Alfa Romeo": ["Giulia", "Stelvio", "Tonale"],
  Maserati: ["Ghibli", "Levante", "Quattroporte", "Grecale"],
  Chrysler: ["Pacifica", "300", "Voyager", "Town & Country"],
  Fiat: ["500X", "500L", "500"],
  Rivian: ["R1S", "R1T"],
};
/** Makes whose model names are matched only after the make is named. */
const MODEL_NEEDS_MAKE = new Set(["Land Rover", "Jaguar", "Genesis", "Alfa Romeo", "Maserati", "Chrysler", "Fiat", "Rivian", "Porsche", "BMW", "Mercedes-Benz", "Audi", "Volkswagen", "Jeep", "Tesla", "GMC", "Dodge", "Volvo", "Buick", "Cadillac", "Infiniti", "Mitsubishi"]);
const MAKE_ALIASES: Record<string, string> = { chevy: "Chevrolet", vw: "Volkswagen", mercedes: "Mercedes-Benz", benz: "Mercedes-Benz" };

const COLORS = ["black", "white", "silver", "gray", "grey", "blue", "red", "green", "brown", "beige", "gold", "tan", "orange", "yellow", "purple", "maroon", "burgundy", "charcoal", "pearl"];
/** Makes the reader knows (for checking a make the buyer types in). */
export const KNOWN_MAKES: readonly string[] = Object.keys(MODELS);

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function parseNumber(num: string, k?: string): number {
  const n = Number(num.replace(/,/g, ""));
  return k ? Math.round(n * 1000) : n;
}

// Links a listing page often contains that are never the listing itself: the seller's
// walk-around video, social profiles, photo albums, maps, and history-report links.
const NOT_LISTING_HOST = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|imgur\.com|dropbox\.com|maps\.app\.goo\.gl|goo\.gl|carfax\.com|autocheck\.com|nhtsa\.gov|vehiclehistory\.gov)$/;

function findUrl(raw: string): { url: string | null; host: string | null } {
  for (const m of raw.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    try {
      const u = new URL(m[0]);
      const host = u.hostname.replace(/^www\./, "");
      if (NOT_LISTING_HOST.test(host) || (host === "google.com" && /^\/maps/.test(u.pathname))) continue;
      // A site's home page ("Register at https://www.salvagereseller.com") isn't a listing.
      if (u.pathname.replace(/\/+$/, "") === "" && !u.search) continue;
      return { url: u.toString(), host };
    } catch {
      // not a valid URL: try the next one
    }
  }
  return { url: null, host: null };
}

function findVin(raw: string): { vin: string | null; typed: string | null } {
  // Candidates: 17-char runs of VIN characters that contain at least one digit and one letter.
  const candidates = (raw.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) ?? []).filter(
    (c) => /\d/.test(c) && /[A-Z]/.test(c),
  );
  const good = candidates.find((c) => checkVin(c).ok);
  if (good) return { vin: good, typed: null };
  // A VIN typed by hand: with spaces or dashes, or O/I/Q for 0/1 ("4T1B 11HK 8JU1 4588O"). Only the
  // whole paste or the characters right after "VIN", and only when the check digit then passes.
  const whole = raw.toUpperCase().replace(/\bVIN(?:\s*(?:NUMBER|NO\.?|#))?\b|[\s#:.\-()]/g, "");
  const after = /\bVIN(?:\s*(?:number|no\.?|#))?\s*[:#]?\s*((?:[A-Z0-9]+[\s-]?){1,6})/i.exec(raw)?.[1] ?? "";
  const words = after.trim().split(/[\s-]+/);
  const joined = words.map((_, i) => words.slice(0, i + 1).join("")).find((j) => j.length === 17) ?? "";
  for (const typed of [whole, joined]) {
    if (typed.length !== 17) continue;
    const vin = vinFromTypo(typed);
    if (vin) return { vin, typed: typed.toUpperCase() };
  }
  // Otherwise keep the first so the scam rules can flag it.
  return { vin: candidates.length ? normalizeVin(candidates[0]) : null, typed: null };
}

/**
 * The known model of `make` that `after` starts with ("cherokee trailhawk…" → "Cherokee"), longest name first so
 * "Grand Cherokee" wins over "Cherokee". Null when the words aren't a model VinVerdict knows.
 */
export function modelNamed(make: string, after: string): string | null {
  const models = [...(MODELS[make] ?? [])].sort((a, b) => b.length - a.length);
  const head = squash(after.slice(0, 30));
  return models.find((m) => head.startsWith(squash(m))) ?? null;
}

function findMakeModel(text: string): { make: string | null; model: string | null; at: number } {
  let best: { make: string; model: string | null; at: number } | null = null;
  const consider = (make: string, at: number, after: string) => {
    if (best && best.at <= at) return;
    const models = MODELS[make] ?? [];
    const head = squash(after.slice(0, 30));
    // Longest name first, so "CX-50" isn't read as "CX-5" or "Grand Cherokee" as "Cherokee".
    const model = [...models].sort((a, b) => b.length - a.length).find((m) => head.startsWith(squash(m))) ?? null;
    best = { make, model, at };
  };
  for (const make of Object.keys(MODELS)) {
    const m = new RegExp(`\\b${make.toLowerCase()}\\b`).exec(text);
    if (m) consider(make, m.index, text.slice(m.index + make.length));
  }
  for (const [alias, make] of Object.entries(MAKE_ALIASES)) {
    const m = new RegExp(`\\b${alias}\\b`).exec(text);
    if (m) consider(make, m.index, text.slice(m.index + alias.length));
  }
  // The make was named, but not next to a model: it's in a dealer's name ("DCH Wappingers Falls Toyota
  // Open Today"), while the heading says "2020 Camry". A model right after a year is the car itself:
  // this make's models first, then any make's (a Toyota dealer selling a "2019 Accord").
  if (best && !(best as { model: string | null }).model) {
    const found = best as { make: string; model: string | null; at: number };
    const makes = [found.make, ...Object.keys(MODELS).filter((x) => x !== found.make)];
    for (const make of makes) {
      const hit = [...(MODELS[make] ?? [])]
        .filter((model) => make === found.make || model.length >= 3)
        .sort((a, b) => b.length - a.length)
        .map((model) => ({ model, m: new RegExp(`\\b(?:19[89]\\d|20[0-4]\\d) ${model.toLowerCase().replace(/[-]/g, "[- ]?")}\\b`).exec(text) }))
        .filter((x) => x.m)
        .sort((a, b) => a.m!.index - b.m!.index)[0];
      if (hit) {
        best = { make, model: hit.model, at: hit.m!.index + 5 };
        break;
      }
    }
  }
  // No make named: a model name alone ("2017 accord") is enough.
  if (!best) {
    for (const [make, models] of Object.entries(MODELS)) {
      if (MODEL_NEEDS_MAKE.has(make)) continue;
      for (const model of models) {
        if (model.length < 3) continue; // "ES", "IS" are too ambiguous alone
        const m = new RegExp(`\\b${model.toLowerCase().replace(/[-]/g, "[- ]?")}\\b`).exec(text);
        if (m && (!best || m.index < (best as { at: number }).at)) best = { make, model, at: m.index };
      }
    }
  }
  return best ?? { make: null, model: null, at: -1 };
}

function findYear(text: string, makeAt: number): number | null {
  const max = new Date().getFullYear() + 1;
  const years = [...text.matchAll(/(?<![$\d,.])\b(19[89]\d|20[0-4]\d)\b(?!\s*(?:k\b|,\d{3}|miles|mi\b))/g)]
    .map((m) => ({ y: Number(m[1]), at: m.index }))
    .filter(({ y }) => y >= 1981 && y <= max);
  if (years.length === 0) {
    // Short texts: "08 accord", "'15 camry" (two digits right before the make or model).
    const two = makeAt > 0 ? text.slice(Math.max(0, makeAt - 12), makeAt).match(/(?:^|[\s(])'?(\d{2})\s+(?:[a-z]+\s+)?$/) : null;
    if (two) {
      const yy = Number(two[1]);
      const y = yy <= max % 100 ? 2000 + yy : 1900 + yy;
      if (y >= 1981 && y <= max) return y;
    }
    return null;
  }
  if (makeAt >= 0) {
    // The year usually sits right before the make: "2017 Honda Accord".
    const near = years.filter(({ at }) => at < makeAt && makeAt - at <= 8);
    if (near.length) return near[near.length - 1].y;
  }
  return years[0].y;
}

// Fees a dealer charges itself (not the state's title, tag, registration or tax).
const DEALER_FEE_WORDS = String.raw`(?:dealer|doc(?:ument(?:ation|ary)?)?\.?|prep(?:aration)?|processing|service|reconditioning|recon|admin(?:istrative)?|handling|electronic(?: filing)?|e-?filing|filing|delivery|certification|cpo|etch(?:ing)?|dealer-installed|protection|appearance)`;
const STATE_FEE_WORDS = String.raw`(?:title|tags?|temp tag|registration|licen[cs]e|plates?|state|dmv|inspection|tire|government|tax(?:es)?)`;

/**
 * Amounts the ad adds to or takes off a price: dealer and state fees ("Doc Fee + $398", "$699 prep fee") and
 * discounts ("Dealer Discount $2,000", "$500 off", "Price drop $600"). Used to tell a price stack
 * (list price, discount, sale price, fees, total) from two prices that disagree.
 */
function priceAdjustments(text: string): { fees: { n: number; dealer: boolean }[]; discounts: number[] } {
  const amt = String.raw`\$\s?(\d{1,2},\d{3}|\d{1,4})(?:\.\d{2})?\b`;
  const fees: { n: number; dealer: boolean }[] = [];
  const kinds = new RegExp(`(${DEALER_FEE_WORDS}|${STATE_FEE_WORDS})`);
  for (const m of text.matchAll(new RegExp(String.raw`\b((?:[a-z-]+\.? ){0,3})fees?\b[^$\d]{0,15}${amt}`, "g"))) {
    const n = parseNumber(m[2]);
    if (n > 0 && n <= 5_000) fees.push({ n, dealer: !new RegExp(`\\b${STATE_FEE_WORDS}\\b`).test(m[1]) && (kinds.test(m[1]) || m[1].trim() === "") });
  }
  // "$699 prep fee", but not "$599 / Electronic Filing Fee $89" (the next line's label, with its own amount).
  for (const m of text.matchAll(new RegExp(`${amt}\\s*((?:${DEALER_FEE_WORDS}|${STATE_FEE_WORDS})(?: ${DEALER_FEE_WORDS}){0,2}) fees?\\b(?![^$\\d]{0,12}\\$?\\s?\\d)`, "g"))) {
    const n = parseNumber(m[1]);
    if (n > 0 && n <= 5_000) fees.push({ n, dealer: !new RegExp(`\\b${STATE_FEE_WORDS}\\b`).test(m[2]) });
  }
  const discounts: number[] = [];
  for (const m of text.matchAll(/\b(?:discount|savings?|you save|save|rebate|price (?:drop|cut|reduction)(?:ped)?|dropped|reduced(?: by)?|dealer cash|incentives?|bonus cash|markdown)\b[^$\d]{0,12}-?\$\s?(\d{1,3}(?:,\d{3})+|\d+)/g)) {
    discounts.push(parseNumber(m[1]));
  }
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)\s*(?:off|price (?:drop|cut)|discount|savings|rebate|markdown)\b/g)) {
    discounts.push(parseNumber(m[1]));
  }
  return { fees, discounts };
}

/**
 * The dealer's fees when the ad states a total and its fees add up to it exactly: "Sale Price $21,450 /
 * Documentation Fee $599 / Electronic Filing Fee $89 / Total Price $22,138" is $688 of dealer fees, so the
 * page's total matches the ad's. State fees in the stack are left to the out-the-door estimate. Null otherwise.
 */
function feesToTotal(text: string, price: number | null): number | null {
  if (price == null) return null;
  const totals = [...text.matchAll(/\btotal(?: price)?:? \$\s?(\d{1,3}(?:,\d{3})+)/g)].map((m) => parseNumber(m[1]));
  const { fees } = priceAdjustments(text);
  const dealer = fees.filter((f) => f.dealer).reduce((s, f) => s + f.n, 0);
  const all = fees.reduce((s, f) => s + f.n, 0);
  for (const t of totals) {
    if (dealer > 0 && (t - price === dealer || t - price === all)) return dealer;
  }
  return null;
}

function findDocFee(text: string): number | null {
  const ok = (n: number) => n > 0 && n <= 3_000;
  // Autotrader's price box lists each fee between the listing price and the total:
  // "Listing Price $11,995 Title Fee + $18 Temp Tag Fee + $23 Doc Fee + $398 Total Price $12,434".
  // Add up the dealer's own fees only: title, tag and registration are state fees that the
  // out-the-door cost adds itself (the box's "Dealer fees ($439)" total would count them twice).
  const box = text.match(/\blisting price \$[\d,]+ (.{0,300}?)\btotal price\b/);
  if (box) {
    const items = [...box[1].matchAll(/([a-z][a-z -]{0,40}?) fees? \+ \$(\d{1,2},\d{3}|\d{1,4})/g)];
    if (items.length) {
      const dealer = items.filter((m) => !/\b(title|tags?|registration|licen[cs]e|plates?|tax(es)?|state|dmv|government)\b/.test(m[1]));
      const sum = dealer.reduce((n, m) => n + Number(m[2].replace(",", "")), 0);
      return ok(sum) ? sum : null;
    }
  }
  // "Doc fee $499", "Dealer Prep Fee $699", "plus a $599 documentation fee", "$899 dealer documentation fee".
  // Not "Dealer fees ($439) included": Autotrader's total of every fee, which can include the state's.
  const name = String.raw`(?:dealer )?(?:doc(?:ument(?:ation|ary))?\.?|prep(?:aration)?|processing|admin(?:istrative)?|reconditioning|electronic filing)(?: service)?`;
  const m =
    text.match(new RegExp(String.raw`\b(?:(?:${name}) fees?|dealer fee(?!s))\b[^$\d]{0,12}\$?\s?(\d{1,4}(?:\.\d{2})?)\b`)) ??
    text.match(new RegExp(String.raw`\$\s?(\d{1,4}(?:\.\d{2})?)\s+(?:${name}) fees?\b`));
  if (!m) return null;
  const n = Number(m[1]);
  return ok(n) && n <= 2_000 ? n : null;
}

// Amounts that are about the price but aren't the asking price:
// "MSRP $31,450", "IMV of $20,009", "was $16,000", "save $1,500".
// A minus glued to the dollar sign ("-$1,500") is a discount; "EX-L - $11,900" is not.
// "paid $18k for it", "KBB says it's worth $15k", "Edmunds suggested price", "total of all payments", "amount financed".
const NOT_ASKING_BEFORE = /(?:\b(?:msrp|retail|original|list|market (?:value|price|average|avg)|kbb(?: value)?|book value|trade-in value|trade-in|imv of|imv|was|was asking|reduced from|originally|previously|save|savings|discount|rebate|owe|owe about|payoff|paid|bought (?:it )?(?:for|at)|worth|valued at|appraised at|suggested(?: price)?|fair (?:market|purchase) (?:price|value)|true market value|tmv|(?:est\.?|estimated) value|average|avg|total of (?:all )?payments|amount financed|financed|down payment|with (?:est\.?|estimated) (?:taxes and )?fees|monthly payment|payment|up to)\s*:?\s*|-)$/;
// "$460 below market", "$1,200 price drop", "$150/mo", "$500 deposit", "$199 processing fee", "$17,937 amount financed", "$969 delivery fee".
const NOT_ASKING_AFTER = new RegExp(
  // A fee name with no amount of its own after it names this amount ("$969 Delivery Fee"); "$21,995 Dealer Prep Fee $699" doesn't.
  String.raw`^\s*\*?\s*(?:(?:${DEALER_FEE_WORDS}|${STATE_FEE_WORDS})(?: [a-z-]+)? fees?\b(?![^$\d]{0,12}\$?\s?\d)|` +
    /(?:\/|per\b|a month|monthly|down|deposit|fee|doc|processing|below|under|above|over|off|less|(?:price )?drop(?:ped)?\b(?![^$\d]{0,20}\$\s?\d)|savings|in savings|to the bank|in (?:repairs|work|upgrades|mods|parts)|refundable|amount financed|financed|total of|invested|market value|value\b|trade|est(?:imated)?\.? (?:value|payment))/.source +
    ")",
);

type PriceRead = { price: number | null; docFee?: number; unsure?: number[] };

/**
 * The asking price, and whether the ad agrees with itself. Every amount that could be the price is collected,
 * not just the first. A price stack is fine: "$29,995 / Dealer Discount $2,000 / $27,995" (the price is
 * $27,995) or "Retail $21,995 / Prep Fee $699 / Your Price $22,694" (price $21,995 plus a $699 dealer fee).
 * Two prices that nothing in the ad explains make the price unsure: the page asks instead of guessing.
 */
function readPrice(text: string, docFee: number | null, checkText: string, mixed: boolean): PriceRead {
  const all = priceCandidates(text);
  if (!all.length) return { price: null };
  const top = all[0].n;
  return reconcilePrice(top, priceCandidates(checkText), text, docFee, mixed);
}

/** Amounts that could be the asking price, in order of trust: labelled, then a bare number with a price word, then any dollar amount. */
function priceCandidates(text: string): { n: number; labelled: boolean }[] {
  // Up to $1M (the same limit as the price check): exotic cars are real listings, and a cap that's too low makes an option's
  // price ("$630") win instead (case 28, a $435,640 Porsche).
  const ok = (n: number) => n >= 500 && n <= 1_000_000;
  const num = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b`;
  const all: { n: number; labelled: boolean }[] = [];
  const take = (n: number, labelled: boolean) => {
    if (ok(n)) all.push({ n, labelled });
  };
  // 1) Labelled: "asking $9,000", "price: 9500", "internet price $25,495", "$9k obo"
  const labelRe = new RegExp(String.raw`\b(asking|price|priced at|selling for|for sale for)\b[:\s]*\$?\s*${num}`, "g");
  for (const m of text.matchAll(labelRe)) {
    const before = text.slice(Math.max(0, m.index - 25), m.index);
    if (/\b(msrp|retail|original|list|market|was|was asking|suggested|fair purchase|fair market|kbb|edmunds|book|purchase|paid)\s*$/.test(before)) continue;
    take(parseNumber(m[2], m[3]), true);
  }
  // 2) A bare number with a price word after it: "4500 cash", "7,800 obo", "9k firm".
  for (const m of text.matchAll(/(?<![\d,.$])(\d{1,3}(?:,\d{3})+|\d{3,6}|\d{1,3}(?:\.\d)?(?=\s*k\b))\s*(k)?\s*(?:cash|obo|or best offer|firm|negotiable|or trade)\b/g)) {
    take(parseNumber(m[1], m[2]), true);
  }
  // 3) Dollar amounts that aren't a payment, deposit, fee, saving or reference price.
  for (const m of text.matchAll(new RegExp(String.raw`\$\s?${num}`, "g"))) {
    const before = text.slice(Math.max(0, m.index - 25), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25);
    // "$15,200$16,000": Facebook's new price glued to the crossed-out old one.
    if (NOT_ASKING_BEFORE.test(before) || NOT_ASKING_AFTER.test(after) || /\$[\d,]+(?:\.\d+)?$/.test(before)) continue;
    take(parseNumber(m[1], m[2]), false);
  }
  return all;
}

function reconcilePrice(top: number, all: { n: number; labelled: boolean }[], text: string, docFee: number | null, mixed: boolean): PriceRead {
  // Same-size amounts must be explained by the ad's own fees or discounts; a labelled price far above the one
  // read (a "$1,500" headline that is really the down payment of a "Total price $18,990") must be too.
  const { fees, discounts } = priceAdjustments(text);
  const steps = [...new Set([...fees.map((f) => f.n), ...discounts, ...(docFee ? [docFee] : [])])];
  const sums = [fees.reduce((s, f) => s + f.n, 0), fees.filter((f) => f.dealer).reduce((s, f) => s + f.n, 0)].filter((n) => n > 0);
  const explains = (d: number) => steps.includes(d) || sums.includes(d);
  const toCheck = [...new Set(all.filter(({ n, labelled }) => n !== top && (mixed || (n >= top / 2 && n <= top * 2) || (labelled && n > top * 2))).map((x) => x.n))];
  const known = new Set([top]);
  let left = toCheck;
  for (let changed = true; changed && left.length; ) {
    changed = false;
    left = left.filter((v) => {
      if ([...known].some((k) => explains(Math.abs(v - k)))) {
        known.add(v);
        changed = true;
        return false;
      }
      return true;
    });
  }
  if (left.length) return { price: null, unsure: [top, ...left] };

  // The first amount read was a total or a pre-discount price: the price is the one a fee or discount below it.
  const below = toCheck.filter((v) => v < top && explains(top - v)).sort((a, b) => b - a)[0];
  if (below === undefined) return { price: top };
  const d = top - below;
  const asFee = fees.find((f) => f.n === d) ?? (sums[1] === d ? { n: d, dealer: true } : undefined);
  if (asFee && !discounts.includes(d)) return { price: below, ...(asFee.dealer && !docFee ? { docFee: d } : {}) };
  return { price: below };
}

// Mileage that isn't the odometer: service history ("new tires at 140k miles",
// "oil every 5,000 miles", "brakes 2k miles ago"), distance ("969 mi away"),
// warranties ("100,000 miles powertrain").
const MILES_NOT_ODO_BEFORE = /\b(?:at|every|each|by|until|before|after|within|up to|over|for|next|last|from|in|asking|price)\s*$|[-/$]$/;
const MILES_NOT_ODO_AFTER = /^\.?\s*(?:away|from|radius|range|per\b|\/|ago|of (?:warranty|coverage|range)|warranty|powertrain|limited|bumper|return|buy-?back|guarantee|coverage|on (?:the )?(?:new |current )?(?:tires|brakes|battery|engine|motor|transmission|trans|rebuild|pads)|later|left|interval|service|or (?:less|fewer|under|below))/;

/** Two odometer readings that are the same reading ("36k miles" and "36,412 miles"). */
const sameMiles = (a: number, b: number) => Math.abs(a - b) <= Math.max(1_000, Math.max(a, b) * 0.02);

/**
 * The odometer reading. Every labelled or "N miles" reading is collected: two that disagree
 * ("Mileage: 48,211" and "61,020 mi" from another car) make the miles unsure instead of a guess.
 */
function readMiles(text: string): { miles: number | null; unsure?: number[] } {
  const ok = (n: number) => n >= 0 && n <= 600_000;
  const num = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?`;
  const seen: number[] = [];
  // 1) Labelled: "mileage: 31,200", "odometer: 112000", "Mileage 183,086", "miles: 40000", "driven 98,450 miles".
  const labelled = new RegExp(String.raw`\b(?:mileage|odometer|odo|miles:|driven)\s*:?\s*${num}\b`, "g");
  for (const m of text.matchAll(labelled)) {
    // "Odometer: 84,000 km (52,195 miles)": kilometres aren't miles; the miles are read below.
    if (/^\s*(?:km|kms|kilomet)/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 10))) continue;
    const n = parseNumber(m[1], m[2]);
    if (ok(n) && n > 0) seen.push(n);
  }
  // 2) "183,086 mi", "150k miles", "4,100 original miles", "42k on it" - ones that aren't service history.
  const free = new RegExp(String.raw`(?<![\d,.$])${num}\s*(?:(?:original|actual|true|highway|hwy|total)\s+)?(?:miles\b|mi\b|mileage\b(?!:?\s*\d)|on (?:it|the clock|the odometer)\b)`, "g");
  for (const m of text.matchAll(free)) {
    const before = text.slice(Math.max(0, m.index - 25), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (MILES_NOT_ODO_BEFORE.test(before) || MILES_NOT_ODO_AFTER.test(after)) continue;
    const n = parseNumber(m[1], m[2]);
    if (ok(n)) seen.push(n);
  }
  if (seen.length) {
    // Small numbers ("250 miles of range", "5 miles from downtown") aren't a second odometer reading.
    const others = seen.filter((n) => n >= 1_000 && seen[0] >= 1_000 && !sameMiles(n, seen[0]));
    const distinct = others.filter((n, i) => others.findIndex((o) => sameMiles(o, n)) === i);
    return distinct.length ? { miles: null, unsure: [seen[0], ...distinct] } : { miles: seen[0] };
  }
  return { miles: findShortMiles(text) };
}

function findShortMiles(text: string): number | null {
  // 3) Short texts: a bare "165k" that isn't money ("$9k", "9k cash/obo/firm/down") or service history.
  for (const m of text.matchAll(/(?<![\d,.$])(\d{2,3}(?:\.\d)?)\s*k\b(?!\s*(?:cash|obo|firm|down|or best|negotiable|\$))/g)) {
    const before = text.slice(Math.max(0, m.index - 25), m.index);
    if (/\b(?:asking|price|for|at|every|by|after|before)\s*$|\$\s*$/.test(before)) continue;
    const n = parseNumber(m[1], "k");
    if (n >= 10_000 && n <= 400_000) return n;
  }
  return null;
}

function findDistance(text: string): number | null {
  const m = text.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*(?:mi|miles)\.? away\b/);
  return m ? parseNumber(m[1]) : null;
}

function findTitle(text: string): TitleStatus {
  // Cars.com: "Clean title: No" means the title is branded.
  // Needs the colon (or the box's next label / end of text) so "clean title no accidents" stays clean.
  if (/\bclean title:\s*no\b|\bclean title no(?= open recall| personal use| 1-owner|$)/.test(text)) return "branded";
  // "Rebuilt salvage title", "rebuilt from salvage": salvaged once, now repaired and re-titled.
  if (hasUnnegated(text, /\brebuilt[- ]salvage\b|\bsalvage[- ]rebuilt\b|\brebuilt (?:from|after) (?:a )?salvage\b|\bsalvaged?\b[^.]{0,40}\b(?:now|has) (?:a )?rebuilt\b/)) return "rebuilt";
  if (hasUnnegated(text, /\bsalvaged?\b/)) return "salvage";
  // "Rebuilt engine" is a repair, not a title. But Craigslist's fields run together once pasted
  // ("title status: rebuilt transmission: automatic"), so a word followed by a colon is the next field.
  if (hasUnnegated(text, /\b(rebuilt|rebuild|reconstructed|restored) title\b|\brebuilt\b(?! (?:engine|transmission|motor|trans)\b(?!:))/)) return "rebuilt";
  if (hasUnnegated(text, /\bflood(ed)?\b|water damage/)) return "flood";
  // The lemon-law brand, not "lemon yellow paint" or a "lemon tree air freshener".
  if (hasUnnegated(text, /\blemon[- ](law|title|buy ?back|brand)|\b(is|was|a|declared|deemed) (a )?lemon\b(?! (yellow|green|tree|scent|fresh|colou?r|paint))|\bmanufacturer buy ?back\b/)) return "lemon";
  // Craigslist's "title status: parts only" is a junk-type brand: the car can't be registered for the road.
  if (hasUnnegated(text, /\bbranded title\b|\b(junk|non-?repairable) title\b|\btitle (status:? )?(is )?(junk|non-?repairable|parts only)\b/)) return "branded";
  // "clean title", "title is clean", Craigslist's "title status: clean", "clean NJ title",
  // "clean blue title", "clean and clear title", eBay's "Vehicle Title: Clean". ("Clear title" alone means no lien, not no brand.)
  if (/\bclean (and clear |blue |[a-z]{2} )?(title|carfax|autocheck)\b|title:? (status:? )?(is )?clean\b/.test(text)) return "clean";
  return "unknown";
}

// Safety features whose names contain crash words but say nothing about the
// car's history: Toyota "Pre-Collision System", Honda "Collision Mitigation
// Braking", "Forward Collision Warning", a dealer's "collision center".
const SAFETY_FEATURE = /\bpre-?collision\b|\b(?:forward|front|rear|cross[- ]traffic) collision\b|\bcollision (?:mitigation|warning|avoidance|alert|detection|braking|prevention|center|centre|repair shop)\b|\baccident avoidance\b/g;

// History boxes on dealer sites. These are the strongest signals, so they win
// over anything else in the text (reviews, ads, feature lists).
//   Cars.com  "Accidents or damage: None reported" / "At least 1 accident or damage reported"
//   AutoTrader (AutoCheck)  "Accident or Damage Reported"
//   CarGurus / CarMax / Carvana  "No accidents reported" / "1 accident reported"
const HISTORY_ACCIDENT = /\bat least (?:1|one) accident\b|\b[1-9] (?:accidents?|damage events?)(?: or damage)? reported\b|\baccidents? or damage:? (?:at least )?[1-9]\b|\baccidents? (?:or damage )?reported\b|\bdamage reported\b/;
const HISTORY_NONE = /\baccidents? or damage:? none reported\b|\bno accidents? (?:or damage )?reported\b|\bno accidents? or damage\b|\b0 accidents\b|\bno reported accidents\b|\bclean carfax\b/;
const SAID_NONE = /\bno accidents?\b|\baccidents?\s*[?:\-–—]+\s*(?:no|none|nope|zero|0)\b(?![- ]?(?:injur|one (?:was )?hurt))|\baccident[- ]free\b|never (?:been )?in an accident|\bzero accidents\b|\bno damage\b|\bno significant damage\b|\bnever (?:been )?wrecked\b|\bno wrecks?\b/;
const SAID_ACCIDENT = /\baccidents?\b|\bcollision\b|fender[- ]bender|\b(?:frame|structural|front[- ]end|rear[- ]end|body|hail) damage\b|airbags? (?:deployed|popped)|\bwas hit\b|got hit|been hit|rear[- ]ended|\btotaled\b|\bwreck(?:ed|s)?\b|\bhit (?:a |by a )?(?:deer|pole|curb|car|truck|guardrail)\b/;

function findAccident(text: string): AccidentStatus {
  const t = text.replace(SAFETY_FEATURE, " ");
  if (hasUnnegated(t, HISTORY_ACCIDENT)) return "reported";
  if (HISTORY_NONE.test(t)) return "none";
  // Free text: remove "no accidents"-style phrases first so their words don't count as a report.
  const rest = t.replace(new RegExp(HISTORY_NONE.source, "g"), " ").replace(new RegExp(SAID_NONE.source, "g"), " ");
  if (hasUnnegated(rest, SAID_ACCIDENT)) return "reported";
  if (SAID_NONE.test(t)) return "none";
  return "unknown";
}

// Maker paint names that don't contain a plain colour word, and what colour they are
// (Toyota, Honda, Lexus, Subaru, Mazda). Only read when labelled as the exterior.
const PAINT: Record<string, string> = {
  "wind chill": "white", "super white": "white", "blizzard": "white", "ice cap": "white", "eminent white": "white", "ultra white": "white", "crystal white": "white",
  "platinum white": "white", "taffeta white": "white", "snowflake white": "white", "rallye white": "white", "lunar rock": "gray", "underground": "gray",
  "magnetic gray": "gray", "predawn": "gray", "celestial": "silver", "classic silver": "silver", "lunar silver": "silver", "modern steel": "gray",
  "sonic gray": "gray", "meteorite": "gray", "urban gray": "gray", "machine gray": "gray", "polymetal": "gray", "nebula gray": "gray", "atomic silver": "silver",
  "midnight black": "black", "crystal black": "black", "attitude black": "black", "obsidian": "black", "jet black": "black", "caviar": "black",
  "blueprint": "blue", "cavalry blue": "blue", "still night": "blue", "obsidian blue": "blue", "aegean": "blue", "canyon river": "blue", "nautical blue": "blue",
  "galactic aqua": "blue", "deep crystal blue": "blue", "soul red": "red", "supersonic red": "red", "ruby flare": "red", "radiant red": "red", "barcelona red": "red",
  "san marino red": "red", "rallye red": "red", "army green": "green", "cement": "gray", "quicksand": "beige",
  // Nissan, Ford, Chevrolet, Kia and Hyundai paints without a plain colour word.
  "gun metallic": "gray", "magnetic metallic": "gray", "carbonized": "gray",
  "snow white": "white", "aurora black": "black", "mosaic black": "black", "phantom black": "black", "quartz white": "white",
};

const PAINT_NAMES = Object.keys(PAINT).sort((a, b) => b.length - a.length); // "obsidian blue" before "obsidian"
const CAR_PART = String.raw`(?:grille|trim|mirrors?|accents?|bumpers?|wheels?|rims?|roof|rub|tailpipes?|exhaust|surround|badg\w*|stripes?|handles?|leather|cloth|seats?|upholstery|headliner|carpet|windows?|calipers?|lights?)`;

/** The colour in a label's value: "Lunar Silver Metallic" → silver, "Black · Interior color: Gray" → black, "Black Grille" → null. */
function colorIn(value: string): string | null {
  const v = normalizeText(value).split(/\s*(?:[·|,;(]| \/ | - |\binterior\b)\s*/)[0];
  const head = v.split(" ").slice(0, 5).join(" ");
  if (!head) return null;
  const paint = PAINT_NAMES.find((n) => new RegExp(`(?:^| )${n}(?: |$)`).test(head));
  if (paint) return PAINT[paint];
  const m = head.match(new RegExp(`\\b(${COLORS.join("|")})\\b(?!(?: [a-z/-]+){0,2} ${CAR_PART}\\b)`));
  if (!m) return null;
  return m[1] === "grey" ? "gray" : m[1];
}

/**
 * The exterior colour, read line by line so the label and its value stay together: "Exterior Color Gravity Gray"
 * (label first), "Sterling Gray Metallic Exterior" (value first, Autotrader), "Exterior" with the value on the
 * next line, "paint color: grey" (Craigslist). Two different colours make it unsure. Text without line breaks
 * falls back to reading the whole text.
 */
function readColor(raw: string, text: string): { color: string | null; unsure?: string[] } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 120) continue;
    const labelFirst = line.match(/^(?:exterior|ext\.?)(?: colou?r)?\s*[:\-–]?\s*(.*)$/i) ?? line.match(/^(?:paint(?: colou?r)?|colou?r)\s*[:\-–]\s*(.+)$/i);
    const valueFirst = labelFirst ? null : line.match(/^(.{2,60}?)\s+exterior(?: colou?r)?$/i);
    const value = labelFirst ? (labelFirst[1] || (lines[i + 1] ?? "")) : valueFirst?.[1];
    const c = value ? colorIn(value) : null;
    if (c) found.push(c);
  }
  const distinct = [...new Set(found)];
  if (distinct.length > 1) return { color: null, unsure: distinct };
  if (distinct.length === 1) return { color: distinct[0] };
  return { color: findColor(text) };
}

function findColor(text: string): string | null {
  // "Ext. Color: Wind Chill Pearl" (toyota.com): the maker's paint name, labelled as the exterior.
  const names = Object.keys(PAINT).sort((a, b) => b.length - a.length).join("|"); // "obsidian blue" before "obsidian"
  // Not when the paint name is the next line's interior: Autotrader's "Sterling Gray Metallic Exterior /
  // Jet Black With Red Accents Interior" reads "exterior jet black with red accents interior" (case 34).
  const notInterior = String.raw`(?!(?: [a-z/-]+){0,4} interior\b(?!:| colou?r))`; // "Interior: Gray" is the next label, so that one is fine
  const paint = text.match(new RegExp(`\\b(?:exterior|ext\\.?)(?: colou?r)?[:\\s-]*(${names})\\b${notInterior}`));
  if (paint) return PAINT[paint[1]];
  const list = COLORS.join("|");
  const labelled =
    // "Exterior color: Black", "Exterior color Magnetic Gray Metallic" (up to 2 words before the color)
    // Not a part's colour ("Exterior: Black Grille", "black side windows trim") or the next
    // line's interior ("Gravity Grey Exterior / Black Interior" reads "exterior black interior").
    text.match(new RegExp(`(?:exterior|\\bext\\.?)(?: colou?r)?[:\\s-]*(?:[a-z]+ ){0,2}?(${list})\\b${notInterior}(?!(?: [a-z/-]+)? (?:grille|trim|mirrors?|accents?|bumpers?|wheels?|rims?|roof|rub|tailpipes?|exhaust|surround|badg\\w*|stripes?|handles?|leather|cloth|seats?|upholstery|headliner|carpet)\\b|(?: [a-z/-]+)? (?:leather|cloth|seats?)\\b)`)) ??
    text.match(new RegExp(`(?<!(?:interior|\\bint\\.?) )\\b(?:paint )?colou?r[:\\s-]*(${list})\\b`)) ??
    // "Midnight Black Metallic exterior", "white paint", "black on tan"
    text.match(new RegExp(`\\b(${list})\\b(?=(?: [a-z]+){0,2} (exterior|paint)\\b| on (black|gray|grey|tan|beige)\\b)`));
  if (!labelled) return null;
  const c = labelled[1];
  return c === "grey" ? "gray" : c;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, first: 1, second: 2, third: 3, fourth: 4, "2nd": 2, "3rd": 3, "4th": 4 };

function findOwners(text: string): number | null {
  // Cars.com "1-owner vehicle: No" says it had more than one, but not how many.
  if (/\b(?:one|single|1)[- ]owner(?: vehicle)?:? no\b/.test(text)) return null;
  if (/\b(?:one|single|1)[- ]owner\b|\bfirst owner\b|\bcarfax 1-owner\b/.test(text)) return 1;
  // "1 previous owner", "2 owners", "I'm the second owner"
  const m =
    text.match(/\b(\d|one|two|three|four|five) (?:previous |prior )?owners?\b/) ??
    text.match(/\b(\d)[- ]owners?\b/) ??
    text.match(/\b(second|third|fourth|2nd|3rd|4th) owner\b/);
  if (!m) return null;
  const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
  return n >= 1 && n <= 9 ? n : null;
}

// Sites that only sell their own stock. Marketplaces (AutoTrader, Cars.com,
// CarGurus, Facebook, Craigslist) carry both dealers and private sellers, so
// for them the text decides.
const DEALER_ONLY_HOSTS = /(^|\.)(carmax|carvana|enterprisecarsales|hertzcarsales|vroom|echopark|autonation)\.com$/;

function findSellerType(text: string, host: string | null): SellerType {
  // Private sellers often say "no dealers", which contains the word "dealer".
  // AutoTrader's menu says "Private Seller Cars" on every page, so skip that, and its
  // footer menu lists "... New Cars for Sale / For Sale By Owner / Car Deals".
  text = text.replace(/\bcars for sale for sale by owner\b/g, "cars for sale");
  if (/\bno dealers\b|\bdealers,? (?:please )?(?:don'?t|do not|need not)\b|\bnot a dealer(?:ship)?\b|\b(?:for sale )?by owner\b|\bprivate (?:seller|party|sale)\b(?! cars)|\bfsbo\b/.test(text)) {
    return "private";
  }
  // "serviced at the dealer" or "bought it from the dealer" is a private seller talking.
  const t = text.replace(/\b(?:at|from|by|through) (?:the|a|my) (?:honda |toyota |local )?dealer(?:ship)?\b|\bdealer[- ](?:maintained|serviced|service records?|records)\b/g, " ");
  if (/\b(dealer(?:ship)?|we finance|financing available|doc(?:umentation)? fee|stock ?(?:#|number|no\b)|certified pre-?owned|cpo|our inventory|warranty available|carmax|carvana|enterprise car sales|hertz car sales|echopark|autonation|processing fee|no-haggle price|internet price|e-price)\b/.test(t) || /\bstock ?#|\bstock(?: number)?: [a-z0-9-]*\d/.test(t)) {
    return "dealer";
  }
  if (host && DEALER_ONLY_HOSTS.test(host)) return "dealer";
  if (/\b(i'?m selling|i am selling|selling my|selling (?:it )?because|my car|my daily|i bought (?:it|a|an|my)|i'?ve owned|i'?m the (?:first|second|original|only) owner|seller'?s description)\b/.test(text)) {
    return "private";
  }
  return "unknown";
}

function findUsage(text: string): Usage {
  if (/\bfleet vehicle:? yes\b.{0,20}\brental\b/.test(text) ||
      hasUnnegated(text, /\b(?:previous|former|prior|ex-?) ?rental\b|\brental (?:car|vehicle|use|history|unit)\b/)) return "rental";
  if (/\bfleet (?:vehicle|use|car)?:? ?yes\b/.test(text) ||
      // Police and taxi only when they describe the car: "meet at a police station" is safety advice.
      hasUnnegated(text, /\b(?:ex-?|former |previous )fleet\b|\bfleet (?:vehicle|car|use)\b(?!:? ?no)|\bcommercial use\b|\b(?:uber|lyft|rideshare)\b|\b(?:ex-?|former |retired )(?:police|taxi|cab)\b|\b(?:police|taxi) (?:car|vehicle|interceptor|cruiser|package|unit|use|cab)\b/)) {
    return "fleet";
  }
  if (/\bpersonal use(?: only)?(?::? yes)?\b(?!:? ?no)|\bnot a fleet or rental\b/.test(text)) return "personal";
  return "unknown";
}

function findTransmission(text: string): TransmissionKind {
  // 1) "Transmission: 8-Speed Automatic", "Transmission CVT". Stop at punctuation
  //    so "owner's manual" later in the text can't leak in.
  // The label as sites misspell it too ("Transmimssion" on toyota.com).
  for (const m of text.matchAll(/\btransmi[a-z]{0,3}ssion\b[:\s-]+([^.;·|,]{2,40})/g)) {
    const k = classifyTransmission(m[1].split(/\b(?:engine|fuel|drive|mpg|exterior|interior|vin|highlights)\b/)[0]);
    if (k !== "unknown") return k;
  }
  // 2) "6-speed manual transmission", "Automatic Transmission"
  const before = text.match(/\b((?:\d{1,2}[- ]speed )?(?:manual|automatic|auto|cvt|stick ?shift|dual[- ]clutch)) (?:transmission|trans\b|gearbox)/);
  if (before) return classifyTransmission(before[1]);
  // 3) Loose mentions, skipping feature names like "automatic climate control".
  const loose = text.match(/\b(cvt|stick ?shift|\d-speed (?:manual|automatic)|automatic(?! (?:emergency|climate|temperature|headlights?|high[- ]?beams?|braking|wipers?|lights?|locks?|door|on\/off|start|dimming|leveling|parking|rain))|manual(?= (?:only|car)\b))\b/);
  return classifyTransmission(loose?.[1] ?? null);
}

function findZip(raw: string): string | null {
  const m = raw.match(/\b(?:zip(?: code)?:?\s*|[A-Z]{2},?\s+)(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

function findPhones(raw: string): string[] {
  const out = new Set<string>();
  for (const m of raw.matchAll(/(?<![\dA-Za-z])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})(?![\dA-Za-z])/g)) {
    const digits = m[1] + m[2] + m[3];
    if (!/^(\d)\1{9}$/.test(digits)) out.add(digits); // skip 0000000000-style filler
    if (out.size >= 5) break;
  }
  return [...out];
}

/** True when the paste is just a VIN, maybe labelled: "VIN: 4T1C…", "vin# 4T1C…". */
function isOnlyVin(raw: string, vin: string): boolean {
  const rest = raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(vin, "")
    .replace(/VIN(NUMBER|NO\.?|#)?|NUMBER|[#:.\-()]/g, "");
  return rest.length === 0;
}

// Headings that start a list of other cars on a listing page ("Similar Vehicles", "You may also like",
// "SPONSORED"). What follows them is about other cars. (Autotrader's "More from the seller" is this car's description.)
const OTHER_CARS_HEADING = /^(?:similar (?:vehicles|cars|listings|inventory)|you (?:may|might) also like|recommended(?: for you| vehicles| cars| listings)?|recently viewed(?: vehicles| cars)?|sponsored(?: listings?| vehicles| results)?|compare (?:to )?similar(?: vehicles| cars)?|other (?:listings|vehicles|cars)(?: you may like)?|people also (?:viewed|looked at)|shoppers also viewed|related (?:listings|vehicles|cars)|more like this|more (?:vehicles|cars|inventory) (?:from|at|like) .{0,40}|check out similar .{0,40}|accessible carousel)$/i;

// A car card in a list of other cars: a short "2016 MAZDA CX-5" line with a lone "85K mi" or "$14,995" line just below.
const CARD_TITLE = /^(?:(?:used|new|certified|cpo|pre-owned)\s+)?(?:19[89]\d|20[0-4]\d)\s+[A-Za-z][\w-]*(?:\s+\S+){0,6}$/i;
const CARD_FACT = /^(?:\$\s?\d{1,3}(?:,\d{3})+|\d{1,3}(?:,\d{3})*(?:\.\d)?k?\s*(?:mi|miles)\.?)$/i;

/**
 * The part of a pasted page about this car: everything before the first other-cars heading or list of car
 * cards, when this car's facts come first. A "Recently viewed" strip at the top doesn't count: then the whole
 * page is read, and two cars' facts make those facts unsure instead of mixing them.
 */
export function thisCarPart(raw: string): { raw: string; mixed: boolean } {
  const lines = raw.split(/\r?\n/);
  const at: number[] = [];
  let chars = 0;
  for (const l of lines) {
    at.push(chars);
    chars += l.length + 1;
  }
  let i = lines.findIndex((l) => l.trim().length <= 60 && OTHER_CARS_HEADING.test(l.trim()));
  // Card lists without a heading: only in the later part of the page (this car's own title and miles come first).
  const card = lines.findIndex((l, k) => at[k] >= chars * 0.4 && l.trim().length <= 60 && CARD_TITLE.test(l.trim()) &&
    lines.slice(k + 1, k + 5).some((n) => CARD_FACT.test(n.trim())));
  if (card > 0 && (i < 0 || card < i)) i = /^(?:used|new|certified|cpo|pre-owned)$/i.test(lines[card - 1].trim()) ? card - 1 : card;
  if (i < 0) return { raw, mixed: false };
  const head = lines.slice(0, i).join("\n");
  // Other cars come first ("Recently viewed" at the top): read everything, but treat every amount as a possible
  // other car's, so a price that isn't clearly this car's is "not sure".
  return i > 0 && /\$\s?\d|\b(?:19[89]\d|20[0-4]\d)\b/.test(head) ? { raw: head, mixed: false } : { raw, mixed: true };
}

/** Lines that list many prices at once (a window sticker's options, a payment breakdown): never the asking price. */
const withoutPriceLists = (raw: string) => raw.split(/\r?\n/).filter((l) => (l.match(/\$\s?\d/g) ?? []).length < 4).join("\n");

/**
 * Every "2019 Honda CR-V" title line (a short line of its own, not a sentence), to notice a page that names two
 * different cars. A seller's description that mentions another car is left to the model-conflict rule.
 */
function carTitles(raw: string): { year: number; make: string; model: string | null }[] {
  const text = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length <= 90 && /^(?:(?:used|certified|new|pre-owned|cpo)\s+)?(?:19|20)\d\d\s/i.test(l))
    .map((l) => normalizeText(l))
    .join("\n");
  const names = [...Object.keys(MODELS), ...Object.keys(MAKE_ALIASES)].sort((a, b) => b.length - a.length);
  const re = new RegExp(String.raw`\b(19[89]\d|20[0-4]\d) (?:(?:used|certified|new|pre-owned|cpo) )?(${names.map((n) => n.toLowerCase().replace(/-/g, "[- ]?")).join("|")})\b ?(.{0,30})`, "g");
  const max = new Date().getFullYear() + 1;
  return [...text.matchAll(re)]
    .filter((m) => Number(m[1]) <= max)
    .map((m) => {
      const said = m[2].replace(/ /g, "-");
      const make = MAKE_ALIASES[said] ?? Object.keys(MODELS).find((k) => k.toLowerCase() === said || squash(k) === squash(said)) ?? said;
      return { year: Number(m[1]), make, model: modelNamed(make, m[3]) };
    });
}

export function parseListing(input: string): ParsedListing {
  const raw = input.slice(0, MAX_LISTING_CHARS);
  const { url, host } = findUrl(raw);
  // This car's facts come from its own part of the page, not the "Similar vehicles" below it.
  const { raw: carRaw, mixed } = thisCarPart(raw);
  const own = findVin(carRaw);
  const { vin, typed: vinTyped } = own.vin ? own : findVin(raw);
  // Facts come from the text without its links: a search link's
  // "makeCode=TOYOTA&startYear=2018" are filters, not this car.
  const text = normalizeText(carRaw.replace(URL_RE, " "));

  const onlyUrl = url !== null && raw.trim().split(/\s+/).length === 1;
  // A dealer link with the VIN in it ("…-1hgcv1f35la054321.htm") is a VIN lookup.
  const kind = vin && (isOnlyVin(raw, vinTyped ?? vin) || onlyUrl) ? "vin" : onlyUrl ? "url" : "text";

  const unsure: Unsure[] = [];
  const found = findMakeModel(text);
  let { make, model } = found;
  let year = findYear(text, found.at);
  // Two different cars named ("2019 Honda CR-V EX" and "2018 Toyota Corolla LE"): don't pick one.
  const titles = carTitles(carRaw);
  const years = [...new Set(titles.map((t) => t.year))];
  const makes = [...new Set(titles.map((t) => t.make))];
  const models = [...new Set(titles.flatMap((t) => (t.model ? [t.model] : [])))];
  if (years.length > 1) {
    unsure.push({ field: "year", values: years });
    year = null;
  }
  if (makes.length > 1) {
    unsure.push({ field: "make", values: makes });
    make = null;
    model = null;
  } else if (models.length > 1) {
    unsure.push({ field: "model", values: models });
    model = null;
  }

  const docFeeSaid = findDocFee(text);
  const priced = readPrice(text, docFeeSaid, normalizeText(withoutPriceLists(carRaw).replace(URL_RE, " ")), mixed);
  if (priced.unsure) unsure.push({ field: "price", values: priced.unsure });
  // With the price not sure, the fees on top of it aren't either (which stack do they belong to?).
  const docFee = priced.unsure ? null : feesToTotal(text, priced.price) ?? docFeeSaid ?? priced.docFee ?? null;
  const odo = readMiles(text);
  if (odo.unsure) unsure.push({ field: "miles", values: odo.unsure });
  const painted = readColor(carRaw, text);
  if (painted.unsure) unsure.push({ field: "exteriorColor", values: painted.unsure });

  return {
    kind,
    url,
    sourceHost: host,
    vin,
    // Typed with O/I/Q or spaces: what was typed (shown as "read as"). Only when it differs.
    ...(vinTyped && vinTyped !== vin ? { vinTyped } : {}),
    year,
    make,
    model,
    price: priced.price,
    docFee,
    miles: odo.miles,
    transmission: findTransmission(text),
    // A business named "Salvage Reseller" (an auction broker) isn't a salvage title.
    titleStatus: findTitle(text.replace(/\bsalvage ?reseller(\.com)?\b/g, " ")),
    accident: findAccident(text),
    exteriorColor: painted.color,
    ownerCount: findOwners(text),
    sellerType: findSellerType(text, host),
    usage: findUsage(text),
    zip: findZip(carRaw.replace(URL_RE, " ")),
    distanceMiles: findDistance(text),
    phones: findPhones(raw.replace(URL_RE, " ")),
    dealerName: findDealerName(carRaw),
    ...(unsure.length ? { unsure } : {}),
  };
}

const DEALER_WORD = new RegExp(String.raw`\b(?:${Object.keys(MODELS).join("|")}|chevy|motors?|auto(?:s|motive| group| mall|plex)?|cars|dealership)\b`, "i");

/**
 * A dealer's name, only in one strict layout: a short line naming a car brand or a dealer word,
 * directly above its opening hours. Nothing else is guessed (a wrong name would send the buyer
 * to verify the wrong business).
 */
function findDealerName(raw: string): string | null {
  const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    const name = lines[i];
    if (!/^(?:open(?: today| now)?|closed(?: now| today)?)\b|^hours\b/i.test(lines[i + 1])) continue;
    if (name.length > 60 || !/^[A-Z0-9][\w&'.-]*(?: [\w&'.-]+){1,7}$/.test(name) || !DEALER_WORD.test(name)) continue;
    return name;
  }
  // The dealer's own blurb: "Chevrolet-Cadillac of Turnersville, located at the Turnersville AutoMall, ..." (case 34).
  // Only a business-shaped name ("X of Place", "... Motors", "... Auto Group") that starts a line, never "My Honda, located in".
  for (const line of lines) {
    const m = line.match(/^((?!(?:My|Our|This|The|It|Your|His|Her)\b)[A-Z][\w&'.-]*(?: [A-Z0-9][\w&'.-]*){0,5}(?: of(?: [A-Z][\w&'.-]*){1,3})?),? (?:is )?located (?:at|in|on)\b/);
    if (!m) continue;
    const name = m[1];
    if (name.length > 60 || !DEALER_WORD.test(name) || !(/ of [A-Z]/.test(name) || /\b(?:motors?|auto(?:s|motive| group| mall|plex)|cars|dealership)$/i.test(name))) continue;
    return name;
  }
  return null;
}
