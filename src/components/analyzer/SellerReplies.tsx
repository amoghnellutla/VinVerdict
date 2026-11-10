"use client";

import { useState, type ChangeEvent } from "react";
import { CopyButton } from "@/components/CopyButton";
import { pickImages, readEachScreenshot, type OcrProgress } from "@/lib/ocr";
import type { ReplyHit } from "@/lib/seller-replies";

/**
 * What the seller wrote back. Pasted text or chat screenshots are read on this
 * device; the checks run here too, and the verdict above updates. Nothing is
 * sent or saved.
 */
export function SellerReplies({ value, onChange, hits }: { value: string; onChange: (v: string) => void; hits: ReplyHit[] }) {
  const [reading, setReading] = useState<OcrProgress | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onShots(e: ChangeEvent<HTMLInputElement>) {
    const { files, skipped } = pickImages(e.target.files);
    e.target.value = "";
    if (!files.length) {
      setNote("Pick one or more screenshots of the chat (images under 25 MB).");
      return;
    }
    setNote(null);
    try {
      const texts = await readEachScreenshot(files, setReading);
      const read = texts.join("\n").trim();
      if (!read) setNote("Couldn't read any text in those screenshots. Paste the messages instead.");
      else onChange(value ? `${value}\n${read}` : read);
      if (skipped) setNote(`Read ${files.length} screenshots; skipped ${skipped}.`);
    } catch {
      setNote("Couldn't read the screenshots on this device. Paste the messages instead.");
    } finally {
      setReading(null);
    }
  }

  return (
    <div className="mt-8 border-t border-border pt-6">
      <h3 className="font-semibold">What did the seller say?</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Many scams only show after the first message: a deposit request, a shipping story, a story that changes. Paste their replies or add chat
        screenshots. They&apos;re read and checked on this device, and nothing is sent or saved.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 20_000))}
          rows={4}
          placeholder="Paste the seller's messages here"
          aria-label="The seller's messages"
          className="field min-h-24 flex-1 text-[0.95rem]"
        />
        <label className={`btn btn-secondary shrink-0 ${reading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          {reading ? (reading.loading ? `Getting ready… ${reading.pct}%` : `Reading… ${reading.pct}%`) : "Add chat screenshots"}
          <input type="file" accept="image/*" multiple className="sr-only" disabled={!!reading} onChange={(e) => void onShots(e)} />
        </label>
      </div>
      {note && <p className="mt-2 text-sm text-warn">{note}</p>}

      {value.trim() && (
        <div aria-live="polite" className="mt-4">
          {hits.length === 0 ? (
            <p className="text-sm">
              <span className="font-semibold text-good">Nothing worrying in their messages.</span>{" "}
              <span className="text-muted">That only covers what they wrote: still see the car and the title in person before paying.</span>
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {hits.map((h) => (
                <li key={h.id} className="py-3">
                  <p className={`font-semibold ${h.action === "hide" ? "text-bad" : "text-warn"}`}>{h.title}</p>
                  {h.quote && <blockquote className="mt-1 border-l-2 border-border-strong pl-3 text-[0.95rem] italic">&ldquo;{h.quote}&rdquo;</blockquote>}
                  <p className="mt-1 text-sm text-muted">{h.reason}</p>
                  {h.suggest && (
                    <div className="mt-2 flex flex-col gap-2 rounded-md bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[0.95rem]">
                        <span className="text-sm font-semibold text-muted">You could reply: </span>
                        {h.suggest}
                      </p>
                      <CopyButton text={h.suggest} label="Copy reply" className="btn btn-secondary shrink-0 text-sm" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
