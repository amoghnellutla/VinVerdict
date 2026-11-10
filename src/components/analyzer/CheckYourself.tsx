"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { ExternalLink } from "@/components/ExternalLink";
import type { CheckRating, Proof, ProofSummary } from "@/lib/evidence/combine";
import { readProof, SOURCE_NAME, type ProofKind } from "@/lib/evidence/parse";
import type { LiveListing } from "@/lib/live/parse";
import { pickImages, readEachScreenshot, type OcrProgress } from "@/lib/ocr";
import { verifyLinks } from "@/lib/sources";

/** A piece of proof on the page: what was read, plus a local preview (never uploaded). */
export type Attached = Proof & { label: string; thumb: string | null; movedFrom: ProofKind | null };

const MAX_TEXT = 20_000;

const RATING: Record<CheckRating, { text: string; tone: string }> = {
  clear: { text: "Clear", tone: "bg-good-soft text-good" },
  problem: { text: "Problem found", tone: "bg-bad-soft text-bad" },
  check: { text: "Look closer", tone: "bg-warn-soft text-warn" },
  read: { text: "Attached", tone: "bg-surface-muted text-muted" },
  none: { text: "Not checked", tone: "bg-surface-muted text-muted" },
};

const ROW_NAME: Record<ProofKind, string> = {
  history: "Carfax or AutoCheck report",
  nhtsa: "NHTSA recall lookup",
  maker: "Maker recall lookup",
  nicb: "NICB VINCheck",
  nmvtis: "NMVTIS title history",
  google: "Search the VIN on Google",
};

type Props = {
  vin: string | null;
  make: string | null;
  live: LiveListing | null;
  proofs: Attached[];
  onProofs: (next: Attached[]) => void;
  summary: ProofSummary;
  /** Owner: findings are kept with the saved car. */
  savedNote: string | null;
};

/**
 * Free outside checks for this exact VIN, and the proof the person found
 * there. Screenshots are read on this device (lib/ocr.ts) and pasted text
 * stays in the page: nothing is uploaded. Each item is sorted to its check
 * by what it says, rated, and feeds the verdict and the price.
 */
