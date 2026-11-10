"use client";

import { useEffect, useRef } from "react";

/**
 * Night-road effects (decorative, never in the way of input):
 *  - black asphalt grain behind the page (one small tile made once);
 *  - tire tracks: tread marks that fade after a few seconds. On a computer a
 *    little car follows the mouse and lays them from its rear wheels; on a
 *    phone a finger lays them as it touches and scrolls, drawn over the page;
 *  - the little car itself, as the mouse cursor. Over links, buttons and
 *    text boxes the normal cursor comes back so clicking stays exact.
 *
 * Marks live in page coordinates, so they scroll with the page like marks on
 * a road. Both canvases draw only while something moves or fades. Reduced
 * motion keeps the still asphalt and the normal cursor.
 */

type Mark = { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; t: number };

const LIFE_MS = 3200; // how long a mark takes to fade
const STEP = 7; // px between track segments
const MAX_MARKS = 500;
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

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** The little car, seen from above, pointing along +x. */
function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, brake: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#151a1f";
  for (const [wx, wy] of [[-11, -10], [-11, 6.5], [7, -10], [7, 6.5]]) {
    rounded(ctx, wx, wy, 7, 3.5, 1.5);
    ctx.fill();
  }
  ctx.fillStyle = "rgb(143,179,245)";
  rounded(ctx, -15, -8, 30, 16, 6);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0b1730"; // roof
  rounded(ctx, -3, -6, 9, 12, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)"; // windscreen
  rounded(ctx, 6, -6, 4, 12, 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,${Math.round(120 - brake * 60)},${Math.round(110 - brake * 60)},${0.5 + brake * 0.5})`;
  rounded(ctx, -15, -7, 2.5, 3.5, 1);
  ctx.fill();
  rounded(ctx, -15, 3.5, 2.5, 3.5, 1);
  ctx.fill();
  if (brake > 0.3) {
    ctx.shadowColor = "rgba(255,80,60,0.9)";
    ctx.shadowBlur = 14 * brake;
    rounded(ctx, -15, -7, 2.5, 14, 1);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
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
    const dpr = Math.min(mouse ? 2 : 1.25, window.devicePixelRatio || 1);
    const size = () => {
      for (const [c, ctx] of [[tc, tctx], [cc, cctx]] as const) {
        c.width = Math.round(innerWidth * dpr);
        c.height = Math.round(innerHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      wake();
    };

    const marks: Mark[] = [];
    let lastTrack: { x: number; y: number } | null = null; // page coordinates
    let touching = false;
    let frame = 0;
    // The car (viewport coordinates) and where it's heading.
    const car = { x: 0, y: 0, a: 0, v: 0, brake: 0, placed: false, show: false };
    let target: { x: number; y: number } | null = null;
    let overUi = false;

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
    };

    const draw = () => {
      frame = 0;
      const now = performance.now();
      let moving = false;

      // Drive the car toward the pointer; its rear wheels lay the tracks.
      if (mouse && target && car.placed) {
        const dx = target.x - car.x;
        const dy = target.y - car.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 4) {
          let da = Math.atan2(dy, dx) - car.a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          car.a += da * 0.2;
        }
        const speed = Math.min(dist * 0.18, 26);
        car.brake = car.v - speed > 0.6 || dist < 3 ? Math.min(1, car.brake + 0.25) : Math.max(0, car.brake - 0.08);
        car.v = speed;
        car.x += Math.cos(car.a) * speed;
        car.y += Math.sin(car.a) * speed;
        if (car.show && !overUi) addTrack(car.x - Math.cos(car.a) * 9 + scrollX, car.y - Math.sin(car.a) * 9 + scrollY);
        moving = dist > 0.5 || car.brake > 0.01;
      }

      while (marks.length && now - marks[0].t > LIFE_MS) marks.shift();
      tctx.clearRect(0, 0, innerWidth, innerHeight);
      tctx.lineWidth = 7;
      tctx.setLineDash([3, 3]);
      const gauge = mouse ? 7 : 11;
      const alpha = mouse ? 0.3 : 0.22; // over the text on phones: a little fainter
      for (const m of marks) {
        tctx.strokeStyle = `rgba(190, 200, 210, ${alpha * (1 - (now - m.t) / LIFE_MS)})`;
        for (const o of [-gauge, gauge]) {
          tctx.beginPath();
          tctx.moveTo(m.x0 + m.nx * o - scrollX, m.y0 + m.ny * o - scrollY);
          tctx.lineTo(m.x1 + m.nx * o - scrollX, m.y1 + m.ny * o - scrollY);
          tctx.stroke();
        }
      }
      tctx.setLineDash([]);

      cctx.clearRect(0, 0, innerWidth, innerHeight);
      if (mouse && car.show && !overUi) drawCar(cctx, car.x, car.y, car.a, car.brake);

      if (marks.length || moving) frame = requestAnimationFrame(draw);
    };
    function wake() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // touches come through touchmove (works while scrolling)
      target = { x: e.clientX, y: e.clientY };
      overUi = !!(e.target instanceof Element && e.target.closest(INTERACTIVE));
      if (!car.placed) Object.assign(car, { x: e.clientX, y: e.clientY, placed: true });
      if (!car.show) lastTrack = null;
      car.show = true;
      wake();
    };
    const onTouch = (e: TouchEvent) => {
      touching = true;
      const t = e.touches[0];
      if (!t) return;
      addTrack(t.clientX + scrollX, t.clientY + scrollY);
      wake();
    };
    const lift = () => {
      touching = false;
      lastTrack = null;
    };
    const leave = () => {
      car.show = false;
      lastTrack = null;
      wake();
    };
    // Scrolling moves the marks with the page. A wheel scroll starts a fresh track
    // (no line jumping across the page); a finger keeps drawing.
    const onScroll = () => {
      if (!touching) lastTrack = null;
      if (marks.length) wake();
    };

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
