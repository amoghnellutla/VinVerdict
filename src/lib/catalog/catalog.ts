import "server-only";
import index from "@/data/catalog/index.json";
import type { CatalogIndex, MakeDetail, MakeSummary, ModelSummary } from "./types";

/**
 * The Car guide catalog: every make, model and year sold in the US since 2000
 * (EPA data, built offline by tools/build_cars.py). Server-only: the data
 * files never reach the browser.
 */
export const CATALOG = index as CatalogIndex;

export function findMake(slug: string): MakeSummary | null {
  return CATALOG.makes.find((m) => m.slug === slug) ?? null;
}

export function findModel(makeSlug: string, modelSlug: string): { make: MakeSummary; model: ModelSummary } | null {
  const make = findMake(makeSlug);
  const model = make?.models.find((m) => m.slug === modelSlug);
  return make && model ? { make, model } : null;
}

/** One make's full year-by-year data (a separate file per make, loaded only when needed). */
export async function loadMake(slug: string): Promise<MakeDetail | null> {
  if (!/^[a-z0-9-]+$/.test(slug) || !findMake(slug)) return null;
  const mod = (await import(`@/data/catalog/makes/${slug}.json`)) as { default: MakeDetail };
  return mod.default;
}

/** Makes people search for most, shown first on /cars (the rest follow A–Z). */
export const POPULAR_MAKES = [
  "toyota", "honda", "ford", "chevrolet", "nissan", "hyundai", "kia", "subaru", "mazda", "jeep", "gmc", "ram",
  "volkswagen", "bmw", "mercedes-benz", "audi", "lexus", "acura", "tesla", "dodge", "buick", "cadillac", "volvo", "land-rover",
] as const;

/** Simple search over make and model names: every word must appear. */
export function searchCatalog(query: string, limit = 40): { make: MakeSummary; model: ModelSummary }[] {
  const words = query.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 -]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];
  const hits: { make: MakeSummary; model: ModelSummary; score: number }[] = [];
  for (const make of CATALOG.makes) {
    for (const model of make.models) {
      const hay = `${make.name} ${model.name}`.toLowerCase();
      const squashed = hay.replace(/[^a-z0-9]/g, "");
      if (words.every((w) => hay.includes(w) || squashed.includes(w.replace(/[^a-z0-9]/g, "")))) {
        // Recent, long-running models first.
        hits.push({ make, model, score: model.years.length + (model.years.at(-1) ?? 0) / 100 });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit).map(({ make, model }) => ({ make, model }));
}
