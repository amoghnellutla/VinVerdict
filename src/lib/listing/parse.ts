/**
 * Pull structured facts out of pasted listing text (PLAN.md §8, paste flow
 * step 2). Pure and best-effort: every field can be null/"unknown", and the
 * VIN decode and seller checklist fill the gaps later.
 *
 * The text is only ever read with regexes; it is never rendered as HTML or
 * executed (PLAN.md §9).
 */

import { classifyTransmission, type TransmissionKind } from "@/lib/nhtsa/parse";
import { checkVin, normalizeVin } from "@/lib/vin";
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
};

// Brands in scope first (PLAN.md §1), then common others so text still parses.
const MODELS: Record<string, string[]> = {
  Toyota: ["Camry", "Corolla Cross", "Corolla", "RAV4", "Highlander", "Prius", "Avalon", "4Runner", "Tacoma", "Tundra", "Sienna", "Venza", "C-HR", "Yaris", "Sequoia", "bZ4X", "Crown", "Grand Highlander"],
  Honda: ["Accord", "Civic", "CR-V", "HR-V", "Pilot", "Odyssey", "Fit", "Insight", "Passport", "Ridgeline", "Clarity", "Prologue"],
  Lexus: ["ES", "IS", "GS", "LS", "RX", "NX", "UX", "GX", "LX", "RC", "TX"],
  Acura: ["TLX", "ILX", "RLX", "TSX", "RDX", "MDX", "Integra", "ZDX"],
  Mazda: ["Mazda3", "Mazda6", "CX-30", "CX-3", "CX-5", "CX-50", "CX-9", "CX-90", "MX-5 Miata"],
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
      return { url: u.toString(), host };
    } catch {
      // not a valid URL: try the next one
    }
  }
  return { url: null, host: null };
}

function findVin(raw: string): string | null {
  // Candidates: 17-char runs of VIN characters that contain at least one digit and one letter.
  const candidates = (raw.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) ?? []).filter(
    (c) => /\d/.test(c) && /[A-Z]/.test(c),
  );
  if (candidates.length === 0) return null;
  // Prefer one that passes the check digit; otherwise keep the first so the scam rules can flag it.
  return candidates.find((c) => checkVin(c).ok) ?? normalizeVin(candidates[0]);
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
    const model = models.find((m) => head.startsWith(squash(m))) ?? null;
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
  const m =
    text.match(/\bdoc(?:ument(?:ation|ary))?\.? fees?\b[^$\d]{0,12}\$?\s?(\d{1,4}(?:\.\d{2})?)\b/) ??
    text.match(/\$\s?(\d{1,4}(?:\.\d{2})?)\s+doc(?:ument(?:ation|ary))?\.? fees?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return ok(n) && n <= 2_000 ? n : null;
}

// Amounts that are about the price but aren't the asking price:
// "MSRP $31,450", "IMV of $20,009", "was $16,000", "save $1,500".
// A minus glued to the dollar sign ("-$1,500") is a discount; "EX-L - $11,900" is not.
const NOT_ASKING_BEFORE = /(?:\b(?:msrp|retail|original|list|market (?:value|price|average|avg)|kbb(?: value)?|book value|trade-in value|imv of|imv|was|reduced from|originally|save|savings|discount|rebate|owe|owe about|payoff)\s*:?\s*|-)$/;
// "$460 below market", "$1,200 price drop", "$150/mo", "$500 deposit", "$199 processing fee".
const NOT_ASKING_AFTER = /^\s*\*?\s*(?:\/|per\b|a month|monthly|down|deposit|fee|doc|processing|below|under|above|over|off|less|price drop|drop|savings|to the bank|in (?:repairs|work)|refundable)/;

