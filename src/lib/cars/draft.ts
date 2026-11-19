/**
 * "Save to My cars", reviewed first (Amogh: "before storing confirm so it stores correctly"). A check no longer saves
 * the car by itself: it drafts what would be stored (the listing link, price, miles, MPG, hybrid or not, title and
 * accidents), each with where it came from, and the owner corrects anything and presses Save. Pure.
 *
 * Nothing is guessed: a field the check couldn't read is left empty ("Not sure"), never filled with a likely value.
 * Everything the browser sends back is checked again here before it's stored (`parsePending`).
 */

import type { CarFacts, SaveInput } from "@/lib/cars/store";
import type { Analysis } from "@/lib/analyze";
import type { AccidentStatus, TitleStatus } from "@/lib/listing/parse";
import type { Verdict } from "@/lib/scam/rules";

export type Powertrain = "gas" | "diesel" | "hybrid" | "plug-in hybrid" | "electric";

/** What the owner reviews and can correct before saving. */
export type SaveFields = {
  sourceUrl: string | null;
  price: number | null;
  miles: number | null;
  mpgCity: number | null;
  mpgHwy: number | null;
  mpgComb: number | null;
  powertrain: Powertrain | null;
  titleStatus: TitleStatus;
  accident: AccidentStatus;
};

/** Where each drafted value came from, shown beside it ("the listing", "the VIN", "FuelEconomy.gov"). */
export type FieldSource = Partial<Record<"sourceUrl" | "price" | "miles" | "mpg" | "powertrain" | "titleStatus" | "accident", string>>;

/** The rest of the saved row, worked out by the check (not edited on the card). */
export type SaveBase = Omit<SaveInput, "sourceUrl" | "price" | "miles">;

export type PendingSave = {
  base: SaveBase;
  fields: SaveFields;
  from: FieldSource;
  /** FuelEconomy.gov's variants disagree: their combined MPG runs from low to high, and the best match is drafted. */
  mpgRange: { low: number; high: number } | null;
  /** This VIN is already in My cars: saving updates that car. */
  existingId: number | null;
};

export const POWERTRAIN_TEXT: Record<Powertrain, string> = {
  gas: "Gas (not hybrid)",
  diesel: "Diesel",
  hybrid: "Hybrid",
  "plug-in hybrid": "Plug-in hybrid",
  electric: "Electric",
};

/** Hybrid or not: the VIN first (NHTSA's electrification and fuel), then FuelEconomy.gov when every variant agrees, then the ad's words. */
export function powertrainOf(a: Pick<Analysis, "decoded" | "fuel" | "listing">): { value: Powertrain | null; from: string | null } {
  const e = a.decoded?.electrification ?? "";
  if (/phev|plug-?in/i.test(e)) return { value: "plug-in hybrid", from: "the VIN" };
  if (/\bbev\b|battery electric|fcev|fuel cell/i.test(e)) return { value: "electric", from: "the VIN" };
  if (/hev|hybrid/i.test(e)) return { value: "hybrid", from: "the VIN" };
  const fuel = a.decoded?.fuel ?? "";
  if (a.decoded && !e && /diesel/i.test(fuel)) return { value: "diesel", from: "the VIN" };
  if (a.decoded && !e && /gasoline/i.test(fuel)) return { value: "gas", from: "the VIN" };
  const v = a.fuel?.vehicles ?? [];
  if (v.length) {
    const kinds = new Set(v.map((x) => (/plug-?in/i.test(x.atvType ?? "") ? "plug-in hybrid" : /hybrid/i.test(x.atvType ?? "") ? "hybrid" : /\bev\b|electric/i.test(x.atvType ?? "") || x.fuel === "electric" ? "electric" : x.fuel === "diesel" ? "diesel" : "gas")));
    if (kinds.size === 1) return { value: [...kinds][0] as Powertrain, from: "FuelEconomy.gov" };
  }
  const words = `${a.listing.model ?? ""} ${a.decoded?.trim ?? ""} ${a.decoded?.model ?? ""}`;
  if (/\bplug-?in\b|\bphev\b|\bprime\b/i.test(words)) return { value: "plug-in hybrid", from: "the listing" };
  if (/\bhybrid\b|\b\d{3}h\b/i.test(words)) return { value: "hybrid", from: "the listing" };
  return { value: null, from: null };
}

/** The drafted fields from a check, and where each came from. */
export function draftFields(a: Pick<Analysis, "decoded" | "fuel" | "listing">): { fields: SaveFields; from: FieldSource; mpgRange: PendingSave["mpgRange"] } {
  const l = a.listing;
  const v = a.fuel?.vehicles ?? [];
  const best = v[0] ?? null;
  const combs = v.map((x) => x.comb).filter((n) => Number.isFinite(n) && n > 0);
  const low = combs.length ? Math.min(...combs) : null;
  const high = combs.length ? Math.max(...combs) : null;
  const pt = powertrainOf(a);
  const from: FieldSource = {};
  if (l.url) from.sourceUrl = "the listing";
  if (l.price != null) from.price = "the listing";
  if (l.miles != null) from.miles = "the listing";
  if (best) from.mpg = "FuelEconomy.gov";
  if (pt.from) from.powertrain = pt.from;
  if (l.titleStatus !== "unknown") from.titleStatus = "the listing says";
  if (l.accident !== "unknown") from.accident = "the listing says";
  return {
    fields: {
      sourceUrl: l.url ?? null,
      price: l.price ?? null,
      miles: l.miles ?? null,
      mpgCity: best && best.city > 0 ? best.city : null,
      mpgHwy: best && best.hwy > 0 ? best.hwy : null,
      mpgComb: best && best.comb > 0 ? best.comb : null,
      powertrain: pt.value,
      titleStatus: l.titleStatus,
      accident: l.accident,
    },
    from,
    mpgRange: low != null && high != null && high - low >= 1 ? { low, high } : null,
  };
}

