"use client";

import { useId, useState } from "react";

const HTTPS = /^https:\/\/[^\s<>"'`]+$/i;

/**
 * "Full report": everything on the result page as one Markdown file, to keep
 * or to paste into your own AI. Built on this device when you click; nothing
 * is sent. The listing link is only written into the file, never opened.
 */
export function ReportDownload({ build, fileName, knownUrl }: { build: (listingUrl: string | null) => string; fileName: string; knownUrl: string | null }) {
  const id = useId();
  const [url, setUrl] = useState(knownUrl ?? "");
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const trimmed = url.trim();
  const valid = trimmed === "" || HTTPS.test(trimmed);
  const link = trimmed && valid ? trimmed : null;

  function download() {
    const blob = new Blob([build(link)], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(build(link));
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <details className="group rounded-lg border border-border px-4 py-3 print:hidden">
      <summary className="cursor-pointer font-semibold">Full report for you or your AI</summary>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Everything on this page in one Markdown file: the verdict, every warning with its source, the car, price, history, checks to do yourself with their
        links, safety, costs and what to ask, plus the ad as you pasted it. Paste it into your own AI for help deciding. Made on this device; nothing is sent.
      </p>
      <label htmlFor={id} className="mt-3 block text-sm font-semibold">
        Listing link (optional)
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value.slice(0, 2000))}
        placeholder="https://…"
        className="field mt-1 w-full max-w-xl"
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className={`mt-1 text-sm ${valid ? "text-muted" : "text-warn"}`}>
        {valid ? "Only written into the report. VinVerdict never opens it." : "Only https:// links are included. This one will be left out."}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={download} className="btn btn-primary">Download report (.md)</button>
        <button type="button" onClick={() => void copy()} className="btn btn-secondary">
          {copied === "done" ? "Copied" : copied === "failed" ? "Couldn't copy: download it instead" : "Copy report"}
        </button>
      </div>
    </details>
  );
}
