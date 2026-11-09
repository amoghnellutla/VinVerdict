"use server";

import { redirect } from "next/navigation";
import { currentLogin } from "@/lib/auth/session";
import { LOGIN_PATH, parseFactorId, parseTotpCode, safeNext } from "@/lib/auth/validate";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabase } from "@/lib/supabase/server";

/**
 * Two-step login (TOTP authenticator app, Supabase MFA). These are the only
 * actions a password-only ("aal1") session may call. Each checks the login,
 * validates its input and is rate-limited; Supabase also rate-limits MFA
 * attempts on its side.
 */

export type EnrollState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; factorId: string; qr: string; secret: string };

export type VerifyState = { error: string | null };

const TRIES_PER_MINUTE = 5;
const WRONG_CODE = "That code didn't work. Check the time on your phone is set automatically, then try the newest code.";

/** First login: create an authenticator factor and return its QR code. */
export async function startEnrollAction(): Promise<EnrollState> {
  const login = await currentLogin();
  if (!login) return { status: "error", message: "Your login has expired. Log in again." };
  if (!rateLimit(`mfa-enroll:${login.id}`, 3, 60_000)) return { status: "error", message: "Too many tries. Wait a minute." };

  try {
    const supabase = await createSupabase();
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    // A password alone must never add a second authenticator: that would let
    // someone with a stolen password bypass the one already set up.
    if (factors.totp.length > 0) return { status: "error", message: "Two-step login is already set up. Enter the code from your app." };
    // Clear half-finished setups, so only the QR code shown now works.
    for (const f of factors.all) {
      if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `VinVerdict ${new Date().toISOString().slice(0, 10)}`, issuer: "VinVerdict" });
    if (error) throw error;
    // Supabase returns the QR code as an SVG data URI; it's shown in an <img>, where scripts can't run.
    if (!data.totp.qr_code.startsWith("data:image/svg+xml")) throw new Error("unexpected QR format");
    return { status: "ready", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  } catch (err) {
    console.error("mfa enroll failed", err instanceof Error ? err.message : "unknown error");
    return { status: "error", message: "Couldn't start the setup. Try again in a moment." };
  }
}

/** Check a 6-digit code (finishes setup, or the second step of a normal login). */
export async function verifyMfaAction(_prev: VerifyState, form: FormData): Promise<VerifyState> {
  const login = await currentLogin();
  if (!login) return { error: "Your login has expired. Log in again." };
  const factorId = parseFactorId(form.get("factorId"));
  const code = parseTotpCode(form.get("code"));
  if (!factorId) return { error: "Something went wrong. Reload the page." };
  if (!code) return { error: "Enter the 6-digit code from your authenticator app." };

  const ip = await clientIp();
  if (!rateLimit(`mfa:ip:${ip}`, TRIES_PER_MINUTE, 60_000) || !rateLimit(`mfa:user:${login.id}`, TRIES_PER_MINUTE, 60_000)) {
    return { error: "Too many tries. Wait a minute and try again." };
  }

  try {
    const supabase = await createSupabase();
    // Only this user's own factor can be used (Supabase checks too).
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    if (!factors.all.some((f) => f.id === factorId && f.factor_type === "totp")) return { error: "Something went wrong. Reload the page." };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      if (error.status === 429) return { error: "Too many tries. Wait a minute and try again." };
      if (!error.status || error.status >= 500) {
        console.error("mfa verify failed", error.status ?? "no status", error.code ?? "");
        return { error: "Couldn't reach the login service. Try again in a moment." };
      }
      return { error: WRONG_CODE };
    }
  } catch (err) {
    console.error("mfa verify failed", err instanceof Error ? err.message : "unknown error");
    return { error: "Couldn't reach the login service. Try again in a moment." };
  }
  // redirect() throws, so it stays outside the try block.
  redirect(safeNext(form.get("next")));
}

/** Leave the second step (wrong account, no phone at hand). */
export async function cancelMfaAction(): Promise<void> {
  try {
    const supabase = await createSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    console.error("signOut failed", err instanceof Error ? err.message : "unknown error");
  }
  redirect(LOGIN_PATH);
}
