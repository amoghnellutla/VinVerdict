import "server-only";
import { makeName } from "@/lib/format";
import { mergeAiRead, type ListingRead } from "@/lib/ai/listing-read";
import { applyFixes, type ListingFixes } from "@/lib/listing/fixes";
import { parseListing, type ParsedListing } from "@/lib/listing/parse";
import { decodeVin, getComplaintSummary, getRecalls, getSafetyRatings, type VehicleKey } from "@/lib/nhtsa/client";
import { nhtsaModelName, type ComplaintSummary, type DecodedVin, type Recall, type SafetyRating } from "@/lib/nhtsa/parse";
import { findFuelEconomy, type FuelMatch } from "@/lib/fuel/client";
import { driveOf, type FuelTarget } from "@/lib/fuel/parse";
import { checkVin, type VinCheck } from "@/lib/vin";

/**
 * The paste-analyzer pipeline (PLAN.md §8, paste flow steps 2–5), minus
 * market value (Phase 4). Server-only because it calls NHTSA.
 *
 * Returns only what the page shows: no raw API responses. Each NHTSA call
 * fails on its own, so one slow service doesn't sink the whole result.
 *
 * Links are never fetched: reading arbitrary URLs from the server would let
 * someone make it request internal addresses (SSRF). Facebook needs login
 * anyway, so the user pastes the text instead.
 */

export type Analysis = {
  text: string;
  listing: ParsedListing;
  vinCheck: VinCheck | null;
  decoded: DecodedVin | null;
  /** Year/make/model used for NHTSA lookups: decoded VIN first, then the listing. */
  vehicle: VehicleKey | null;
  recalls: Recall[] | null;
  ratings: SafetyRating[] | null;
  complaints: ComplaintSummary | null;
  /**
   * The year/make/model as NHTSA's safety APIs spell it (Lexus "ES350"), so
   * the page can link to the exact public records it used.
   */
  nhtsaVehicle?: VehicleKey | null;
  /** Recalls and complaints for this model year and the years either side (NHTSA). */
  years?: YearRow[] | null;
  /** When the free lookups ran (ISO date), shown in the sources list. */
  checkedAt?: string;
  /** EPA fuel economy for the likely variants (FuelEconomy.gov), for the running-cost panel. */
  fuel: FuelMatch | null;
  /** Plain-English notes about lookups that failed or were skipped. */
  notices: string[];
};

export type YearRow = { year: number; recalls: number | null; complaints: number | null; crashOrFire: number | null };

