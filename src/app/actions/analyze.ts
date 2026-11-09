"use server";

import { headers } from "next/headers";
import { analyzeListing, type Analysis } from "@/lib/analyze";
import { MAX_LISTING_CHARS } from "@/lib/listing/parse";
import { rateLimit } from "@/lib/rate-limit";

export type AnalyzeState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; id: number; analysis: Analysis };

const LIMIT_PER_MINUTE = 10;

/**
 * Server Action behind the "Analyze" button. Reachable by direct POST, so it
 * validates everything itself. Next.js already rejects cross-site requests
 * (Origin check) and bodies over 1 MB.
 *
 * TODO(Phase 2b): require login here before anything else.
 */
export async function analyzeAction(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  const raw = formData.get("listing");
  if (typeof raw !== "string") return { status: "error", message: "Paste a listing, link or VIN first." };
  const text = raw.trim();
  if (!text) return { status: "error", message: "Paste a listing, link or VIN first." };
  if (text.length > MAX_LISTING_CHARS) {
    return { status: "error", message: `That's too long. Paste up to ${MAX_LISTING_CHARS.toLocaleString("en-US")} characters.` };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (!rateLimit(`analyze:${ip}`, LIMIT_PER_MINUTE, 60_000)) {
    return { status: "error", message: "Too many checks in a minute. Wait a moment and try again." };
  }

  try {
    const analysis = await analyzeListing(text);
    return { status: "done", id: Date.now(), analysis };
  } catch (err) {
    console.error("analyzeAction failed", err);
    return { status: "error", message: "Something went wrong while checking that listing. Try again." };
  }
}
