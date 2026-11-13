"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { decodeVinAction } from "@/app/actions/decode";
import type { DecodedVin } from "@/lib/nhtsa/parse";
import { checkVin, vinDigitsForLetters } from "@/lib/vin";

const PARTS = [
  { from: 0, to: 3, name: "Maker", explain: "Country and maker. 1, 4 or 5 is the USA, 2 Canada, 3 Mexico, J Japan, K Korea, W Germany." },
  { from: 3, to: 8, name: "Model and engine", explain: "Each maker's own code for the model, body, engine and safety gear." },
  { from: 8, to: 9, name: "Check digit", explain: "Worked out from the other 16 characters, so a typo or a made-up VIN doesn't add up." },
  { from: 9, to: 10, name: "Year", explain: "Letters and digits cycle every 30 years: M is 1991 or 2021, G is 1986 or 2016." },
  { from: 10, to: 11, name: "Plant", explain: "The factory, in the maker's own code." },
  { from: 11, to: 17, name: "Serial", explain: "This one car's production number." },
];

// A VIN never uses O, I or Q: typed, they're the 0 and 1 they look like.
const clean = (s: string) => vinDigitsForLetters(s).replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17);
const cap = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Type or paste any VIN: the plate fills in as you type, checks itself, and NHTSA decodes it. Click a part to flip it. */
export function VinPlayground({ examples, onCheck, onCheckOwn }: { examples: { label: string; vin: string }[]; onCheck: (vin: string) => void; onCheckOwn: () => void }) {
  const [vin, setVin] = useState("");
  const [decoded, setDecoded] = useState<DecodedVin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const typing = useRef<ReturnType<typeof setInterval> | null>(null);

  const full = vin.length === 17;
  const check = full ? checkVin(vin) : null;

  // Decode once all 17 characters are in (NHTSA, free; cached on the server).
  useEffect(() => {
    if (!full || (check && !check.ok && check.reason === "format")) return;
    let live = true;
    start(async () => {
      const r = await decodeVinAction(vin);
      if (!live) return;
      if (r.ok) setDecoded(r.decoded);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vin, full]);

  function edit(next: string) {
    if (typing.current) clearInterval(typing.current);
    typing.current = null;
    setVin(clean(next));
    setDecoded(null);
    setError(null);
  }

  // "Try a real one": types it in, one character at a time. Typing yourself takes over.
  function typeIn(target: string) {
    edit("");
    let i = 0;
    typing.current = setInterval(() => {
      i++;
      setVin(target.slice(0, i));
      if (i >= target.length && typing.current) {
        clearInterval(typing.current);
        typing.current = null;
      }
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 55);
  }
  useEffect(() => () => {
    if (typing.current) clearInterval(typing.current);
  }, []);

  const detail = (i: number): string | null => {
    if (!decoded) return null;
    const engine = [decoded.displacementL ? `${decoded.displacementL} L` : null, decoded.cylinders ? `${decoded.cylinders}-cylinder` : null].filter(Boolean).join(" ");
    return [
      decoded.make ? cap(decoded.make) : null,
      [decoded.model, decoded.trim].filter(Boolean).join(" ") + (engine ? `, ${engine}` : "") || null,
      check?.ok ? "Adds up" : "Doesn't add up",
      decoded.year ? String(decoded.year) : null,
      "Factory code",
      "This one car",
    ][i];
  };

  return (
    <div>
      {/* The plate: 17 stamped slots. Each part is a button that flips to say what it means. */}
      <div className="@container">
        <div className="grid grid-cols-[3fr_5fr_1.6fr_1.6fr_1.6fr_6fr] gap-x-2 sm:gap-x-4">
          {PARTS.map((p, pi) => {
            const chars = Array.from({ length: p.to - p.from }, (_, k) => vin[p.from + k] ?? "");
            const isCheck = pi === 2;
            const tone = isCheck && full ? (check?.ok ? "bg-good" : "bg-bad") : chars.every(Boolean) ? "bg-accent" : "bg-border-strong";
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => setFlipped(flipped === pi ? null : pi)}
                aria-expanded={flipped === pi}
                aria-label={`${p.name}: ${chars.join("") || "empty"}. ${flipped === pi ? "Hide" : "Show"} what it means`}
                className="relative min-w-0 text-left [perspective:600px] after:absolute after:-inset-x-1.5 after:-inset-y-1 after:content-['']"
              >
                <span className={`flip relative block h-[1.15em] text-[length:min(3.4rem,calc((100cqi-2.5rem)*0.075))] ${flipped === pi ? "flipped" : ""}`}>
                  <span className="flip-face absolute inset-0 flex items-end font-mono leading-none font-semibold tracking-[0.06em]">
                    {chars.map((c, k) => (
                      <span key={`${k}${c}`} className={`inline-block w-[0.66em] ${c ? "pop" : "text-border-strong"}`}>
                        {c || "_"}
                      </span>
                    ))}
                  </span>
                  <span className="flip-face flip-back absolute inset-0 flex items-center text-[0.3em] leading-tight font-semibold text-accent">
                    {p.name}
                  </span>
                </span>
                <span aria-hidden className={`mt-2 block h-[3px] rounded-full transition-colors duration-300 ${tone}`} />
                <span className="mt-2 hidden text-sm leading-tight sm:block">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-muted">{detail(pi) ?? (pending && full ? "Decoding…" : " ")}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {flipped !== null && (
        <p key={flipped} className="pop mt-4 rounded-lg bg-accent-soft px-4 py-3">
          <strong>{PARTS[flipped].name}:</strong> {PARTS[flipped].explain}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="text-sm font-semibold">Type or paste any VIN</span>
          <input
            value={vin}
            onChange={(e) => edit(e.target.value)}
            className="field mt-1 font-mono text-lg tracking-[0.08em] uppercase"
            placeholder="17 letters and digits"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            maxLength={24}
          />
        </label>
        <button type="button" className="btn btn-primary py-3" disabled={!check?.ok} onClick={() => onCheck(vin)}>
          Check this car
        </button>
      </div>
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        {error
          ? error
          : full
            ? check?.ok
              ? decoded
                ? `NHTSA says: ${decoded.year ?? ""} ${decoded.make ? cap(decoded.make) : ""} ${decoded.model ?? ""}. Click any part of the plate to see what it means.`
                : "The check digit adds up. Asking NHTSA what it is…"
              : check && !check.ok
                ? check.message
                : null
            : `${vin.length} of 17. Tap any part of the plate to see what it means, or try a real one: `}
        {!full &&
          examples.map((e, i) => (
            <span key={e.vin}>
              {i > 0 && " or "}
              <button type="button" className="link" onClick={() => typeIn(e.vin)}>
                {e.label}
              </button>
            </span>
          ))}
      </p>
      <p className="mt-4 border-t border-border pt-4 text-sm">
        Have a listing instead?{" "}
        <button type="button" className="link font-semibold" onClick={onCheckOwn}>
          Paste it in the box above
        </button>
      </p>
    </div>
  );
}
