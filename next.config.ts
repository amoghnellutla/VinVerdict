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
  // The camera for this site only (scanning a VIN at the car, read on the device); every other feature stays off, and no other site or frame gets it.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()" },
  // Other sites' windows can't reach this one, and its files can't be embedded elsewhere.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const PRIVATE_PATHS = ["/checked", "/car/:path*", "/compare", "/search", "/settings", "/login", "/mfa", "/share"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // The public pages are for anyone to find; the owner's pages, login and handoff stay out of search engines.
      ...PRIVATE_PATHS.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
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
