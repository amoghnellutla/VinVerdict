import { AREA_LABEL, type AreaStatus, type Decision, type Level } from "@/lib/decision";

const TONE: Record<Level, { box: string; title: string }> = {
  stop: { box: "border-l-bad bg-bad-soft", title: "text-bad" },
  verify: { box: "border-l-warn bg-warn-soft", title: "text-warn" },
  investigate: { box: "border-l-border-strong bg-surface", title: "text-foreground" },
  thin: { box: "border-l-border-strong bg-surface", title: "text-foreground" },
};

// A word as well as a color, so the status never depends on color alone.
const STATUS: Record<AreaStatus, { word: string; dot: string; text: string }> = {
  stop: { word: "Warning", dot: "bg-bad", text: "text-bad" },
  verify: { word: "Check", dot: "bg-warn", text: "text-warn" },
  ok: { word: "OK so far", dot: "bg-good", text: "text-good" },
  unchecked: { word: "Not checked", dot: "border border-border-strong bg-transparent", text: "text-muted" },
};

/**
 * The verdict: one next step, then the four questions behind it. Each row says
 * what was found and, folded away, what hasn't been checked yet, so "nothing
 * found" is never mistaken for "checked clean".
 */
export function VerdictCard({ d }: { d: Decision }) {
  const t = TONE[d.level];
  return (
    <section className={`rise d1 rounded-lg border-l-4 px-5 py-5 ${t.box}`} aria-labelledby="verdict-title">
      <h2 id="verdict-title" className={`text-[2rem] font-extrabold leading-tight tracking-tight sm:text-[2.6rem] ${t.title}`}>{d.title}</h2>
      <p className="mt-1 max-w-2xl text-[1.05rem]">{d.text}</p>
      <dl className="mt-4 divide-y divide-border border-y border-border">
        {d.areas.map((r) => {
          const s = STATUS[r.status];
          return (
            <div key={r.area} className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[9.5rem_7rem_1fr]">
              <dt className="font-semibold">{AREA_LABEL[r.area]}</dt>
              <dd className={`flex items-center gap-2 self-start pt-0.5 text-sm font-semibold ${s.text}`}>
                <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${s.dot}`} />
                {s.word}
              </dd>
              <dd className="min-w-0">
                {r.line}
                {r.unknown.length > 0 && (
                  <details className="group mt-0.5 text-sm text-muted">
                    <summary className="cursor-pointer select-none underline-offset-2 hover:underline">
                      Still unknown ({r.unknown.length})
                    </summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {r.unknown.map((u) => <li key={u}>{u}</li>)}
                    </ul>
                  </details>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 text-sm text-muted">
        Each finding below says where its evidence comes from and links its source. <a href="#check-yourself" className="link">Check the car yourself</a>.
      </p>
    </section>
  );
}