export function CheckYourself({ vin, make, live, proofs, onProofs, summary, savedNote }: Props) {
  const [reading, setReading] = useState<OcrProgress | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Latest list for the async reader and the unmount cleanup.
  const latest = useRef(proofs);
  useEffect(() => {
    latest.current = proofs;
  }, [proofs]);
  useEffect(() => () => latest.current.forEach((p) => p.thumb && URL.revokeObjectURL(p.thumb)), []);

  function attach(text: string, hint: ProofKind | null, label: string, thumb: string | null): Attached | null {
    const read = readProof(text.slice(0, MAX_TEXT), hint);
    const kind = read.kind ?? hint;
    if (!kind) {
      if (thumb) URL.revokeObjectURL(thumb);
      return null;
    }
    return { id: crypto.randomUUID(), kind, read, label, thumb, movedFrom: hint && read.kind && read.kind !== hint ? hint : null };
  }

  function add(items: (Attached | null)[], skipped = 0) {
    const ok = items.filter((x): x is Attached => x !== null);
    const lost = items.length - ok.length;
    onProofs([...latest.current, ...ok]);
    const moved = ok.filter((x) => x.movedFrom);
    const parts = [
      moved.length ? `Moved ${moved.map((x) => `"${x.label}" to ${ROW_NAME[x.kind]}`).join(", ")}: that's what it shows.` : "",
      lost ? `Couldn't tell what ${lost === 1 ? "one item" : `${lost} items`} showed. Add ${lost === 1 ? "it" : "them"} to a check below instead.` : "",
      skipped ? `Skipped ${skipped} file${skipped > 1 ? "s" : ""} (images only, up to 6 at a time).` : "",
    ].filter(Boolean);
    setNote(parts.join(" ") || null);
  }

  async function addFiles(list: FileList | File[] | null, hint: ProofKind | null) {
    if (reading) return;
    const { files, skipped } = pickImages(list);
    if (!files.length) {
      setNote("Pick screenshots (images under 25 MB).");
      return;
    }
    setNote(null);
    setReading({ image: 1, of: files.length, pct: 0, loading: true });
    try {
      const texts = await readEachScreenshot(files, setReading);
      add(files.map((f, i) => attach(texts[i] ?? "", hint, f.name || "Screenshot", URL.createObjectURL(f))), skipped);
    } catch (err) {
      console.error("proof reading failed", err);
      setNote("Couldn't read those screenshots on this device. Paste the report's text instead.");
    } finally {
      setReading(null);
    }
  }

  function addText(text: string, hint: ProofKind | null) {
    if (text.trim().length < 15) return setNote("Paste more of the page: at least a few lines.");
    add([attach(text, hint, "Pasted text", null)]);
  }

  function remove(id: string) {
    const gone = proofs.find((p) => p.id === id);
    if (gone?.thumb) URL.revokeObjectURL(gone.thumb);
    onProofs(proofs.filter((p) => p.id !== id));
  }

  const links = vin ? verifyLinks(vin, make) : [];
  const historyLink = live?.carfaxUrl
    ? { name: "The dealer's free Carfax report", href: live.carfaxUrl, cost: "Free from the dealer", what: "Accidents, title brands, owners, use and odometer readings. Open it, then screenshot or copy the summary." }
    : { name: "Carfax or AutoCheck report", href: "https://www.carfax.com/", cost: "Often free from dealers · paid otherwise", what: "Accidents, title brands, owners and odometer readings. Dealer listings usually link one free; ask a private seller to send it." };
  const checked = (Object.values(summary.rating) as CheckRating[]).filter((r) => r !== "none").length;
  const problems = (Object.values(summary.rating) as CheckRating[]).filter((r) => r === "problem").length;

  return (
    <section className="border-t border-border pt-8" id="check-yourself">
      <h2 className="section-title">Check it yourself</h2>
      {!vin ? (
        <p className="max-w-2xl">
          No valid VIN yet. Ask the seller for it: with the VIN you can check open recalls, theft and insurance write-offs, and title
          brands for free or a few dollars. A seller who won&apos;t share it is a reason to walk away.
        </p>
      ) : (
        <>
          <p className="max-w-2xl">
            Don&apos;t take our word for it. Run these checks, then add a screenshot or the page&apos;s text to each one: VinVerdict reads it,
            rates it and counts it in the verdict.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[1.05rem] tracking-wide">{vin}</code>
            <CopyButton text={vin} label="Copy VIN" />
          </div>

          <ProofMeter rating={summary.rating} checked={checked} problems={problems} />

          <DropBox busy={reading} onFiles={(f) => void addFiles(f, null)} onText={(t) => addText(t, null)} />
          {note && <p role="status" className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{note}</p>}
          {summary.otherVin.length > 0 && (
            <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
              {summary.otherVin.length === 1 ? "One item is" : `${summary.otherVin.length} items are`} for a different VIN (
              {[...new Set(summary.otherVin.flatMap((p) => p.read.vins))].join(", ")}), so {summary.otherVin.length === 1 ? "it isn't" : "they aren't"} counted.
            </p>
          )}

          <ul className="mt-6 divide-y divide-border border-y border-border">
            <Row
              vin={vin}
              kind="history"
              name={historyLink.name}
              href={historyLink.href}
              cost={historyLink.cost}
              what={historyLink.what}
              rating={summary.rating.history}
              proofs={proofs.filter((p) => p.kind === "history")}
              busy={reading}
              onFiles={(f) => void addFiles(f, "history")}
              onText={(t) => addText(t, "history")}
              onRemove={remove}
            />
            {links.map((l) =>
              l.kind ? (
                <Row
                  vin={vin}
                  key={l.name}
                  kind={l.kind}
                  name={l.name}
                  href={l.href}
                  cost={`${l.cost}${l.vinInLink ? "" : " · paste the VIN"}`}
                  what={l.what}
                  rating={summary.rating[l.kind]}
                  proofs={proofs.filter((p) => p.kind === l.kind)}
                  busy={reading}
                  onFiles={(f) => void addFiles(f, l.kind)}
                  onText={(t) => addText(t, l.kind)}
                  onRemove={remove}
                />
              ) : (
                <li key={l.name} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-4">
                  <span>
                    <ExternalLink href={l.href} className="link font-semibold">{l.name}</ExternalLink>
                    <span className="block text-sm text-muted">{l.cost}</span>
                  </span>
                  <span>{l.what}</span>
                </li>
              ),
            )}
          </ul>
          <p className="mt-3 text-sm text-muted">
            Screenshots are read on this device and pasted text stays in this page: nothing is uploaded, and it&apos;s gone when you leave.
            {savedNote ? ` ${savedNote}` : ""}
          </p>
        </>
      )}
    </section>
  );
}

