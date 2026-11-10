import type { MetadataRoute } from "next";

/**
 * The public tool is for anyone to find. The owner's pages (behind the two-step
 * login), the login itself and the share handoff stay out of search engines
 * (next.config.ts sends X-Robots-Tag: noindex for them too).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/checked", "/car/", "/compare", "/search", "/settings", "/login", "/mfa", "/share"] },
    sitemap: "https://vinverdict.vercel.app/sitemap.xml",
  };
}
