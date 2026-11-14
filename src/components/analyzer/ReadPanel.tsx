"use client";

import { useState } from "react";
import { readListingAiAction } from "@/app/actions/ai";
import { Turnstile } from "@/components/Turnstile";
import { readFromNotes, type ListingRead } from "@/lib/ai/listing-read";
import { adSays, mi, usd } from "@/lib/format";
import { FIX_COLORS, FIX_TITLES, type ListingFixes } from "@/lib/listing/fixes";
import { KNOWN_MAKES, type FixField, type ParsedListing, type UnsureField } from "@/lib/listing/parse";

type Row = {
  field: FixField;
  label: string;
  value: string | null;
  input: "number" | "text" | { options: readonly string[] };
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const show = (field: FixField, v: number | string) =>
  typeof v === "number" ? (field === "price" || field === "docFee" ? usd(v) : field === "miles" ? mi(v) : String(v)) : cap(v);

function rows(l: ParsedListing): Row[] {
  return [
    { field: "year", label: "Year", value: l.year?.toString() ?? null, input: "number" },
    { field: "make", label: "Make", value: l.make, input: { options: KNOWN_MAKES } },
    { field: "model", label: "Model", value: l.model, input: "text" },
    { field: "price", label: "Price", value: l.price == null ? null : usd(l.price), input: "number" },
    ...(l.sellerType === "dealer" ? [{ field: "docFee" as const, label: "Dealer fee", value: l.docFee ? usd(l.docFee) : "None read", input: "number" as const }] : []),
    { field: "miles", label: "Miles", value: l.miles == null ? null : mi(l.miles), input: "number" },
    { field: "exteriorColor", label: "Color", value: l.exteriorColor ? cap(l.exteriorColor) : null, input: { options: FIX_COLORS } },
    { field: "titleStatus", label: "Title", value: l.titleStatus === "unknown" ? null : cap(l.titleStatus), input: { options: FIX_TITLES } },
    { field: "sellerType", label: "Seller", value: l.sellerType === "unknown" ? null : cap(l.sellerType), input: { options: ["private", "dealer"] } },
  ];
}

/** The fixes already made, so a new one keeps them. */
function earlierFixes(l: ParsedListing): ListingFixes {
  const out: Record<string, unknown> = {};
  for (const f of l.fixed ?? []) out[f] = f === "docFee" ? (l.docFee ?? 0) : l[f];
  return out as ListingFixes;
}

const LABEL: Record<string, string> = { year: "the year", make: "the make", model: "the model", price: "the price", miles: "the miles", exteriorColor: "the color" };

/**
 * "What we read from the ad": the facts the check runs on, each one fixable. A fact the ad gives two answers
 * for (or that the free AI read differently) is shown with both, and one tap picks the right one. Fixing runs
 * the check again with the buyer's answer, marked "you entered". With AI mode on, "Double-check with free AI"
 * has a second reader go through the ad (behind the "I'm human" check for visitors). `onFix` is null for the
 * recorded examples (shown, not fixable).
 */
export function ReadPanel({ listing: l, text, onFix, guest, ai }: {
  listing: ParsedListing;
  text: string;
  onFix: ((fixes: ListingFixes | null, ai: ListingRead | null) => void) | null;
  guest: boolean;
  /** AI mode is on. */
  ai: boolean;
}) {
  const [editing, setEditing] = useState<FixField | null>(null);
  const [draft, setDraft] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const unsure = (l.unsure ?? []).filter((u) => u.field in LABEL);
  const [open, setOpen] = useState(unsure.length > 0);
  if (l.kind !== "text") return null;
  const aiNote = (f: FixField) => l.aiRead?.find((n) => n.field === f);

  const fix = (field: FixField, value: string | number) => {
    const v = typeof value === "number" ? value : field === "year" || field === "price" || field === "miles" || field === "docFee" ? Number(value.replace(/[$,\s]/g, "")) : value;
    if (typeof v === "number" && !Number.isInteger(v)) return;
    setEditing(null);
    onFix?.({ ...earlierFixes(l), [field]: v }, readFromNotes(l.aiRead));
  };

  async function askAi() {
    if (aiBusy || (guest && !token) || !onFix) return;
    setAiBusy(true);
    setAiMsg(null);
    try {
      const r = await readListingAiAction({ text, token });
      if (r.status === "error") setAiMsg(r.message);
      else if (!r.read) setAiMsg(`${r.provider} couldn't find a fact it could quote from the ad, so nothing changed.`);
      else onFix(Object.keys(earlierFixes(l)).length ? earlierFixes(l) : null, r.read);
    } catch {
      setAiMsg("Couldn't reach VinVerdict. Check your connection and try again.");
    }
    setAiBusy(false);
    setToken(null);
    setAttempt((n) => n + 1);
  }

  const agreed = l.aiRead?.filter((n) => n.outcome === "agreed").length ?? 0;
  const added = l.aiRead?.filter((n) => n.outcome === "added").length ?? 0;
  const disagreed = l.aiRead?.filter((n) => n.outcome === "disagreed").length ?? 0;

  return (
    <details
      className={`rounded-lg border px-4 py-3 ${unsure.length ? "border-warn bg-warn-soft" : "border-border"}`}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      id="read"
    >
      <summary className="cursor-pointer select-none">
        <span className="font-semibold">What we read from the ad</span>{" "}
        <span className="text-sm text-muted">
          {unsure.length
            ? `${unsure.some((u) => aiNote(u.field)?.outcome === "disagreed") ? "Two readings" : "The ad gives two answers"} for ${unsure.map((u) => LABEL[u.field]).join(" and ")}. Pick the right one.`
            : onFix ? "Check it, and fix anything that's wrong." : "Check it against the ad."}
        </span>
      </summary>
      {l.aiRead && (
        <p className="mt-2 text-sm">
          A free AI read the ad too, quoting its words: it agreed on {agreed} {agreed === 1 ? "fact" : "facts"}
          {added ? `, found ${added} more` : ""}{disagreed ? `, and read ${disagreed} differently (shown below to pick)` : ""}.
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {rows(l).map((r) => {
          const said = unsure.find((u) => u.field === r.field);
          const note = aiNote(r.field);
          const entered = l.fixed?.includes(r.field);
          return (
            <div key={r.field} className="min-w-0">
              <dt className="font-semibold">{r.label}</dt>
              <dd className="min-w-0">
                {said ? (
                  <>
                    <span className="font-semibold text-warn">Not sure: </span>
                    {note?.outcome === "disagreed" ? (
                      <span>
                        VinVerdict read {show(r.field, said.values[0])}, the AI read {show(r.field, said.values[1])} from &ldquo;{note.quote}&rdquo;
                      </span>
                    ) : (
                      <span>the ad shows {adSays(l, r.field as UnsureField)}</span>
                    )}
                    {onFix && (
                      <span className="mt-1 flex flex-wrap gap-2">
                        {said.values.map((v) => (
                          <button key={String(v)} type="button" className="btn-secondary min-h-9 px-3 py-1 text-sm" onClick={() => fix(r.field, v)}>
                            It&apos;s {show(r.field, v)}
                          </button>
                        ))}
                      </span>
                    )}
                  </>
                ) : (
                  <span className={r.value ? "" : "text-muted"}>
                    {r.value ?? "Not read"}
                    {entered && <span className="text-muted"> (you entered)</span>}
                    {!entered && note?.outcome === "added" && <span className="text-muted"> (read by the AI from &ldquo;{note.quote}&rdquo;)</span>}
                    {!entered && note?.outcome === "agreed" && <span className="text-muted"> (the AI read the same)</span>}
                  </span>
                )}{" "}
                {onFix && editing !== r.field && (
                  <button type="button" className="link text-sm" onClick={() => { setEditing(r.field); setDraft(""); }} aria-label={`Fix the ${r.label.toLowerCase()}`}>
                    {said ? "Something else" : "Fix"}
                  </button>
                )}
                {onFix && editing === r.field && (
                  <form className="mt-1 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (draft) fix(r.field, draft); }}>
                    <label className="sr-only" htmlFor={`fix-${r.field}`}>{r.label}</label>
                    {typeof r.input === "object" ? (
                      <select id={`fix-${r.field}`} className="field min-h-9 py-1" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus>
                        <option value="">Choose…</option>
                        {r.input.options.map((o) => <option key={o} value={o}>{cap(o)}</option>)}
                      </select>
                    ) : (
                      <input
                        id={`fix-${r.field}`}
                        className="field min-h-9 w-36 py-1"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        inputMode={r.input === "number" ? "numeric" : "text"}
                        maxLength={r.input === "number" ? 10 : 40}
                        placeholder={r.field === "price" || r.field === "docFee" ? "$" : ""}
                        autoFocus
                      />
                    )}
                    <button type="submit" className="btn-primary min-h-9 px-3 py-1 text-sm" disabled={!draft}>Use this</button>
                    <button type="button" className="link text-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </form>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {onFix && ai && !l.aiRead && (
        <div className="mt-3 border-t border-border pt-3 print:hidden">
          <p className="text-sm text-muted">
            A second reader: a free AI service (GLM by Z.ai, or Gemini by Google, or Groq) reads the ad&apos;s text, with phone numbers and emails taken
            out, and must quote the ad for every fact. Where the two readings differ, you pick. Google&apos;s free tier may keep what&apos;s sent.
          </p>
          {guest && <Turnstile key={attempt} action="ai" onToken={setToken} />}
          <button type="button" className="btn btn-secondary mt-2" disabled={aiBusy || (guest && !token)} onClick={() => void askAi()}>
            {aiBusy ? "Reading…" : "Double-check with free AI"}
          </button>
          {aiMsg && <p role="status" className="mt-2 text-sm">{aiMsg}</p>}
        </div>
      )}
      {onFix && guest && <p className="mt-3 text-xs text-muted">Fixing something or a double-check checks the car again, which counts as one of today&apos;s free checks{ai ? " (a double-check also uses one of the 5 free AI actions)" : ""}.</p>}
    </details>
  );
}
