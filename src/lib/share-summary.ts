/**
 * A plain-text summary of a check, to send a friend, family member or mechanic.
 * Privacy-safe: no pasted ad text, seller names or numbers, only the car, the
 * verdict, the main warnings and what's still unknown. The link reopens the
 * check only when there's a VIN (a VIN identifies a car, not a person).
 */

import { AREA_LABEL, type Decision } from "@/lib/decision";

const SITE = "https://vinverdict.vercel.app";
const WORD = { stop: "Warning", verify: "Check", ok: "OK so far", unchecked: "Not checked" } as const;

export function shareSummary(car: { name: string; price: number | null; miles: number | null; vin: string | null }, d: Decision): string {
  const facts = [car.price != null ? `$${car.price.toLocaleString("en-US")}` : null, car.miles != null ? `${car.miles.toLocaleString("en-US")} miles` : null]
    .filter(Boolean)
    .join(", ");
  const warnings = d.findings.filter((f) => f.severity !== "note").slice(0, 4);
  const unknown = d.areas.flatMap((a) => a.unknown).slice(0, 4);
  return [
    `VinVerdict check: ${car.name}${facts ? ` (${facts})` : ""}`,
    `Next step: ${d.title}`,
    "",
    // "Not checked: paste the ad…" already says its status.
    ...d.areas.map((a) => `- ${AREA_LABEL[a.area]}: ${a.line.startsWith(WORD[a.status]) ? a.line : `${WORD[a.status]}, ${a.line}`}`),
    ...(warnings.length ? ["", "Main warnings:", ...warnings.map((f) => `- ${f.title}`)] : []),
    ...(unknown.length ? ["", "Still unknown:", ...unknown.map((u) => `- ${u}`)] : []),
    "",
    car.vin ? `Check it yourself: ${SITE}/#listing=${car.vin}` : `Check a listing yourself: ${SITE}`,
  ].join("\n");
}
