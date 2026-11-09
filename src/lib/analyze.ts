import "server-only";
import { parseListing, type ParsedListing } from "@/lib/listing/parse";
import { decodeVin, getComplaintSummary, getRecalls, getSafetyRatings, type VehicleKey } from "@/lib/nhtsa/client";
import type { ComplaintSummary, DecodedVin, Recall, SafetyRating } from "@/lib/nhtsa/parse";
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
  /** EPA fuel economy for the likely variants (FuelEconomy.gov), for the running-cost panel. */
  fuel: FuelMatch | null;
  /** Plain-English notes about lookups that failed or were skipped. */
  notices: string[];
};

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export async function analyzeListing(text: string): Promise<Analysis> {
  const listing = parseListing(text);
  const notices: string[] = [];

  const vinCheck = listing.vin ? checkVin(listing.vin) : null;
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

  const year = decoded?.year ?? listing.year;
  const make = decoded?.make ? titleCase(decoded.make) : listing.make;
  const model = decoded?.model ?? listing.model;
  const vehicle: VehicleKey | null = year && make && model ? { year, make, model } : null;

  let recalls: Recall[] | null = null;
  let ratings: SafetyRating[] | null = null;
  let complaints: ComplaintSummary | null = null;
  let fuel: FuelMatch | null = null;
  if (vehicle) {
    const target: FuelTarget = {
      model: vehicle.model,
      displacementL: decoded?.displacementL ?? null,
      cylinders: decoded?.cylinders ?? null,
      transmission: decoded?.transmissionKind !== "unknown" && decoded ? decoded.transmissionKind : listing.transmission,
      drive: driveOf(decoded?.driveType ?? null),
      hybrid: /hybrid|hev/i.test(decoded?.electrification ?? "") || /\bhybrid\b/i.test(text),
      electric: /\bBEV\b|battery electric/i.test(decoded?.electrification ?? ""),
    };
    const [r, s, c, f] = await Promise.allSettled([
      getRecalls(vehicle),
      getSafetyRatings(vehicle),
      getComplaintSummary(vehicle),
      findFuelEconomy(vehicle.year, vehicle.make, target),
    ]);
    if (r.status === "fulfilled") recalls = r.value;
    else notices.push("Couldn't load recalls from NHTSA just now.");
    if (s.status === "fulfilled") ratings = s.value;
    else notices.push("Couldn't load crash-test ratings from NHTSA just now.");
    if (c.status === "fulfilled") complaints = c.value;
    else notices.push("Couldn't load complaints from NHTSA just now.");
    if (f.status === "fulfilled") fuel = f.value;
    else notices.push("Couldn't load fuel economy from FuelEconomy.gov just now.");
  } else if (listing.kind !== "url") {
    notices.push("Couldn't tell the year, make and model, so recalls and safety data are missing. Include them or the VIN.");
  }

  return { text, listing, vinCheck, decoded, vehicle, recalls, ratings, complaints, fuel, notices };
}
