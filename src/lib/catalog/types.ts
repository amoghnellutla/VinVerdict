/** Shapes of the Car guide data built by tools/build_cars.py (src/data/catalog/). */

export type Body = "car" | "suv" | "pickup" | "minivan" | "van" | "wagon";
export type Power = "gas" | "diesel" | "hybrid" | "plug-in hybrid" | "electric";

/** A fact with the sentence it rests on and where that sentence is. */
export type Sourced = { reason: string; source: string };

export type ModelSummary = { name: string; slug: string; body: Body; years: number[]; sporty?: Sourced };
export type MakeSummary = { name: string; slug: string; models: ModelSummary[]; luxury?: Sourced };

export type CatalogIndex = {
  generated: string;
  labelsChecked: string;
  sources: { epa: { url: string; about: string; name: string; downloaded: string; lastModified: string | null } };
  makes: MakeSummary[];
};

/** One model year, from every EPA-tested version of it. */
export type ModelYear = {
  variants: number;
  body: Body;
  size: string | null;
  classes: string[];
  drive: string[];
  power: Power[];
  cylinders: number[];
  displacementL: [number, number] | null;
  turbo: boolean;
  supercharged: boolean;
  manual: boolean;
  premiumFuel: boolean;
  /** EPA's yearly fuel cost (15,000 miles, 55% city), across versions. */
  fuelCostYear: { min: number; median: number; max: number } | null;
  /** EPA combined MPG (MPGe for electric), lowest and highest version. */
  mpg: [number, number] | null;
  epaIds: number[];
};

export type MakeDetail = { make: string; slug: string; models: Record<string, { name: string; years: Record<string, ModelYear> }> };
