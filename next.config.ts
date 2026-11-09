import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The page Content-Security-Policy is set per request with a fresh nonce in
// src/proxy.ts (lib/csp.ts). The OCR worker files under /ocr get their own
// strict policy below: they may only load this site's files and compile
// WebAssembly ('wasm-unsafe-eval' does not allow JavaScript eval).
const OCR_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()" },
  // Other sites' windows can't reach this one, and its files can't be embedded elsewhere.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Private app: keep it out of search engines.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // OCR engine + language data (~7 MB on first use): let phones keep them a week.
      {
        source: "/ocr/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
          { key: "Content-Security-Policy", value: OCR_CSP },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
