/**
 * Fixed guidance on the result page, written once as data so the page and the
 * downloadable report always say the same thing. Pure.
 */

import type { Analysis } from "@/lib/analyze";
import { STATE_TAX } from "@/lib/costs/stateTax";
import { STATES, type StateCode } from "@/lib/geo/zip";
import type { SellerType } from "@/lib/listing/parse";
import { liveSeller, type LiveListing } from "@/lib/live/parse";
import { REF } from "@/lib/sources";
import type { Line } from "./text";

// NJ private-sale steps, from NJ MVC "Transferring ownership" (checked 2026-11-09).
export const NJ_TRANSFER = "https://www.nj.gov/mvc/vehicles/transowner.htm";

export type StepGroup = { title: string; steps: Line[]; note?: Line };

/** "Before you pay": the checks and paperwork for buying day. */
export function buyingDay(vin: string | null, seller: SellerType, state: StateCode): StepGroup[] {
  const groups: StepGroup[] = [
    {
      title: "Check the car",
      steps: [
        ["Run the free checks in ", { label: "Check it yourself", href: "#check-yourself" }, vin ? ` with VIN ${vin}` : "", ": open recalls on NHTSA, theft and insurance write-offs on NICB VINCheck."],
        ["A pre-purchase inspection by your own mechanic ($100–250). Give them the list from the Inspection list tab."],
        ["On the test drive: start it cold, drive at highway speed, look for warning lights, and check the odometer matches the listing and its earlier readings."],
      ],
    },
  ];
  if (seller === "dealer") {
    groups.push({
      title: "At the dealer",
      steps: [
        ['Read the Buyers Guide on the window: it says "As Is" or lists the warranty.'],
        ["Ask for the out-the-door price in writing and read the buyer's order line by line. Say no to add-ons you didn't ask for."],
      ],
    });
    return groups;
  }
  groups.push({
    title: "On the day",
    steps: [
      ["Before you drive out, ask for two fresh photos: the odometer, and the VIN sticker on the driver's door with a paper showing today's date. Someone using stolen listing photos can't send them, and the VIN must match the listing."],
      ["Meet in daylight somewhere public. Many police stations have a safe exchange spot."],
      ['See the title in person. The name must match the seller\'s photo ID, and the VIN must match the dashboard and the driver\'s door sticker. No "Salvage", "Rebuilt" or "Flood" on it. A title issued in the last few weeks needs a good reason.'],
      ["If there's a loan on the car, finish the deal at the seller's bank or pay the lender directly, and get the original lien release on the lender's letterhead."],
      ["Pay at the handover with a cashier's check or a bank transfer. Never a deposit before you've seen the car, gift cards or crypto."],
    ],
  });
  if (state === "NJ") {
    groups.push({
      title: "Paperwork in New Jersey",
      steps: [
        ["The seller signs the back of the title and gives you a bill of sale with your name and address, the date, the odometer reading and the price. You sign the buyer's section."],
        ["The seller keeps the license plates. Get insurance before you drive it, and plan how to get it home."],
        ["Within 10 working days, go to an MVC agency in person with the signed title, your ID and proof of NJ insurance ($25 penalty after that). You pay the 6.625% sales tax and get your plates there."],
      ],
      note: ["From ", { label: "NJ MVC: transferring ownership", href: NJ_TRANSFER }, ". Your state comes from the ZIP you entered."],
    });
  } else {
    groups.push({
      title: "Paperwork",
      steps: [["Get the signed title and a bill of sale with the date, price and odometer reading. Check ", { label: `${STATES[state]}'s DMV`, href: STATE_TAX[state].dmv }, " for the deadline to transfer it and where to pay the sales tax."]],
    });
  }
  return groups;
}

/** "Is this dealer real?" steps. */
export function dealerCheck(name: string | null): { intro: Line; steps: Line[] } {
  const q = encodeURIComponent(name ? `${name} car dealer` : "car dealer near me");
  const reviews = encodeURIComponent(`${name ?? "dealer name"} scam OR complaint OR review`);
  return {
    intro: ["Scammers clone real dealers' websites (logos, cars, photos) and take payment for cars that don't exist. ", { label: REF.ftcFakeDealer.name, href: REF.ftcFakeDealer.href }],
    steps: [
      ["Find the dealer yourself on ", { label: "Google Maps", href: `https://www.google.com/maps/search/${q}` }, ", not through the ad's links. Its website address should match the one you're buying from."],
      ["Call the number you found there (not the one in the ad) and ask them to confirm this exact car, by VIN or stock number."],
      ['Search the name with "scam" or "complaint": ', { label: "search now", href: `https://www.google.com/search?q=${reviews}` }, "."],
      ["See the car at the dealership, or send a mobile inspection service if it's far. A dealer that refuses both is a warning sign."],
      ['Never pay by "wire transfer only" before you\'ve seen the car. Pay at the dealership, with a signed buyer\'s order.'],
    ],
  };
}

