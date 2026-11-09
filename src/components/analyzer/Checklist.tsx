"use client";

import type { SellerChecklist } from "@/lib/scam/rules";

type Key = keyof SellerChecklist;

// Feature G. "good" is the answer you want to hear.
const QUESTIONS: { key: Key; q: string; good: boolean }[] = [
  { key: "titleInSellerName", q: "Is the title in the seller's own name (matching their ID)?", good: true },
  { key: "lienOnTitle", q: "Is there a loan or lien on the car?", good: false },
  { key: "anyAccidents", q: "Has it been in any accident, even a small one?", good: false },
  { key: "allowsInspection", q: "Will they allow a pre-purchase inspection by your mechanic?", good: true },
  { key: "meetsInPersonLocally", q: "Will they meet in person, locally, with the title in hand?", good: true },
];

const ALSO_ASK = [
  "Do you have service records?",
  "How many owners has it had?",
  "Why are you selling?",
  "Any warning lights, leaks or noises?",
];

type Props = { value: SellerChecklist; onChange: (next: SellerChecklist) => void };

export function Checklist({ value, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="font-semibold">Ask the seller</h2>
      <p className="mt-1 text-sm text-muted">Record their answers. The verdict above updates as you go.</p>
      <ul className="mt-4 divide-y divide-border">
        {QUESTIONS.map(({ key, q, good }) => {
          const answer = value[key];
          const set = (v: boolean | null) => onChange({ ...value, [key]: v });
          const bad = answer != null && answer !== good;
          return (
            <li key={key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className={`text-sm ${bad ? "text-bad" : ""}`}>{q}</span>
              <fieldset className="flex shrink-0 gap-1" aria-label={q}>
                {([["Yes", true], ["No", false], ["Not asked", null]] as const).map(([label, v]) => (
                  <label
                    key={label}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                      (answer ?? null) === v ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    <input type="radio" name={key} className="sr-only" checked={(answer ?? null) === v} onChange={() => set(v)} />
                    {label}
                  </label>
                ))}
              </fieldset>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-muted">Also ask: {ALSO_ASK.join(" · ")}</p>
    </section>
  );
}
