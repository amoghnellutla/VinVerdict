/** How a saved car's MPG, hybrid or not, title and accidents read in My cars, Compare and a car's page. Pure. */

import type { CarFacts } from "@/lib/cars/store";
import { POWERTRAIN_TEXT } from "@/lib/cars/draft";

/** "30 mpg (27 city / 35 hwy)", or null when none was saved. */
export function mpgText(f: CarFacts): string | null {
  const m = f.mpg;
  if (!m) return null;
  const parts = m.city != null && m.hwy != null ? ` (${m.city} city / ${m.hwy} hwy)` : "";
  if (m.comb != null) return `${m.comb} mpg${parts}`;
  return parts ? parts.slice(2, -1) + " mpg" : null;
}

export const powertrainText = (f: CarFacts): string | null => (f.powertrain ? POWERTRAIN_TEXT[f.powertrain] : null);

const TITLE: Record<string, string> = { clean: "Clean title", salvage: "Salvage title", rebuilt: "Rebuilt title", flood: "Flood title", lemon: "Lemon buyback", branded: "Branded title" };
export const titleText = (f: CarFacts): string => TITLE[f.title ?? ""] ?? "Title not known";

export const accidentText = (f: CarFacts): string => (f.accident === "none" ? "No accidents reported" : f.accident === "reported" ? "Accident reported" : "Accidents not known");

/** Clean title and no accidents reported: the combination the owner asked to see at a glance. */
export const cleanRecord = (f: CarFacts): boolean => f.title === "clean" && f.accident === "none";
