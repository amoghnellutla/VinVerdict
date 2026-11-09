/**
 * Tidy text read from listing screenshots (OCR) before parsing. Fixes only
 * the misreads that change a number the analyzer needs; everything else is
 * left alone. Pure, so it's tested without a browser.
 */
import { checkVin } from "@/lib/vin";

// After a "VIN" label: up to three pieces split by a space or line break.
const LABELLED_VIN = /(\bVIN\b[:#\s]*)([A-HJ-NPR-Z0-9]{2,16}(?:[ \n][A-HJ-NPR-Z0-9]{1,15}){1,2})\b/gi;
// Anywhere: two uppercase pieces split by one space.
const SPLIT_VIN = /\b([A-HJ-NPR-Z0-9]{3,14}) ([A-HJ-NPR-Z0-9]{3,14})\b/g;

/** OCR often breaks a VIN at a line wrap or adds a space: join it back. */
function joinSplitVins(text: string): string {
  // After a label, join when that makes exactly 17 characters (a bad check digit is still flagged later).
  const labelled = text.replace(LABELLED_VIN, (m, label: string, vin: string) => {
    const joined = vin.replace(/[ \n]/g, "");
    return joined.length === 17 ? label + joined : m;
  });
  // Without a label, only when the joined text passes the VIN check digit.
  return labelled.replace(SPLIT_VIN, (m, a: string, b: string) => (a.length + b.length === 17 && checkVin(a + b).ok ? a + b : m));
}

export function cleanOcrText(raw: string): string {
  return joinSplitVins(
    raw
      // "$" misread as S or § right before a price: "S9,000" → "$9,000"
      .replace(/(^|[\s(:])[S§](\d{1,3}(?:,\d{3})+|\d{3,6})(?![\d,])/gm, "$1$$$2")
      // Thousands dot misread or written European-style: "100.000 miles", "$9.000"
      .replace(/(^|[\s$(])(\d{1,3})\.(\d{3})(?![\d.,])/gm, "$1$2,$3")
      // Curly quotes and odd spaces from the OCR engine
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[ \t ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}