/** `fixes`: what the buyer corrected on the result (already checked by `parseFixes`), applied before any check runs. */
export async function analyzeListing(text: string, fixes: ListingFixes | null = null, aiRead: ListingRead | null = null): Promise<Analysis> {
  // `aiRead`: the free AI's second reading (already checked against the text by `checkListingRead`).
  const listing = mergeAiRead(applyFixes(parseListing(text), fixes), aiRead);
  const notices: string[] = [];

  const vinCheck = listing.vin ? checkVin(listing.vin) : null;
  if (listing.vinTyped && listing.vin) notices.push(`Read the VIN as ${listing.vin}: a VIN never uses the letters O, I or Q, so they were read as 0 and 1.`);
  let decoded: DecodedVin | null = null;
  // A VIN with a bad check digit is still decoded: NHTSA's answer helps show
  // whether it's a typo (decodes to the listed car) or junk.
  if (listing.vin && (vinCheck?.ok || vinCheck?.reason === "check-digit")) {
    try {
      decoded = await decodeVin(listing.vin);
    } catch {
      notices.push("Couldn't reach NHTSA to decode the VIN just now. Try again in a minute.");
    }
  }

  // Only a VIN that passes its check digit names the car over the ad. A bad one (a typo or a fake)
  // decodes to some other car: the ad's car comes first, so its recalls and complaints aren't
  // another car's; the decode only fills in what the ad doesn't say.
  const trusted = vinCheck?.ok ? decoded : null;
  const year = trusted?.year ?? listing.year ?? decoded?.year ?? null;
  const make = trusted?.make ? makeName(trusted.make) : listing.make ?? (decoded?.make ? makeName(decoded.make) : null);
  const model = trusted?.model ?? listing.model ?? decoded?.model ?? null;
  const vehicle: VehicleKey | null = year && make && model ? { year, make, model } : null;

  let recalls: Recall[] | null = null;
  let ratings: SafetyRating[] | null = null;
  let complaints: ComplaintSummary | null = null;
  let fuel: FuelMatch | null = null;
  let nhtsaVehicle: VehicleKey | null = null;
  let years: YearRow[] | null = null;
  if (vehicle) {
    const target: FuelTarget = {
      model: vehicle.model,
      displacementL: decoded?.displacementL ?? null,
      cylinders: decoded?.cylinders ?? null,
      transmission: decoded?.transmissionKind !== "unknown" && decoded ? decoded.transmissionKind : listing.transmission,
      drive: driveOf(decoded?.driveType ?? null),
      hybrid: /hybrid|hev/i.test(decoded?.electrification ?? "") || /\bhybrid\b/i.test(text),
      electric: /\bBEV\b|battery electric/i.test(decoded?.electrification ?? ""),
      trim: decoded?.trim ?? null,
    };
    // NHTSA's safety APIs spell some models differently from the VIN decoder (Lexus "ES" → "ES350").
    const nhtsa = { ...vehicle, model: nhtsaModelName(vehicle.make, vehicle.model, decoded?.trim ?? null, text) };
    nhtsaVehicle = nhtsa;
    // The years either side, for "is this a good year?" (free, cached; a failure only hides that row).
    const neighbours = [vehicle.year - 1, vehicle.year + 1].filter((y) => y >= 1981 && y <= new Date().getFullYear());
    const [r, s, c, f, ...near] = await Promise.allSettled([
      getRecalls(nhtsa),
      getSafetyRatings(nhtsa),
      getComplaintSummary(nhtsa),
      findFuelEconomy(vehicle.year, vehicle.make, target),
      ...neighbours.flatMap((year) => [getRecalls({ ...nhtsa, year }), getComplaintSummary({ ...nhtsa, year })]),
    ]);
    if (r.status === "fulfilled") recalls = r.value;
    else notices.push("Couldn't load recalls from NHTSA just now.");
    if (s.status === "fulfilled") ratings = s.value;
    else notices.push("Couldn't load crash-test ratings from NHTSA just now.");
    if (c.status === "fulfilled") complaints = c.value;
    else notices.push("Couldn't load complaints from NHTSA just now.");
    if (f.status === "fulfilled") fuel = f.value;
    else notices.push("Couldn't load fuel economy from FuelEconomy.gov just now.");
    if (complaints) {
      const row = (year: number, rc: PromiseSettledResult<unknown>, cc: PromiseSettledResult<unknown>): YearRow | null => {
        const rv = rc.status === "fulfilled" ? (rc.value as Recall[]) : null;
        const cv = cc.status === "fulfilled" ? (cc.value as ComplaintSummary) : null;
        if (!rv && !cv) return null;
        return { year, recalls: rv?.length ?? null, complaints: cv?.total ?? null, crashOrFire: cv ? (cv.crashOrFire ?? cv.crashes + cv.fires) : null };
      };
      const mine: YearRow = { year: vehicle.year, recalls: recalls?.length ?? null, complaints: complaints.total, crashOrFire: complaints.crashOrFire ?? complaints.crashes + complaints.fires };
      const others = neighbours.map((y, i) => row(y, near[i * 2], near[i * 2 + 1])).filter((x): x is YearRow => x !== null);
      // Only worth showing when the other years have data too (a brand-new model has none).
      if (others.some((o) => (o.complaints ?? 0) > 0 || (o.recalls ?? 0) > 0)) years = [...others, mine].sort((a, b) => a.year - b.year);
    }
  } else if (listing.kind !== "url") {
    notices.push("Couldn't tell the year, make and model, so recalls and safety data are missing. Include them or the VIN.");
  }

  const checkedAt = new Date().toISOString().slice(0, 10);
  return { text, listing, vinCheck, decoded, vehicle, recalls, ratings, complaints, nhtsaVehicle, years, checkedAt, fuel, notices };
}
