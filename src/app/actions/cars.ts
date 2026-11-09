"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { deleteCar, getCars, recordPrice } from "@/lib/cars/store";
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
