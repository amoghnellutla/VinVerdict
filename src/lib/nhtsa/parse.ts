/**
 * Turn raw NHTSA API responses into small, typed objects.
 * Pure functions (no network), so they are unit-tested against real
 * response shapes. The fetching lives in ./client.ts.
 */

export type TransmissionKind = "automatic" | "manual" | "unknown";

/**
 * NHTSA and sellers describe transmissions many ways. CVTs, dual-clutch and
 * automated-manual gearboxes have no clutch pedal, so they count as
 * automatic (PLAN.md: "automatic only" rejects only true manuals).
 */
export function classifyTransmission(text: string | null | undefined): TransmissionKind {
  if (!text) return "unknown";
  const t = text.toLowerCase();
  if (/automated manual|dual[- ]?clutch|\bdct\b|\bamt\b/.test(t)) return "automatic";
  if (/\bmanual\b|stick ?shift/.test(t)) return "manual";
  if (/automatic|\bauto\b|\bcvt\b|continuously variable|tiptronic|e-?cvt/.test(t)) return "automatic";
  return "unknown";
}

// ---------- VIN decode (vPIC DecodeVinValues) ----------

export type DecodedVin = {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  body: string | null;
  driveType: string | null;
  transmission: string | null;
  transmissionKind: TransmissionKind;
  fuel: string | null;
  /** Manufacturer curb weight, when vPIC has it (sets the NJ registration weight class). */
  curbWeightLb: number | null;
  /** Engine size and cylinders: used to pick the right FuelEconomy.gov variant. */
  displacementL: number | null;
  cylinders: number | null;
  /** e.g. "Strong HEV (Hybrid Electric Vehicle)", "BEV (Battery Electric Vehicle)"; null for gas-only. */
  electrification: string | null;
  /** "0" means a clean decode. Anything else (e.g. "1" = bad check digit) is a warning. */
  errorCode: string;
  errorText: string;
  clean: boolean;
};

const blank = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s !== "Not Applicable" ? s : null;
};

