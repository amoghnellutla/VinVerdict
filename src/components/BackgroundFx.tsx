"use client";

import { useEffect, useRef } from "react";

/**
 * Night-road effects (decorative, never in the way of input):
 *  - black asphalt grain behind the page (one small tile made once);
 *  - the little car as the mouse cursor. It sits exactly where the mouse is
 *    (moved by the compositor in the pointer event itself, so it never trails)
 *    and only its heading eases toward the direction of travel. Over links,
 *    buttons and text boxes the normal cursor comes back so clicking stays exact;
 *  - tire tracks that fade after a few seconds: from the car's rear wheels on a
 *    computer, from a finger on a phone (drawn over the page there).
 *
 * Cheap by design: the car is a small canvas drawn once and moved/rotated with a
 * CSS transform; the tracks canvas draws only while marks fade, at 1x pixel
 * density, batching marks into a few strokes per frame. Reduced motion keeps
 * the still asphalt and the normal cursor.
 */

type Mark = { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; t: number };

const LIFE_MS = 2600; // how long a mark takes to fade
const STEP = 8; // px between track segments
const MAX_MARKS = 240;
const BUCKETS = 6; // fade levels drawn per frame (one stroke each)
const CAR = 44; // car canvas size in CSS px
// The normal cursor comes back over anything you click or type in.
const INTERACTIVE = "a, button, input, textarea, select, label, summary, [role=button], [role=tab], [contenteditable=true]";

