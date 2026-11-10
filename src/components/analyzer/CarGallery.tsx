"use client";

import { useMemo, useState } from "react";
import { isSafeImageSrc } from "@/lib/live/parse";

/**
 * The car's photos at the top of a result: the live listing's photos, or the
 * person's own listing screenshots (local blob: previews). One large photo;
 * the thumbnails crossfade to any other. Nothing moves on its own. Photos that fail to load (old listings' photos expire) are dropped.
 */
export function CarGallery({ photos, label, caption }: { photos: string[]; label: string; caption: string }) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  // Only the approved photo host or local previews, whatever the caller passes (defence in depth; the CSP allows nothing else either).
  const list = useMemo(() => photos.filter((p) => isSafeImageSrc(p) && !failed.has(p)), [photos, failed]);
  const [at, setAt] = useState(0);
  const shown = list.length ? at % list.length : 0;

  if (!list.length) return null;
  const drop = (src: string) => setFailed((f) => new Set(f).add(src));

  return (
    <figure>
      <div className="lift relative aspect-[16/10] overflow-hidden rounded-xl bg-surface-muted">
        {list.map((src, i) => (
          // Listing photos (allowed host only, see lib/csp.ts) or local screenshots: plain <img>, no optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt={i === shown ? `${label}, photo ${i + 1} of ${list.length}` : ""}
            aria-hidden={i !== shown}
            referrerPolicy="no-referrer"
            loading={i < 2 ? "eager" : "lazy"}
            onError={() => drop(src)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${i === shown ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        {list.length > 1 && (
          <span className="nums absolute right-3 bottom-3 rounded bg-black/55 px-2 py-0.5 text-xs text-white">
            {shown + 1} / {list.length}
          </span>
        )}
      </div>
      {list.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 print:hidden">
          {list.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setAt(i)}
              aria-label={`Show photo ${i + 1}`}
              className={`h-12 w-16 shrink-0 overflow-hidden rounded border-2 transition-colors ${i === shown ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => drop(src)} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <figcaption className="mt-1 text-xs text-muted">{caption}</figcaption>
    </figure>
  );
}
