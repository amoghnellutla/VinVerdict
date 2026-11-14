"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { analyzeAction, type AnalyzeState } from "@/app/actions/analyze";
import type { ListingFixes } from "@/lib/listing/fixes";
import { readListingHash } from "@/lib/bookmarklet";
import { loadLot, rankLot, saveLot, upsertLot, type LotCar } from "@/lib/lot";
import { VinScanner } from "./VinScanner";
import { EXAMPLES, loadExample, type DemoData, type ExampleId } from "@/lib/demo/examples";
import { MAX_LISTING_CHARS } from "@/lib/listing/parse";
import { MAX_SCREENSHOTS, pickImages, readScreenshots, type OcrProgress } from "@/lib/ocr";
import { HomePlay } from "@/components/play/HomePlay";
import type { PlayData } from "@/lib/demo/play";
import { Bookmarklet } from "./Bookmarklet";
import { useElapsed } from "./LookupProgress";
import { Result } from "./Result";

const initial: AnalyzeState = { status: "idle" };

// Touch screen (phone/tablet)? Server and first paint say no; then the real answer.
const COARSE = "(pointer: coarse)";
const subscribeCoarse = (cb: () => void) => {
  const m = window.matchMedia(COARSE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const subscribeNever = () => () => {};
const useTouch = () => useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);

/** The check, with a lost connection or a server cut-off turned into a message instead of a broken page. */
async function safeAnalyze(prev: AnalyzeState, form: FormData): Promise<AnalyzeState> {
  try {
    return await analyzeAction(prev, form);
  } catch {
    return { status: "error", message: "The check didn't come back: the connection dropped or the server took too long. Try again." };
  }
}

/**
 * Paste box + results for the "Check a listing" page. `guest` = demo visitor (no login).
 * `intro` (the page's headline and pitch) shows until a result does; then the
 * page belongs to the result and the box shrinks to "Check another car".
 */
export function Analyzer({ guest = false, intro = null, outro = null, play = null }: { guest?: boolean; intro?: ReactNode; outro?: ReactNode; play?: PlayData | null }) {
  const [state, formAction, pending] = useActionState(safeAnalyze, initial);
  // Cars scanned with the camera (walking a lot), kept on this device and ranked. Read from the
  // device only in the browser (the server render has none), and only once.
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [lotState, setLotState] = useState<LotCar[] | null>(null);
  const lot = lotState ?? (inBrowser ? loadLot() : []);
  const setLot = (f: (l: LotCar[]) => LotCar[]) => setLotState((l) => f(l ?? loadLot()));
  const elapsed = useElapsed(pending);
  // Listing screenshots the current check was read from (local previews for the result).
  const [shots, setShots] = useState<string[]>([]);
  const shotsRef = useRef<string[]>([]);
  const setShotUrls = (next: string[]) => {
    // Re-checking the same ad (with a VIN added) keeps its screenshots: only links being replaced are freed.
    shotsRef.current.filter((u) => !next.includes(u)).forEach((u) => URL.revokeObjectURL(u));
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
    setPasteNote(null);
    try {
      setExample({ id, data: await loadExample(id) });
      // Bring the result into view on phones.
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      // Offline or a dropped connection: say so (the example's data loads only when it's opened).
      setPasteNote("Couldn't open the example: check your connection and try again.");
      requestAnimationFrame(() => document.querySelector("[role=status].bg-warn-soft")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } finally {
      setExampleLoading(null);
    }
  }

  /** Fill the box and run the check straight away. */
  function check(listing: string, fromShots: string[] = [], fixes: ListingFixes | null = null) {
    const t = listing.trim().slice(0, MAX_LISTING_CHARS);
    if (!t) return;
    setShotUrls(fromShots);
    setText(t);
    setPasteNote(null);
    setExample(null);
    const data = new FormData();
    data.set("listing", t);
    if (fixes) data.set("fixes", JSON.stringify(fixes));
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

  // A check that's refused (not a car, limit reached) says so under the Check button: bring it into view
  // (on a phone, "Paste & check" is far above it).
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state]);

  // Back goes to the home page instead of leaving the site; Forward brings the result back.
  // A result adds one "#result" history entry; leaving it hides the result.
  const lastExample = useRef<typeof example>(null);
  const lastDoneId = useRef<number | null>(null);
  useEffect(() => {
    if (example) lastExample.current = example;
    if (doneId && !example) lastExample.current = null;
    lastDoneId.current = doneId;
  }, [example, doneId]);
  useEffect(() => {
    if (showing && window.location.hash !== "#result") window.history.pushState(null, "", "#result");
  }, [showing, doneId, example?.id]);
  useEffect(() => {
    // A reload on "#result" has nothing to show: drop the leftover hash.
    if (window.location.hash === "#result") window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const pop = () => {
      if (window.location.hash === "#result") {
        if (lastExample.current) setExample(lastExample.current);
        else setHiddenId(null);
        requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ block: "start" }));
        return;
      }
      setExample(null);
      if (lastDoneId.current) setHiddenId(lastDoneId.current);
      // After the browser's own scroll restore (which would leave the page mid-way down).
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: 0 })));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (doneId) requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [doneId]);

  /** "Now check your own listing": back to the paste box, cursor in it. */
  function focusBox() {
    const box = document.getElementById("listing") as HTMLTextAreaElement | null;
    document.getElementById("check-form")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    box?.focus({ preventScroll: true });
  }

  function startOver() {
    if (window.location.hash === "#result") window.history.replaceState(null, "", window.location.pathname + window.location.search);
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
      {!showing && intro}
      {showing && (
        <div className="fade-in mb-4 flex flex-wrap items-baseline justify-between gap-3 print:hidden">
          <p className="text-lg font-bold">Check another car</p>
          <button type="button" onClick={startOver} className="link text-sm">
            {guest ? "Back to the start and the examples" : "Start over"}
          </button>
        </div>
      )}
      <form
        id="check-form"
        action={formAction}
        // A new check replaces any open example.
        onSubmit={() => { setExample(null); setPasteNote(null); }}
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
        <div className={`${showing ? "" : "mt-5"} flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center`}>
          <button type="button" onClick={pasteAndCheck} disabled={busy} className={`btn ${touch ? "btn-secondary order-2" : "btn-primary"} py-3 text-base sm:px-8`}>
            {pending ? "Checking…" : "Paste & check"}
          </button>
          <label className={`btn ${touch ? "btn-primary order-1" : "btn-secondary"} py-3 text-base sm:px-6 ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
            {ocr ? ocrLabel(ocr) : "Read screenshots"}
            <input type="file" accept="image/*" multiple onChange={onScreenshots} disabled={busy} className="sr-only" />
          </label>
          <VinScanner
            className="btn btn-secondary w-full py-3 text-base sm:w-auto sm:px-6"
            wrapperClassName="order-3"
            label="Scan a VIN"
            hint="At the car: point at the barcode on the driver's door sticker, or the VIN plate at the bottom of the windshield. Read on this phone."
            onVin={(vin) => {
              setLot((l) => { const next = upsertLot(l, { vin, at: Date.now() }); saveLot(next); return next; });
              check(vin);
            }}
          />
          {showing && (
            <button type="button" className="link text-sm sm:ml-2" onClick={() => setShowBox((x) => !x)}>
              {showBox ? "Hide the box" : "Paste text or a VIN instead"}
            </button>
          )}
        </div>
        {lot.length > 0 && (
          <LotList
            cars={lot}
            onCheck={(vin) => check(vin)}
            onRemove={(vin) => setLot((l) => { const next = l.filter((c) => c.vin !== vin); saveLot(next); return next; })}
          />
        )}
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
        {pending && (
          <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="size-2 rounded-full bg-accent motion-safe:animate-pulse" />
            Reading the listing and asking NHTSA for the VIN decode, recalls, complaints and crash tests ({elapsed}{" "}
            {elapsed === 1 ? "second" : "seconds"}). Usually 2 to 8 seconds.
          </p>
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
            <p className="text-sm text-muted">
              After the check, keep going: paste the seller&apos;s messages or the Carfax (or screenshots of them), or say what you learn
              (&quot;he&apos;d take 13,500&quot;, &quot;KBB says 13,200&quot;), and the whole result updates.
            </p>
            <button type="submit" disabled={busy} className="btn btn-secondary">
              {pending ? "Checking…" : "Check"}
            </button>
          </div>
        </div>
        {/* Right under the button: on the home page the result area is far below (playground, examples). */}
        {!example && !pending && state.status === "error" && (
          <p ref={errorRef} role="alert" className="mt-4 scroll-mb-6 rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-bad">
            {state.message}
          </p>
        )}
      </form>

      {!showing && (
        <div className="mt-4 pointer-coarse:hidden print:hidden">
          <Bookmarklet />
        </div>
      )}
      {/* The main task comes first; the playground is for when there's no listing to hand. */}
      {!showing && play && <HomePlay data={play} onCheck={(vin) => check(vin)} onOpenExample={(id) => void openExample(id)} onCheckOwn={focusBox} />}
      {!showing && guest && <Examples onOpen={openExample} loading={exampleLoading} />}
      {!showing && outro}

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
        {/* key resets the checklist answers for each new analysis */}
        {!example && done && (
          <Result key={done.id} analysis={done.analysis} carId={done.carId} saveNote={done.saveNote} phoneMatches={done.phoneMatches} guest={done.guest} shots={shots} onCheckVin={(vin) => check(vin)} onRecheck={(t) => check(t, shots)} onFix={(f) => check(done.analysis.text, shots, f)} onSummary={(x) => setLot((l) => {
            if (!l.some((c) => c.vin === x.vin)) return l;
            const next = upsertLot(l, { ...x, at: Date.now() });
            saveLot(next);
            return next;
          })} />
        )}
      </div>
    </>
  );
}

/** Demo: five real checks recorded earlier, one click each (no server call, no API quota). */
function Examples({ onOpen, loading }: { onOpen: (id: ExampleId) => void; loading: ExampleId | null }) {
  const [featured, ...rest] = EXAMPLES;
  return (
    <section className="mt-14 print:hidden" aria-labelledby="examples-title">
      <h2 id="examples-title" className="section-title">Open a full example</h2>
      <p className="-mt-2 mb-5 text-muted">Two real cars and three typical ads, all checked with real recall, complaint and price data.</p>
      <button
        type="button"
        onClick={() => onOpen(featured.id)}
        className="glow-hover group grid w-full overflow-hidden rounded-xl border border-border bg-surface text-left sm:grid-cols-[1.1fr_1fr]"
      >
        {featured.photo && (
          // Real listing photo (allowed host only, see lib/csp.ts).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={featured.photo} alt="" width={640} height={400} referrerPolicy="no-referrer" className="aspect-[16/10] h-full w-full object-cover" />
        )}
        <span className="flex flex-col justify-center gap-1 p-5">
          <span className="text-sm font-semibold text-accent">{featured.site}</span>
          <span className="text-2xl font-bold tracking-tight">{loading === featured.id ? "Opening…" : featured.title}</span>
          <span className="text-[0.95rem]">{featured.shows}</span>
        </span>
      </button>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {rest.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onOpen(e.id)}
              className="glow-hover h-full w-full rounded-lg border border-border bg-surface px-4 py-3 text-left"
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

/** The cars scanned on a lot, best first (lib/lot.ts), each one tap from its check. */
function LotList({ cars, onCheck, onRemove }: { cars: LotCar[]; onCheck: (vin: string) => void; onRemove: (vin: string) => void }) {
  const ranked = rankLot(cars);
  return (
    <section aria-labelledby="lot-title" className="mt-5 rounded-lg border border-border p-4">
      <h2 id="lot-title" className="font-semibold">Cars you scanned</h2>
      <p className="text-sm text-muted">Best first: the verdict, then fewer recalls, then the price. Kept on this phone for 3 days.</p>
      <ol className="mt-3 space-y-2">
        {ranked.map((c, i) => (
          <li key={c.vin} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="nums font-semibold">{i + 1}.</span>
            <span className="min-w-0">
              <span className="font-semibold">{c.car ?? c.vin}</span>
              {c.verdict && <span className="text-muted"> · {c.verdict}</span>}
              {c.price ? <span className="nums text-muted"> · ${c.price.toLocaleString("en-US")}</span> : null}
              {c.recalls != null && <span className="text-muted"> · {c.recalls} recall{c.recalls === 1 ? "" : "s"}</span>}
              <span className="nums block text-xs text-muted">{c.vin}</span>
            </span>
            <button type="button" className="link" onClick={() => onCheck(c.vin)}>Open</button>
            <button type="button" className="link text-muted" onClick={() => onRemove(c.vin)} aria-label={`Remove ${c.car ?? c.vin}`}>Remove</button>
          </li>
        ))}
      </ol>
    </section>
  );
}
