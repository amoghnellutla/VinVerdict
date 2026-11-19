"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { parseBase, parseFields, toSaveInput } from "@/lib/cars/draft";
import { deleteCar, getCars, recordPrice, saveCar, saveProof, saveValue } from "@/lib/cars/store";
import type { DealLabel } from "@/lib/value/estimate";
import { parseSavedProof } from "@/lib/evidence/validate";
import { clientIp } from "@/lib/client-ip";
import { lookupLiveListing } from "@/lib/live/client";
import { rateLimit } from "@/lib/rate-limit";
import { quotaBlock, recordUsage } from "@/lib/usage";

export type CarActionState = { status: "idle" } | { status: "error" | "done"; message: string };

const idOf = (v: FormDataEntryValue | null) => {
  const n = Number(typeof v === "string" ? v : "");
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Remove a car from "My cars" (and its price history). Row-level security keeps it to your own cars. */
export async function deleteCarAction(_prev: CarActionState, form: FormData): Promise<CarActionState> {
  if (!(await currentUser())) return { status: "error", message: "Your login has expired. Reload and log in again." };
  const id = idOf(form.get("id"));
  if (!id) return { status: "error", message: "Unknown car." };
  const r = await deleteCar(id);
  if (!r.ok) return { status: "error", message: "Couldn't remove it just now. Try again." };
  redirect("/checked");
}

/**
 * "Check for a price drop": looks the VIN up again (1 Auto.dev call, cached
 * for an hour) and adds the price to the car's history if it changed.
 */
export async function recheckPriceAction(_prev: CarActionState, form: FormData): Promise<CarActionState> {
  if (!(await currentUser())) return { status: "error", message: "Your login has expired. Reload and log in again." };
  const id = idOf(form.get("id"));
  if (!id) return { status: "error", message: "Unknown car." };
  const ip = await clientIp();
  if (!rateLimit(`recheck:${ip}`, 5, 60_000) || !rateLimit("recheck:day", 60, 86_400_000)) {
    return { status: "error", message: "Too many price checks for now, to protect the free API quota. Try again later." };
  }
  const blocked = await quotaBlock({ autodev: 1, marketcheck: 1 });
  if (blocked) return { status: "error", message: blocked };
  const found = await getCars([id]);
  if (!found.ok || !found.value[0]) return { status: "error", message: "Couldn't find that car." };
  const car = found.value[0];
  if (!car.vin) return { status: "error", message: "This car has no VIN, so its listing can't be looked up again." };
  const live = await lookupLiveListing(car.vin);
  await recordUsage({ autodev: live.tried.includes("Auto.dev") ? 1 : 0, marketcheck: live.tried.includes("MarketCheck") ? 1 : 0 });
  const l = live.listing;
  if (!l || l.removedAt || !l.price) {
    return { status: "done", message: l?.removedAt ? `The listing ended ${l.removedAt.slice(0, 10)}: it may have sold.` : "No active listing found for this VIN right now." };
  }
  const before = car.price;
  await recordPrice(id, l.price, l.source);
  refresh();
  if (before && l.price < before) return { status: "done", message: `Price dropped by $${(before - l.price).toLocaleString("en-US")} to $${l.price.toLocaleString("en-US")}.` };
  if (before && l.price > before) return { status: "done", message: `Price went up to $${l.price.toLocaleString("en-US")}.` };
  return { status: "done", message: `Same price: $${l.price.toLocaleString("en-US")}.` };
}

const LABELS: readonly DealLabel[] = ["great", "good", "fair", "high", "over"];

/**
 * "Save to My cars", after the owner reviewed what will be stored. Everything is checked again here (the browser
 * can send anything): the check's part (`parseBase`), the reviewed fields (`parseFields`), and a price check that
 * already ran on the page, which is kept with the car.
 */
export async function saveCheckedCarAction(payload: string): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  if (!(await currentUser())) return { ok: false, message: "Your login has expired. Reload and log in again." };
  const ip = await clientIp();
  if (!rateLimit(`save:${ip}`, 20, 60_000)) return { ok: false, message: "Too many saves at once. Try again in a minute." };
  if (typeof payload !== "string" || payload.length > 60_000) return { ok: false, message: "That couldn't be saved." };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "That couldn't be saved." };
  }
  const base = parseBase(raw.base);
  const fields = parseFields(raw.fields);
  if (!base) return { ok: false, message: "That couldn't be saved." };
  if (!fields) return { ok: false, message: "A field is out of range: check the link (https://…), price, miles and MPG." };
  const saved = await saveCar(toSaveInput(base, fields));
  if (!saved.ok) return { ok: false, message: saved.error === "not-set-up" ? "Saving to My cars needs a one-time database setup (docs/SETUP.md, step 8)." : "Couldn't save just now. Try again." };
  // A price check that already ran on the page: keep its fair range with the car.
  const v = (raw.value ?? null) as Record<string, unknown> | null;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1_000_000 ? Math.round(x) : null);
  if (v && n(v.fairLow) != null && n(v.fairHigh) != null && n(v.fair) != null) {
    const label = LABELS.includes(v.dealLabel as DealLabel) ? (v.dealLabel as DealLabel) : null;
    await saveValue(saved.value, { fairLow: n(v.fairLow)!, fairHigh: n(v.fairHigh)!, dealLabel: label, fair: n(v.fair)! }, null);
  }
  return { ok: true, id: saved.value };
}

/** Keep the findings from proof the owner attached with a saved car (labels only). */
export async function saveProofAction(id: number, payload: string): Promise<{ ok: boolean }> {
  if (!(await currentUser())) return { ok: false };
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false };
  const ip = await clientIp();
  if (!rateLimit(`proof:${ip}`, 20, 60_000)) return { ok: false };
  const items = parseSavedProof(payload);
  if (!items) return { ok: false };
  const r = await saveProof(id, items);
  return { ok: r.ok };
}
