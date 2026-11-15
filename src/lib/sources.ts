/**
 * Where every claim on a result comes from, so anyone can check it.
 * Pure and browser-safe.
 *
 * Two kinds of source:
 *  - REF: official guidance a warning is based on (FBI, FTC, NICB, NHTSA…).
 *    Each URL was checked on 2026-11-09 (FTC and nhtsa.gov block scripts,
 *    so those were checked by search-engine index instead).
 *  - raw-data links: the exact public API request VinVerdict made, so the
 *    numbers on the page can be compared with the government's own answer.
 */

export type SourceRef = { name: string; href: string };

export const SOURCES_CHECKED = "2026-11-09";

export const REF = {
  ic3: { name: "FBI IC3: fraudulent online vehicle sales", href: "https://www.ic3.gov/PSA/2018/PSA180117" },
  ftcPay: { name: "FTC: spot a scam by how they ask you to pay", href: "https://consumer.ftc.gov/consumer-alerts/2026/07/way-spot-scams-how-someone-asks-you-pay" },
  ftcWire: { name: "FTC: wire transfer scams", href: "https://consumer.ftc.gov/all-scams/wire-transfer-scams" },
  ftcApps: { name: "FTC: payment apps like Venmo, Cash App and Zelle", href: "https://consumer.ftc.gov/consumer-alerts/2023/08/do-you-use-payment-apps-venmo-cashapp-or-zelle-read" },
  ftcDealer: { name: "FTC: buying a used car from a dealer", href: "https://consumer.ftc.gov/articles/buying-used-car-dealer" },
  nicb: { name: "NICB: buying a used vehicle", href: "https://www.nicb.org/prevent-fraud-theft/buying-vehicle" },
  nicbVincheck: { name: "NICB VINCheck", href: "https://www.nicb.org/vincheck" },
  nmvtis: { name: "NMVTIS (U.S. Department of Justice): title history", href: "https://vehiclehistory.bja.ojp.gov/" },
  curbstoning: { name: "Minnesota Attorney General: curbstoning", href: "https://www.ag.state.mn.us/consumer/Publications/Curbstoning.asp" },
  odometer: { name: "NHTSA: protect yourself from odometer fraud", href: "https://www.nhtsa.gov/press-releases/consumer-advisory-tips-nhtsa-protect-against-odometer-fraud" },
  fhwa: { name: "FHWA: average miles driven per year", href: "https://www.fhwa.dot.gov/ohim/onh00/bar8.htm" },
  vinRule: { name: "49 CFR Part 565: the federal VIN standard", href: "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-565" },
  nhtsaRecalls: { name: "NHTSA recall lookup", href: "https://www.nhtsa.gov/recalls" },
  ftcFakeDealer: { name: "FTC: scammers are spoofing car dealership websites (Sept 2026)", href: "https://consumer.ftc.gov/consumer-alerts/2026/09/scammers-are-spoofing-car-dealership-websites-what-you-need-know" },
  cargurusAccident: { name: "CarGurus study (2012): a past accident lowers value about 3–12%", href: "https://www.cargurus.com/press/20121213.html" },
  // Checked 2026-11-14: "You can usually buy the vehicle you want without any add-ons"; "ask for the out-the-door prices in writing".
  ftcAddOns: { name: "FTC: you can usually buy the car without any add-ons", href: "https://consumer.ftc.gov/buying-used-car-dealer" },
  // Checked 2026-11-14: "Negotiate the APR … just as you would negotiate the price of the car. The APR you negotiate with the
  // dealer usually includes an amount that compensates the dealer for handling the financing."
  ftcFinancing: { name: "FTC: financing or leasing a car (the APR is negotiable)", href: "https://consumer.ftc.gov/financing-or-leasing-car" },
  // Checked 2026-11-14: "Generally you cannot be required to buy an extended warranty, GAP insurance, or credit insurance."
  // Checked 2026-11-14: "The dealer may charge you up to $175 for this service" (processing registration and title documents).
  nyDocFee: { name: "NY DMV: a dealer may charge up to $175 to process registration and title", href: "https://dmv.ny.gov/brochure/let-the-buyer-be-aware" },
  // Checked 2026-11-14: RCW 46.70.180(2)(a)(ii): "an amount not to exceed $200 per vehicle sale or lease"; it must be disclosed as "a negotiable fee".
  waDocFee: { name: "RCW 46.70.180: Washington's documentary service fee, at most $200 and negotiable", href: "https://app.leg.wa.gov/RCW/default.aspx?cite=46.70.180" },
  // Checked 2026-11-14: Minn. Stat. 168.27 subd. 31(b): from July 1, 2025 "the maximum fee is the lesser of $350 or an amount equal to ten percent of the value of the sale or lease".
  mnDocFee: { name: "Minn. Stat. 168.27, subd. 31: Minnesota's documentary fee, at most $350 or 10% of the sale", href: "https://www.revisor.mn.gov/statutes/cite/168.27" },
  // Checked 2026-11-14: Md. Transportation § 15-311.1(b)(1)(ii): "$800 on and after July 1, 2024".
  mdDocFee: { name: "Md. Transportation § 15-311.1: Maryland's dealer processing charge, at most $800", href: "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gtr&section=15-311.1&enactments=false" },
  // Checked 2026-11-15: DMV handbook 3.030 (VC 4456.5): "shall not exceed eighty-five dollars ($85)" with a private industry
  // partner agreement, "seventy dollars ($70)" without (SB 791, which would have raised it, was vetoed in October 2025).
  caDocFee: { name: "California DMV (Vehicle Code 4456.5): a dealer's document processing charge, at most $85 ($70 without a DMV partner agreement)", href: "https://www.dmv.ca.gov/portal/handbook/vehicle-industry-registration-procedures-manual-2/collection-and-payment-of-fees-and-penalties/dealers-document-preparation-and-electronic-filing-service-fee/" },
  // Checked 2026-11-15: ORS 822.043(4): "in no case shall the document processing fee ... exceed: (a) $250, if the vehicle
  // dealer uses an integrator; or (b) $200, if the vehicle dealer does not use an integrator."
  orDocFee: { name: "ORS 822.043: Oregon's document processing fee, at most $250 ($200 without an integrator)", href: "https://www.oregonlegislature.gov/bills_laws/ors/ors822.html" },
  // Checked 2026-11-15: Iowa Code 322.19A(2): "a documentary fee not to exceed one hundred eighty dollars"; (3): the dealer
  // "shall include the fee in the price of the motor vehicle" and disclose it in any advertised price.
  iaDocFee: { name: "Iowa Code 322.19A: Iowa's documentary fee, at most $180, and included in the advertised price", href: "https://www.legis.iowa.gov/docs/code/322.19A.pdf" },
  // Checked 2026-11-15: 15 U.S.C. § 1232(f): the label lists "the retail price of such automobile suggested by the manufacturer" and "the amount charged, if any, to such dealer for the transportation of such automobile".
  monroney: { name: "15 U.S.C. § 1232: a new car's window sticker lists the maker's price and its destination charge", href: "https://www.law.cornell.edu/uscode/text/15/1232" },
  // Checked 2026-11-15: "Dealers have to display a Buyers Guide in every used car they offer for sale"; it says "whether the car is being sold 'as is' or with a warranty"; "It will override anything in your sales contract."
  ftcBuyersGuide: { name: "FTC: the Buyers Guide on every used car (as is or warranty), which overrides the contract", href: "https://consumer.ftc.gov/buying-used-car-dealer" },
  cfpbAddOns: { name: "CFPB: an extended warranty, GAP or credit insurance generally can't be required", href: "https://www.consumerfinance.gov/ask-cfpb/am-i-required-to-purchase-an-extended-warranty-or-guaranteed-asset-protection-gap-insurance-from-a-lender-or-dealer-to-get-an-auto-loan-en-807/" },
} satisfies Record<string, SourceRef>;

