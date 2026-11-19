"use client";

import { useState, useTransition } from "react";
import { POWERTRAIN_TEXT, withBadNews, withReport, type FieldSource, type PendingSave, type Powertrain, type SaveFields } from "@/lib/cars/draft";
import type { ReportAnswers } from "@/lib/history-report";
import type { AccidentStatus, TitleStatus } from "@/lib/listing/parse";

const TITLE_OPTIONS: [TitleStatus, string][] = [
  ["clean", "Clean"],
  ["salvage", "Salvage"],
  ["rebuilt", "Rebuilt"],
  ["flood", "Flood"],
  ["lemon", "Lemon buyback"],
  ["branded", "Branded (salvage, rebuilt, flood or junk)"],
  ["unknown", "Not sure"],
];
const ACCIDENT_OPTIONS: [AccidentStatus, string][] = [
  ["none", "No accidents reported"],
  ["reported", "Accident or damage reported"],
  ["unknown", "Not sure"],
];

/**
 * Save a checked car, reviewed first: what the check read (the listing link, price, miles, MPG, hybrid or not, title
 * and accidents), each with where it came from, to correct before anything is stored. The owner saves to "My cars"
 * (their account); a visitor saves to "My list" (this device only). Same card, same checks.
 */
export function SaveCard({ draft, report, badNews = { accident: null, branded: null }, where, openHref, existing, onSave }: {
  draft: { fields: SaveFields; from: FieldSource; mpgRange: PendingSave["mpgRange"] };
  /** What the history report said on this page (bad news wins over the listing). */
  report: ReportAnswers;
  /** An accident or branded title found elsewhere on the page (the VIN's history data), with where it came from. */
  badNews?: { accident: string | null; branded: string | null };
  where: "My cars" | "My list";
  openHref: string;
  /** Already saved there (same VIN, or saved once on this page): saving updates it. */
  existing: boolean;
  onSave: (fields: SaveFields) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const start = withBadNews(withReport({ fields: draft.fields, from: draft.from }, report), badNews);
  const [f, setF] = useState<SaveFields>(start.fields);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const set = <K extends keyof SaveFields>(k: K, v: SaveFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[$,\s]/g, "")));
  const from = start.from;
  const [saved, setSaved] = useState(false);
  const update = existing || saved;

  const save = () =>
    startSaving(async () => {
      setMessage(null);
      const r = await onSave(f);
      if (r.ok) {
        setMessage({ ok: true, text: update ? `Updated in ${where}.` : `Saved to ${where}.` });
        setSaved(true);
      } else setMessage({ ok: false, text: r.message });
    });

  const src = (k: keyof typeof from) => (from[k] ? <span className="text-sm text-muted"> {from[k]}</span> : <span className="text-sm text-muted"> not read: fill it in or leave it</span>);

  return (
    <section id="save" className="card">
      <h2 className="text-xl">{update ? `Update this car in ${where}` : `Save to ${where}`}</h2>
      <p className="mt-1 text-muted">
        {existing && !saved ? `This car is already in ${where}. ` : ""}
        Check what will be stored and correct anything that&apos;s wrong. Nothing is saved until you press {update ? "Update" : "Save"}.
        {where === "My list" ? " My list is kept in this browser only: nothing is uploaded." : ""}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="font-semibold">Listing link</span>{src("sourceUrl")}
          <input type="url" inputMode="url" value={f.sourceUrl ?? ""} onChange={(e) => set("sourceUrl", e.target.value.trim() || null)} placeholder="https://…" className="field mt-1 w-full" />
        </label>
        <label>
          <span className="font-semibold">Price ($)</span>{src("price")}
          <input inputMode="numeric" value={f.price ?? ""} onChange={(e) => set("price", num(e.target.value))} className="field nums mt-1 w-full" />
        </label>
        <label>
          <span className="font-semibold">Miles</span>{src("miles")}
          <input inputMode="numeric" value={f.miles ?? ""} onChange={(e) => set("miles", num(e.target.value))} className="field nums mt-1 w-full" />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="font-semibold">
            MPG{src("mpg")}
            {draft.mpgRange && (
              <span className="block text-sm font-normal text-muted">
                This model&apos;s versions run {draft.mpgRange.low}–{draft.mpgRange.high} mpg combined; the closest match is filled in. Check the window sticker or the listing.
              </span>
            )}
          </legend>
          <div className="mt-1 grid grid-cols-3 gap-3">
            {(["mpgCity", "mpgHwy", "mpgComb"] as const).map((k) => (
              <label key={k}>
                <span className="text-sm">{k === "mpgCity" ? "City" : k === "mpgHwy" ? "Highway" : "Combined"}</span>
                <input inputMode="numeric" value={f[k] ?? ""} onChange={(e) => set(k, num(e.target.value))} className="field nums mt-1 w-full" />
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          <span className="font-semibold">Hybrid or not</span>{src("powertrain")}
          <select value={f.powertrain ?? ""} onChange={(e) => set("powertrain", (e.target.value || null) as Powertrain | null)} className="field mt-1 w-full">
            {(Object.keys(POWERTRAIN_TEXT) as Powertrain[]).map((p) => (
              <option key={p} value={p}>{POWERTRAIN_TEXT[p]}</option>
            ))}
            <option value="">Not sure</option>
          </select>
        </label>
        <label>
          <span className="font-semibold">Title</span>{src("titleStatus")}
          <select value={f.titleStatus} onChange={(e) => set("titleStatus", e.target.value as TitleStatus)} className="field mt-1 w-full">
            {TITLE_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label>
          <span className="font-semibold">Accidents</span>{src("accident")}
          <select value={f.accident} onChange={(e) => set("accident", e.target.value as AccidentStatus)} className="field mt-1 w-full">
            {ACCIDENT_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>
      {(from.titleStatus === "the listing says" || from.accident === "the listing says") && (
        <p className="mt-3 text-sm text-muted">Title and accidents from the listing are the seller&apos;s word: a history report (Carfax, AutoCheck) confirms them.</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? "Saving…" : update ? `Update in ${where}` : `Save to ${where}`}
        </button>
        {message && (
          <p role="status" className={message.ok ? "font-semibold text-good" : "text-bad"}>
            {message.text}
            {message.ok && <> <a href={openHref} className="link">Open {where}</a></>}
          </p>
        )}
      </div>
    </section>
  );
}
