"use server";

import { clientIp } from "@/lib/client-ip";
import { decodeVin } from "@/lib/nhtsa/client";
import type { DecodedVin } from "@/lib/nhtsa/parse";
import { rateLimit } from "@/lib/rate-limit";
import { checkVin, normalizeVin } from "@/lib/vin";

export type DecodeResult = { ok: true; decoded: DecodedVin } | { ok: false; message: string };

/**
 * The home page's VIN decoder: NHTSA's free decode of one VIN (cached for
 * weeks), for visitors too. No paid lookups. Reachable by direct POST, so it
 * validates the VIN itself and is rate-limited per visitor and per day.
 */
export async function decodeVinAction(raw: unknown): Promise<DecodeResult> {
  if (typeof raw !== "string" || raw.length > 40) return { ok: false, message: "That isn't a VIN." };
  const vin = normalizeVin(raw);
  const check = checkVin(vin);
  // A bad check digit still decodes: it shows whether it's a typo of a real car.
  if (!check.ok && check.reason !== "check-digit") return { ok: false, message: check.message };
  const ip = await clientIp();
  if (!rateLimit(`decode:${ip}`, 20, 60_000) || !rateLimit("decode:day", 5_000, 86_400_000)) {
    return { ok: false, message: "Too many lookups for now. Wait a minute and try again." };
  }
  try {
    return { ok: true, decoded: await decodeVin(vin) };
  } catch {
    return { ok: false, message: "NHTSA didn't answer just now. Try again in a minute." };
  }
}
