"use server";

import { currentUser } from "@/lib/auth/session";
import { saveValue } from "@/lib/cars/store";
import { clientIp } from "@/lib/client-ip";
import { allowanceMessage, takeGuestAllowance } from "@/lib/guest/allowance";
import { verifyTurnstile } from "@/lib/guest/turnstile";
import { fetchVinHistory } from "@/lib/history/client";
import type { HistoryRecord } from "@/lib/history/parse";
import { historyRuleHits, recentMiles, savedHistory, summarizeHistory } from "@/lib/history/summary";
import { parseListing } from "@/lib/listing/parse";
import { zipToState } from "@/lib/geo/zip";
import { lookupLiveListing } from "@/lib/live/client";
import type { LiveListing } from "@/lib/live/parse";
import { rateLimit } from "@/lib/rate-limit";
import type { AccidentStatus, SellerType, TitleStatus, Usage } from "@/lib/listing/parse";
import { fetchPredicted, fetchPriceSources, type PriceCheck } from "@/lib/value/client";
import { valueCar } from "@/lib/value/estimate";
import { quotaBlock, recordUsage } from "@/lib/usage";
import { checkVin, normalizeVin } from "@/lib/vin";

export type PriceState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "done";
      live: LiveListing | null;
      /** Past listings of this VIN (oldest first); null without a VIN or if the lookup failed. */
      history: HistoryRecord[] | null;
      /** null when year/make/model are unknown even after the live lookup. */
      sources: PriceCheck | null;
      /** What was priced (the page re-prices from the comps if the details are edited). */
      car: { year: number; make: string; model: string; trim: string | null; miles: number | null } | null;
      notes: string[];
    };

// The whole check answers within this, even when a listing site hangs (each call also has its own timeout).
const DEADLINE_MS = 25_000;

// Quota guards (PLAN.md §10): a check spends up to 5 calls (3 MarketCheck, 2 Auto.dev).
// In-memory per server instance until the Phase 7 usage meter.
const PER_IP_PER_MINUTE = 3;
const PER_DAY = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: FormDataEntryValue | null, min: number, max: number) => {
  const n = Number(text(v, 12).replace(/[,$]/g, ""));
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * "Check price & history" (features 2 + 2b). Reachable by direct POST, so it
 * checks login and validates every field itself. Only runs on a click.
 */
export async function priceCheckAction(_prev: PriceState, form: FormData): Promise<PriceState> {
  // Owner (two-step login) or demo visitor. Visitors get a lean, rationed check (below).
  const owner = await currentUser();

  const vinRaw = normalizeVin(text(form.get("vin"), 40));
  const vin = vinRaw && checkVin(vinRaw).ok ? vinRaw : null;
  // ZIP for local prices. With a VIN it may be left out: the car is still looked up
  // online, and priced where it's listed (or not priced until a ZIP is given).
  const zipIn = text(form.get("zip"), 5);
  const zip = validZip(zipIn) ?? validZip(text(form.get("listingZip"), 5));
  if (!zip && (zipIn || !vin)) return { status: "error", message: "Enter your 5-digit US ZIP code, so prices are local." };
  const year = int(form.get("year"), 1981, new Date().getFullYear() + 1);
  let make = text(form.get("make"), 40) || null;
  let model = text(form.get("model"), 60) || null;
  const trim = text(form.get("trim"), 60) || null;
  const miles = int(form.get("miles"), 0, 600_000);
  if (make && !/^[a-z][a-z -]{1,39}$/i.test(make)) make = null;
  if (model && !/^[a-z0-9][a-z0-9 .-]{0,59}$/i.test(model)) model = null;
  if (!vin && !(year && make && model)) return { status: "error", message: "Need the VIN, or the year, make and model, to check the price." };

  const ip = await clientIp();
  if (!rateLimit(`price:${ip}`, PER_IP_PER_MINUTE, 60_000)) return { status: "error", message: "Too many checks in a minute. Wait a moment and try again." };
  if (!rateLimit("price:day", PER_DAY, DAY_MS)) return { status: "error", message: `Daily limit reached (${PER_DAY} price checks), to protect the free API quota. Try again tomorrow.` };
  if (owner) {
    const blocked = await quotaBlock({ marketcheck: 4, autodev: 2 });
    if (blocked) return { status: "error", message: blocked };
  } else {
    // Demo visitor: prove you're a person, then the shared daily/monthly allowance
    // (Supabase, also keeps the owner's monthly reserve). Order matters: a bot
    // without a valid token never touches the counter.
    if (!(await verifyTurnstile(form.get("cf-turnstile-response"), "price"))) {
      return { status: "error", message: "Please complete the \"I'm human\" check below the button, then press it again." };
    }
    const allowed = await takeGuestAllowance("price");
    if (allowed !== "ok") return { status: "error", message: allowanceMessage(allowed, "price") };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<PriceState>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "error", message: "The listing sites took longer than 25 seconds to answer. Try again in a minute: whatever came back is cached, so the next try is quicker." }),
      DEADLINE_MS,
    );
  });
  try {
    return await Promise.race([runCheck(form, { owner: !!owner, vin, year, make, model, trim, miles, zip }), late]);
  } finally {
    clearTimeout(timer);
  }
}

const validZip = (z: string | null | undefined) => (z && /^\d{5}$/.test(z) && zipToState(z) ? z : null);

type CheckInput = { owner: boolean; vin: string | null; year: number | null; make: string | null; model: string | null; trim: string | null; miles: number | null; zip: string | null };

