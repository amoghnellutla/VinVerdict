import "server-only";
import { createHmac } from "node:crypto";
import { clientIp } from "@/lib/client-ip";
import { createSupabase } from "@/lib/supabase/server";

/**
 * Demo-visitor limits (public demo, no account). Each visitor is a salted
 * one-way hash of their IP: the raw IP never leaves this server. The counter
 * and its limits live in Supabase (supabase/migrations/20261111_guest_demo.sql),
 * so they hold across every Vercel instance, and a caller can't change them.
 */

export type GuestKind = "check" | "price";
export type Allowance = "ok" | "visitor" | "global" | "month" | "unavailable";

const ANSWERS: readonly Allowance[] = ["ok", "visitor", "global", "month"];

/** HMAC-SHA256(ip, GUEST_HASH_SALT) as 64 hex characters; null without a proper salt. */
export function hashVisitor(ip: string, salt: string | undefined): string | null {
  if (!salt || salt.length < 32) return null;
  return createHmac("sha256", salt).update(ip).digest("hex");
}

export async function takeGuestAllowance(kind: GuestKind): Promise<Allowance> {
  const visitor = hashVisitor(await clientIp(), process.env.GUEST_HASH_SALT);
  if (!visitor) return "unavailable";
  const db = await createSupabase();
  try {
    const { data, error } = await db.rpc("take_guest_allowance", { p_visitor: visitor, p_kind: kind });
    if (error) {
      console.error("guest allowance failed", error.code ?? "", error.message);
      return "unavailable";
    }
    return ANSWERS.includes(data as Allowance) ? (data as Allowance) : "unavailable";
  } catch (err) {
    console.error("guest allowance failed", err instanceof Error ? err.message : "unknown error");
    return "unavailable";
  }
}

/** What to tell a demo visitor when they're over a limit. */
export function allowanceMessage(a: Exclude<Allowance, "ok">, kind: GuestKind): string {
  if (kind === "price") {
    if (a === "visitor") return "Demo limit: two live lookups per visitor per day. The full examples on the home page include lookups.";
    if (a === "global") return "Today's live price checks for the demo are used up. The full examples on the home page show complete checks; try again tomorrow.";
    if (a === "month") return "This month's live price checks for the demo are used up. The full examples on the home page show complete checks.";
    return "Live price checks aren't available in the demo right now. The full examples on the home page show complete checks.";
  }
  if (a === "visitor") return "Demo limit reached for today (30 checks). Try again tomorrow.";
  if (a === "global") return "The demo is very busy today. Try again tomorrow.";
  return "The demo isn't available right now. Try again in a minute.";
}
