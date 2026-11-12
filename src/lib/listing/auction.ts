/**
 * A wholesale dealer-auction record (Manheim, ADESA, ACV, OVE), as a buyer copies it
 * from the auction's page: "Run: C-080 VIN: … MMR: N/A Odometer: 126,360 (Actual)
 * CR: Grade: N/A Announcements: N/A Consignor: Piazza Auto Group". Pure.
 * Real case 34. Only fields the record states are read; nothing is guessed.
 */

import { checkVin } from "@/lib/vin";

export type AuctionRecord = {
  house: "Manheim" | "ADESA" | "ACV" | "OVE" | null;
  vin: string | null;
  /** The sold (hammer) price, when the record or the person states it. */
  soldPrice: number | null;
  saleDate: string | null;
  consignor: string | null;
  /** Condition report grade, e.g. "3.8", or null when "N/A". */
  crGrade: string | null;
  odometer: number | null;
  /** "(Actual)" next to the odometer: the seller declared the miles real. */
  odometerActual: boolean;
  /** Announcements (the auction's disclosures), when they say something. */
  announcements: string | null;
  run: string | null;
};

const MARKERS = /\bmmr\b|\bcr:? ?grade\b|\bconsignor\b|\brun:\s*[a-z]?-?\d|\bannouncements?:|\bmanheim\b|\badesa\b|\bacv auctions?\b|\bove\.com\b/gi;

const num = (s: string | undefined) => (s ? Number(s.replace(/[,$\s]/g, "")) : NaN);
const na = (s: string | undefined | null) => (!s || /^(n\/?a|none|-+)$/i.test(s.trim()) ? null : s.trim());

/** The record, when the text is one: at least two of the auction's own labels. */
export function parseAuctionRecord(text: string): AuctionRecord | null {
  const t = text.replace(/\s+/g, " ");
  if (new Set((t.match(MARKERS) ?? []).map((m) => m.toLowerCase().replace(/[^a-z]/g, ""))).size < 2) return null;
  const vinRaw = /\bVIN:?\s*([A-HJ-NPR-Z0-9]{17})\b/i.exec(t)?.[1]?.toUpperCase() ?? null;
  const odo = /\bodometer:?\s*([\d,]{1,9})\s*(\(actual\))?/i.exec(t);
  const sold = /\b(?:sold(?: price)?|sale price|hammer(?: price)?|high bid|winning bid)\s*(?:for|at|:)?\s*\$\s?([\d,]{3,9})\b/i.exec(t);
  const date = /\b(?:sale date|sold on|sold)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i.exec(t)?.[1] ?? null;
  const consignor = /\bconsignor:?\s*([A-Za-z0-9&'.,\- ]{2,60}?)(?=\s+(?:vehicle details|trim|vin|color|colour|odometer|announcements|seller|location|$))/i.exec(t)?.[1] ?? null;
  const cr = /\bcr:?\s*(?:grade:?\s*)?([0-5](?:\.\d)?|n\/a)\b/i.exec(t)?.[1];
  const ann = /\bannouncements?:?\s*(.{1,120}?)(?=\s+(?:scan vin|more like this|pdf|consignor|vehicle details|odometer|cr:|$))/i.exec(t)?.[1];
  const house = /\bmanheim\b/i.test(t) ? "Manheim" : /\badesa\b/i.test(t) ? "ADESA" : /\bacv\b/i.test(t) ? "ACV" : /\bove\.com\b/i.test(t) ? "OVE" : null;
  const odometer = num(odo?.[1]);
  const price = num(sold?.[1]);
  return {
    house,
    vin: vinRaw && checkVin(vinRaw).ok ? vinRaw : null,
    soldPrice: Number.isFinite(price) && price >= 100 ? price : null,
    saleDate: date,
    consignor: na(consignor),
    crGrade: na(cr),
    odometer: Number.isFinite(odometer) && odometer > 0 ? odometer : null,
    odometerActual: !!odo?.[2],
    announcements: na(ann),
    run: /\brun:\s*([a-z]?-?\d{1,4})\b/i.exec(t)?.[1]?.toUpperCase() ?? null,
  };
}
