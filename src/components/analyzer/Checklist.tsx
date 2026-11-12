"use client";

import type { ReactNode } from "react";
import type { SellerChecklist } from "@/lib/scam/rules";

type Key = keyof SellerChecklist;

// Feature G. "good" is the answer you want to hear.
export const QUESTIONS: { key: Key; q: string; good: boolean }[] = [
  { key: "titleInSellerName", q: "Is the title in the seller's own name (matching their ID)?", good: true },
  { key: "lienOnTitle", q: "Is there a loan or lien on the car?", good: false },
  { key: "anyAccidents", q: "Has it been in any accident, even a small one?", good: false },
  { key: "allowsInspection", q: "Will they allow a pre-purchase inspection by your mechanic?", good: true },
  { key: "meetsInPersonLocally", q: "Will they meet in person, locally, with the title in hand?", good: true },
];

/** Private-seller questions that don't fit a dealer: a dealer handles the title and pays off any loan itself, and a far-away showroom is normal. */
export const PRIVATE_ONLY: Key[] = ["titleInSellerName", "lienOnTitle", "meetsInPersonLocally"];

const ALSO_ASK = [
  "Do you have service records?",
  "How many owners has it had?",
  "Why are you selling?",
  "Any warning lights, leaks or noises?",
];
const ALSO_ASK_DEALER = [
  "Do you have its service records?",
  "How many owners has it had?",
  "What's the out-the-door price with every fee, in writing?",
  "Any warning lights, leaks or noises?",
];

type Props = { value: SellerChecklist; onChange: (next: SellerChecklist) => void; dealer?: boolean; children?: ReactNode };

export function Checklist({ value, onChange, dealer = false, children }: Props) {
  const questions = dealer ? QUESTIONS.filter((x) => !PRIVATE_ONLY.includes(x.key)) : QUESTIONS;
  return (
    <section className="border-t border-border pt-8">
      <h2 className="section-title">Ask the seller</h2>
      <p className="mt-1 text-sm text-muted">Record their answers. The verdict above updates as you go.</p>
      <ul className="mt-4 divide-y divide-border">
        {questions.map(({ key, q, good }) => {
          const answer = value[key];
          const set = (v: boolean | null) => onChange({ ...value, [key]: v });
          const bad = answer != null && answer !== good;
          return (
            <li key={key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className={bad ? "font-semibold text-bad" : ""}>{q}</span>
              <fieldset className="flex shrink-0 gap-1" aria-label={q}>
                {([["Yes", true], ["No", false], ["Not asked", null]] as const).map(([label, v]) => (
                  <label
                    key={label}
                    className={`cursor-pointer rounded-md border px-3 py-1 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                      (answer ?? null) === v ? "border-foreground bg-foreground font-semibold text-background" : "border-border-strong text-muted hover:border-foreground hover:text-foreground"
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
      <p className="mt-4 text-sm text-muted">Also ask: {(dealer ? ALSO_ASK_DEALER : ALSO_ASK).join(" ")}</p>
      {children}
    </section>
  );
}
