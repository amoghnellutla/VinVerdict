/**
 * The buyer's ZIP, remembered on this device only (localStorage), shared by
 * the price check and the out-the-door calculator. Per-viewer convenience:
 * every read and write is wrapped, so a blocked or private-mode storage just
 * means typing the ZIP again.
 */

import { isStateCode, type StateCode } from "@/lib/geo/zip";

const KEY = "vinverdict.buyerZip";

/** `saved` is false when nothing was saved and New Jersey is only the default. */
export function readBuyerZip(): { zip: string; state: StateCode; saved: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { zip?: unknown; state?: unknown } | null;
    if (raw && typeof raw.zip === "string" && typeof raw.state === "string" && isStateCode(raw.state)) {
      return { zip: raw.zip.replace(/\D/g, "").slice(0, 5), state: raw.state, saved: true };
    }
  } catch {}
  return { zip: "", state: "NJ", saved: false };
}

export function saveBuyerZip(zip: string, state: StateCode) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ zip, state }));
  } catch {}
}
