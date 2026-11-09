import "server-only";
import type { SavedHistory } from "@/lib/history/summary";
import { createSupabase } from "@/lib/supabase/server";
import type { DealLabel } from "@/lib/value/estimate";
import type { Verdict } from "@/lib/scam/rules";

/**
 * Saved cars ("My cars", Phase 8) in Supabase. Uses the logged-in user's
 * session, so row-level security (supabase/migrations/…_checked_cars.sql)
 * limits every query to that user's own rows. The service-role key is never
 * used here.
 *
 * If the tables haven't been created yet, every function reports
 * "not-set-up" instead of throwing, so checking cars still works.
 */

export type CarFacts = {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  seller?: string | null;
  accident?: string | null;
  title?: string | null;
  owners?: number | null;
  usage?: string | null;
  zip?: string | null;
  /** Top findings, most serious first ("Accident reported", "Very high miles…"). */
  findings?: string[];
  fair?: number | null;
  costPerYear?: number | null;
  /** Seller phone numbers (10 digits), for "same phone on several listings". */
  phones?: string[];
  /** What the VIN's listing history showed at the last price check. */
  history?: SavedHistory;
};

export type PhoneMatch = { id: number; title: string; price: number | null };

export type PricePoint = { price: number; source: string; seenAt: string };

export type SavedCar = {
  id: number;
  vin: string | null;
  title: string;
  sourceUrl: string | null;
  sourceHost: string | null;
  price: number | null;
  miles: number | null;
  verdict: Verdict;
  risk: number;
  fairLow: number | null;
  fairHigh: number | null;
  dealLabel: DealLabel | null;
  facts: CarFacts;
  listingText: string | null;
  createdAt: string;
  updatedAt: string;
  history: PricePoint[];
};

export type SaveInput = {
  vin: string | null;
  title: string;
  sourceUrl: string | null;
  sourceHost: string | null;
  price: number | null;
  miles: number | null;
  verdict: Verdict;
  risk: number;
  facts: CarFacts;
  listingText: string | null;
};

export type StoreError = "not-set-up" | "failed";
type Result<T> = { ok: true; value: T } | { ok: false; error: StoreError };

type Row = {
  id: number; vin: string | null; title: string; source_url: string | null; source_host: string | null;
  price: number | null; miles: number | null; verdict: Verdict; risk: number;
  fair_low: number | null; fair_high: number | null; deal_label: DealLabel | null;
  facts: CarFacts | null; listing_text: string | null; created_at: string; updated_at: string;
  price_history?: { price: number; source: string; seen_at: string }[];
};

const COLUMNS = "id, vin, title, source_url, source_host, price, miles, verdict, risk, fair_low, fair_high, deal_label, facts, listing_text, created_at, updated_at";

function fail(err: { code?: string; message?: string } | null): { ok: false; error: StoreError } {
  const missing = err?.code === "PGRST205" || err?.code === "42P01" || /could not find the table|does not exist/i.test(err?.message ?? "");
  if (!missing) console.error("cars store", err?.code ?? "", (err?.message ?? "").slice(0, 200));
  return { ok: false, error: missing ? "not-set-up" : "failed" };
}

const toCar = (r: Row): SavedCar => ({
  id: r.id, vin: r.vin, title: r.title, sourceUrl: r.source_url, sourceHost: r.source_host,
  price: r.price, miles: r.miles, verdict: r.verdict, risk: r.risk,
  fairLow: r.fair_low, fairHigh: r.fair_high, dealLabel: r.deal_label,
  facts: r.facts ?? {}, listingText: r.listing_text, createdAt: r.created_at, updatedAt: r.updated_at,
  history: (r.price_history ?? [])
    .map((h) => ({ price: h.price, source: h.source, seenAt: h.seen_at }))
    .sort((a, b) => a.seenAt.localeCompare(b.seenAt)),
});

/** Add a price point if it differs from the last one (so the history shows changes, not repeats). */
async function addPrice(carId: number, price: number, source: string): Promise<void> {
  const db = await createSupabase();
  const { data: last } = await db.from("price_history").select("price").eq("car_id", carId).order("seen_at", { ascending: false }).limit(1).maybeSingle();
  if (last?.price === price) return;
  await db.from("price_history").insert({ car_id: carId, price, source });
}

/** Save a checked car. The same VIN updates the existing row instead of adding a duplicate. */
export async function saveCar(input: SaveInput): Promise<Result<number>> {
  // Read the login cookie outside try/catch: during prerendering Next.js signals
  // "this part is dynamic" by rejecting cookies(), and that must not be swallowed.
  const db = await createSupabase();
  try {
    const row = {
      vin: input.vin, title: input.title.slice(0, 200), source_url: input.sourceUrl, source_host: input.sourceHost,
      price: input.price, miles: input.miles, verdict: input.verdict, risk: input.risk,
      facts: input.facts, listing_text: input.listingText?.slice(0, 20_000) ?? null, updated_at: new Date().toISOString(),
    };
    let id: number | null = null;
    if (input.vin) {
      const found = await db.from("checked_cars").select("id").eq("vin", input.vin).limit(1).maybeSingle();
      if (found.error) return fail(found.error);
      id = found.data?.id ?? null;
    }
    if (id !== null) {
      const { error } = await db.from("checked_cars").update(row).eq("id", id);
      if (error) return fail(error);
    } else {
      const { data, error } = await db.from("checked_cars").insert(row).select("id").single();
      if (error) return fail(error);
      id = data.id as number;
    }
    if (input.price) await addPrice(id, input.price, "listing");
    return { ok: true, value: id };
  } catch (err) {
    return fail({ message: err instanceof Error ? err.message : "unknown" });
  }
}

