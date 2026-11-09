/**
 * Pure checks for the login form (no network). Used by the sign-in Server
 * Action and by the proxy, and unit-tested on their own.
 */

export const LOGIN_PATH = "/login";
/** Second login step (authenticator code). Open to a password-only session, nothing else is. */
export const MFA_PATH = "/mfa";

/** The login page: open to everyone, and a logged-in owner is sent on from it. */
export function isPublicPath(pathname: string): boolean {
  return pathname === LOGIN_PATH;
}

/**
 * The public demo: pages a visitor can use without an account (nothing they
 * do is saved, paid lookups are rationed in the Server Actions). Everything
 * else (My cars, Compare, Search, Settings, car pages) needs the owner's
 * two-step login.
 */
export const DEMO_PATHS = ["/", "/shortlist", "/security", "/share", "/why"] as const;

export function isDemoPath(pathname: string): boolean {
  return (DEMO_PATHS as readonly string[]).includes(pathname);
}

/**
 * Where to send someone after they log in. Only a path on this site is
 * allowed, so `/login?next=https://evil.example` (an "open redirect") can't
 * bounce a user to another site. Anything odd falls back to "/".
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return "/";
  // Must be a plain path: "/x", not "//host", "/\\host" or "http://host".
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // No control characters or whitespace tricks.
  if (/[\u0000-\u001f\u007f\s\\]/.test(raw)) return "/";
  const base = "http://vinverdict.invalid";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return "/";
  }
  if (url.origin !== base) return "/";
  if (isPublicPath(url.pathname) || url.pathname === MFA_PATH) return "/";
  return url.pathname + url.search;
}

/** A 6-digit authenticator code, with spaces or dashes removed. */
export function parseTotpCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 20) return null;
  const code = raw.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** Supabase factor ids are UUIDs. */
export function parseFactorId(raw: unknown): string | null {
  return typeof raw === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw.toLowerCase() : null;
}

export type Credentials = { email: string; password: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks the login form fields. Returns a short message on bad input. */
export function parseCredentials(form: FormData): Credentials | { error: string } {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string") return { error: "Enter your email and password." };
  const e = email.trim().toLowerCase();
  if (!e || !password) return { error: "Enter your email and password." };
  if (e.length > 254 || !EMAIL.test(e)) return { error: "That email doesn't look right." };
  if (password.length > 128) return { error: "Email or password is wrong." };
  return { email: e, password };
}
