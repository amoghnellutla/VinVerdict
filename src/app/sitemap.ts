import type { MetadataRoute } from "next";

const SITE = "https://vinverdict.vercel.app";

/** The public pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/scam-signs`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/accuracy`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/mine`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/shortlist`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/why`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/security`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
