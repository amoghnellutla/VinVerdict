"use client";

import { useState } from "react";
import { adSays, mi, usd } from "@/lib/format";
import { FIX_COLORS, FIX_TITLES, type ListingFixes } from "@/lib/listing/fixes";
import { KNOWN_MAKES, type FixField, type ParsedListing, type UnsureField } from "@/lib/listing/parse";

type Row = {
  field: FixField;
  label: string;
  value: string | null;
  input: "number" | "text" | { options: readonly string[] };
  /** Range for a number input. */
  min?: number;
  max?: number;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function rows(l: ParsedListing): Row[] {
  const year = new Date().getFullYear() + 1;
  return [
    { field: "year", label: "Year", value: l.year?.toString() ?? null, input: "number", min: 1981, max: year },
    { field: "make", label: "Make", value: l.make, input: { options: KNOWN_MAKES } },
    { field: "model", label: "Model", value: l.model, input: "text" },
    { field: "price", label: "Price", value: l.price == null ? null : usd(l.price), input: "number", min: 500, max: 1_000_000 },
    ...(l.sellerType === "dealer" ? [{ field: "docFee" as const, label: "Dealer fee", value: l.docFee ? usd(l.docFee) : "None read", input: "number" as const, min: 0, max: 5_000 }] : []),
    { field: "miles", label: "Miles", value: l.miles == null ? null : mi(l.miles), input: "number", min: 0, max: 600_000 },
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

/**
 * "What we read from the ad": the facts the check runs on, each one fixable. A fact the ad gives two answers
 * for is shown with both, and one tap picks the right one. Fixing runs the check again with the buyer's
 * answer, marked "you entered". `onFix` is null for the recorded examples (shown, not fixable).
 */
export function ReadPanel({ listing: l, onFix, guest }: { listing: ParsedListing; onFix: ((fixes: ListingFixes) => void) | null; guest: boolean }) {
  const [editing, setEditing] = useState<FixField | null>(null);
  const [draft, setDraft] = useState("");
  const unsure = (l.unsure ?? []).filter((u) => ["year", "make", "model", "price", "miles", "exteriorColor"].includes(u.field));
  const [open, setOpen] = useState(unsure.length > 0);
  if (l.kind !== "text") return null;

  const fix = (field: FixField, value: string | number) => {
    const v = typeof value === "number" ? value : field === "year" || field === "price" || field === "miles" || field === "docFee" ? Number(value.replace(/[$,\s]/g, "")) : value;
    if (typeof v === "number" && !Number.isInteger(v)) return;
    setEditing(null);
    onFix?.({ ...earlierFixes(l), [field]: v });
  };

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
          {unsure.length ? `The ad gives two answers for ${unsure.map((u) => LABEL[u.field]).join(" and ")}. Pick the right one.` : onFix ? "Check it, and fix anything that's wrong." : "Check it against the ad."}
        </span>
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {rows(l).map((r) => {
          const said = unsure.find((u) => u.field === r.field);
          const entered = l.fixed?.includes(r.field);
          return (
            <div key={r.field} className="min-w-0">
              <dt className="font-semibold">{r.label}</dt>
              <dd className="min-w-0">
                {said ? (
                  <>
                    <span className="text-warn font-semibold">Not sure: </span>
                    <span>the ad shows {adSays(l, r.field as UnsureField)}</span>
                    {onFix && (
                      <span className="mt-1 flex flex-wrap gap-2">
                        {said.values.map((v) => (
                          <button key={String(v)} type="button" className="btn-secondary min-h-9 px-3 py-1 text-sm" onClick={() => fix(r.field, v)}>
                            It&apos;s {typeof v === "number" ? (r.field === "price" ? usd(v) : r.field === "miles" ? mi(v) : String(v)) : cap(String(v))}
                          </button>
                        ))}
                      </span>
                    )}
                  </>
                ) : (
                  <span className={r.value ? "" : "text-muted"}>
                    {r.value ?? "Not read"}
                    {entered && <span className="text-muted"> (you entered)</span>}
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
      {onFix && guest && <p className="mt-3 text-xs text-muted">Fixing something checks the car again, which counts as one of today&apos;s free checks.</p>}
    </details>
  );
}

const LABEL: Record<string, string> = { year: "the year", make: "the make", model: "the model", price: "the price", miles: "the miles", exteriorColor: "the color" };