function findPrice(text: string): number | null {
  // Up to $1M (the same limit as the price check): exotic cars are real listings, and a cap that's too low makes an option's
  // price ("$630") win instead (case 28, a $435,640 Porsche).
  const ok = (n: number) => n >= 500 && n <= 1_000_000;
  const num = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b`;
  // 1) Labelled: "asking $9,000", "price: 9500", "internet price $25,495", "$9k obo"
  const labelRe = new RegExp(String.raw`\b(asking|price|priced at|selling for|for sale for)\b[:\s]*\$?\s*${num}`, "g");
  for (const m of text.matchAll(labelRe)) {
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    if (/\b(msrp|retail|original|list|market|was)\s*$/.test(before)) continue;
    const n = parseNumber(m[2], m[3]);
    if (ok(n)) return n;
  }
  // 2) A bare number with a price word after it: "4500 cash", "7,800 obo", "9k firm".
  const bare = text.match(/(?<![\d,.$])(\d{1,3}(?:,\d{3})+|\d{3,6}|\d{1,3}(?:\.\d)?(?=\s*k\b))\s*(k)?\s*(?:cash|obo|or best offer|firm|negotiable|or trade)\b/);
  if (bare) {
    const n = parseNumber(bare[1], bare[2]);
    if (ok(n)) return n;
  }
  // 3) First dollar amount that isn't a payment, deposit, fee, saving or reference price.
  for (const m of text.matchAll(new RegExp(String.raw`\$\s?${num}`, "g"))) {
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25);
    if (NOT_ASKING_BEFORE.test(before) || NOT_ASKING_AFTER.test(after)) continue;
    const n = parseNumber(m[1], m[2]);
    if (ok(n)) return n;
  }
  return null;
}

// Mileage that isn't the odometer: service history ("new tires at 140k miles",
// "oil every 5,000 miles", "brakes 2k miles ago"), distance ("969 mi away"),
// warranties ("100,000 miles powertrain").
const MILES_NOT_ODO_BEFORE = /\b(?:at|every|each|by|until|before|after|within|up to|over|for|next|last|from|in)\s*$|[-/]$/;
const MILES_NOT_ODO_AFTER = /^\.?\s*(?:away|from|radius|range|per\b|\/|ago|of (?:warranty|coverage|range)|warranty|powertrain|limited|bumper|return|buy-?back|guarantee|coverage|on (?:the )?(?:new |current )?(?:tires|brakes|battery|engine|motor|transmission|trans|rebuild|pads)|later|left|interval|service)/;

function findMiles(text: string): number | null {
  const ok = (n: number) => n >= 0 && n <= 600_000;
  const num = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?`;
  // 1) Labelled: "mileage: 31,200", "odometer: 112000", "Mileage 183,086", "miles: 40000", "driven 98,450 miles".
  const labelled = new RegExp(String.raw`\b(?:mileage|odometer|odo|miles:|driven)\s*:?\s*${num}\b`, "g");
  for (const m of text.matchAll(labelled)) {
    const n = parseNumber(m[1], m[2]);
    if (ok(n) && n > 0) return n;
  }
  // 2) "183,086 mi", "150k miles", "4,100 original miles", "42k on it" - first one that isn't service history.
  const free = new RegExp(String.raw`(?<![\d,.$])${num}\s*(?:(?:original|actual|true|highway|hwy|total)\s+)?(?:miles\b|mi\b|mileage\b|on (?:it|the clock|the odometer)\b)`, "g");
  for (const m of text.matchAll(free)) {
    const before = text.slice(Math.max(0, m.index - 25), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (MILES_NOT_ODO_BEFORE.test(before) || MILES_NOT_ODO_AFTER.test(after)) continue;
    const n = parseNumber(m[1], m[2]);
    if (ok(n)) return n;
  }
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
  // "clean blue title", "clean and clear title". ("Clear title" alone means no lien, not no brand.)
  if (/\bclean (and clear |blue |[a-z]{2} )?(title|carfax|autocheck)\b|title (status:? )?(is )?clean\b/.test(text)) return "clean";
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
};

function findColor(text: string): string | null {
  // "Ext. Color: Wind Chill Pearl" (toyota.com): the maker's paint name, labelled as the exterior.
  const names = Object.keys(PAINT).sort((a, b) => b.length - a.length).join("|"); // "obsidian blue" before "obsidian"
  const paint = text.match(new RegExp(`\\b(?:exterior|ext\\.?)(?: colou?r)?[:\\s-]*(${names})\\b`));
  if (paint) return PAINT[paint[1]];
  const list = COLORS.join("|");
  const labelled =
    // "Exterior color: Black", "Exterior color Magnetic Gray Metallic" (up to 2 words before the color)
    // Not a part's colour ("Exterior: Black Grille", "black side windows trim") or the next
    // line's interior ("Gravity Grey Exterior / Black Interior" reads "exterior black interior").
    text.match(new RegExp(`(?:exterior|\\bext\\.?)(?: colou?r)?[:\\s-]*(?:[a-z]+ ){0,2}?(${list})\\b(?!(?: [a-z/-]+)? (?:grille|trim|mirrors?|accents?|bumpers?|wheels?|rims?|roof|rub|interior|tailpipes?|exhaust|surround|badg\\w*|stripes?|handles?|leather|cloth|seats?|upholstery|headliner|carpet)\\b|(?: [a-z/-]+)? (?:leather|cloth|seats?)\\b)`)) ??
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
  if (/\b(dealer(?:ship)?|we finance|financing available|doc(?:umentation)? fee|stock ?(?:#|number|no\b)|certified pre-?owned|cpo|our inventory|warranty available|carmax|carvana|enterprise car sales|hertz car sales|echopark|autonation|processing fee|no-haggle price)\b/.test(t) || /\bstock ?#/.test(t)) {
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

export function parseListing(input: string): ParsedListing {
  const raw = input.slice(0, MAX_LISTING_CHARS);
  const { url, host } = findUrl(raw);
  const vin = findVin(raw);
  // Facts come from the text without its links: a search link's
  // "makeCode=TOYOTA&startYear=2018" are filters, not this car.
  const text = normalizeText(raw.replace(URL_RE, " "));

  const onlyUrl = url !== null && raw.trim().split(/\s+/).length === 1;
  // A dealer link with the VIN in it ("…-1hgcv1f35la054321.htm") is a VIN lookup.
  const kind = vin && (isOnlyVin(raw, vin) || onlyUrl) ? "vin" : onlyUrl ? "url" : "text";

  const { make, model, at } = findMakeModel(text);
  return {
    kind,
    url,
    sourceHost: host,
    vin,
    year: findYear(text, at),
    make,
    model,
    price: findPrice(text),
    docFee: findDocFee(text),
    miles: findMiles(text),
    transmission: findTransmission(text),
    titleStatus: findTitle(text),
    accident: findAccident(text),
    exteriorColor: findColor(text),
    ownerCount: findOwners(text),
    sellerType: findSellerType(text, host),
    usage: findUsage(text),
    zip: findZip(raw.replace(URL_RE, " ")),
    distanceMiles: findDistance(text),
    phones: findPhones(raw.replace(URL_RE, " ")),
    dealerName: findDealerName(raw),
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
  return null;
}
