import "server-only";

import { createSupabase } from "@/lib/supabase/server";

export type User = { id: string; email: string | null };

/** "aal1" = password only; "aal2" = password + authenticator code. */
export type Login = User & { aal: "aal1" | "aal2" };

/**
 * The one login check (password + authenticator code). Every Server Action and route handler calls this
 * first, even though the proxy also checks: the proxy can be skipped by a
 * matcher change, this can't.
 *
 * Uses getClaims(), which verifies the token's signature (Supabase's advice),
 * instead of getSession(), which trusts whatever the cookie says. Returns
 * only the id and email, never the tokens.
 */
export async function currentUser(): Promise<User | null> {
  const login = await currentLogin();
  // Two-step login is required: a password-only session can do nothing but finish it.
  return login && login.aal === "aal2" ? { id: login.id, email: login.email } : null;
}

/**
 * Any login, including one that has only passed the password step. Only the
 * two-step login page and its actions may use this; everything else uses
 * currentUser().
 */
export async function currentLogin(): Promise<Login | null> {
  try {
    const supabase = await createSupabase();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    const email = typeof data.claims.email === "string" ? data.claims.email : null;
    return { id: data.claims.sub, email, aal: data.claims.aal === "aal2" ? "aal2" : "aal1" };
  } catch (err) {
    console.error("currentLogin failed", err instanceof Error ? err.message : "unknown error");
    return null;
  }
}
