"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH, parseCredentials, safeNext } from "@/lib/auth/validate";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabase } from "@/lib/supabase/server";

/** `email` refills the field after a failed try (React resets the form). */
export type SignInState = { error: string | null; email?: string };

const TRIES_PER_MINUTE = 5;
const WRONG = "Email or password is wrong.";
const UNREACHABLE = "Couldn't reach the login service. Try again in a moment.";
const TOO_MANY = "Too many tries. Wait a minute and try again.";

/**
 * Email + password login. There is no sign-up: the one account is created in
 * the Supabase dashboard and public sign-ups are turned off there.
 *
 * Every failure that could reveal whether an account exists gives the same
 * message. The password is never logged.
 */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const creds = parseCredentials(formData);
  if ("error" in creds) return { error: creds.error };
  const fail = (error: string): SignInState => ({ error, email: creds.email });

  const ip = await clientIp();
  if (!rateLimit(`login:ip:${ip}`, TRIES_PER_MINUTE, 60_000) || !rateLimit(`login:email:${creds.email}`, TRIES_PER_MINUTE, 60_000)) {
    return fail(TOO_MANY);
  }

  try {
    const supabase = await createSupabase();
    const { error } = await supabase.auth.signInWithPassword(creds);
    if (error) {
      if (error.status === 429) return fail(TOO_MANY);
      if (!error.status || error.status >= 500) {
        console.error("signIn failed", error.status ?? "no status", error.code ?? "");
        return fail(UNREACHABLE);
      }
      return fail(WRONG);
    }
  } catch (err) {
    console.error("signIn failed", err instanceof Error ? err.message : "unknown error");
    return fail(UNREACHABLE);
  }

  // redirect() works by throwing, so it stays outside the try block.
  redirect(safeNext(formData.get("next")));
}

export async function signOutAction(): Promise<void> {
  try {
    const supabase = await createSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    console.error("signOut failed", err instanceof Error ? err.message : "unknown error");
  }
  redirect(LOGIN_PATH);
}
