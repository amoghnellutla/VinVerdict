"use client";

import { useEffect } from "react";
import { MAX_LISTING_CHARS } from "@/lib/listing/parse";

/**
 * Moves shared text from the query string (?title=&text=&url=) into the
 * checker's #listing= fragment and replaces this page in history, so the
 * shared text doesn't linger in the address bar. Plain text only.
 */
export function ShareHandoff() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const parts = [q.get("title"), q.get("text"), q.get("url")]
      .map((s) => (s ?? "").trim())
      .filter((s, i, all) => s && all.indexOf(s) === i);
    const text = parts.join("\n").slice(0, MAX_LISTING_CHARS);
    window.location.replace(text ? `/#listing=${encodeURIComponent(text)}` : "/");
  }, []);
  return null;
}
