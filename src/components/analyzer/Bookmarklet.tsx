"use client";

import { useEffect, useRef, useState } from "react";
import { bookmarkletHref } from "@/lib/bookmarklet";

/**
 * Feature 2a: the "Check with VinVerdict" bookmark. Drag it to the bookmarks
 * bar once; on any listing page, one click opens VinVerdict with that
 * listing filled in and checked.
 *
 * React 19 refuses javascript: URLs in JSX (a good default), so the link's
 * href is set on the DOM element after mount. The code only ever comes from
 * lib/bookmarklet.ts plus this site's own origin.
 */
export function Bookmarklet({ open = false }: { open?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bookmarkletHref(window.location.origin));
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <details open={open} className="group text-[0.95rem]">
      <summary className="cursor-pointer text-muted hover:text-foreground">Prefer a bookmark button? (works on most sites)</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          Show your bookmarks bar: <kbd className="kbd">Ctrl</kbd>+
          <kbd className="kbd">Shift</kbd>+<kbd className="kbd">B</kbd>{" "}
          (<kbd className="kbd">⌘</kbd>+<kbd className="kbd">Shift</kbd>+
          <kbd className="kbd">B</kbd> on a Mac).
        </li>
        <li>
          Drag this button onto the bookmarks bar:{" "}
          <a
            ref={ref}
            onClick={(e) => e.preventDefault()}
            title="Drag me to your bookmarks bar"
            className="btn btn-secondary ml-1 cursor-grab py-1"
          >
            Check with VinVerdict
          </a>
        </li>
        <li>Open a listing and click the bookmark. VinVerdict opens in a new tab with the listing filled in and checks it.</li>
      </ol>
      <p className="mt-3 text-sm text-muted">
        It reads the page in your own browser and hands it only to VinVerdict. Some sites block bookmark buttons; Paste &amp; check always works.
      </p>
      <p className="mt-2 text-sm text-muted">
        Can&apos;t drag? Create a bookmark by hand and paste this as its address:{" "}
        <button type="button" onClick={copy} className="link">
          {copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy the bookmark code"}
        </button>
        .
      </p>
    </details>
  );
}
