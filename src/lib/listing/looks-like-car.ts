import { parseListing } from "./parse";

/**
 * Is this worth a check at all? A listing names the car (make or model), or carries a VIN (even a
 * mistyped one: the check explains the typo) or a link. Random text, or the text read from a photo
 * of something that isn't a listing, is told so before it costs a visitor one of their checks.
 */
export function looksLikeCar(text: string): boolean {
  const l = parseListing(text);
  return l.kind !== "text" || !!(l.vin || l.make || l.model) || /\b[A-HJ-NPR-Z0-9]{17}\b/i.test(text) || /\bvin\b/i.test(text);
}

export const NOT_A_CAR = "That doesn't look like a car listing or a VIN, so nothing was checked. Paste the listing's text or link, or the car's 17-character VIN, or take screenshots of the listing.";
