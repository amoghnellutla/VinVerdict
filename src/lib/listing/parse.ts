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
  zip: string | null;
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
};
const MAKE_ALIASES: Record<string, string> = { chevy: "Chevrolet", vw: "Volkswagen", volkswagen: "Volkswagen" };

const COLORS = ["black", "white", "silver", "gray", "grey", "blue", "red", "green", "brown", "beige", "gold", "tan", "orange", "yellow", "purple", "maroon", "burgundy", "charcoal", "pearl"];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function parseNumber(num: string, k?: string): number {
  const n = Number(num.replace(/,/g, ""));
  return k ? Math.round(n * 1000) : n;
}

function findUrl(raw: string): { url: string | null; host: string | null } {
  const m = raw.match(/https?:\/\/[^\s<>"')]+/i);
  if (!m) return { url: null, host: null };
  try {
    const u = new URL(m[0]);
    return { url: u.toString(), host: u.hostname.replace(/^www\./, "") };
  } catch {
    return { url: null, host: null };
  }
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
  // No make named: a model name alone ("2017 accord") is enough.
  if (!best) {
    for (const [make, models] of Object.entries(MODELS)) {
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
  if (years.length === 0) return null;
  if (makeAt >= 0) {
    // The year usually sits right before the make: "2017 Honda Accord".
    const near = years.filter(({ at }) => at < makeAt && makeAt - at <= 8);
    if (near.length) return near[near.length - 1].y;
  }
  return years[0].y;
}

function findDocFee(text: string): number | null {
  const m =
    text.match(/\bdoc(?:ument(?:ation|ary))?\.? fees?\b[^$\d]{0,12}\$?\s?(\d{1,4}(?:\.\d{2})?)\b/) ??
    text.match(/\$\s?(\d{1,4}(?:\.\d{2})?)\s+doc(?:ument(?:ation|ary))?\.? fees?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 2_000 ? n : null;
}

function findPrice(text: string): number | null {
  const ok = (n: number) => n >= 500 && n <= 250_000;
  // 1) Labelled: "asking $9,000", "price: 9500", "$9k obo"
  const labelled = text.match(/\b(?:asking|price|priced at|selling for|for sale for|sale price)\b[:\s]*\$?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b/);
  if (labelled) {
    const n = parseNumber(labelled[1], labelled[2]);
    if (ok(n)) return n;
  }
  // 2) First dollar amount that isn't a payment, deposit or fee.
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b(?!\s*(?:\/|per\b|a month|monthly|down|deposit|fee|doc))/g)) {
    const n = parseNumber(m[1], m[2]);
    if (ok(n)) return n;
  }
  return null;
}

function findMiles(text: string): number | null {
  const ok = (n: number) => n >= 0 && n <= 600_000;
  const patterns = [
    /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\s*(?:miles|mi\b|mileage)/,
    /\b(?:mileage|odometer|miles)\b[:\s]*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b/,
    /(\d{1,3}(?:\.\d)?)\s*(k)\s*(?:on (?:it|the clock|the odometer)|original)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseNumber(m[1], m[2]);
      if (ok(n)) return n;
    }
  }
  return null;
}

function findTitle(text: string): TitleStatus {
  if (hasUnnegated(text, /\bsalvage\b/)) return "salvage";
  if (hasUnnegated(text, /\b(rebuilt|rebuild|reconstructed|restored) title\b|\brebuilt\b(?! (engine|transmission|motor|trans))/)) return "rebuilt";
  if (hasUnnegated(text, /\bflood(ed)?\b|water damage/)) return "flood";
  if (hasUnnegated(text, /\blemon\b/)) return "lemon";
  if (hasUnnegated(text, /\bbranded title\b/)) return "branded";
  // "clean title", "title is clean", Craigslist's "title status: clean", "clean NJ title"
  if (/\bclean (title|carfax|autocheck)\b|title (status:? )?(is )?clean\b|\bclean [a-z]{2} title\b/.test(text)) return "clean";
  return "unknown";
}

function findAccident(text: string): AccidentStatus {
  if (hasUnnegated(text, /\baccidents?\b|\bcollision\b|fender[- ]bender|frame damage|airbags? (deployed|popped)|\bwas hit\b|got hit|been hit|rear[- ]ended/)) {
    return "reported";
  }
  if (/\bno (reported )?accidents?\b|accident[- ]free|never (been )?in an accident|zero accidents|clean carfax|no damage|no significant damage/.test(text)) {
    return "none";
  }
  return "unknown";
}

function findColor(text: string): string | null {
  const list = COLORS.join("|");
  const labelled =
    text.match(new RegExp(`exterior(?: colou?r)?[:\\s-]*(${list})\\b`)) ??
    text.match(new RegExp(`\\bcolou?r[:\\s-]*(${list})\\b`)) ??
    // "Midnight Black Metallic exterior", "white paint", "black on tan"
    text.match(new RegExp(`\\b(${list})\\b(?=(?: [a-z]+){0,2} (exterior|paint)\\b| on (black|gray|grey|tan|beige)\\b)`));
  if (!labelled) return null;
  const c = labelled[1];
  return c === "grey" ? "gray" : c;
}

function findOwners(text: string): number | null {
  if (/\b(one|single|1)[- ]owner\b|\bfirst owner\b/.test(text)) return 1;
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
  const m = text.match(/\b(\d|two|three|four|five)[- ]owners?\b/);
  if (!m) return null;
  return words[m[1]] ?? Number(m[1]);
}

function findSellerType(text: string, host: string | null): SellerType {
  if (/\b(dealer(ship)?|we finance|financing available|doc(umentation)? fee|stock ?#|certified pre-?owned|\bcpo\b|our inventory|warranty available)\b/.test(text)) {
    return "dealer";
  }
  if (host && /carmax|carvana|enterprisecarsales|hertzcarsales|cars\.com|autotrader|cargurus/.test(host)) return "dealer";
  if (/\b(private (seller|party|sale)|by owner|i('m| am) selling|selling my|my car|i bought it|i've owned)\b/.test(text)) {
    return "private";
  }
  return "unknown";
}

function findZip(raw: string): string | null {
  const m = raw.match(/\b(?:zip(?: code)?:?\s*|[A-Z]{2},?\s+)(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

export function parseListing(input: string): ParsedListing {
  const raw = input.slice(0, MAX_LISTING_CHARS);
  const text = normalizeText(raw);
  const { url, host } = findUrl(raw);
  const vin = findVin(raw);

  const onlyVin = vin !== null && normalizeVin(raw.trim()) === vin;
  const onlyUrl = url !== null && raw.trim().split(/\s+/).length === 1;

  const { make, model, at } = findMakeModel(text);
  return {
    kind: onlyVin ? "vin" : onlyUrl ? "url" : "text",
    url,
    sourceHost: host,
    vin,
    year: findYear(text, at),
    make,
    model,
    price: findPrice(text),
    docFee: findDocFee(text),
    miles: findMiles(text),
    transmission: classifyTransmission(text.match(/[^.;\n·|]{0,40}\btransmission\b[^.;\n·|]{0,20}/)?.[0] ?? (/\b(cvt|automatic|stick ?shift|manual transmission|\d-speed manual)\b/.exec(text)?.[0] ?? null)),
    titleStatus: findTitle(text),
    accident: findAccident(text),
    exteriorColor: findColor(text),
    ownerCount: findOwners(text),
    sellerType: findSellerType(text, host),
    zip: findZip(raw),
  };
}
