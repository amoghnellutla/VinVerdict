import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDemoPath, isPublicPath, LOGIN_PATH, MFA_PATH, safeNext } from "@/lib/auth/validate";
import { buildCsp, newNonce } from "@/lib/csp";
import { AUTH_COOKIE_OPTIONS, supabaseConfig } from "@/lib/supabase/config";

/**
 * Runs before every page (Next.js 16 "Proxy", formerly Middleware).
 *
 * 1. Refreshes the Supabase login so it doesn't expire mid-visit. Only the
 *    proxy refreshes: refreshing in several places can make Supabase revoke
 *    the session (refresh-token reuse).
 * 2. Demo pages (/, /shortlist, /security, /share) are open to everyone.
 *    Owner pages send logged-out visitors to /login?next=<page>, and
 *    logged-in owners are sent away from /login.
 * 3. Two-step login: a session that has only passed the password step
 *    ("aal1") can open /mfa and nothing else until the authenticator code is
 *    entered ("aal2").
 *
 * 4. Sets a Content-Security-Policy with a fresh nonce on every page. Next.js
 *    reads the nonce from the request header and stamps it on its scripts;
 *    any other script on the page is refused by the browser.
 *
 * This is the first gate, not the only one: every Server Action checks the
 * login again itself (lib/auth/session.ts).
 */
export async function proxy(request: NextRequest) {
  const config = supabaseConfig();
  // Fail closed: without Supabase settings nobody gets in.
  if (!config) return new NextResponse("Login is not configured on this server.", { status: 503 });

  const csp = buildCsp(newNonce(), process.env.NODE_ENV === "development");
  // Pass the request on with the CSP header added (Next.js takes the nonce
  // from it). Rebuilt after a cookie refresh so the page sees new cookies.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", csp);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();
  const noCache: Record<string, string> = {};

  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        // Make refreshed cookies visible to the page being rendered...
        for (const { name, value } of list) request.cookies.set(name, value);
        response = forward();
        // ...and send them back to the browser.
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        // Responses that set login cookies must never be cached and shared.
        Object.assign(noCache, headers);
      },
    },
  });

  // getClaims() verifies the token signature and refreshes it near expiry.
  // Any failure counts as logged out.
  let loggedIn = false;
  let fullLogin = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    loggedIn = !error && Boolean(data?.claims?.sub);
    fullLogin = loggedIn && data?.claims?.aal === "aal2";
  } catch {
    loggedIn = false;
  }

  const { pathname, search } = request.nextUrl;
  const isRead = request.method === "GET" || request.method === "HEAD";
  let result: NextResponse = response;

  if (!loggedIn && !isPublicPath(pathname) && !isDemoPath(pathname)) {
    if (isRead) {
      const to = new URL(LOGIN_PATH, request.url);
      const next = safeNext(pathname + search);
      if (next !== "/") to.searchParams.set("next", next);
      result = withCookies(NextResponse.redirect(to), response);
    } else if (!request.headers.has("next-action")) {
      // A POST that isn't a Server Action has no business here.
      result = withCookies(new NextResponse("Log in first.", { status: 401 }), response);
    }
    // Server Action POSTs pass through: owner actions refuse with a friendly
    // "log in again" message; demo actions apply the visitor limits.
  } else if (loggedIn && !fullLogin && pathname !== MFA_PATH) {
    if (isRead) {
      const to = new URL(MFA_PATH, request.url);
      const next = safeNext(pathname + search);
      if (next !== "/") to.searchParams.set("next", next);
      result = withCookies(NextResponse.redirect(to), response);
    } else if (!request.headers.has("next-action")) {
      result = withCookies(new NextResponse("Finish logging in first.", { status: 401 }), response);
    }
    // Server Actions refuse password-only sessions themselves (currentUser()).
  } else if (fullLogin && (isPublicPath(pathname) || pathname === MFA_PATH) && isRead) {
    result = withCookies(NextResponse.redirect(new URL("/", request.url)), response);
  }

  for (const [k, v] of Object.entries(noCache)) result.headers.set(k, v);
  result.headers.set("Content-Security-Policy", csp);
  return result;
}

/** Copy any refreshed or cleared login cookies onto a different response. */
function withCookies(target: NextResponse, from: NextResponse): NextResponse {
  for (const c of from.cookies.getAll()) target.cookies.set(c);
  return target;
}

export const config = {
  // Every route except Next.js build files, images, the app manifest and the
  // link-preview image, so CSS/JS load on the login page, a phone can install
  // the app before login, and shared links show a preview, plus Google Search
  // Console's ownership file (public/google<hex>.html). None of these contain
  // user data.
  matcher: ["/((?!_next/static|_next/image|ocr/|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|google[0-9a-f]+\\.html$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
