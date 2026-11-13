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

/** A door-sticker barcode (Code 39 / Data Matrix): some add a leading "I" (import marker) or spaces. */
export function barcodeVin(raw: string): string | null {
  let v = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length === 18 && v.startsWith("I")) v = v.slice(1);
  return v.length === 17 && checkVin(v).ok ? v : null;
}

/**
 * Valid VINs in text read from a photo. OCR mixes up O/0, I/1 and Q/0, and a VIN never contains
 * I, O or Q, so those are corrected; spaces and dashes inside a line are ignored. Only VINs whose
 * check digit works are returned (a misread almost never passes it), in the order found.
 */
export function vinsInText(text: string): string[] {
  const out: string[] = [];
  const fix = (s: string) => s.toUpperCase().replace(/[OQ]/g, "0").replace(/[I|]/g, "1");
  for (const line of text.split(/\n+/)) {
    for (const chunk of [line, ...line.split(/[^A-Za-z0-9 -]+/)]) {
      const compact = fix(chunk.replace(/[\s-]+/g, "")).replace(/[^A-Z0-9]/g, "");
      for (let i = 0; i + 17 <= compact.length; i++) {
        const v = compact.slice(i, i + 17);
        if (!out.includes(v) && checkVin(v).ok) out.push(v);
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
