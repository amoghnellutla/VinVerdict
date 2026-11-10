"use client";

import { useEffect, useRef } from "react";

/**
 * The page's background: black asphalt with a fine grain, and tire tracks.
 * Wherever the mouse moves (or a finger touches and scrolls on a phone) it
 * leaves a pair of tread marks that fade after a few seconds. Marks are kept
 * in page coordinates, so they scroll with the page like marks on a road.
 *
 * Cheap on purpose: the grain is one small tile made once; the canvas only
 * draws while marks are fading and stops when there are none. Reduced motion
 * gets the still asphalt with no tracks. Decorative and behind everything.
 */

type Mark = { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; t: number };

const LIFE_MS = 3200; // how long a mark takes to fade
const STEP = 7; // px between track segments
const GAUGE = 11; // half the distance between the two tires
const MAX_MARKS = 500;

/** A small asphalt grain tile, made once in the browser (a data: URL, which the CSP allows). */
function grainTile(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d");
  if (!g) return "";
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 13; // as subtle as the preview: specks just above black
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export function BackgroundFx() {
  const ground = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tile = grainTile();
    if (ground.current && tile) ground.current.style.backgroundImage = `url(${tile})`;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const marks: Mark[] = [];
    let last: { x: number; y: number } | null = null;
    let touching = false;
    let frame = 0;
    // Phones: a lighter canvas (fewer pixels to fill each frame).
    const dpr = Math.min(window.matchMedia("(pointer: coarse)").matches ? 1.25 : 2, window.devicePixelRatio || 1);

    const size = () => {
      c.width = Math.round(innerWidth * dpr);
      c.height = Math.round(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    const draw = () => {
      frame = 0;
      const now = performance.now();
      while (marks.length && now - marks[0].t > LIFE_MS) marks.shift();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const sx = scrollX;
      const sy = scrollY;
      ctx.lineWidth = 7;
      ctx.setLineDash([3, 3]);
      for (const m of marks) {
        const a = 1 - (now - m.t) / LIFE_MS;
        ctx.strokeStyle = `rgba(190, 200, 210, ${0.3 * a})`;
        for (const o of [-GAUGE, GAUGE]) {
          ctx.beginPath();
          ctx.moveTo(m.x0 + m.nx * o - sx, m.y0 + m.ny * o - sy);
          ctx.lineTo(m.x1 + m.nx * o - sx, m.y1 + m.ny * o - sy);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      if (marks.length) frame = requestAnimationFrame(draw);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    // Add track from the last point to (x, y), in page coordinates.
    const drive = (clientX: number, clientY: number) => {
      const x = clientX + scrollX;
      const y = clientY + scrollY;
      if (!last) {
        last = { x, y };
        return;
      }
      const dx = x - last.x;
      const dy = y - last.y;
      const d = Math.hypot(dx, dy);
      if (d < STEP) return;
      marks.push({ x0: last.x, y0: last.y, x1: x, y1: y, nx: -dy / d, ny: dx / d, t: performance.now() });
      if (marks.length > MAX_MARKS) marks.shift();
      last = { x, y };
      wake();
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // touches come through touchmove (works while scrolling)
      drive(e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      touching = true;
      const t = e.touches[0];
      if (t) drive(t.clientX, t.clientY);
    };
    const lift = () => {
      touching = false;
      last = null;
    };
    // Scrolling moves the marks with the page. A wheel scroll starts a fresh
    // track (no line jumping from where the mouse was); a finger keeps drawing.
    const onScroll = () => {
      if (!touching) last = null;
      if (marks.length) wake();
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchend", lift, { passive: true });
    document.documentElement.addEventListener("pointerleave", lift);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", size);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchend", lift);
      document.documentElement.removeEventListener("pointerleave", lift);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", size);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ground} aria-hidden className="bg-fx">
      <canvas ref={canvas} />
    </div>
  );
}