async function runCheck(form: FormData, input: CheckInput): Promise<PriceState> {
  const { owner, vin, trim } = input;
  let { year, make, model, miles, zip } = input;
  const notes: string[] = [];
  // When the car is already known (VIN decode or listing) the price search starts now, alongside the lookups.
  const milesUpfront = miles;
  const early = year && make && model && zip
    ? fetchPriceSources({ vin, year, make, model, trim, miles, zip }, { skipPriceModel: !owner || miles === null })
    : null;
  try {
    let live: LiveListing | null = null;
    let liveTried: string[] = [];
    let history: HistoryRecord[] | null = null;
    if (vin) {
      const [r, h] = await Promise.all([
        // Visitors: Auto.dev only (1,000/month), never the MarketCheck backup.
        lookupLiveListing(vin, owner ? undefined : { autoDevOnly: true }),
        fetchVinHistory(vin).catch((err) => {
          console.error("vin history failed", err instanceof Error ? err.message : "unknown error");
          notes.push("The listing history didn't answer just now. Try again later.");
          return null;
        }),
      ]);
      live = r.listing;
      liveTried = r.tried;
      history = h;
      if (r.failed.length) notes.push(`${r.failed.join(" and ")} didn't answer for the live listing.`);
    }
    // Calls made so far (live lookup + history), counted even if no price check follows.
    const lookupCalls = { autodev: liveTried.includes("Auto.dev") ? 1 : 0, marketcheck: (liveTried.includes("MarketCheck") ? 1 : 0) + (vin && process.env.MARKETCHECK_API_KEY ? 1 : 0) };
    year ??= live?.year ?? null;
    make ??= live?.make ?? null;
    model ??= live?.model ?? null;
    miles ??= live?.miles ?? null;
    if (miles === null && history) {
      const seen = recentMiles(history);
      if (seen) {
        miles = seen.miles;
        notes.push(`Miles taken from its last listing (${seen.miles.toLocaleString("en-US")} on ${seen.date}). Check the dashboard.`);
      }
    }
    if (!(year && make && model)) {
      if (owner) await recordUsage(lookupCalls);
      return { status: "done", live, history, sources: null, car: null, notes: [...notes, "Couldn't tell the year, make and model, so there's no price check. Paste the listing text too."] };
    }
    zip ??= validZip(live?.zip);
    if (!zip) {
      if (owner) await recordUsage(lookupCalls);
      return { status: "done", live, history, sources: null, car: { year, make, model, trim: trim ?? live?.trim ?? null, miles }, notes };
    }
    // Visitors skip MarketCheck's price model (1 call): sold + for-sale comps still price the car.
    let sources: PriceCheck;
    if (early) {
      sources = await early;
      // Miles found only now (VIN only): the owner's price model runs with them.
      if (owner && vin && milesUpfront === null && miles !== null) sources = { ...sources, predicted: await fetchPredicted(vin, miles, zip) };
    } else {
      sources = await fetchPriceSources({ vin, year, make, model, trim: trim ?? live?.trim ?? null, miles, zip }, { skipPriceModel: !owner });
    }
    // The owner's meter is per login; visitor use is counted by the guest allowance.
    if (owner) {
      await recordUsage({
        autodev: lookupCalls.autodev + 1,
        marketcheck: lookupCalls.marketcheck + (vin && miles !== null ? 1 : 0) + 1,
      });
    }
    if (sources.failed.length) notes.push(`Couldn't reach ${sources.failed.join(", ")} just now; the value uses the other sources.`);
    if (miles === null) notes.push("The miles are unknown, so the value is for an average-mileage car.");

    // Remember the result in "My cars" (if this check was saved there).
    // Only the owner has a My cars; a visitor's form can't make the server save anything.
    const carId = owner ? int(form.get("carId"), 1, Number.MAX_SAFE_INTEGER) : null;
    if (carId) {
      // The page's value wins unless it's "unknown"; then the live listing's (or the default).
      const pick = <T extends string>(v: FormDataEntryValue | null, allowed: readonly T[], dflt: T): T => {
        const t = text(v, 20) as T;
        return allowed.includes(t) && t !== "unknown" ? t : dflt;
      };
      const price = int(form.get("price"), 1, 1_000_000) ?? live?.price ?? null;
      const v = valueCar(sources, {
        price, miles,
        sellerType: pick<SellerType>(form.get("sellerType"), ["private", "dealer", "unknown"], live?.sellerType ?? "unknown"),
        accident: live?.accidentCount ? "reported" : pick<AccidentStatus>(form.get("accident"), ["none", "reported", "unknown"], "unknown"),
        titleStatus: pick<TitleStatus>(form.get("titleStatus"), ["clean", "salvage", "rebuilt", "flood", "lemon", "branded", "unknown"], "unknown"),
        usage: pick<Usage>(form.get("usage"), ["personal", "fleet", "rental", "unknown"], live?.usage ?? "unknown"),
      });
      // History findings for this car as the page sees it (seller, price, miles).
      let kept = null;
      if (history) {
        const h = summarizeHistory(history);
        const asListed = { ...parseListing(""), kind: "text" as const, sellerType: pick<SellerType>(form.get("sellerType"), ["private", "dealer", "unknown"], "unknown"), price, miles: int(form.get("miles"), 0, 600_000) };
        kept = savedHistory(h, historyRuleHits(asListed, h));
      }
      if (v) await saveValue(carId, { fairLow: v.low, fairHigh: v.high, dealLabel: v.label, fair: v.fair }, live && !live.removedAt ? { price: live.price, source: live.source } : null, kept);
    }
    return { status: "done", live, history, sources, car: { year, make, model, trim: trim ?? live?.trim ?? null, miles }, notes };
  } catch (err) {
    console.error("priceCheckAction failed", err instanceof Error ? err.message : "unknown error");
    return { status: "error", message: "Something went wrong while checking the price. Try again." };
  }
}
