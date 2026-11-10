"use client";

import { useEffect, useState } from "react";

/** Risk 0–100 as a half-circle dial that sweeps to its value. Color follows the verdict. */
export function RiskGauge({ risk, tone }: { risk: number; tone: "bad" | "warn" | "good" | "muted" }) {
  // Start empty, then sweep (CSS transition), so the number feels measured rather than printed.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(risk));
    return () => cancelAnimationFrame(t);
  }, [risk]);
  const r = 52;
  const len = Math.PI * r;
  const color = { bad: "var(--bad)", warn: "var(--warn)", good: "var(--good)", muted: "var(--muted)" }[tone];
  return (
    <div className="relative w-28 shrink-0 self-end sm:w-36 sm:self-auto" role="img" aria-label={`Risk score ${risk} out of 100`}>
      <svg viewBox="0 0 120 68" className="w-full">
        <path d={`M8 60 A${r} ${r} 0 0 1 112 60`} fill="none" stroke="var(--border)" strokeWidth="9" strokeLinecap="round" />
        <path
          d={`M8 60 A${r} ${r} 0 0 1 112 60`}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.2, 0.7, 0.2, 1)" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">
        <span className="nums font-serif text-3xl font-semibold">{risk}</span>
        <span className="block text-xs text-muted">risk / 100</span>
      </div>
    </div>
  );
}
