"use server";

import { analyzeListing, type Analysis } from "@/lib/analyze";
import { currentUser } from "@/lib/auth/session";
import { findPhoneMatches, saveCar, type PhoneMatch } from "@/lib/cars/store";
import { clientIp } from "@/lib/client-ip";
import { MAX_LISTING_CHARS } from "@/lib/listing/parse";
import { rateLimit } from "@/lib/rate-limit";
import { buildVerdict } from "@/lib/verdict";

export type AnalyzeState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "done";
      id: number;
      analysis: Analysis;
      /** Row in "My cars", or null if it wasn't saved. */
      carId: number | null;
      /** Why it wasn't saved, when that's worth telling the user. */
      saveNote: string | null;
      /** Other saved cars whose listing had the same phone number. */
      phoneMatches: PhoneMatch[];
    };

const LIMIT_PER_MINUTE = 10;
const cap = (s: string | null | undefined) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : null);

/**
 * Server Action behind the "Analyze" button. Reachable by direct POST, so it
 * validates everything itself. Next.js already rejects cross-site requests
 * (Origin check) and bodies over 1 MB.
 */
export async function analyzeAction(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  // Login first, before reading anything else.
  if (!(await currentUser())) {
    return { status: "error", message: "Your login has expired. Reload the page and log in again." };
  }

  const raw = formData.get("listing");
  if (typeof raw !== "string") return { status: "error", message: "Paste a listing, link or VIN first." };
  const text = raw.trim();
  if (!text) return { status: "error", message: "Paste a listing, link or VIN first." };
  if (text.length > MAX_LISTING_CHARS) {
    return { status: "error", message: `That's too long. Paste up to ${MAX_LISTING_CHARS.toLocaleString("en-US")} characters.` };
  }

  const ip = await clientIp();
  if (!rateLimit(`analyze:${ip}`, LIMIT_PER_MINUTE, 60_000)) {
    return { status: "error", message: "Too many checks in a minute. Wait a moment and try again." };
  }

  let analysis: Analysis;
  try {
    analysis = await analyzeListing(text);
  } catch (err) {
    console.error("analyzeAction failed", err);
    return { status: "error", message: "Something went wrong while checking that listing. Try again." };
  }

  // Save it to "My cars" (a link alone has nothing worth saving).
  let carId: number | null = null;
  let saveNote: string | null = null;
  const l = analysis.listing;
  const d = analysis.decoded;
  const title = [d?.year ?? l.year, cap(d?.make) ?? l.make, d?.model ?? l.model, d?.trim].filter(Boolean).join(" ") || (l.vin ? `VIN ${l.vin}` : "Car");
  // Look for the same phone before saving this car, so it doesn't match itself.
  const phoneMatches = l.sellerType !== "dealer" && l.kind !== "url" ? await findPhoneMatches(l.phones, l.vin, { title, price: l.price }) : [];
  if (l.kind !== "url") {
    const v = buildVerdict(analysis, {});
    const order = { hide: 0, flag: 1, info: 2 } as const;
    const saved = await saveCar({
      vin: l.vin && analysis.vinCheck?.ok ? l.vin : null,
      title,
      sourceUrl: l.url,
      sourceHost: l.sourceHost,
      price: l.price,
      miles: l.miles,
      verdict: v.verdict,
      risk: v.risk,
      facts: {
        year: d?.year ?? l.year, make: cap(d?.make) ?? l.make, model: d?.model ?? l.model, trim: d?.trim ?? null,
        seller: l.sellerType, accident: l.accident, title: l.titleStatus, owners: l.ownerCount, usage: l.usage, zip: l.zip,
        phones: l.phones,
        findings: [...v.hits].sort((x, y) => order[x.action] - order[y.action]).filter((h) => h.action !== "info").slice(0, 5).map((h) => h.title),
      },
      listingText: l.kind === "vin" ? null : text,
    });
    if (saved.ok) carId = saved.value;
    else if (saved.error === "not-set-up") saveNote = "Saving to My cars needs a one-time database setup (docs/SETUP.md, step 8).";
  }
  return { status: "done", id: Date.now(), analysis, carId, saveNote, phoneMatches };
}
