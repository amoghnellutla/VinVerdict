"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";

/** Open a tab by its id from anywhere on the page (the checklist, the assistant): `openTab("car")`. */
export const TAB_EVENT = "vinverdict:tab";
export function openTab(tab: string) {
  window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: tab }));
}

/**
 * One result section that holds several related panels behind tabs, so a long
 * result reads as a few decisions instead of a wall. Every panel stays mounted
 * (calculators keep what you typed) and all of them print.
 */
export function SectionTabs({ id, title, intro, tabs }: { id: string; title: string; intro?: ReactNode; tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [at, setAt] = useState(0);
  const uid = useId();
  const ids = tabs.map((t) => t.id).join(",");
  useEffect(() => {
    const open = (e: Event) => {
      const i = ids.split(",").indexOf((e as CustomEvent<string>).detail);
      if (i < 0) return;
      setAt(i);
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(TAB_EVENT, open);
    return () => window.removeEventListener(TAB_EVENT, open);
  }, [ids, id]);
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === "ArrowRight" ? (at + 1) % tabs.length : e.key === "ArrowLeft" ? (at + tabs.length - 1) % tabs.length : -1;
    if (next < 0) return;
    e.preventDefault();
    setAt(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };
  return (
    <section className="border-t border-border pt-8" id={id}>
      <h2 className="section-title">{title}</h2>
      {intro && <div className="-mt-1 mb-4 text-muted">{intro}</div>}
      <div role="tablist" aria-label={title} onKeyDown={key} className="flex gap-1 overflow-x-auto border-b border-border print:hidden">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`${uid}-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={at === i}
            aria-controls={`${uid}-panel-${i}`}
            tabIndex={at === i ? 0 : -1}
            onClick={() => setAt(i)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[0.95rem] font-semibold whitespace-nowrap transition-colors ${
              at === i ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} id={`${uid}-panel-${i}`} role="tabpanel" aria-labelledby={`${uid}-tab-${i}`} hidden={at !== i} className="tab-panel pt-6">
          {t.content}
        </div>
      ))}
    </section>
  );
}