/** "Are the photos really this car?": how to search them and how to read what comes back. */
export function photoCheck(photos: string[], dealer: boolean): { photos: { src: string; lens: string; bing: string }[]; steps: Line[]; howToRead: string } {
  const enc = encodeURIComponent;
  return {
    photos: photos.map((src) => ({
      src,
      lens: `https://lens.google.com/uploadbyurl?url=${enc(src)}`,
      bing: `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${enc(src)}`,
    })),
    steps: [
      ["On a phone: in the Facebook or Craigslist app, open a photo, long-press it (or take a screenshot) and choose Search with Google Lens."],
      ["On a computer: right-click a photo and choose Search image with Google, or upload it at ", { label: "Google Lens", href: "https://lens.google.com/" }, "."],
    ],
    howToRead: `${dealer ? "A dealer's photos on its own site and on listing sites is normal. " : ""}Worry if the same photos show a different price, a different city, an older date, a different seller, or a dealer's watermark on a private ad. Then ask the seller for a new photo of the car next to a handwritten note: the message under "Ask the seller" has one ready.`,
  };
}

const USAGE_LABEL: Record<string, string | null> = { personal: "Personal", fleet: "Fleet / commercial", rental: "Rental", unknown: null };
const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : null);
const money = (n: number | null) => (n == null ? null : `$${n.toLocaleString("en-US")}`);
const mi = (n: number | null) => (n == null ? null : `${n.toLocaleString("en-US")} mi`);

/** "The car": what the listing says, what the VIN decodes to, and what the live listing says. Rows with nothing are left out. */
export function carFactRows(a: Analysis, live: LiveListing | null): [string, string | null, string | null, string | null][] {
  const l = a.listing;
  const d = a.decoded;
  const vinStatus = !l.vin ? null : a.vinCheck?.ok ? (d?.clean === false ? "Decoded with warnings" : "Valid") : "Invalid check digit";
  // A feed's "0 accidents" isn't a history report, so it's never shown as "none".
  const liveAccidents = live?.accidentCount ? `${live.accidentCount} reported` : live ? "Not confirmed" : null;
  const rows: [string, string | null, string | null, string | null][] = [
    ["Year", l.year?.toString() ?? null, d?.year?.toString() ?? null, live?.year?.toString() ?? null],
    ["Make", l.make, d?.make ?? null, live?.make ?? null],
    ["Model", l.model, d?.model ?? null, live?.model ?? null],
    ["Trim", null, d?.trim ?? null, live?.trim ?? null],
    ["Body", null, d?.body ?? null, null],
    ["Transmission", l.transmission === "unknown" ? null : cap(l.transmission), d?.transmission ?? null, null],
    ["Drive", null, d?.driveType ?? null, null],
    ["Fuel", null, d?.fuel ?? null, null],
    ["Price", money(l.price), null, money(live?.price ?? null)],
    ["Miles", mi(l.miles), null, mi(live?.miles ?? null)],
    ["Title", l.titleStatus === "unknown" ? null : cap(l.titleStatus), null, live?.cleanTitle ? "Carfax clean-title flag on the listing" : null],
    ["Accidents", l.accident === "unknown" ? null : l.accident === "none" ? "None mentioned" : "Reported", null, liveAccidents],
    ["Exterior", cap(l.exteriorColor), null, live?.exteriorColor ?? null],
    ["Owners", l.ownerCount?.toString() ?? null, null, null],
    ["Prior use", USAGE_LABEL[l.usage] ?? null, null, live && (live.usage === "fleet" || live.usage === "rental") ? USAGE_LABEL[live.usage] : null],
    ["Seller", l.sellerType === "unknown" ? null : cap(l.sellerType), null, live ? (liveSeller(live).mismatch ? `unclear (the feed's name, ${live.sellerName}, doesn't match its link)` : live.sellerName ?? (live.sellerType !== "unknown" ? cap(live.sellerType) : null)) : null],
    ["Distance", mi(l.distanceMiles), null, null],
    ["VIN", l.vin, vinStatus, null],
  ];
  return rows.filter(([, x, y, z]) => x || y || z);
}
