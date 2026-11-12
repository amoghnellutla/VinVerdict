"use client";

import { useState } from "react";
import { readHistoryAction, type HistoryReadState } from "@/app/actions/ai";
import { Turnstile } from "@/components/Turnstile";
import { HISTORY_LIMITS } from "@/lib/ai/history-read";

export type HistoryReadOk = Extract<HistoryReadState, { status: "ok" }>;

/** A screenshot (blob: URL) as a JPEG data URL that fits the request limit; drops the photo's metadata (re-drawn). */
export async function shrink(blobUrl: string): Promise<string | null> {
  const img = new Image();
  img.src = blobUrl;
  try {
    await img.decode();
  } catch {
    return null;
  }
  for (const [width, quality] of [[1400, 0.8], [1100, 0.7], [900, 0.6]] as const) {
    const scale = Math.min(1, width / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= HISTORY_LIMITS.image) return url;
  }
  return null;
}

/**
 * "Read it closely with free AI" under an attached Carfax/AutoCheck. Sends the text read on this
 * device (and the screenshot, shrunk) only when tapped. Visitors pass the "I'm human" check first.
 */
export function AiHistoryRead({ text, thumb, guest, onRead }: { text: string; thumb: string | null; guest: boolean; onRead: (r: HistoryReadOk) => void }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy || (guest && !token)) return;
    setBusy(true);
    setError(null);
    let r: HistoryReadState;
    try {
      const image = thumb ? await shrink(thumb) : null;
      r = await readHistoryAction({ text, image, token });
    } catch {
      r = { status: "error", message: "Couldn't reach VinVerdict. Check your connection and try again." };
    }
    setBusy(false);
    setToken(null);
    setAttempt((n) => n + 1);
    if (r.status === "ok") {
      setOpen(false);
      onRead(r);
    } else setError(r.message);
  }

  if (!open) {
    return (
      <button type="button" className="link mt-2 text-sm print:hidden" onClick={() => setOpen(true)}>
        Read it closely with free AI (every accident and damage date, service work)
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-border p-3 text-sm print:hidden">
      <p className="text-muted">
        Sends this report&apos;s text{thumb ? " and the screenshot (shrunk, without its photo details)" : ""} to a free AI service (GLM by Z.ai; Gemini by Google
        when it&apos;s busy), which may keep it. Only events whose words are found in the report&apos;s text change the verdict.
      </p>
      {guest && <Turnstile key={attempt} action="ai" onToken={setToken} />}
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" disabled={busy || (guest && !token)} onClick={() => void send()}>
          {busy ? "Reading…" : "Read it"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="mt-2 rounded-md bg-bad-soft px-3 py-2 text-bad">{error}</p>}
    </div>
  );
}
