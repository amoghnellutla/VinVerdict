import "server-only";
import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";

/**
 * Cloudflare Turnstile: proves a demo visitor is a person before a live price
 * check spends API quota. The browser widget gives a one-time token; this
 * checks it with Cloudflare (server to server, secret key never leaves here).
 * Tokens are single-use and expire after 5 minutes on Cloudflare's side.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type SiteverifyReply = { success?: unknown; action?: unknown; hostname?: unknown; "error-codes"?: unknown };

/** Pure check of Cloudflare's answer: success, the expected action, and this site's hostname. */
export function acceptSiteverify(reply: SiteverifyReply, action: string, host: string | null): boolean {
  if (reply.success !== true || reply.action !== action) return false;
  if (!host || typeof reply.hostname !== "string") return false;
  return reply.hostname.toLowerCase() === host.toLowerCase();
}

export async function verifyTurnstile(token: FormDataEntryValue | null, action: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || typeof token !== "string" || token.length < 10 || token.length > 2048) return false;
  const h = await headers();
  const host = (h.get("host") ?? "").replace(/:\d+$/, "") || null;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: await clientIp() }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    return acceptSiteverify((await res.json()) as SiteverifyReply, action, host);
  } catch (err) {
    console.error("turnstile verify failed", err instanceof Error ? err.message : "unknown error");
    return false;
  }
}
