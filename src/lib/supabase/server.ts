import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS, supabaseConfig } from "./config";

/**
 * A Supabase client for one request (Server Actions, route handlers, server
 * components). Never share it between requests: it reads that request's
 * login cookies.
 */
export async function createSupabase() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY).");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
