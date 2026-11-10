"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { AREA_LABEL, type AreaStatus, type Level } from "@/lib/decision";
import { importFile, load, merge, parseWorkspace, remove, save, setNote, WORKSPACE_KEY, type SavedCar } from "@/lib/workspace/local";

const LEVEL_TAG: Record<Level, string> = {
  stop: "bg-bad-soft text-bad",
  verify: "bg-warn-soft text-warn",
  investigate: "bg-surface-muted text-foreground",
  thin: "bg-surface-muted text-muted",
};
const STATUS: Record<AreaStatus, { word: string; text: string }> = {
  stop: { word: "Warning", text: "text-bad" },
  verify: { word: "Check", text: "text-warn" },
  ok: { word: "OK so far", text: "text-good" },
  unchecked: { word: "Not checked", text: "text-muted" },
};

// The saved list lives in localStorage; re-read it when this or another tab changes it.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("vv-workspace", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("vv-workspace", onChange);
  };
}
function snapshot(): string {
  try {
    return localStorage.getItem(WORKSPACE_KEY) ?? "";
  } catch {
    return "";
  }
}

const usd = (n: number | null) => (n == null ? "–" : `$${n.toLocaleString("en-US")}`);
const mi = (n: number | null) => (n == null ? "–" : `${n.toLocaleString("en-US")} mi`);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function MyList() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const cars = useMemo(() => {
    if (raw === null) return null;
    try {
      return raw ? parseWorkspace(JSON.parse(raw)).cars : [];
    } catch {
      return [];
    }
  }, [raw]);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  if (cars === null) return <p className="text-muted">Loading your list…</p>;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id]));
  const comparing = cars.filter((c) => picked.includes(c.id));

  function exportList() {
    const blob = new Blob([JSON.stringify(load(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vinverdict-my-list-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importList(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const incoming = file.size <= 1_000_000 ? importFile(await file.text()) : null;
    if (!incoming || !incoming.cars.length) {
      setMessage("That file isn't a VinVerdict list (or it's empty).");
      return;
    }
    const before = load();
    const after = merge(before, incoming);
    setMessage(save(after) ? `Added ${after.cars.length - before.cars.length} car${after.cars.length - before.cars.length === 1 ? "" : "s"}.` : "Couldn't save on this device.");
  }

  if (!cars.length) {
    return (
      <div className="max-w-2xl space-y-4">
        <p>
          Nothing saved yet. After checking a listing, press <strong>Save to My list</strong> at the top of the result. Saved cars stay on this device, so you
          can compare them side by side and come back to them.
        </p>
        <p>
          <Link href="/" className="btn btn-primary">Check a listing</Link>
        </p>
        <ImportButton onChange={importList} />
        {message && <p className="text-sm text-warn">{message}</p>}
      </div>
    );
  }

  return (
    <>
      <p className="max-w-2xl text-sm text-muted">
        Saved in this browser only: nothing is uploaded, and clearing this site&apos;s data deletes it. Export a copy to keep it or move it to another device.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary" onClick={exportList}>Export my list</button>
        <ImportButton onChange={importList} />
      </div>
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}

      {comparing.length >= 2 && <Compare cars={comparing} />}
      {cars.length >= 2 && comparing.length < 2 && <p className="mt-6 text-sm text-muted">Tick two to five cars to compare them side by side.</p>}

      <ul className="mt-6 divide-y divide-border border-y border-border">
        {cars.map((c) => (
          <li key={c.id} className="grid gap-3 py-5 sm:grid-cols-[1.5rem_1fr]">
            <input
              type="checkbox"
              className="mt-1.5 size-4 accent-[var(--accent)]"
              checked={picked.includes(c.id)}
              onChange={() => toggle(c.id)}
              aria-label={`Compare ${c.title}`}
              disabled={!picked.includes(c.id) && picked.length >= 5}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-xl font-bold">{c.title}</h2>
                <span className="text-sm text-muted">Saved {day(c.savedAt)}</span>
              </div>
              <p className="nums mt-0.5">
                {usd(c.price)} · {mi(c.miles)} <span className={`tag ml-2 ${LEVEL_TAG[c.level]}`}>{c.verdict}</span>
              </p>
              {c.warnings.length > 0 && <p className="mt-1 text-sm text-muted">{c.warnings.slice(0, 3).join(" · ")}</p>}
              <label className="mt-3 block text-sm">
                <span className="font-semibold">Your notes</span>
                <textarea
                  defaultValue={c.note}
                  rows={2}
                  maxLength={2000}
                  placeholder="Seller's answers, when you're seeing it, what the mechanic said…"
                  className="field mt-1 w-full text-[0.95rem]"
                  onBlur={(e) => {
                    if (e.target.value !== c.note) save(setNote(load(), c.id, e.target.value));
                  }}
                />
              </label>
              <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <a href={`/#listing=${encodeURIComponent(c.text)}`} className="link font-semibold">Check it again</a>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    if (window.confirm(`Remove ${c.title} from My list?`)) {
                      save(remove(load(), c.id));
                      setPicked((p) => p.filter((x) => x !== c.id));
                    }
                  }}
                >
                  Remove
                </button>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ImportButton({ onChange }: { onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="btn btn-secondary cursor-pointer">
      Import a list
      <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onChange(e)} />
    </label>
  );
}

function Compare({ cars }: { cars: SavedCar[] }) {
  const rows: { label: string; cell: (c: SavedCar) => React.ReactNode }[] = [
    { label: "Asking price", cell: (c) => usd(c.price) },
    { label: "Miles", cell: (c) => mi(c.miles) },
    { label: "Next step", cell: (c) => <span className={`tag ${LEVEL_TAG[c.level]}`}>{c.verdict}</span> },
    ...(["listing", "car", "price", "deal"] as const).map((area) => ({
      label: AREA_LABEL[area],
      cell: (c: SavedCar) => {
        const r = c.areas.find((x) => x.area === area);
        return r ? <><span className={`font-semibold ${STATUS[r.status].text}`}>{STATUS[r.status].word}</span><span className="block text-sm text-muted">{r.line}</span></> : "–";
      },
    })),
    { label: "Still unknown", cell: (c) => `${c.unknown} item${c.unknown === 1 ? "" : "s"}` },
    { label: "Your notes", cell: (c) => <span className="text-sm">{c.note || "–"}</span> },
  ];
  return (
    <section className="mt-8" aria-label="Compare saved cars">
      <h2 className="section-title">Side by side</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left align-top">
          <thead>
            <tr className="border-b border-border-strong">
              <th className="w-36 py-2 pr-4" />
              {cars.map((c) => <th key={c.id} className="py-2 pr-4 font-semibold">{c.title}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.label} className="align-top">
                <th scope="row" className="py-2.5 pr-4 text-sm font-medium text-muted">{r.label}</th>
                {cars.map((c) => <td key={c.id} className="nums py-2.5 pr-4">{r.cell(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
