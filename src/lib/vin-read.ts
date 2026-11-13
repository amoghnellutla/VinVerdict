/**
 * Reading a VIN off the car itself (camera barcode or a photo read on the device) and checking
 * that every place the VIN appears agrees. Pure.
 *
 * The VIN is on the windshield plate, the driver's door sticker and the title, and it must be
 * the same everywhere and match the ad. A different VIN on one of them is the classic sign of a
 * cloned or stolen car (a good VIN copied onto a stolen one) or a swapped title.
 */

import type { RuleHit } from "@/lib/scam/rules";
import { checkVin } from "@/lib/vin";

/** Model-year codes (10th character): no I, O, Q, U, Z or 0. */
const YEAR_CODE = /^[A-HJ-NPR-TV-Y1-9]$/;

/**
 * Could this be a real VIN? The check digit alone lets about 1 random string in 11 through, so a
 * misread of anything (a random object, a logo) could pass. A real VIN also has a valid model-year
 * code in position 10, digits in the last four positions (the serial number), and doesn't start
 * with 0. The page still confirms it with NHTSA's decoder before using it.
 */
export function plausibleVin(v: string): boolean {
  return v.length === 17 && checkVin(v).ok && YEAR_CODE.test(v[9]) && /^\d{4}$/.test(v.slice(13)) && v[0] !== "0";
}

/** A door-sticker barcode (Code 39 / Data Matrix): some add a leading "I" (import marker) or spaces. */
export function barcodeVin(raw: string): string | null {
  let v = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length === 18 && v.startsWith("I")) v = v.slice(1);
  return plausibleVin(v) ? v : null;
}

/**
 * VINs in text read from a photo. A VIN is printed as one 17-character word ("4T1B11HK8JU145889"),
 * sometimes after "VIN" with no space, or in a few groups ("4T1B 11HK 8JU1 45889"); nothing else
 * counts (no sliding through longer text, which would "find" a VIN in any garbled read). OCR mixes
 * up O/0, I/1 and Q/0, and a VIN never has I, O or Q, so those are corrected. Each must pass
 * `plausibleVin`. In the order found.
 */
export function vinsInText(text: string): string[] {
  const out: string[] = [];
  const fix = (s: string) => s.replace(/[OQ]/g, "0").replace(/I/g, "1");
  const add = (raw: string) => {
    const v = fix(raw);
    if (!out.includes(v) && plausibleVin(v)) out.push(v);
  };
  for (const line of text.toUpperCase().split(/\n+/)) {
    const words = line.split(/[^A-Z0-9|]+/).map((w) => w.replace(/\|/g, "1")).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length === 17) add(w);
      else if (w.length === 20 && w.startsWith("VIN")) add(w.slice(3));
      // Groups: consecutive short words that add up to exactly 17 (at most 6 groups).
      let joined = "";
      for (let j = i; j < Math.min(words.length, i + 6) && joined.length < 17; j++) {
        if (words[j].length > 8) break;
        joined += words[j];
        if (joined.length === 17 && j > i) add(joined);
      }
    }
  }
  return out;
}

export type VinPlace = "plate" | "door" | "title" | "ad";
export const VIN_PLACE: Record<VinPlace, string> = { plate: "windshield plate", door: "door sticker", title: "title", ad: "ad" };

/**
 * Do the VINs agree? A mismatch between any two is a serious warning; all the same (at least two
 * places on the car or its papers) is good evidence. One place alone says nothing yet.
 */
export function matchVins(vins: Partial<Record<VinPlace, string | null>>): RuleHit[] {
  const seen = (Object.entries(vins) as [VinPlace, string | null | undefined][]).filter((e): e is [VinPlace, string] => !!e[1]);
  const physical = seen.filter(([p]) => p !== "ad");
  if (!physical.length) return [];
  const distinct = [...new Set(seen.map(([, v]) => v))];
  if (distinct.length > 1) {
    const list = seen.map(([p, v]) => `${VIN_PLACE[p]} ${v}`).join("; ");
    return [{
      id: "proof-vin-mismatch",
      action: "hide",
      title: "The VINs don't match",
      reason: `${list}. The VIN must be identical on the windshield plate, the door sticker, the title and the ad. A mismatch is the classic sign of a cloned or stolen car or a swapped title: don't pay, and report it to the police or NICB.`,
    }];
  }
  if (seen.length < 2) return [];
  const places = seen.map(([p]) => VIN_PLACE[p]);
  return [{
    id: "proof-vin-match",
    action: "info",
    title: `VIN matches on the ${places.slice(0, -1).join(", ")}${places.length > 1 ? ` and ${places[places.length - 1]}` : ""}`,
    reason: "The same VIN in every place you checked: good evidence it isn't a cloned car or a swapped title.",
  }];
}