/** Warnings that point at another part of the result instead of a website. */
export const ON_PAGE: Record<string, { name: string; anchor: string }> = {
  "history-rollback": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-miles-lower": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-dealer-recent": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-turnover": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-price-cut": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-two-sellers": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-moved": { name: "this car's listing history, below", anchor: "#listing-history" },
  "live-accident": { name: "the live listing, below", anchor: "#price-check" },
  "live-cloned": { name: "the live listing, below", anchor: "#price-check" },
  "live-dealer-too": { name: "the live listing, below", anchor: "#price-check" },
  "live-price-differs": { name: "the live listing, below", anchor: "#price-check" },
  "live-miles-lower": { name: "the live listing, below", anchor: "#price-check" },
  "live-ended": { name: "the live listing, below", anchor: "#price-check" },
  "report-damage": { name: "the history report you checked", anchor: "#history-report" },
  "report-title": { name: "the history report you checked", anchor: "#history-report" },
  "report-commercial": { name: "the history report you checked", anchor: "#history-report" },
  "proof-reports-differ": { name: "the proof you attached", anchor: "#check-yourself" },
  "proof-stolen": { name: "the proof you attached", anchor: "#check-yourself" },
  "proof-total-loss": { name: "the proof you attached", anchor: "#check-yourself" },
  "proof-auction": { name: "the proof you attached", anchor: "#check-yourself" },
  "proof-odometer": { name: "the proof you attached", anchor: "#check-yourself" },
  "proof-open-recalls": { name: "the proof you attached", anchor: "#check-yourself" },
  "proof-miles-lower": { name: "the proof you attached", anchor: "#check-yourself" },
};

