import "server-only";
import { createSupabase } from "@/lib/supabase/server";

/**
 * Monthly API usage meter (PLAN.md §10, Phase 7). Counts requests per
 * provider for the logged-in user in Supabase (row-level security). It
 * counts every request, even ones the "use cache" layer may answer for free,
 * so it errs high: a safe guide for the free quotas. If the table isn't set
 * up yet, recording is skipped silently and the meter shows nothing.
 */

export type Provider = "marketcheck" | "autodev";
export const MONTHLY_LIMIT: Record<Provider, number> = { marketcheck: 500, autodev: 1_000 };

const month = (d = new Date()) => d.toISOString().slice(0, 7);

export async function recordUsage(counts: Partial<Record<Provider, number>>): Promise<void> {
  const db = await createSupabase();
  try {
    const m = month();
    for (const [provider, n] of Object.entries(counts) as [Provider, number][]) {
      if (!n) continue;
      // Atomic add (supabase/migrations/20261110_security_hardening.sql); the
      // read-then-write below is the fallback until that file has been run.
      const rpc = await db.rpc("add_api_usage", { p_provider: provider, p_calls: n });
      if (!rpc.error) continue;
      const cur = await db.from("api_usage").select("calls").eq("month", m).eq("provider", provider).maybeSingle();
      if (cur.error) return; // table missing or not reachable: the meter is optional
      await db.from("api_usage").upsert({ month: m, provider, calls: (cur.data?.calls ?? 0) + n }, { onConflict: "user_id,month,provider" });
    }
  } catch {
    // Optional feature: never let the meter break a check.
  }
}

export async function getUsage(): Promise<Record<Provider, number> | null> {
  const db = await createSupabase();
  try {
    const { data, error } = await db.from("api_usage").select("provider, calls").eq("month", month());
    if (error) return null;
    const out: Record<Provider, number> = { marketcheck: 0, autodev: 0 };
    for (const r of data ?? []) if (r.provider === "marketcheck" || r.provider === "autodev") out[r.provider as Provider] = r.calls as number;
    return out;
  } catch {
    return null;
  }
}

/** Keep this share of each monthly quota unused, as a safety margin. */
const RESERVE = 0.05;

/**
 * Hard stop before spending quota: refuses when this month's recorded calls
 * plus what the next step needs would pass the free limit (minus a 5%
 * margin). Stored in Supabase, so it holds across every server instance,
 * unlike the in-memory per-minute limits. Returns a message to show, or null
 * when it's fine. If the usage table isn't set up, it can't tell and allows
 * the call (the in-memory daily caps still apply).
 */
export async function quotaBlock(needs: Partial<Record<Provider, number>>): Promise<string | null> {
  const used = await getUsage();
  if (!used) return null;
  // Demo visitors' live checks this month (~2 MarketCheck + 2 Auto.dev each).
  const guest = await guestMonthChecks();
  used.marketcheck += guest * 2;
  used.autodev += guest * 2;
  for (const [provider, n] of Object.entries(needs) as [Provider, number][]) {
    if (n && used[provider] + n > MONTHLY_LIMIT[provider] * (1 - RESERVE)) {
      const name = provider === "marketcheck" ? "MarketCheck" : "Auto.dev";
      return `This month's free ${name} lookups are used up (${used[provider]} of ${MONTHLY_LIMIT[provider]}). They reset on the 1st.`;
    }
  }
  return null;
}

async function guestMonthChecks(): Promise<number> {
  const db = await createSupabase();
  try {
    const { data, error } = await db.rpc("guest_month_usage");
    return !error && typeof data === "number" && data >= 0 ? data : 0;
  } catch {
    return 0;
  }
}
