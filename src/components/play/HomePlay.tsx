"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import type { PlayData } from "@/lib/demo/play";
import { PhotoDeck } from "./PhotoDeck";
import { ScamSpotter } from "./ScamSpotter";
import { VinPlayground } from "./VinPlayground";

const DESIGNS = [
  { id: "vin", label: "Decode a VIN" },
  { id: "scam", label: "Spot the scam" },
  { id: "deck", label: "Flip through a car" },
] as const;
type DesignId = (typeof DESIGNS)[number]["id"];
const KEY = "vv-home-play";

/** Three ways to play with VinVerdict before checking a car. The pick is remembered on this device. */
export function HomePlay({ data, onCheck, onOpenExample }: { data: PlayData; onCheck: (vin: string) => void; onOpenExample: (id: "lexus") => void }) {
  const [tab, setTab] = useState<DesignId>("vin");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // Restoring a saved choice from browser storage, an outside source.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && DESIGNS.some((d) => d.id === saved)) setTab(saved as DesignId);
    } catch {}
  }, []);
  function pick(id: DesignId) {
    setTab(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }
  // Arrow keys move between tabs (the usual tablist behavior).
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const i = DESIGNS.findIndex((d) => d.id === tab);
    const next = e.key === "ArrowRight" ? (i + 1) % DESIGNS.length : e.key === "ArrowLeft" ? (i + DESIGNS.length - 1) % DESIGNS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    pick(DESIGNS[next].id);
    document.getElementById(`play-tab-${DESIGNS[next].id}`)?.focus();
  }

  return (
    <section className="mt-10" aria-label="Try VinVerdict">
      <div role="tablist" aria-label="Ways to try it" onKeyDown={key} className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1">
        {DESIGNS.map((d) => (
          <button
            key={d.id}
            id={`play-tab-${d.id}`}
            role="tab"
            type="button"
            aria-selected={tab === d.id}
            aria-controls="play-panel"
            tabIndex={tab === d.id ? 0 : -1}
            onClick={() => pick(d.id)}
            className={`rounded-lg px-2 py-2.5 text-sm leading-tight font-semibold transition-colors sm:px-4 ${
              tab === d.id ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div id="play-panel" role="tabpanel" aria-labelledby={`play-tab-${tab}`} className="mt-4 rounded-2xl border border-border bg-surface px-5 py-6 sm:px-8 sm:py-8">
        <div key={tab} className="fade-in">
          {tab === "vin" && <VinPlayground examples={data.vins} onCheck={onCheck} />}
          {tab === "scam" && <ScamSpotter fair={data.scamFair} />}
          {tab === "deck" && <PhotoDeck photos={data.deck.photos} cards={data.deck.cards} verdict={data.deck.verdict} onOpen={() => onOpenExample("lexus")} />}
        </div>
      </div>
    </section>
  );
}
