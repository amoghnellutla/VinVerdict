import "server-only";
import { cacheLife } from "next/cache";
import {
  parseRatingDetail,
  parseRatingVariants,
  parseRecalls,
  parseVinDecode,
  summarizeComplaints,
  type ComplaintSummary,
  type DecodedVin,
  type Recall,
  type SafetyRating,
} from "./parse";

/**
 * NHTSA data fetchers (free, no key). Server-only.
 * Results are cached with "use cache: remote": one shared cache for every server
 * instance, so a car looked up once is instant for the next visitor (PLAN.md §10: cached per
 * model/year). Only the small parsed objects are cached, not raw responses.
 * Errors throw and are not cached, so a failed call is retried next time.
 */

const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles";
const API = "https://api.nhtsa.gov";
const TIMEOUT_MS = 10_000;

export type VehicleKey = { year: number; make: string; model: string };

export class NhtsaError extends Error {}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VinVerdict/0.1" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new NhtsaError(`NHTSA returned HTTP ${res.status} for ${new URL(url).pathname}`);
  return res.json();
}

function assertVehicle({ year, make, model }: VehicleKey) {
  const maxYear = new Date().getFullYear() + 2;
  if (!Number.isInteger(year) || year < 1981 || year > maxYear) throw new NhtsaError(`Invalid year: ${year}`);
  if (!make.trim() || !model.trim() || make.length > 40 || model.length > 60) throw new NhtsaError("Invalid make/model");
}

const q = (s: string) => encodeURIComponent(s.trim());

/** Decode a VIN. Caller must pass a format-checked VIN (see lib/vin.ts). */
export async function decodeVin(vin: string): Promise<DecodedVin> {
  "use cache: remote";
  cacheLife("weeks");
  return parseVinDecode(vin, await getJson(`${VPIC}/DecodeVinValues/${q(vin)}?format=json`));
}

/** All recalls for the model/year (not per-VIN open status; see PLAN.md §13). */
export async function getRecalls(v: VehicleKey): Promise<Recall[]> {
  "use cache: remote";
  cacheLife("days");
  assertVehicle(v);
  return parseRecalls(
    await getJson(`${API}/recalls/recallsByVehicle?make=${q(v.make)}&model=${q(v.model)}&modelYear=${v.year}`),
  );
}

/** Crash-test stars for each body variant (e.g. 4-door FWD, 2-door FWD). */
export async function getSafetyRatings(v: VehicleKey): Promise<SafetyRating[]> {
  "use cache: remote";
  cacheLife("weeks");
  assertVehicle(v);
  const variants = parseRatingVariants(
    await getJson(`${API}/SafetyRatings/modelyear/${v.year}/make/${q(v.make)}/model/${q(v.model)}`),
  );
  const details = await Promise.all(
    variants.slice(0, 4).map(async (x) => parseRatingDetail(await getJson(`${API}/SafetyRatings/VehicleId/${x.vehicleId}`))),
  );
  return details.filter((d): d is SafetyRating => d !== null);
}

export async function getComplaintSummary(v: VehicleKey): Promise<ComplaintSummary> {
  "use cache: remote";
  cacheLife("days");
  assertVehicle(v);
  return summarizeComplaints(
    await getJson(`${API}/complaints/complaintsByVehicle?make=${q(v.make)}&model=${q(v.model)}&modelYear=${v.year}`),
  );
}
