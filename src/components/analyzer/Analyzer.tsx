"use client";

import { startTransition, useActionState, useEffect, useState, useSyncExternalStore, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { analyzeAction, type AnalyzeState } from "@/app/actions/analyze";
import { readListingHash } from "@/lib/bookmarklet";
import { MAX_LISTING_CHARS } from "@/lib/listing/parse";
import { MAX_SCREENSHOTS, pickImages, readScreenshots, type OcrProgress } from "@/lib/ocr";
import { Bookmarklet } from "./Bookmarklet";
import { Result } from "./Result";

const initial: AnalyzeState = { status: "idle" };

// Touch screen (phone/tablet)? Server and first paint say no; then the real answer.
const COARSE = "(pointer: coarse)";
const subscribeCoarse = (cb: () => void) => {
  const m = window.matchMedia(COARSE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useTouch = () => useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);

/** Paste box + results for the "Check a listing" page. */
export function Analyzer() {
  const [state, formAction, pending] = useActionState(analyzeAction, initial);
  // Controlled so the text survives React's automatic form reset after submit.
  const [text, setText] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrProgress | null>(null);

  /** Fill the box and run the check straight away. */
  function check(listing: string) {
    const t = listing.trim().slice(0, MAX_LISTING_CHARS);
    if (!t) return;
    setText(t);
    setPasteNote(null);
    const data = new FormData();
    data.set("listing", t);
    startTransition(() => formAction(data));
  }

  // "Paste & check": read the clipboard (the browser asks permission once),
  // so the whole flow is Ctrl+A, Ctrl+C on the listing, then one click here.
  async function pasteAndCheck() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) check(clip);
      else setPasteNote("The clipboard is empty. On the listing page press Ctrl+A, then Ctrl+C, and try again.");
    } catch {
      setPasteNote("The browser didn't allow reading the clipboard. Click in the box and press Ctrl+V instead: it checks straight away.");
    }
  }

  // "Read screenshots": OCR on the device, then the normal check. The text
  // lands in the box too, so a misread can be fixed and checked again.
  function onScreenshots(e: ChangeEvent<HTMLInputElement>) {
    const picked = pickImages(e.target.files);
    e.target.value = ""; // so picking the same screenshots again still fires
    void readImages(picked);
  }

  async function readImages({ files, skipped }: { files: File[]; skipped: number }) {
    if (busy) return;
    if (!files.length) {
      setPasteNote("Pick one or more screenshots (images under 25 MB).");
      return;
    }
    setPasteNote(null);
    setOcr({ image: 1, of: files.length, pct: 0, loading: true });
    try {
      const read = await readScreenshots(files, setOcr);
      if (read.replace(/\s/g, "").length < 20) {
        setPasteNote("Couldn't read any text in those screenshots. Make sure the price, details and description are in the shots, not just photos.");
        return;
      }
      check(read);
      if (skipped) setPasteNote(`Read ${files.length} screenshots; skipped ${skipped} (only images, up to ${MAX_SCREENSHOTS}).`);
    } catch (err) {
      console.error("screenshot reading failed", err);
      setPasteNote("Couldn't read the screenshots on this device. Copy the listing text instead, or type the year, model, miles and price.");
    } finally {
      setOcr(null);
    }
  }

  // Pasting into the empty box checks straight away, no extra click.
  // A pasted image (Win+Shift+S, or "copy image") is read like a screenshot.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const images = pickImages(e.clipboardData.files);
    if (images.files.length && !e.clipboardData.getData("text").trim()) {
      e.preventDefault();
      void readImages(images);
      return;
    }
    if (text.trim()) return; // adding to existing text: normal paste
    const pasted = e.clipboardData.getData("text");
    if (!pasted.trim()) return;
    e.preventDefault();
    check(pasted);
  }

  // Opened from the bookmark, the phone's Share menu (/share) or "Check it
  // again": the listing arrives in the URL fragment. Any website can link here
  // with a fragment, so it only fills the box: nothing runs or gets saved to
  // My cars until you press Check. The fragment is cleared so a reload
  // doesn't bring it back.
  const [received, setReceived] = useState(false);
  useEffect(() => {
    const fromLink = readListingHash(window.location.hash, MAX_LISTING_CHARS);
    if (!fromLink) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    // Syncing from the URL, an outside source, is what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(fromLink);
    setReceived(true);
  }, []);

  const busy = pending || ocr !== null;

  // Dropping screenshot files anywhere on the box reads them.
  const [dragging, setDragging] = useState(false);
  function onDragOver(e: DragEvent<HTMLFormElement>) {
    if (!Array.from(e.dataTransfer.items).some((i) => i.kind === "file")) return;
    e.preventDefault();
    setDragging(true);
  }
  function onDrop(e: DragEvent<HTMLFormElement>) {
    const images = pickImages(e.dataTransfer.files);
    setDragging(false);
    if (!e.dataTransfer.files.length) return; // dropped text: let the box take it
    e.preventDefault();
    void readImages(images);
  }
  const touch = useTouch();

  return (
    <>
      <form
        action={formAction}
        className={`card ${dragging ? "outline-2 outline-dashed outline-accent" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {/* Computer: copy the whole page. Phone (touch screen): screenshots, since apps have no "select all". */}
        <ol className="space-y-3 text-[1.05rem] pointer-coarse:hidden">
          <li className="flex gap-3">
            <Step n={1} />
            <span>
              Open the listing and press <Kbd>Ctrl</Kbd> <Kbd>A</Kbd>, then <Kbd>Ctrl</Kbd> <Kbd>C</Kbd> to copy the whole page.
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <span>Come back here and press the button.</span>
          </li>
        </ol>
        <ol className="hidden space-y-3 text-[1.05rem] pointer-coarse:block">
          <li className="flex gap-3">
            <Step n={1} />
            <span>Take screenshots of the listing: the title and price, the details, and the seller&apos;s description.</span>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <span>Press <strong>Read screenshots</strong> and pick them. They&apos;re read on your phone, not uploaded.</span>
          </li>
        </ol>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" onClick={pasteAndCheck} disabled={busy} className={`btn ${touch ? "btn-secondary order-2" : "btn-primary"} py-3 text-base sm:px-8`}>
            {pending ? "Checking…" : "Paste & check"}
          </button>
          <label className={`btn ${touch ? "btn-primary order-1" : "btn-secondary"} py-3 text-base sm:px-6 ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
            {ocr ? ocrLabel(ocr) : "Read screenshots"}
            <input type="file" accept="image/*" multiple onChange={onScreenshots} disabled={busy} className="sr-only" />
          </label>
        </div>
        {ocr?.loading && ocr.image === 1 && (
          <p className="mt-2 text-sm text-muted">The first time, the reader downloads about 7 MB. After that it&apos;s quick.</p>
        )}
        {received && !pending && state.status === "idle" && (
          <div role="status" className="mt-4 rounded-md border-l-4 border-l-accent bg-accent-soft px-4 py-3">
            <p>A listing was sent here from another page. It&apos;s in the box below: look it over, then check it.</p>
            <button type="button" className="btn btn-primary mt-2" onClick={() => check(text)}>
              Check this listing
            </button>
          </div>
        )}
        {pasteNote && (
          <p role="status" className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-warn">
            {pasteNote}
          </p>
        )}

        <div className="mt-6 border-t border-border pt-5">
          <label htmlFor="listing" className="font-semibold">
            Or paste it yourself
          </label>
          <p className="text-sm text-muted">A whole page, a few lines like &quot;2017 Accord EX-L 100k miles $9,000&quot;, just the VIN, or a screenshot (paste it or drop the file here). Pasting starts the check.</p>
          <textarea
            id="listing"
            name="listing"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            rows={4}
            required
            maxLength={MAX_LISTING_CHARS}
            placeholder={"2017 Honda Accord EX-L, 100k miles, $9,000, clean title…\nor a VIN like 1HGCR2F8XHA000123"}
            className="field mt-2 resize-y"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Menus and ads in a copied page are ignored.</p>
            <button type="submit" disabled={busy} className="btn btn-secondary">
              {pending ? "Checking…" : "Check"}
            </button>
          </div>
        </div>
      </form>

      <div className="mt-4 pointer-coarse:hidden">
        <Bookmarklet />
      </div>

      <div aria-live="polite" className="mt-12">
        {state.status === "error" && (
          <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-bad">
            {state.message}
          </p>
        )}
        {/* key resets the checklist answers for each new analysis */}
        {state.status === "done" && <Result key={state.id} analysis={state.analysis} carId={state.carId} saveNote={state.saveNote} phoneMatches={state.phoneMatches} />}
      </div>
    </>
  );
}

function ocrLabel(p: OcrProgress) {
  const which = p.of > 1 ? ` ${p.image} of ${p.of}` : "";
  return p.loading ? `Getting the reader ready… ${p.pct}%` : `Reading screenshot${which}… ${p.pct}%`;
}

function Step({ n }: { n: number }) {
  return (
    <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-sm font-bold text-background">
      {n}
    </span>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="kbd">{children}</kbd>;
}
