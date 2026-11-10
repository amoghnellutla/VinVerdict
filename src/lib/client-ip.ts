import "server-only";

import { headers } from "next/headers";

/**
 * The visitor's IP for rate limits. Prefer the headers Vercel's edge sets
 * itself (a visitor can't forge them); x-forwarded-for, which a client can
 * send, is only the fallback for local runs.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const first = (v: string | null) => v?.split(",")[0]?.trim() || "";
  return first(h.get("x-vercel-forwarded-for")) || first(h.get("x-real-ip")) || first(h.get("x-forwarded-for")) || "local";
}
