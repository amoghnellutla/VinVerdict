"use client";

import { useEffect, useRef } from "react";

/**
 * The page's background: solid black, a faint grid of stamped dots (VIN-plate
 * texture), and a "headlight" that follows the mouse and lights the dots under
 * it. Purely decorative and behind everything.
 *
 * Cheap on purpose: the pointer position is written once per frame, and only
 * on this layer (custom properties set on the root would restyle the whole
 * page). Touch screens and reduced motion get the still version.
 */
export function BackgroundFx() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let x = 0;
    let y = 0;
    let frame = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty("--x", `${x}px`);
      el.style.setProperty("--y", `${y}px`);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      el.dataset.lit = "1";
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => delete el.dataset.lit;
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className="bg-fx">
      <span />
    </div>
  );
}
