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
} satisfies Record<string, SourceRef>;

/** Warnings that point at another part of the result instead of a website. */
export const ON_PAGE: Record<string, { name: string; anchor: string }> = {
  "history-rollback": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-miles-lower": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-dealer-recent": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-turnover": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-price-cut": { name: "this car's listing history, below", anchor: "#listing-history" },
  "history-two-sellers": { name: "this car's listing history, below", anchor: "#listing-history" },
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
