/**
 * Buyer protection badge (PLAN.md feature O): what return window or warranty
 * comes with this seller. Policies checked on the sellers' own sites on
 * 2026-11-09; they change, so each links to its source. Pure.
 */

export const PROTECTION_AS_OF = "2026-11-09";

export type ProtectionSource = "carmax" | "carvana" | "enterprise" | "hertz" | "psx" | "certified" | "dealer" | "private" | "unknown";

/** Autotrader Private Seller Exchange: a private sale run through Autotrader's checkout (checked 2026-11-10). */
const PSX: Omit<Protection, "source"> = {
  name: "Autotrader Private Seller Exchange",
  level: "some",
  returns: null,
  warranty: null,
  notes: [
    "Autotrader checks the car is registered to the seller and verifies IDs, and pays the seller only after you confirm you have the car.",
    "You get a properly endorsed title free of liens. It's still a private sale, sold as-is: no return and no warranty (service contracts cost extra).",
    "This only protects you if you pay through Autotrader's checkout. A seller who asks to move the chat or the payment off the site is a warning sign.",
  ],
  links: [{ label: "Autotrader Private Seller Exchange: how it works", url: "https://intercom.help/autotraderprivatesellerexchange/en/articles/12821655-how-it-works" }],
};

export type Protection = {
  source: ProtectionSource;
  name: string;
  level: "strong" | "some" | "none" | "unknown";
  returns: string | null;
  warranty: string | null;
  notes: string[];
  links: { label: string; url: string }[];
};

const FTC = { label: "FTC Used Car Rule (Buyers Guide)", url: "https://www.ftc.gov/business-guidance/resources/dealers-guide-used-car-rule" };
const NJ_LAW = { label: "NJ used-car warranty law (N.J.S.A. 56:8-69)", url: "https://law.justia.com/codes/new-jersey/2019/title-56/section-56-8-69/" };

const BIG_SELLERS: Record<"carmax" | "carvana" | "enterprise" | "hertz", Omit<Protection, "source">> = {
  carmax: {
    name: "CarMax",
    level: "strong",
    returns: "10-day money-back guarantee",
    warranty: "30-day limited warranty (90 days / 4,000 miles in NJ, NY and MA; 60 days / 3,000 miles in CT, MN and RI)",
    notes: ["CarMax cut its included warranty from 90 days to 30 days on 2026-01-12, except where state law requires more."],
    links: [
      { label: "CarMax return policy", url: "https://www.carmax.com/faq/warranties/what_is_CarMax_return_policy" },
      { label: "CarMax limited warranty", url: "https://www.carmax.com/faq/warranties/do-all-carmax-cars-come-with-the-carmax-limited-warranty" },
    ],
  },
  carvana: {
    name: "Carvana",
    level: "strong",
    returns: "7-day money-back guarantee (400-mile limit)",
    warranty: "100-day / 4,189-mile limited warranty",
    notes: ["You can't test-drive before buying, so use the 7 days for a mechanic's inspection."],
    links: [{ label: "Carvana certified program", url: "https://www.carvana.com/certified-program" }],
  },
  enterprise: {
    name: "Enterprise Car Sales",
    level: "strong",
    returns: "7-day / 1,000-mile buyback",
    warranty: "12-month / 12,000-mile limited powertrain warranty",
    notes: ["Most cars are ex-rentals: ask for the maintenance history."],
    links: [{ label: "Enterprise Car Sales FAQ", url: "https://www.enterprisecarsales.com/used-car-faqs/enterprise-car-sales/" }],
  },
  hertz: {
    name: "Hertz Car Sales",
    level: "strong",
    returns: "7-day / 250-mile buy-back",
    warranty: "3-year / 100,000-mile limited powertrain warranty on eligible cars",
    notes: ["Hertz's site also mentions an older 12-month / 12,000-mile warranty: get the terms for this car in writing."],
    links: [{ label: "Hertz Certified", url: "https://www.hertzcarsales.com/hertz-certified.htm" }],
  },
};

