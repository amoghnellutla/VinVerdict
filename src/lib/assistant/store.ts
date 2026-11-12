/**
 * What the person told VinVerdict about a car, kept on their own device (localStorage)
 * for 7 days, so a refresh or coming back later doesn't lose it. Per car: keyed by the
 * VIN, or by the pasted text when there's no VIN. Never sent anywhere. Any storage
 * error (private mode, full, blocked) just means nothing is kept.
 */

import type { Told } from "./apply";

const PREFIX = "vv-told:";
const KEEP_MS = 7 * 86_400_000;
const MAX_ITEMS = 20;

/** A short stable key for a car. */
export function toldKey(vin: string | null, text: string): string {
  if (vin) return `${PREFIX}${vin}`;
  let h = 0;
  for (const ch of text.slice(0, 2_000)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `${PREFIX}t${(h >>> 0).toString(36)}`;
}

const valid = (t: unknown): t is Told => {
  const o = t as Told;
  return !!o && typeof o.id === "string" && typeof o.label === "string" && o.label.length <= 300 && (o.text === undefined || (typeof o.text === "string" && o.text.length <= 20_000));
};

export function loadTold(key: string, now = Date.now()): Told[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw) as { at?: number; told?: unknown };
    if (typeof v.at !== "number" || now - v.at > KEEP_MS || !Array.isArray(v.told)) return [];
    return v.told.filter(valid).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveTold(key: string, told: Told[], now = Date.now()): void {
  try {
    if (told.length) globalThis.localStorage?.setItem(key, JSON.stringify({ at: now, told: told.slice(-MAX_ITEMS) }));
    else globalThis.localStorage?.removeItem(key);
  } catch {
    // Storage blocked or full: nothing is kept, the page still works.
  }
}

/**
 * The conversation with the assistant, kept the same way (this device, 7 days, per car), so
 * coming back shows what was asked and answered. Screenshots and report text for a close read
 * aren't kept (their links die with the page); the last 40 messages are.
 */
export type StoredMsg = { id: string; who: "you" | "vv"; text: string; [k: string]: unknown };
const MAX_MSGS = 40;

const validMsg = (m: unknown): m is StoredMsg => {
  const o = m as StoredMsg;
  return !!o && typeof o.id === "string" && (o.who === "you" || o.who === "vv") && typeof o.text === "string" && o.text.length <= 5_000;
};

export function loadThread<T extends StoredMsg>(key: string, now = Date.now()): T[] {
  try {
    const raw = globalThis.localStorage?.getItem(`${key}:thread`);
    if (!raw) return [];
    const v = JSON.parse(raw) as { at?: number; thread?: unknown };
    if (typeof v.at !== "number" || now - v.at > KEEP_MS || !Array.isArray(v.thread)) return [];
    return v.thread.filter(validMsg).slice(-MAX_MSGS) as T[];
  } catch {
    return [];
  }
}

export function saveThread(key: string, thread: StoredMsg[], now = Date.now()): void {
  try {
    const keep = thread.slice(-MAX_MSGS).map((m) => {
      const copy = { ...m };
      delete copy.read;
      return copy;
    });
    if (keep.length) globalThis.localStorage?.setItem(`${key}:thread`, JSON.stringify({ at: now, thread: keep }));
    else globalThis.localStorage?.removeItem(`${key}:thread`);
  } catch {
    // Storage blocked or full: the conversation just isn't kept.
  }
}
