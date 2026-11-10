/**
 * The home page's "Spot the scam" practice ad. Made up (it says so on the
 * page), but every flagged phrase is caught by VinVerdict's real scam rules
 * (src/lib/scam/rules.ts); scam-ad.test.ts checks that.
 */

export type AdPart = { text: string; rule?: string };

export const SCAM_AD = {
  title: "2019 Honda Civic EX",
  price: 4_500,
  miles: 31_000,
  seller: "Jenna R.",
  /** The price itself is a flag once it's compared with the real market (recorded data). */
  priceRule: "too-good-plus-flags",
  parts: [
    { text: "Selling my Civic EX, 31,000 miles, clean title, new tires last spring. " },
    { text: "I'm deployed overseas", rule: "seller-remote" },
    { text: " so I can't meet you, but " },
    { text: "the car is at a shipping company", rule: "shipping-only" },
    { text: " and they deliver to your door. To hold it, " },
    { text: "send a $500 deposit in gift cards", rule: "pay-gift-card" },
    { text: ". Sorry, " },
    { text: "no test drives", rule: "no-inspection" },
    { text: ". " },
    { text: "I need to sell it this week", rule: "rushed" },
    { text: ", first come first served!" },
  ] as AdPart[],
};

export const scamAdText = () => `${SCAM_AD.title} $${SCAM_AD.price.toLocaleString("en-US")} ${SCAM_AD.parts.map((p) => p.text).join("")}`;