const PATTERNS: [RegExp, keyof typeof BIG_SELLERS][] = [
  [/\bcarmax\b/i, "carmax"],
  [/\bcarvana\b/i, "carvana"],
  [/\benterprise car sales\b|enterprisecarsales\.com/i, "enterprise"],
  [/\bhertz (car sales|certified)\b|hertzcarsales\.com|\brent2buy\b/i, "hertz"],
];

export type ProtectionInput = {
  text: string;
  sourceHost: string | null;
  sellerType: "private" | "dealer" | "unknown";
  year: number | null;
  price: number | null;
  miles: number | null;
  now?: Date;
};

/** NJ dealers must include a warranty on cars ≤ 7 model years old, ≥ $3,000 and ≤ 100,000 miles. */
export function njDealerWarranty(i: Pick<ProtectionInput, "year" | "price" | "miles" | "now">): string | null {
  const now = i.now ?? new Date();
  if (i.year == null || i.miles == null || i.price == null) return null;
  if (now.getFullYear() - i.year > 7 || i.price < 3000 || i.miles > 100_000) return null;
  if (i.miles <= 24_000) return "90 days or 3,000 miles";
  if (i.miles < 60_000) return "60 days or 2,000 miles";
  return "30 days or 1,000 miles";
}

const MAKERS = "toyota|honda|lexus|acura|nissan|infiniti|subaru|mazda|hyundai|kia|genesis|ford|chevrolet|gmc|buick|cadillac|bmw|mini|mercedes-benz|audi|volkswagen|vw|porsche|volvo|jeep|ram|dodge|chrysler|land rover|jaguar|mitsubishi";
const TERM = String.raw`(\d{1,2})[- ]?(year|month)s?\s*\/\s*(\d{1,3}(?:,\d{3})+|\d{1,6}|unlimited)[- ]?(?:miles?|mi)\b`;
const WARRANTY_NAME = /(limited comprehensive|comprehensive|limited powertrain|powertrain|bumper[- ]to[- ]bumper|roadside assistance)/i;

/**
 * A maker-certified car, as the ad describes it ("Toyota Gold Certified", "Certified Pre-Owned").
 * Only what the ad states: its program name and the warranty terms it lists. Programs differ on
 * when a warranty starts (the car's first sale, or the day you buy it), so that's a question, not a fact.
 */
function certified(text: string, miles: number | null): { name: string; warranty: string | null; notes: string[] } | null {
  const t = text.replace(/\s+/g, " ");
  const named = new RegExp(`\\b(${MAKERS}) (?:(gold|silver|platinum) )?certified(?: used| pre-?owned)?\\b|\\b(gold|silver|platinum) certified\\b|\\bcertified pre-?owned\\b|\\bcpo\\b`, "i").exec(t);
  if (!named) return null;
  const make = named[1] ? (named[1].toLowerCase() === "bmw" || named[1].toLowerCase() === "gmc" ? named[1].toUpperCase() : named[1].replace(/\b\w/g, (c) => c.toUpperCase())) : null;
  const makeInText = make ?? new RegExp(`\\b(${MAKERS}) certified\\b`, "i").exec(t)?.[1]?.replace(/\b\w/g, (c) => c.toUpperCase()) ?? null;
  const tier = (named[2] ?? named[3])?.replace(/^\w/, (c) => c.toUpperCase()) ?? null;
  const name = `${makeInText ? `${makeInText} ` : ""}${tier ? `${tier} ` : ""}Certified${makeInText ? "" : " Pre-Owned"} (as the ad says)`;

  // "Limited Powertrain Warranty 7-year/100,000-mile": a warranty name, then its term within a few words.
  const terms: { label: string; years: number; miles: number | null; text: string }[] = [];
  for (const m of t.matchAll(new RegExp(`${WARRANTY_NAME.source}(?: warranty| plan)?[^/]{0,25}?${TERM}`, "gi"))) {
    const label = m[1].toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    if (terms.some((x) => x.label === label)) continue;
    const n = Number(m[2]);
    const years = m[3].toLowerCase() === "year" ? n : n / 12;
    const limit = m[4].toLowerCase() === "unlimited" ? null : Number(m[4].replace(/,/g, ""));
    terms.push({ label, years, miles: limit, text: `${n} ${m[3].toLowerCase()}${n === 1 ? "" : "s"}/${limit == null ? "unlimited miles" : `${limit.toLocaleString("en-US")} miles`}` });
  }
  const warranty = terms.length ? terms.map((x) => `${x.label}: ${x.text}`).join("; ") : null;
  const notes = [
    "The ad says it's maker-certified. Ask for the certification in writing: the completed inspection checklist and the warranty booklet with its terms.",
  ];
  // The longest mileage limit, against this car's miles, if it counts from the car's first sale.
  const longest = terms.filter((x) => x.miles != null && x.years >= 3).sort((a, b) => b.miles! - a.miles!)[0];
  if (longest && miles != null) {
    const left = longest.miles! - miles;
    notes.push(
      left > 0
        ? `Ask when each warranty starts. Some count from the car's first sale and its total miles, not from your purchase: if the ${longest.label.toLowerCase()} warranty does, its ${longest.miles!.toLocaleString("en-US")}-mile limit leaves at most ${left.toLocaleString("en-US")} miles of cover on this car (${miles.toLocaleString("en-US")} now).`
        : `Ask when each warranty starts. If the ${longest.label.toLowerCase()} warranty counts the car's total miles, its ${longest.miles!.toLocaleString("en-US")}-mile limit has already passed (${miles.toLocaleString("en-US")} now).`,
    );
  } else {
    notes.push("Ask when each warranty starts: some count from the car's first sale, not the day you buy it, so less may be left than it sounds.");
  }
  return { name, warranty, notes };
}

