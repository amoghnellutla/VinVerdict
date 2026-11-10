/**
 * Buyer protection badge (PLAN.md feature O): what return window or warranty
 * comes with this seller. Policies checked on the sellers' own sites on
 * 2026-11-09; they change, so each links to its source. Pure.
 */

export const PROTECTION_AS_OF = "2026-11-09";

export type ProtectionSource = "carmax" | "carvana" | "enterprise" | "hertz" | "psx" | "dealer" | "private" | "unknown";

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
