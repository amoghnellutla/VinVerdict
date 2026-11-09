import type { MetadataRoute } from "next";

/** A private app: ask every search engine to stay out (the X-Robots-Tag header says the same). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