/** A dealer's ad that says the car is maker-certified (Toyota Gold Certified, Certified Pre-Owned...). */
export function makerCertified(text: string, sellerType: string): boolean {
  return sellerType === "dealer" && certified(text, null) !== null;
}

export function buyerProtection(i: ProtectionInput): Protection {
  const hay = `${i.sourceHost ?? ""} ${i.text}`;
  const big = PATTERNS.find(([re]) => re.test(hay))?.[1];
  if (big) return { source: big, ...BIG_SELLERS[big] };
  // No end boundary: Autotrader's page runs the words together ("Private Seller ExchangeVerified Vehicle").
  if (i.sellerType !== "dealer" && /\bprivate seller exchange/i.test(i.text)) return { source: "psx", ...PSX };

  // Anchored, so "notfacebook.com" or "facebook.com.example" don't count.
  if (i.sellerType === "private" || /(^|\.)(facebook\.com|craigslist\.org)$/i.test(i.sourceHost ?? "")) {
    return {
      source: "private",
      name: "Private seller",
      level: "none",
      returns: null,
      warranty: null,
      notes: [
        "Sold as-is: no return and no warranty. The FTC Buyers Guide rule only covers dealers.",
        "Your protection is checking before you pay: a mechanic's inspection, the title in person, and payment at a bank.",
      ],
      links: [FTC],
    };
  }

  const nj = njDealerWarranty(i);
  const notes = [
    "Every dealer car must show an FTC Buyers Guide on the window saying \"As Is\" or listing the warranty. It becomes part of your contract.",
    nj
      ? `If the dealer is in New Jersey, state law requires at least a ${nj} warranty on this car.`
      : "In New Jersey, dealers must include a short warranty on cars up to 7 model years old with ≤ 100,000 miles costing $3,000+.",
  ];
  const cpo = i.sellerType === "dealer" ? certified(i.text, i.miles) : null;
  if (cpo) {
    return { source: "certified", name: cpo.name, level: "some", returns: null, warranty: cpo.warranty, notes: [...cpo.notes, ...notes], links: [FTC, NJ_LAW] };
  }
  return {
    source: i.sellerType === "dealer" ? "dealer" : "unknown",
    name: i.sellerType === "dealer" ? "Dealer" : "Seller type unknown",
    level: i.sellerType === "dealer" ? "some" : "unknown",
    returns: null,
    warranty: null,
    notes: i.sellerType === "dealer" ? notes : ["Ask whether this is a dealer or a private sale: the protections are very different.", ...notes],
    links: [FTC, NJ_LAW],
  };
}
