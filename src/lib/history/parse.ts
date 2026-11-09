/**
 * MarketCheck "History by VIN" (`GET /v2/history/car/{vin}`) → plain records.
 * Every past online listing of one car: who listed it, where, when, at what
 * price and miles. Tested on the Free plan 2026-11-09 (11 records for the
 * Camry in corpus case 01, back to its 2021 new-car listing).
 *
 * Pure and browser-safe. Only listing fields are copied; anything else in the
 * reply is ignored. Links must be https.
 */

import { safeHttpsUrl } from "@/lib/live/parse";

export type HistoryRecord = {
  /** YYYY-MM-DD */
  firstSeen: string;
  lastSeen: string;
  price: number | null;
  miles: number | null;
  sellerType: "dealer" | "private" | "unknown";
  sellerName: string | null;
  city: string | null;
  state: string | null;
  /** Site the listing was on, e.g. "gwatneybuickgmc.com". */
  host: string | null;
  url: string | null;
  isNew: boolean;
};

const MAX_RECORDS = 100;

const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);

/** Unix seconds or an ISO string → YYYY-MM-DD. */
function day(secs: unknown, iso: unknown): string | null {
  if (typeof secs === "number" && secs > 946_684_800 && secs < 4_102_444_800) return new Date(secs * 1000).toISOString().slice(0, 10);
  const s = str(iso, 40);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** Oldest first. Records without a date are dropped. */
export function parseMarketCheckHistory(body: unknown): HistoryRecord[] {
  if (!Array.isArray(body)) return [];
  const out: HistoryRecord[] = [];
  for (const r of body.slice(0, MAX_RECORDS)) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const firstSeen = day(x.first_seen_at, x.first_seen_at_date) ?? day(x.scraped_at, x.scraped_at_date);
    if (!firstSeen) continue;
    const lastSeen = day(x.last_seen_at, x.last_seen_at_date) ?? firstSeen;
    const type = (str(x.seller_type) ?? "").toLowerCase();
    const state = str(x.state, 2);
    out.push({
      firstSeen,
      lastSeen: lastSeen < firstSeen ? firstSeen : lastSeen,
      price: num(x.price, 100, 2_000_000),
      // Odometers under 100 are new-car placeholders, not readings.
      miles: num(x.miles, 100, 1_000_000),
      sellerType: type === "dealer" ? "dealer" : type === "fsbo" || type === "private" ? "private" : "unknown",
      sellerName: str(x.seller_name),
      city: str(x.city, 40),
      state: state && /^[A-Za-z]{2}$/.test(state) ? state.toUpperCase() : null,
      host: str(x.source, 80),
      url: safeHttpsUrl(x.vdp_url),
      isNew: (str(x.inventory_type) ?? "").toLowerCase() === "new",
    });
  }
  return out.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.lastSeen.localeCompare(b.lastSeen));
}