/** "Proof checked: 3 of 6": one segment per check, colored by its rating. */
function ProofMeter({ rating, checked, problems }: { rating: Record<ProofKind, CheckRating>; checked: number; problems: number }) {
  const order: ProofKind[] = ["history", "nhtsa", "maker", "nicb", "nmvtis", "google"];
  const color: Record<CheckRating, string> = { clear: "bg-good", problem: "bg-bad", check: "bg-warn", read: "bg-border-strong", none: "bg-surface-muted" };
  return (
    <div className="mt-6">
      <p className="text-sm">
        <strong>Proof checked: {checked} of 6</strong>
        <span className="text-muted">{checked === 0 ? " · add what you find below" : problems ? ` · ${problems} problem${problems > 1 ? "s" : ""} found` : " · nothing wrong so far"}</span>
      </p>
      <div className="mt-2 flex gap-1" aria-hidden>
        {order.map((k) => (
          <span key={k} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${color[rating[k]]}`} />
        ))}
      </div>
    </div>
  );
}

/** One place for anything: drop, choose, or paste a screenshot or a report's text. It's sorted to its check. */
function DropBox({ busy, onFiles, onText }: { busy: OcrProgress | null; onFiles: (f: FileList | File[]) => void; onText: (t: string) => void }) {
  const [over, setOver] = useState(false);
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
    else {
      const t = e.dataTransfer.getData("text");
      if (t.trim()) onText(t);
    }
  }
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    const t = e.clipboardData.getData("text");
    e.preventDefault();
    if (files.length && !t.trim()) onFiles(files);
    else if (t.trim()) onText(t);
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`mt-5 rounded-lg border-2 border-dashed px-5 py-5 transition-colors ${over ? "border-accent bg-accent-soft" : "border-border-strong"}`}
    >
      <p className="font-semibold">Add a report or screenshot</p>
      <p className="mt-1 text-sm text-muted">
        Carfax, AutoCheck, NICB, a recall page or an auction listing. Drop it here, choose it, or click in the box and press Ctrl+V. It goes to the
        right check by itself.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
        <label className={`btn btn-primary shrink-0 ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          {busy ? progressLabel(busy) : "Choose screenshots"}
          <input type="file" accept="image/*" multiple className="sr-only" disabled={!!busy} onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <textarea
          rows={2}
          onPaste={onPaste}
          placeholder="…or paste a screenshot or the report's text here"
          className="field min-h-11 flex-1 resize-none text-sm"
          aria-label="Paste a screenshot or report text"
          readOnly={!!busy}
        />
      </div>
    </div>
  );
}

function Row(props: {
  kind: ProofKind;
  vin: string;
  name: string;
  href: string;
  cost: string;
  what: string;
  rating: CheckRating;
  proofs: Attached[];
  busy: OcrProgress | null;
  onFiles: (f: FileList) => void;
  onText: (t: string) => void;
  onRemove: (id: string) => void;
}) {
  const { vin, name, href, cost, what, rating, proofs, busy, onFiles, onText, onRemove } = props;
  const [pasting, setPasting] = useState(false);
  const [draft, setDraft] = useState("");
  const r = RATING[rating];
  return (
    <li className="py-4">
      <div className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-4">
        <span>
          <ExternalLink href={href} className="link font-semibold">{name}</ExternalLink>
          <span className="block text-sm text-muted">{cost}</span>
        </span>
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span>{what}</span>
            <span className={`tag shrink-0 ${r.tone}`}>{r.text}</span>
          </div>
          {proofs.map((p) => (
            <ProofCard key={p.id} p={p} vin={vin} onRemove={() => onRemove(p.id)} />
          ))}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm print:hidden">
            <label className={`link ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
              Add screenshot
              <input type="file" accept="image/*" multiple className="sr-only" disabled={!!busy} onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <button type="button" className="link" onClick={() => setPasting((x) => !x)}>
              {pasting ? "Cancel" : "Paste text"}
            </button>
          </div>
          {pasting && (
            <div className="mt-2">
              <textarea
                rows={4}
                value={draft}
                maxLength={MAX_TEXT}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Select the results on that page (Ctrl+A, Ctrl+C) and paste them here"
                className="field resize-y text-sm"
              />
              <button
                type="button"
                className="btn btn-secondary mt-2"
                onClick={() => {
                  onText(draft);
                  setDraft("");
                  setPasting(false);
                }}
              >
                Read it
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ProofCard({ p, vin, onRemove }: { p: Attached; vin: string; onRemove: () => void }): ReactNode {
  const icon = { good: "✓", bad: "✕", warn: "!", info: "·" } as const;
  const tone = { good: "text-good", bad: "text-bad", warn: "text-warn", info: "text-muted" } as const;
  const otherCar = p.read.vins.length > 0 && !p.read.vins.includes(vin);
  return (
    <div className={`proof-in mt-3 flex gap-3 rounded-md border p-3 ${otherCar ? "border-warn/40 bg-warn-soft" : "border-border bg-surface"}`}>
      {p.thumb ? (
        // A local preview (blob: URL) of the person's own screenshot.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.thumb} alt={`Screenshot: ${p.label}`} className="h-20 w-28 shrink-0 rounded border border-border object-cover object-top" />
      ) : (
        <span className="grid h-20 w-28 shrink-0 place-items-center rounded border border-border bg-surface-muted text-xs text-muted">Pasted text</span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex justify-between gap-2">
          <span className="font-semibold">{SOURCE_NAME[p.read.source] === "Unrecognized" ? "Attached" : SOURCE_NAME[p.read.source]}</span>
          <button type="button" onClick={onRemove} className="text-muted hover:text-foreground print:hidden" aria-label={`Remove ${p.label}`}>
            Remove
          </button>
        </p>
        {otherCar && <p className="mt-1 font-semibold text-warn">Different VIN ({p.read.vins.join(", ")}): not counted for this car.</p>}
        {p.read.findings.length ? (
          <ul className={`mt-1 space-y-0.5 ${otherCar ? "opacity-60" : ""}`}>
            {p.read.findings.map((f) => (
              <li key={f.key + f.label} className={tone[f.status]}>
                <span aria-hidden className="inline-block w-4 font-bold">{icon[f.status]}</span>
                {f.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted">Nothing VinVerdict could read for sure. Set what it says under the history report, or attach a clearer shot.</p>
        )}
        {p.read.vins.length > 0 && !otherCar && <p className="mt-1 text-xs text-muted">VIN on it matches this car.</p>}
      </div>
    </div>
  );
}

function progressLabel(p: OcrProgress) {
  return p.loading ? `Getting the reader ready… ${p.pct}%` : `Reading ${p.of > 1 ? `${p.image} of ${p.of}` : ""}… ${p.pct}%`;
}
