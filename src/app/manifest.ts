import type { MetadataRoute } from "next";

/**
 * Lets phones install VinVerdict ("Add to Home screen") and, on Android,
 * puts it in the Share menu: share a listing's text or link and it opens
 * /share, which hands it to the checker.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VinVerdict",
    short_name: "VinVerdict",
    description: "Check a used-car listing: fair price, history, safety and scam signs.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f4",
    theme_color: "#1e5b3a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