const positive = (v: unknown): number | null => {
  const n = Number(blank(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function parseVinDecode(vin: string, body: unknown): DecodedVin {
  const r = (body as { Results?: Record<string, unknown>[] })?.Results?.[0];
  if (!r) throw new Error("vPIC response had no Results");
  const year = Number(blank(r.ModelYear));
  // vPIC can return several codes, e.g. "1,400"; the first is the main one.
  const errorCode = (blank(r.ErrorCode) ?? "0").split(",")[0].trim();
  const transmission = blank(r.TransmissionStyle);
  return {
    vin,
    year: Number.isFinite(year) && year > 0 ? year : null,
    make: blank(r.Make),
    model: blank(r.Model),
    trim: blank(r.Trim) ?? blank(r.Series),
    body: blank(r.BodyClass),
    driveType: blank(r.DriveType),
    transmission,
    transmissionKind: classifyTransmission(transmission),
    fuel: blank(r.FuelTypePrimary),
    curbWeightLb: positive(r.CurbWeightLB),
    displacementL: positive(r.DisplacementL),
    cylinders: positive(r.EngineCylinders),
    electrification: blank(r.ElectrificationLevel),
    errorCode,
    errorText: blank(r.ErrorText) ?? "",
    clean: errorCode === "0",
  };
}

// ---------- Recalls (by year / make / model) ----------

export type Recall = {
  campaign: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  /** ISO date (YYYY-MM-DD) or null. */
  reportDate: string | null;
  parkIt: boolean;
  parkOutside: boolean;
};

/** NHTSA recall dates come as DD/MM/YYYY. */
export function parseNhtsaDate(s: unknown): string | null {
  const m = typeof s === "string" ? s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function parseRecalls(body: unknown): Recall[] {
  const rows = (body as { results?: Record<string, unknown>[] })?.results ?? [];
  return rows
    .map((r) => ({
      campaign: String(r.NHTSACampaignNumber ?? ""),
      component: String(r.Component ?? ""),
      summary: String(r.Summary ?? ""),
      consequence: String(r.Consequence ?? ""),
      remedy: String(r.Remedy ?? ""),
      reportDate: parseNhtsaDate(r.ReportReceivedDate),
      parkIt: r.parkIt === true,
      parkOutside: r.parkOutSide === true,
    }))
    .sort((a, b) => (b.reportDate ?? "").localeCompare(a.reportDate ?? ""));
}

// ---------- Crash-test ratings ----------

export type SafetyRating = {
  vehicleId: number;
  description: string;
  /** 1–5 stars, or null when NHTSA didn't rate it. */
  overall: number | null;
  front: number | null;
  side: number | null;
  rollover: number | null;
};

export type RatingVariant = { vehicleId: number; description: string };

export function parseRatingVariants(body: unknown): RatingVariant[] {
  const rows = (body as { Results?: Record<string, unknown>[] })?.Results ?? [];
  return rows
    .filter((r) => typeof r.VehicleId === "number")
    .map((r) => ({ vehicleId: r.VehicleId as number, description: String(r.VehicleDescription ?? "") }));
}

const stars = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

export function parseRatingDetail(body: unknown): SafetyRating | null {
  const r = (body as { Results?: Record<string, unknown>[] })?.Results?.[0];
  if (!r || typeof r.VehicleId !== "number") return null;
  return {
    vehicleId: r.VehicleId,
    description: String(r.VehicleDescription ?? ""),
    overall: stars(r.OverallRating),
    front: stars(r.OverallFrontCrashRating),
    side: stars(r.OverallSideCrashRating),
    rollover: stars(r.RolloverRating),
  };
}

// ---------- Complaints (summary only: there can be hundreds) ----------

/** One owner report, as filed with NHTSA (ODI number = NHTSA's own ID for it). */
export type ComplaintSample = {
  odi: number;
  /** ISO date the complaint was filed. */
  filed: string | null;
  crash: boolean;
  fire: boolean;
  /** The owner's own words, shortened. Plain text. */
  text: string;
};

export type ComplaintSummary = {
  total: number;
  crashes: number;
  fires: number;
  injuries: number;
  deaths: number;
  /** Each common problem area with the most recent owner reports about it. */
  topComponents: { component: string; count: number; samples?: ComplaintSample[] }[];
  /**
   * Complaints per VIN prefix (first 8 characters: maker, body, engine and
   * series). NHTSA publishes the first 11 VIN characters of each complaint, so
   * this shows how many came from cars built like the one being checked.
   */
  byPrefix?: Record<string, number>;
};

/** Complaint dates come as MM/DD/YYYY (recalls use DD/MM/YYYY). */
export function parseComplaintDate(s: unknown): string | null {
  const m = typeof s === "string" ? s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) : null;
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

const SAMPLE_CHARS = 320;

/** Shorten an owner's report on a word boundary. NHTSA redacts details as "XXX". */
export function shortenComplaint(text: string, max = SAMPLE_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).replace(/[\s,;:.-]+$/, "")}…`;
}

export function summarizeComplaints(body: unknown, top = 5, samplesEach = 2): ComplaintSummary {
  const rows = (body as { results?: Record<string, unknown>[] })?.results ?? [];
  const counts = new Map<string, number>();
  const reports = new Map<string, ComplaintSample[]>();
  const byPrefix: Record<string, number> = {};
  let crashes = 0, fires = 0, injuries = 0, deaths = 0;
  for (const r of rows) {
    if (r.crash === true) crashes++;
    if (r.fire === true) fires++;
    injuries += Number(r.numberOfInjuries) || 0;
    deaths += Number(r.numberOfDeaths) || 0;
    const prefix = String(r.vin ?? "").toUpperCase().slice(0, 8);
    if (/^[A-HJ-NPR-Z0-9]{8}$/.test(prefix)) byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
    const odi = Number(r.odiNumber);
    const text = typeof r.summary === "string" ? r.summary.trim() : "";
    const sample = Number.isInteger(odi) && odi > 0 && text.length >= 20
      ? { odi, filed: parseComplaintDate(r.dateComplaintFiled), crash: r.crash === true, fire: r.fire === true, text: shortenComplaint(text) }
      : null;
    for (const c of String(r.components ?? "").split(",")) {
      const name = c.trim();
      if (!name || name === "UNKNOWN OR OTHER") continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (sample) reports.set(name, [...(reports.get(name) ?? []), sample]);
    }
  }
  const topComponents = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([component, count]) => ({
      component,
      count,
      samples: (reports.get(component) ?? [])
        .sort((a, b) => (b.filed ?? "").localeCompare(a.filed ?? "") || b.odi - a.odi)
        .slice(0, samplesEach),
    }));
  return { total: rows.length, crashes, fires, injuries, deaths, topComponents, byPrefix };
}

/** How many complaints came from cars whose VIN starts like this one (null when unknown). */
export function sameBuildCount(c: ComplaintSummary | null, vin: string | null): number | null {
  if (!c?.byPrefix || !vin || vin.length < 8) return null;
  return c.byPrefix[vin.slice(0, 8).toUpperCase()] ?? 0;
}

/**
 * The model name NHTSA's recalls, crash-rating and complaints APIs use. The
 * VIN decoder says Lexus "ES" with trim "350", but those APIs file it as
 * "ES350" and return nothing for "ES" or "ES 350" (checked 2026-11-09). Other
 * makes pass through unchanged.
 */
export function nhtsaModelName(make: string, model: string, trim: string | null, text = ""): string {
  if (make.toLowerCase() !== "lexus") return model;
  const glued = model.match(/^([A-Z]{2,3}) ?(\d{3}[A-Z]?)$/i);
  if (glued) return (glued[1] + glued[2]).toUpperCase();
  if (!/^[A-Z]{2,3}$/i.test(model)) return model;
  // model is 2–3 letters here (checked above), so it's safe inside a RegExp.
  const num = trim?.match(/\b(\d{3}[A-Z]?)\b/i)?.[1] ?? text.match(new RegExp(String.raw`\b${model} ?(\d{3}[a-z]?)\b`, "i"))?.[1];
  return num ? (model + num).toUpperCase() : model;
}
