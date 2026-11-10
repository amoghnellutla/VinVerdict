"use client";

import { useEffect, useState } from "react";

/**
 * Risk 0–100 as a dashboard dial: tick marks every 10 and a needle that
 * swings to the value when the result appears (it answers the check).
 * Reduced motion: the needle is simply there.
 */
export function RiskGauge({ risk, tone }: { risk: number; tone: "bad" | "warn" | "good" | "muted" }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(risk));
    return () => cancelAnimationFrame(t);
  }, [risk]);
  const color = { bad: "var(--bad)", warn: "var(--warn)", good: "var(--good)", muted: "var(--muted)" }[tone];
  // Dial runs from 180° (left, 0) to 360° (right, 100).
  const at = (v: number, r: number) => {
    const a = Math.PI * (1 + v / 100);
    return [60 + r * Math.cos(a), 62 + r * Math.sin(a)];
  };
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);
  const len = Math.PI * 50;
  return (
    <div className="relative w-32 shrink-0 self-end sm:w-40 sm:self-auto" role="img" aria-label={`Risk score ${risk} out of 100`}>
      <svg viewBox="0 0 120 72" className="w-full overflow-visible">
        <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="var(--border)" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M10 62 A50 50 0 0 1 110 62"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - shown / 100)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[900ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]"
        />
        {ticks.map((t) => {
          const [x1, y1] = at(t, t % 50 === 0 ? 36 : 40);
          const [x2, y2] = at(t, 44);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" strokeWidth={t % 50 === 0 ? 1.6 : 0.9} strokeLinecap="round" />;
        })}
        <g
          style={{ transform: `rotate(${(shown / 100) * 180 - 90}deg)`, transformOrigin: "60px 62px" }}
          className="motion-safe:transition-transform motion-safe:duration-[900ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]"
        >
          <line x1="60" y1="62" x2="60" y2="24" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <circle cx="60" cy="62" r="4.5" fill="var(--foreground)" />
      </svg>
      <p className="nums -mt-1 text-center leading-none">
        <span className="text-3xl font-extrabold tracking-tight">{risk}</span>
        <span className="block text-xs text-muted">risk out of 100</span>
      </p>
    </div>
  );
}