// ----- Checking what the browser sends back -----

const TITLES: readonly TitleStatus[] = ["clean", "salvage", "rebuilt", "flood", "lemon", "branded", "unknown"];
const ACCIDENTS: readonly AccidentStatus[] = ["none", "reported", "unknown"];
const POWERTRAINS: readonly Powertrain[] = ["gas", "diesel", "hybrid", "plug-in hybrid", "electric"];
const VERDICTS: readonly Verdict[] = ["hide", "verify", "caution", "clear"];

const int = (v: unknown, lo: number, hi: number): number | null | undefined => {
  if (v === null || v === "" || v === undefined) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
};
const str = (v: unknown, max: number): string | null | undefined => (v === null || v === undefined ? null : typeof v === "string" ? v.trim().slice(0, max) || null : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);

/** A listing link: http(s) only, no spaces, at most 2,000 characters (as the table allows). */
export function cleanUrl(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length > 2000 || /\s/.test(s)) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** The reviewed fields, or null if any is out of range (nothing is stored then). */
export function parseFields(raw: unknown): SaveFields | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const f = {
    sourceUrl: cleanUrl(r.sourceUrl),
    price: int(r.price, 0, 1_000_000),
    miles: int(r.miles, 0, 1_000_000),
    mpgCity: int(r.mpgCity, 1, 200),
    mpgHwy: int(r.mpgHwy, 1, 200),
    mpgComb: int(r.mpgComb, 1, 200),
    powertrain: r.powertrain === null || r.powertrain === "" ? null : oneOf(r.powertrain, POWERTRAINS),
    titleStatus: oneOf(r.titleStatus, TITLES),
    accident: oneOf(r.accident, ACCIDENTS),
  };
  return Object.values(f).some((v) => v === undefined) ? null : (f as SaveFields);
}

const strList = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : []);

/** The check's part of the row (VIN, title, verdict, facts, listing text), checked field by field. */
export function parseBase(raw: unknown): SaveBase | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const vin = r.vin === null ? null : typeof r.vin === "string" && /^[A-HJ-NPR-Z0-9]{17}$/.test(r.vin) ? r.vin : undefined;
  const title = str(r.title, 200);
  const verdict = oneOf(r.verdict, VERDICTS);
  const risk = int(r.risk, 0, 100);
  const sourceHost = str(r.sourceHost, 200);
  const listingText = str(r.listingText, 20_000);
  const f = (r.facts ?? {}) as Record<string, unknown>;
  if (vin === undefined || !title || !verdict || risk == null || sourceHost === undefined || listingText === undefined) return null;
  const facts: CarFacts = {
    year: int(f.year, 1950, 2100) ?? null,
    make: str(f.make, 60) ?? null,
    model: str(f.model, 80) ?? null,
    trim: str(f.trim, 80) ?? null,
    seller: str(f.seller, 20) ?? null,
    owners: int(f.owners, 0, 20) ?? null,
    usage: str(f.usage, 40) ?? null,
    zip: typeof f.zip === "string" && /^\d{5}$/.test(f.zip) ? f.zip : null,
    docFee: int(f.docFee, 0, 10_000) ?? null,
    phones: strList(f.phones, 5, 10).filter((p) => /^\d{10}$/.test(p)),
    findings: strList(f.findings, 5, 200),
  };
  return { vin, title, sourceHost, verdict, risk, facts, listingText };
}

/** The row to store: the check's part with the reviewed fields in it. */
export function toSaveInput(base: SaveBase, fields: SaveFields): SaveInput {
  return {
    ...base,
    // The site follows the link (it may have been corrected on the card).
    sourceHost: fields.sourceUrl ? new URL(fields.sourceUrl).hostname.replace(/^www\./, "") : base.sourceHost,
    sourceUrl: fields.sourceUrl,
    price: fields.price,
    miles: fields.miles,
    facts: {
      ...base.facts,
      title: fields.titleStatus,
      accident: fields.accident,
      mpg: fields.mpgComb != null || fields.mpgCity != null || fields.mpgHwy != null ? { comb: fields.mpgComb, city: fields.mpgCity, hwy: fields.mpgHwy } : null,
      powertrain: fields.powertrain,
    },
  };
}

/**
 * What the owner's history report said (Carfax, AutoCheck…, read on the page) goes into the title and accidents:
 * bad news always wins, and a clean report only fills in what the listing left unknown.
 */
export function withReport(
  d: { fields: SaveFields; from: FieldSource },
  report: { title: "unknown" | "clean" | "branded"; damage: "unknown" | "none" | "minor" | "moderate" | "severe" },
): { fields: SaveFields; from: FieldSource } {
  const fields = { ...d.fields };
  const from = { ...d.from };
  if (report.title === "branded" && !["salvage", "rebuilt", "flood", "lemon", "branded"].includes(fields.titleStatus)) {
    fields.titleStatus = "branded";
    from.titleStatus = "your history report";
  } else if (report.title === "clean" && fields.titleStatus === "unknown") {
    fields.titleStatus = "clean";
    from.titleStatus = "your history report";
  }
  if (report.damage === "minor" || report.damage === "moderate" || report.damage === "severe") {
    fields.accident = "reported";
    from.accident = "your history report";
  } else if (report.damage === "none" && fields.accident === "unknown") {
    fields.accident = "none";
    from.accident = "your history report";
  }
  return { fields, from };
}