/** Store the price-check result (fair range, label) and any live price seen. */
export async function saveValue(
  id: number,
  v: { fairLow: number; fairHigh: number; dealLabel: DealLabel | null; fair: number },
  live: { price: number | null; source: string } | null,
  history?: SavedHistory | null,
): Promise<Result<true>> {
  const db = await createSupabase();
  try {
    const cur = await db.from("checked_cars").select("facts").eq("id", id).maybeSingle();
    if (cur.error) return fail(cur.error);
    if (!cur.data) return { ok: false, error: "failed" };
    const old = (cur.data.facts as CarFacts) ?? {};
    const facts: CarFacts = { ...old, fair: v.fair };
    if (history) {
      // History red flags go first in "Top concerns", without repeats.
      facts.history = history;
      facts.findings = [...new Set([...history.flags, ...(old.findings ?? [])])].slice(0, 5);
    }
    const { error } = await db.from("checked_cars").update({ fair_low: v.fairLow, fair_high: v.fairHigh, deal_label: v.dealLabel, facts, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail(error);
    if (live?.price) await addPrice(id, live.price, live.source);
    return { ok: true, value: true };
  } catch (err) {
    return fail({ message: err instanceof Error ? err.message : "unknown" });
  }
}

export async function recordPrice(id: number, price: number, source: string): Promise<Result<true>> {
  const db = await createSupabase();
  try {
    const { error } = await db.from("checked_cars").update({ price, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail(error);
    await addPrice(id, price, source);
    return { ok: true, value: true };
  } catch (err) {
    return fail({ message: err instanceof Error ? err.message : "unknown" });
  }
}

export async function listCars(): Promise<Result<SavedCar[]>> {
  const db = await createSupabase();
  try {
    const { data, error } = await db.from("checked_cars").select(`${COLUMNS}, price_history(price, source, seen_at)`).order("updated_at", { ascending: false }).limit(200);
    if (error) return fail(error);
    return { ok: true, value: (data as Row[]).map(toCar) };
  } catch (err) {
    return fail({ message: err instanceof Error ? err.message : "unknown" });
  }
}

export async function getCars(ids: number[]): Promise<Result<SavedCar[]>> {
  const db = await createSupabase();
  try {
    const { data, error } = await db.from("checked_cars").select(`${COLUMNS}, price_history(price, source, seen_at)`).in("id", ids);
    if (error) return fail(error);
    const cars = (data as Row[]).map(toCar);
    return { ok: true, value: ids.map((id) => cars.find((c) => c.id === id)).filter((c): c is SavedCar => !!c) };
  } catch (err) {
    return fail({ message: err instanceof Error ? err.message : "unknown" });
  }
}

export async function deleteCar(id: number): Promise<Result<true>> {
  const db = await createSupabase();
  try {
    const { error } = await db.from("checked_cars").delete().eq("id", id);
    if (error) return fail(error);
    return { ok: true, value: true };
  } catch (err) {
    return fail({ message: err instanceof Error ? err.message : "unknown" });
  }
}

/** Other saved cars (different VIN) whose listing had one of these phone numbers. */
/** `self` (title + price) skips earlier saves of this same listing when it has no VIN. */
export async function findPhoneMatches(phones: string[], vin: string | null, self?: { title: string; price: number | null }): Promise<PhoneMatch[]> {
  if (!phones.length) return [];
  const db = await createSupabase();
  try {
    const { data, error } = await db.from("checked_cars").select("id, title, price, vin, facts").order("updated_at", { ascending: false }).limit(300);
    if (error || !data) return [];
    return (data as { id: number; title: string; price: number | null; vin: string | null; facts: CarFacts | null }[])
      .filter((c) => (vin ? c.vin !== vin : !(self && c.title === self.title && c.price === self.price)) && (c.facts?.phones ?? []).some((p) => phones.includes(p)))
      .slice(0, 5)
      .map((c) => ({ id: c.id, title: c.title, price: c.price }));
  } catch {
    return [];
  }
}

/** Price change since the first time this car was seen: negative = dropped. */
export function priceChange(c: Pick<SavedCar, "history">): { from: number; to: number; diff: number } | null {
  if (c.history.length < 2) return null;
  const from = c.history[0].price;
  const to = c.history[c.history.length - 1].price;
  return from === to ? null : { from, to, diff: to - from };
}