function grainTile(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d");
  if (!g) return "";
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 13; // specks just above black
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** The little car, seen from above, pointing along +x, centred in its canvas. `brake` lights the rear lamps. */
function drawCar(ctx: CanvasRenderingContext2D, brake: boolean) {
  ctx.clearRect(-CAR, -CAR, CAR * 2, CAR * 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)"; // soft shadow, without a blur filter
  box(ctx, -15, -7, 32, 17, 7);
  ctx.fillStyle = "#151a1f";
  for (const [wx, wy] of [[-11, -10], [-11, 6.5], [7, -10], [7, 6.5]]) box(ctx, wx, wy, 7, 3.5, 1.5);
  ctx.fillStyle = "rgb(143,179,245)";
  box(ctx, -15, -8, 30, 16, 6);
  ctx.fillStyle = "#0b1730"; // roof
  box(ctx, -3, -6, 9, 12, 3);
  ctx.fillStyle = "rgba(255,255,255,0.85)"; // windscreen
  box(ctx, 6, -6, 4, 12, 2);
  ctx.fillStyle = brake ? "rgb(255,70,55)" : "rgba(255,120,110,0.55)";
  box(ctx, -15, -7, 2.5, 3.5, 1);
  box(ctx, -15, 3.5, 2.5, 3.5, 1);
}

export function BackgroundFx() {
  const ground = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLCanvasElement>(null);
  const carRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tile = grainTile();
    if (ground.current && tile) ground.current.style.backgroundImage = `url(${tile})`;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tc = tracksRef.current;
    const cc = carRef.current;
    const tctx = tc?.getContext("2d");
    const cctx = cc?.getContext("2d");
    if (!tc || !cc || !tctx || !cctx) return;

    const mouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const root = document.documentElement;
    if (mouse) root.classList.add("car-cursor");
    else tc.dataset.over = "1"; // phones: tracks drawn over the page

    // The car: drawn once (again only when the brake lamps change), then just moved.
    const cdpr = Math.min(2, window.devicePixelRatio || 1);
    cc.width = cc.height = Math.round(CAR * cdpr);
    cc.style.width = cc.style.height = `${CAR}px`;
    cctx.setTransform(cdpr, 0, 0, cdpr, (CAR * cdpr) / 2, (CAR * cdpr) / 2);
    let braking = true;
    drawCar(cctx, braking);

    const size = () => {
      tc.width = innerWidth; // 1x: faint fading marks don't need more pixels
      tc.height = innerHeight;
      wake();
    };

    const marks: Mark[] = [];
    let lastTrack: { x: number; y: number } | null = null; // page coordinates
    let touching = false;
    let frame = 0;
    const car = { x: 0, y: 0, a: 0, placed: false, show: false };
    let stopTimer = 0;

    const addTrack = (px: number, py: number) => {
      if (!lastTrack) {
        lastTrack = { x: px, y: py };
        return;
      }
      const dx = px - lastTrack.x;
      const dy = py - lastTrack.y;
      const d = Math.hypot(dx, dy);
      if (d < STEP) return;
      marks.push({ x0: lastTrack.x, y0: lastTrack.y, x1: px, y1: py, nx: -dy / d, ny: dx / d, t: performance.now() });
      if (marks.length > MAX_MARKS) marks.shift();
      lastTrack = { x: px, y: py };
      wake();
    };

    const draw = () => {
      frame = 0;
      const now = performance.now();
      while (marks.length && now - marks[0].t > LIFE_MS) marks.shift();
      tctx.clearRect(0, 0, tc.width, tc.height);
      if (!marks.length) return;
      const gauge = mouse ? 7 : 11;
      const alpha = mouse ? 0.3 : 0.22; // over the text on phones: a little fainter
      tctx.lineWidth = 7;
      tctx.setLineDash([3, 3]);
      // One path per fade level instead of one stroke per mark.
      const paths = Array.from({ length: BUCKETS }, () => new Path2D());
      for (const m of marks) {
        const age = (now - m.t) / LIFE_MS;
        const p = paths[Math.min(BUCKETS - 1, Math.floor(age * BUCKETS))];
        for (const o of [-gauge, gauge]) {
          p.moveTo(m.x0 + m.nx * o - scrollX, m.y0 + m.ny * o - scrollY);
          p.lineTo(m.x1 + m.nx * o - scrollX, m.y1 + m.ny * o - scrollY);
        }
      }
      paths.forEach((p, i) => {
        tctx.strokeStyle = `rgba(190, 200, 210, ${alpha * (1 - (i + 0.5) / BUCKETS)})`;
        tctx.stroke(p);
      });
      tctx.setLineDash([]);
      frame = requestAnimationFrame(draw);
    };
    function wake() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    const place = () => {
      cc.style.transform = `translate3d(${car.x - CAR / 2}px, ${car.y - CAR / 2}px, 0) rotate(${car.a}rad)`;
    };
    const setBrake = (on: boolean) => {
      if (on !== braking) {
        braking = on;
        drawCar(cctx, on);
      }
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // touches come through touchmove (works while scrolling)
      const overUi = !!(e.target instanceof Element && e.target.closest(INTERACTIVE));
      const x = e.clientX;
      const y = e.clientY;
      if (!car.placed) Object.assign(car, { x, y, placed: true });
      const dx = x - car.x;
      const dy = y - car.y;
      if (Math.hypot(dx, dy) > 1.5) {
        // Turn toward the way the mouse is going; the position itself never lags.
        let da = Math.atan2(dy, dx) - car.a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        car.a += da * 0.35;
        setBrake(false);
      }
      car.x = x;
      car.y = y;
      if (!car.show) lastTrack = null;
      car.show = !overUi;
      cc.style.visibility = car.show ? "visible" : "hidden";
      place();
      if (car.show) addTrack(x - Math.cos(car.a) * 9 + scrollX, y - Math.sin(car.a) * 9 + scrollY);
      else lastTrack = null;
      window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => setBrake(true), 140);
    };
    const onTouch = (e: TouchEvent) => {
      touching = true;
      const t = e.touches[0];
      if (t) addTrack(t.clientX + scrollX, t.clientY + scrollY);
    };
    const lift = () => {
      touching = false;
      lastTrack = null;
    };
    const leave = () => {
      car.show = false;
      cc.style.visibility = "hidden";
      lastTrack = null;
    };
    // Scrolling moves the marks with the page. A wheel scroll starts a fresh track
    // (no line jumping across the page); a finger keeps drawing.
    const onScroll = () => {
      if (!touching) lastTrack = null;
      if (marks.length) wake();
    };

    cc.style.visibility = "hidden";
    size();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchend", lift, { passive: true });
    root.addEventListener("pointerleave", leave);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", size);
    return () => {
      root.classList.remove("car-cursor");
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchend", lift);
      root.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", size);
      window.clearTimeout(stopTimer);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div ref={ground} aria-hidden className="bg-fx" />
      <canvas ref={tracksRef} aria-hidden className="fx-tracks" />
      <canvas ref={carRef} aria-hidden className="fx-car" />
    </>
  );
}
