import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Supabase settings shared by the proxy and server code.
 *
 * The URL and publishable key are public by design (Supabase's row-level
 * security protects data), but VinVerdict only uses them on the server: the
 * browser never talks to Supabase, so the CSP stays at connect-src 'self'.
 */
export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/**
 * Login cookies: httpOnly (page scripts can't read them), sent only over
 * HTTPS in production, and not sent on cross-site requests except top-level
 * links (lax), which blocks most cross-site request forgery.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
