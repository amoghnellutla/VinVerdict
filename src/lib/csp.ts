/**
 * Content-Security-Policy for pages (set per request by src/proxy.ts).
 *
 * Scripts run only if they carry this request's random nonce ('strict-dynamic'
 * lets those scripts load Next.js's own chunks). No 'unsafe-inline' for
 * scripts, so even if an attacker got text onto a page, a <script> in it
 * would not run. Styles keep 'unsafe-inline' for React style attributes
 * (positions on the price bar); styles can't run code.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // Dev only: React's dev tools need eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    // The on-device screenshot reader runs in a worker from /ocr/ (its own CSP: next.config.ts).
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** 128 random bits, base64. A new one for every request. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
