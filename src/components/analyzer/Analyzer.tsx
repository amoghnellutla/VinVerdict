"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { analyzeAction, type AnalyzeState } from "@/app/actions/analyze";
import { readListingHash } from "@/lib/bookmarklet";
import { EXAMPLES, loadExample, type DemoData, type ExampleId } from "@/lib/demo/examples";
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

/**
 * Paste box + results for the "Check a listing" page. `guest` = demo visitor (no login).
 * `intro` (the page's headline and pitch) shows until a result does; then the
 * page belongs to the result and the box shrinks to "Check another car".
 */
export function Analyzer({ guest = false, intro = null }: { guest?: boolean; intro?: ReactNode }) {
  const [state, formAction, pending] = useActionState(analyzeAction, initial);
  // Listing screenshots the current check was read from (local previews for the result).
  const [shots, setShots] = useState<string[]>([]);
  const shotsRef = useRef<string[]>([]);
  const setShotUrls = (next: string[]) => {
    shotsRef.current.forEach((u) => URL.revokeObjectURL(u));
    shotsRef.current = next;
    setShots(next);
  };
  useEffect(() => () => shotsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);
  // "Start over" hides the current result until the next check.
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  const [showBox, setShowBox] = useState(false);
  // Controlled so the text survives React's automatic form reset after submit.
  const [text, setText] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrProgress | null>(null);
  // Demo example being shown (recorded data, no server call), or null.
  const [example, setExample] = useState<{ id: ExampleId; data: DemoData } | null>(null);
  const [exampleLoading, setExampleLoading] = useState<ExampleId | null>(null);

  async function openExample(id: ExampleId) {
    setExampleLoading(id);
    try {
      setExample({ id, data: await loadExample(id) });
      // Bring the result into view on phones.
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } finally {
      setExampleLoading(null);
    }
  }

  /** Fill the box and run the check straight away. */
  function check(listing: string, fromShots: string[] = []) {
    const t = listing.trim().slice(0, MAX_LISTING_CHARS);
    if (!t) return;
    setShotUrls(fromShots);
    setText(t);
    setPasteNote(null);
    setExample(null);
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
      check(read, files.map((f) => URL.createObjectURL(f)));
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
  const done = state.status === "done" && state.id !== hiddenId ? state : null;
  const showing = example !== null || done !== null;

  // A new result scrolls into view.
  const doneId = state.status === "done" ? state.id : null;
  useEffect(() => {
    if (doneId) requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [doneId]);

  function startOver() {
    setExample(null);
    if (state.status === "done") setHiddenId(state.id);
    setShotUrls([]);
    setText("");
    setShowBox(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
      {/* The intro's sample check opens its example (data-example on the server-rendered card). */}
      {!showing && (
        <div
          onClick={(e) => {
            const id = (e.target as HTMLElement).closest("[data-example]")?.getAttribute("data-example");
            if (id && EXAMPLES.some((x) => x.id === id)) void openExample(id as ExampleId);
          }}
        >
          {intro}
        </div>
      )}
      {!showing && guest && <Examples onOpen={openExample} loading={exampleLoading} />}
      {showing && (
        <div className="fade-in mb-4 flex flex-wrap items-baseline justify-between gap-3 print:hidden">
          <h2 className="text-xl">Check another car</h2>
          <button type="button" onClick={startOver} className="link text-sm">
            {guest ? "Back to the start and the examples" : "Start over"}
          </button>
        </div>
      )}
      <form
        action={formAction}
        // A new check replaces any open example.
        onSubmit={() => setExample(null)}
        className={`card print:hidden ${showing ? "sm:py-4" : "rise d2"} ${dragging ? "outline-2 outline-dashed outline-accent" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {/* Computer: copy the whole page. Phone (touch screen): screenshots, since apps have no "select all". */}
        <ol className={`space-y-3 text-[1.05rem] pointer-coarse:hidden ${showing ? "hidden" : ""}`}>
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
        <ol className={`hidden space-y-3 text-[1.05rem] ${showing ? "" : "pointer-coarse:block"}`}>
          <li className="flex gap-3">
            <Step n={1} />
            <span>Take screenshots of the listing: the title and price, the details, and the seller&apos;s description.</span>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <span>Press <strong>Read screenshots</strong> and pick them. They&apos;re read on your phone, not uploaded.</span>
          </li>
        </ol>
        <div className={`${showing ? "" : "mt-5"} flex flex-col gap-3 sm:flex-row sm:items-center`}>
          <button type="button" onClick={pasteAndCheck} disabled={busy} className={`btn ${touch ? "btn-secondary order-2" : "btn-primary"} py-3 text-base sm:px-8`}>
            {pending ? "Checking…" : "Paste & check"}
          </button>
          <label className={`btn ${touch ? "btn-primary order-1" : "btn-secondary"} py-3 text-base sm:px-6 ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
            {ocr ? ocrLabel(ocr) : "Read screenshots"}
            <input type="file" accept="image/*" multiple onChange={onScreenshots} disabled={busy} className="sr-only" />
          </label>
          {showing && (
            <button type="button" className="link text-sm sm:ml-2" onClick={() => setShowBox((x) => !x)}>
              {showBox ? "Hide the box" : "Paste text or a VIN instead"}
            </button>
          )}
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

        <div className={`mt-6 border-t border-border pt-5 ${showing && !showBox ? "hidden" : ""}`}>
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

      {!showing && (
        <div className="mt-4 pointer-coarse:hidden print:hidden">
          <Bookmarklet />
        </div>
      )}

      <div id="result" aria-live="polite" className={`${showing ? "mt-10" : "mt-12"} scroll-mt-6 print:mt-0`}>
        {example && (
          <Result
            key={`example-${example.id}`}
            analysis={example.data.analysis}
            guest
            recorded={{ price: example.data.price, recordedAt: example.data.recordedAt }}
            saveNote={`Example: a real check recorded on ${example.data.recordedAt}. Paste your own listing above to check any car.`}
          />
        )}
        {!example && state.status === "error" && (
          <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-bad">
            {state.message}
          </p>
        )}
        {/* key resets the checklist answers for each new analysis */}
        {!example && done && (
          <Result key={done.id} analysis={done.analysis} carId={done.carId} saveNote={done.saveNote} phoneMatches={done.phoneMatches} guest={done.guest} shots={shots} />
        )}
      </div>
    </>
  );
}

/** Demo: five real checks recorded earlier, one click each (no server call, no API quota). */
function Examples({ onOpen, loading }: { onOpen: (id: ExampleId) => void; loading: ExampleId | null }) {
  const [featured, ...rest] = EXAMPLES;
  return (
    <section className="mb-10 print:hidden" aria-labelledby="examples-title">
      <h2 id="examples-title" className="section-title rise">Try an example</h2>
      <p className="rise d1 -mt-2 mb-5 text-muted">Two real cars and three typical ads, all checked with real recall, complaint and price data. One click, no sign-up.</p>
      <button
        type="button"
        onClick={() => onOpen(featured.id)}
        className="rise d2 group lift grid w-full overflow-hidden rounded-xl border border-border bg-surface text-left transition-transform duration-300 hover:-translate-y-0.5 sm:grid-cols-[1.1fr_1fr]"
      >
        {featured.photo && (
          // Real listing photo (allowed host only, see lib/csp.ts).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={featured.photo} alt="" referrerPolicy="no-referrer" className="aspect-[16/10] h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
        )}
        <span className="flex flex-col justify-center gap-1 p-5">
          <span className="text-sm font-semibold text-accent">{featured.site}</span>
          <span className="font-serif text-2xl font-semibold">{loading === featured.id ? "Opening…" : featured.title}</span>
          <span className="text-[0.95rem]">{featured.shows}</span>
          <span className="mt-2 text-sm font-semibold text-accent">Open the full check →</span>
        </span>
      </button>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {rest.map((e, i) => (
          <li key={e.id} className={`rise d${Math.min(6, i + 3)}`}>
            <button
              type="button"
              onClick={() => onOpen(e.id)}
              className="h-full w-full rounded-lg border border-border bg-surface px-4 py-3 text-left transition duration-300 hover:-translate-y-0.5 hover:border-accent"
            >
              <span className="block font-semibold">{loading === e.id ? "Opening…" : e.title}</span>
              <span className="block text-sm text-muted">{e.site}</span>
              <span className="mt-1 block text-sm">{e.shows}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
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
