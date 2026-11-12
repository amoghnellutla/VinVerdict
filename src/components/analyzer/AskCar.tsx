"use client";

import { useId, useMemo, useState } from "react";
import { askCarAction, type AskState } from "@/app/actions/ai";
import { Turnstile } from "@/components/Turnstile";
import { useReportPart } from "./report-parts";

type Turn = { q: string; reply: AskState };

/**
 * "Ask about this car": a free AI model answers from this result's report only.
 * The conversation stays on this page (nothing saved). Visitors pass the
 * "I'm human" check for each question; answers are plain text.
 */
export function AskCar({ build, guest }: { build: () => string; guest: boolean }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useReportPart(
    "aiAnswers",
    useMemo(() => {
      const done = turns.flatMap((t) => (t.reply.status === "ok" ? [{ q: t.q, a: t.reply.answer, by: t.reply.provider }] : []));
      return done.length ? done : null;
    }, [turns]),
  );

  async function ask() {
    const question = q.trim();
    if (question.length < 3 || pending || (guest && !token)) return;
    setPending(true);
    const earlier = turns.filter((t) => t.reply.status === "ok").map((t) => ({ q: t.q, a: t.reply.status === "ok" ? t.reply.answer : "" }));
    let reply: AskState;
    try {
      reply = await askCarAction({ report: build(), question, earlier, token });
    } catch {
      reply = { status: "error", message: "Couldn't reach VinVerdict. Check your connection and try again." };
    }
    setTurns((t) => [...t, { q: question, reply }]);
    if (reply.status === "ok") setQ("");
    setPending(false);
    // A Turnstile pass works once: a fresh check for the next question.
    setToken(null);
    setAttempt((n) => n + 1);
  }

  return (
    <details className="group rounded-lg border border-border px-4 py-3 print:hidden" open={turns.length > 0 || undefined}>
      <summary className="cursor-pointer font-semibold">Ask about this car (free AI)</summary>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Answers come only from this page&apos;s report, with the section each fact is from. A free AI service writes them (GLM by Z.ai; Gemini by Google
        or Groq when it&apos;s busy), and they may keep what&apos;s sent. Phone numbers and emails are removed first. VinVerdict&apos;s verdict doesn&apos;t
        change.
      </p>

      {turns.length > 0 && (
        <ol className="mt-4 space-y-4">
          {turns.map((t, i) => (
            <li key={i} className="space-y-1">
              <p className="font-semibold">{t.q}</p>
              {t.reply.status === "ok" ? (
                <div className="space-y-2 text-sm">
                  <p className="whitespace-pre-line text-base">{t.reply.answer}</p>
                  {t.reply.claims.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-muted">
                      {t.reply.claims.map((c, j) => (
                        <li key={j}>
                          {c.text} <span className="whitespace-nowrap">({c.section === "At a glance" ? "At a glance" : `section ${c.section}`})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {t.reply.unknowns.length > 0 && <p className="text-muted">Not in the report: {t.reply.unknowns.join("; ")}</p>}
                  {t.reply.next && <p><span className="font-semibold">Next step:</span> {t.reply.next}</p>}
                  <p className="text-xs text-muted">Answered by {t.reply.provider}, from the report only. Check anything important yourself.</p>
                </div>
              ) : (
                <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{t.reply.message}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      <label htmlFor={id} className="mt-4 block text-sm font-semibold">
        Your question
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={300}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Is the price fair? What should I ask the dealer first?"
        className="field mt-1 w-full max-w-xl"
      />
      {guest && (
        <div className="mt-2">
          <p className="text-sm text-muted">Five AI answers or checks per visitor per day, on free AI plans.</p>
          <Turnstile key={attempt} action="ai" onToken={setToken} />
        </div>
      )}
      <div className="mt-3">
        <button type="button" onClick={() => void ask()} disabled={pending || q.trim().length < 3 || (guest && !token)} className="btn btn-primary">
          {pending ? "Asking…" : "Ask"}
        </button>
      </div>
    </details>
  );
}
