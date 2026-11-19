/**
 * The owner's Shortlist: only the models of the cars they've checked, each with the years of that model owners
 * reported the most problems with, and the owner's own cars marked on it. Pure.
 *
 * A saved car is matched to a guide model by make, then by model name with spaces and punctuation ignored
 * ("CR-V" = "CRV"), allowing a trim after it ("Accord Sport", "ES 350"). Cars whose model isn't in the guide are
 * listed apart, never matched to the nearest name.
 */

import type { ShortlistModel } from "./shortlist";

export type MyCar = { id: number; title: string; price: number | null; year: number | null; make: string | null; model: string | null };

export type MyModel = { model: ShortlistModel; cars: MyCar[] };

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// A word after the model name that makes it a different car ("Corolla Cross", "Prius c", "RAV4 Prime"): its years
// aren't the guide model's, so it isn't matched.
const SUB_MODEL = new Set(["cross", "c", "v", "prime"]);

/** The guide model a car is, or null. The longest matching model name wins ("Grand Highlander" over "Highlander"). */
export function guideModelFor(models: ShortlistModel[], car: Pick<MyCar, "make" | "model">): ShortlistModel | null {
  if (!car.make || !car.model) return null;
  const make = key(car.make);
  const words = car.model.toLowerCase().split(/\s+/).filter(Boolean);
  const candidates = models.filter((m) => key(m.make) === make);
  let best: ShortlistModel | null = null;
  for (const m of candidates) {
    const mk = key(m.model);
    // The model's own words, then (optionally) a trim: compare growing prefixes of the car's model words. Also
    // "ES350" for the guide's "ES" (the engine size run on), and "3" for "Mazda3" (the make left off).
    const whole = key(car.model);
    const hit = words.some((_, i) => key(words.slice(0, i + 1).join(" ")) === mk && !SUB_MODEL.has(words[i + 1] ?? "")) || (whole.startsWith(mk) && /^\d{3}h?$/.test(whole.slice(mk.length))) || make + whole === mk;
    if (hit && (!best || key(m.model).length > key(best.model).length)) best = m;
  }
  return best;
}

/** The owner's models (in the order they first checked one, newest first) and the cars that aren't in the guide. */
export function myShortlist(models: ShortlistModel[], cars: MyCar[]): { mine: MyModel[]; notInGuide: MyCar[] } {
  const mine: MyModel[] = [];
  const notInGuide: MyCar[] = [];
  for (const car of cars) {
    const m = guideModelFor(models, car);
    if (!m) {
      notInGuide.push(car);
      continue;
    }
    const entry = mine.find((x) => x.model === m);
    if (entry) entry.cars.push(car);
    else mine.push({ model: m, cars: [car] });
  }
  return { mine, notInGuide };
}