/** The official guidance behind each scam/safety rule (src/lib/scam/rules.ts ids). */
export const RULE_SOURCE: Record<string, SourceRef> = {
  "title-brand": REF.nmvtis,
  "accident-reported": REF.nicb,
  "accident-unknown": REF.nicbVincheck,
  "no-vin": REF.nicb,
  "vin-invalid": REF.vinRule,
  "pay-gift-card": REF.ftcPay,
  "pay-wire": REF.ftcWire,
  "pay-app-upfront": REF.ftcApps,
  "pay-app": REF.ftcApps,
  "deposit-first": REF.ic3,
  "shipping-only": REF.ic3,
  "seller-remote": REF.ic3,
  auction: REF.nicb,
  "no-inspection": REF.ftcDealer,
  curbstoning: REF.curbstoning,
  "same-phone": REF.curbstoning,
  "title-washing": REF.nicb,
  rushed: REF.ic3,
  "mileage-low": REF.odometer,
  "odometer-unknown": REF.odometer,
  "model-conflict": REF.nicb,
  "high-miles": REF.fhwa,
  "too-good": REF.ic3,
  "too-good-plus-flags": REF.ic3,
};

// ---------- Raw public data: the exact requests VinVerdict makes ----------

const enc = encodeURIComponent;
type Ymm = { year: number; make: string; model: string };

export const raw = {
  decode: (vin: string) => `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${enc(vin)}?format=json`,
  recalls: (v: Ymm) => `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${enc(v.make)}&model=${enc(v.model)}&modelYear=${v.year}`,
  recall: (campaign: string) => `https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber=${enc(campaign)}`,
  complaints: (v: Ymm) => `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${enc(v.make)}&model=${enc(v.model)}&modelYear=${v.year}`,
  complaint: (odi: number) => `https://api.nhtsa.gov/complaints/odinumber?odinumber=${odi}`,
  ratings: (v: Ymm) => `https://api.nhtsa.gov/SafetyRatings/modelyear/${v.year}/make/${enc(v.make)}/model/${enc(v.model)}`,
  rating: (vehicleId: number) => `https://api.nhtsa.gov/SafetyRatings/VehicleId/${vehicleId}`,
  fuel: (id: number) => `https://www.fueleconomy.gov/feg/noframes/${id}.shtml`,
};

// ---------- "Check it yourself": free outside checks for one VIN ----------

export type VerifyLink = {
  name: string;
  href: string;
  what: string;
  cost: string;
  vinInLink: boolean;
  /** The proof row a screenshot of this check goes in (null: nothing to attach). */
  kind: "nhtsa" | "maker" | "nicb" | "nmvtis" | "google" | null;
};

/** Maker's own recall/warranty lookup (pages checked 2026-11-09). */
const MAKER_RECALLS: Record<string, SourceRef> = {
  toyota: { name: "Toyota recall lookup", href: "https://www.toyota.com/recall" },
  lexus: { name: "Lexus recall lookup", href: "https://www.lexus.com/recall" },
  honda: { name: "Honda recall lookup", href: "https://owners.honda.com/recalls" },
  acura: { name: "Acura recall lookup", href: "https://owners.honda.com/recalls" },
};

export function verifyLinks(vin: string, make: string | null): VerifyLink[] {
  const links: VerifyLink[] = [
    {
      name: "NHTSA recall lookup",
      href: REF.nhtsaRecalls.href,
      what: "Recalls that haven't been fixed on this exact car. The list on this page covers every car of this model and year.",
      cost: "Free, official",
      vinInLink: false,
      kind: "nhtsa",
    },
    {
      name: "NICB VINCheck",
      href: REF.nicbVincheck.href,
      what: "Reported stolen, or written off by an insurer (salvage or total loss).",
      cost: "Free",
      vinInLink: false,
      kind: "nicb",
    },
    {
      name: "Search the VIN on Google",
      href: `https://www.google.com/search?q=${enc(`"${vin}"`)}`,
      what: "Old listings and auction pages. Photos from a salvage auction show damage a seller won't mention.",
      cost: "Free",
      vinInLink: true,
      kind: "google",
    },
    {
      name: "NMVTIS title history",
      href: REF.nmvtis.href,
      what: "Title brands (salvage, flood, junk) and odometer readings from state DMV records, through approved providers.",
      cost: "A few dollars",
      vinInLink: false,
      kind: "nmvtis",
    },
    {
      name: "NHTSA VIN decode (raw data)",
      href: raw.decode(vin),
      what: "The government's own decode of this VIN, the same answer VinVerdict compares with the listing.",
      cost: "Free, official",
      vinInLink: true,
      kind: null,
    },
  ];
  const maker = make ? MAKER_RECALLS[make.toLowerCase()] : undefined;
  if (maker) {
    links.splice(1, 0, {
      name: maker.name,
      href: maker.href,
      what: "The maker's own record of open recalls and service campaigns for this VIN.",
      cost: "Free, official",
      vinInLink: false,
      kind: "maker",
    });
  }
  return links;
}
