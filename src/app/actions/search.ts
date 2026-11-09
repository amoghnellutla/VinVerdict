"use server";

import { currentUser } from "@/lib/auth/session";
import { clientIp } from "@/lib/client-ip";
import { zipToState } from "@/lib/geo/zip";
import { rateLimit } from "@/lib/rate-limit";
import { searchDealers, searchPrivate, type SearchFilters } from "@/lib/search/client";
import { rankResults, type SearchResult } from "@/lib/search/rank";
import { quotaBlock, recordUsage } from "@/lib/usage";

export type SearchState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; results: SearchResult[]; filters: SearchFilters; notes: string[]; total: number };

const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: FormDataEntryValue | null, min: number, max: number) => {
  const n = Number(text(v, 12).replace(/[,$\s]/g, ""));
  return text(v, 12) && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** The Search button (Phase 7). Costs 1 MarketCheck call, 2 with private sellers; cached for a day. */
export async function searchAction(_prev: SearchState, form: FormData): Promise<SearchState> {
  if (!(await currentUser())) return { status: "error", message: "Your login has expired. Reload the page and log in again." };

  const make = text(form.get("make"), 40);
  const model = text(form.get("model"), 60);
  const zip = text(form.get("zip"), 5);
  const thisYear = new Date().getFullYear();
  const minYear = int(form.get("minYear"), 1990, thisYear + 1) ?? thisYear - 10;
  const maxYear = int(form.get("maxYear"), 1990, thisYear + 1) ?? thisYear;
  if (!/^[a-z][a-z -]{1,39}$/i.test(make) || !/^[a-z0-9][a-z0-9 -]{0,59}$/i.test(model)) return { status: "error", message: "Enter a make and model, like Toyota Camry." };
  if (!/^\d{5}$/.test(zip) || !zipToState(zip)) return { status: "error", message: "Enter your 5-digit US ZIP code." };
  if (minYear > maxYear || maxYear - minYear > 15) return { status: "error", message: "Pick a year range of up to 15 years." };
  const filters: SearchFilters = {
    make, model, minYear, maxYear, zip,
    maxPrice: int(form.get("maxPrice"), 1_000, 500_000),
    maxMiles: int(form.get("maxMiles"), 1_000, 400_000),
    radius: int(form.get("radius"), 10, 100) ?? 100,
  };
  const withPrivate = form.get("private") === "on";

  const ip = await clientIp();
  if (!rateLimit(`search:${ip}`, 4, 60_000) || !rateLimit("search:day", 30, 86_400_000)) {
    return { status: "error", message: "Search limit reached for now, to protect the free API quota. Try again later." };
  }
  const blocked = await quotaBlock({ marketcheck: withPrivate ? 2 : 1 });
  if (blocked) return { status: "error", message: blocked };

  const notes: string[] = [];
  const [d, p] = await Promise.allSettled([searchDealers(filters), withPrivate ? searchPrivate(filters) : Promise.resolve([])]);
  await recordUsage({ marketcheck: withPrivate ? 2 : 1 });
  if (d.status === "rejected" && (!withPrivate || p.status === "rejected")) {
    console.error("search failed", d.reason instanceof Error ? d.reason.message : "unknown");
    return { status: "error", message: "The listing search didn't answer just now. Try again in a minute." };
  }
  if (d.status === "rejected") notes.push("Dealer listings didn't load; showing private sellers only.");
  if (withPrivate && p.status === "rejected") notes.push("Private-seller listings didn't load; showing dealers only.");
  const all = [...(d.status === "fulfilled" ? d.value : []), ...(p.status === "fulfilled" ? p.value : [])];
  const results = rankResults(all, { automaticOnly: true, blackOnly: form.get("blackOnly") === "on", preferBlack: true });
  if (all.length >= 50) notes.push("Showing the first 50 results per seller type (free plan limit). Narrow the filters to see the rest.");
  return { status: "done", results, filters, notes, total: all.length };
}
