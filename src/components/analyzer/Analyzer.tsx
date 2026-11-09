"use client";

import { useActionState, useState } from "react";
import { analyzeAction, type AnalyzeState } from "@/app/actions/analyze";
import { MAX_LISTING_CHARS } from "@/lib/listing/parse";
import { Result } from "./Result";

const initial: AnalyzeState = { status: "idle" };

/** Paste box + results for the "Check a listing" page. */
export function Analyzer() {
  const [state, formAction, pending] = useActionState(analyzeAction, initial);
  // Controlled so the text survives React's automatic form reset after submit.
  const [text, setText] = useState("");

  return (
    <>
      <form action={formAction} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <label htmlFor="listing" className="text-sm font-medium">
          Listing text, link or VIN
        </label>
        <textarea
          id="listing"
          name="listing"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          required
          maxLength={MAX_LISTING_CHARS}
          placeholder={"2017 Honda Accord EX-L, 100k miles, $9,000, clean title, one owner…\nor 1HGCR2F8XHA000123"}
          className="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            Facebook needs pasted text, because its pages require login. Text is treated as plain text, never run.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Checking…" : "Analyze"}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt-8">
        {state.status === "error" && (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
            {state.message}
          </p>
        )}
        {/* key resets the checklist answers for each new analysis */}
        {state.status === "done" && <Result key={state.id} analysis={state.analysis} />}
      </div>
    </>
  );
}
