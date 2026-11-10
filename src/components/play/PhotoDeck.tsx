"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const THROW_DISTANCE = 110; // px dragged before a release throws the card
const THROW_SPEED = 0.6; // px per ms: a quick flick throws it too
const EXIT_MS = 240;

/**
 * The real 2016 Lexus RX 350 as a deck of its listing photos, each card
 * carrying one finding from its check, ending on the verdict. Drag or swipe
 * the top card away (it follows the pointer 1:1 and can be caught again),
 * click it, or use the buttons and arrow keys.
 */
export function PhotoDeck({ photos, cards, verdict, onOpen, onCheckOwn }: { photos: string[]; cards: string[]; verdict: string; onOpen: () => void; onCheckOwn: () => void }) {
  const total = cards.length + 1; // the last card is the verdict
  const [at, setAt] = useState(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const start = useRef({ x: 0, t: 0, lastX: 0, lastT: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Forward (the card flies off the way it was thrown) or back. */
  function go(dir: 1 | -1, thrown: 1 | -1 = 1) {
    if (leaving) return;
    if (dir === -1) return setAt((i) => Math.max(0, i - 1));
    if (at >= total - 1) return;
    if (reduced()) {
      setDx(0);
      return setAt((i) => i + 1);
    }
    setLeaving(thrown);
    timer.current = setTimeout(() => {
      setAt((i) => i + 1);
      setLeaving(0);
      setDx(0);
    }, EXIT_MS);
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (leaving || at >= total - 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const now = performance.now();
    start.current = { x: e.clientX, t: now, lastX: e.clientX, lastT: now };
    setDragging(true);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDx(e.clientX - start.current.x);
    start.current.lastX = e.clientX;
    start.current.lastT = performance.now();
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    const moved = e.clientX - start.current.x;
    const speed = Math.abs(moved) / Math.max(1, performance.now() - start.current.t);
    if (Math.abs(moved) < 4) return go(1); // a click
    if (Math.abs(moved) > THROW_DISTANCE || speed > THROW_SPEED) {
      setDx(moved);
      go(1, moved > 0 ? 1 : -1); // either way moves on; "Back" goes back
    } else setDx(0); // springs back
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  }

  const card = (k: number) => {
    const last = k === total - 1;
    return { photo: photos[k % Math.max(1, photos.length)], text: last ? null : cards[k], last };
  };
  const visible = [at, at + 1, at + 2].filter((k) => k < total);

  return (
    <div className="grid items-center gap-8 md:grid-cols-[1.25fr_1fr]">
      <div
        role="group"
        aria-roledescription="card deck"
        aria-label={`Photo ${at + 1} of ${total}`}
        tabIndex={0}
        onKeyDown={key}
        className="relative mx-auto aspect-[4/3] w-full max-w-lg select-none"
      >
        {visible
          .slice()
          .reverse()
          .map((k) => {
            const depth = k - at; // 0 = top card
            const c = card(k);
            const top = depth === 0;
            const x = top ? (leaving ? leaving * 640 : dx) : 0;
            const rot = top ? (leaving ? leaving * 18 : dx / 18) : depth * -2.5;
            return (
              <div
                key={k}
                onPointerDown={top ? down : undefined}
                onPointerMove={top ? move : undefined}
                onPointerUp={top ? up : undefined}
                onPointerCancel={top ? () => (setDragging(false), setDx(0)) : undefined}
                style={{
                  transform: `translate(${x}px, ${depth * 14}px) rotate(${rot}deg) scale(${1 - depth * 0.05})`,
                  transition: top && dragging ? "none" : `transform ${leaving ? EXIT_MS : 320}ms cubic-bezier(0.23, 1, 0.32, 1), opacity ${EXIT_MS}ms`,
                  opacity: top && leaving ? 0 : 1,
                  zIndex: 10 - depth,
                  touchAction: "pan-y",
                }}
                className={`lift absolute inset-0 overflow-hidden rounded-2xl bg-surface-muted ${top ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
              >
                {c.photo && (
                  // Real listing photo (Auto.dev's photo host, allowed by the CSP).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo} alt="" draggable={false} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="pointer-events-none h-full w-full object-cover" />
                )}
                {/* Scrim so the finding stays readable over any photo. */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-5 pt-16 pb-4 text-white">
                  {c.last ? (
                    <>
                      <p className="text-sm opacity-80">The verdict</p>
                      <p className="text-4xl font-extrabold tracking-tight">{verdict}</p>
                    </>
                  ) : (
                    <p className="text-xl leading-snug font-bold">{c.text}</p>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      <div>
        <p className="nums text-sm text-muted">
          {at + 1} of {total}
        </p>
        <p className="mt-1 text-2xl font-bold">A real 2016 Lexus RX 350, one finding per photo.</p>
        <p className="mt-2 text-muted">Drag or swipe the photo away, click it, or use the arrow keys. Every finding comes from its real check.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" onClick={() => go(-1)} disabled={at === 0}>
            Back
          </button>
          {at < total - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => go(1)}>
              Next finding
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={onCheckOwn}>
                Now check your own listing
              </button>
              <button type="button" className="btn btn-secondary" onClick={onOpen}>
                Open its full check
              </button>
              <button type="button" className="link text-sm" onClick={() => setAt(0)}>
                Start over
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
