"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile "I'm human" check (demo visitors' live price check).
 * The script is added by this (nonced) app code, which the CSP's
 * 'strict-dynamic' allows; the widget itself runs in Cloudflare's frame
 * (CSP frame-src). Inside a <form>, it adds the hidden field
 * "cf-turnstile-response" that the server verifies.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile didn't load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** What the widget is doing, for the page to explain: it wants a click, it failed, or its pass expired. */
export type TurnstileStatus = "interactive" | "error" | "expired";

export function Turnstile({ action, onToken, onStatus }: { action: string; onToken: (token: string | null) => void; onStatus?: (s: TurnstileStatus) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [failed, setFailed] = useState(false);
  // A failed or timed-out pass is said here with a way to retry (a page that explains it itself
  // passes onStatus and gets no second message).
  const [problem, setProblem] = useState<"error" | "expired" | null>(null);
  const widget = useRef<string | undefined>(undefined);
  // Keep the latest callback without re-rendering the widget.
  const cb = useRef(onToken);
  const st = useRef(onStatus);
  useEffect(() => {
    cb.current = onToken;
    st.current = onStatus;
  }, [onToken, onStatus]);

  useEffect(() => {
    if (!siteKey) return;
    let id: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        id = widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          theme: "dark",
          callback: (t: string) => {
            setProblem(null);
            cb.current(t);
          },
          "expired-callback": () => {
            cb.current(null);
            st.current?.("expired");
          },
          "error-callback": () => {
            cb.current(null);
            setProblem("error");
            st.current?.("error");
          },
          "timeout-callback": () => {
            setProblem("expired");
            st.current?.("expired");
          },
          "before-interactive-callback": () => st.current?.("interactive"),
        });
      })
      .catch(() => {
        setFailed(true);
        st.current?.("error");
      });
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, action]);

  if (!siteKey) return <p className="text-sm text-muted">Live checks aren&apos;t switched on in this demo yet. The full examples on the home page show complete checks.</p>;
  if (failed) return <p className="text-sm text-bad">The &quot;I&apos;m human&quot; check didn&apos;t load. Turn off blockers for this site or try again.</p>;
  return (
    <div>
      <div ref={box} className="min-h-[65px]" />
      {problem && !onStatus && (
        <p role="status" className="mt-2 text-sm text-warn">
          {problem === "error"
            ? "The \"I'm human\" check didn't work. Turn off ad or script blockers for this site, then "
            : "The \"I'm human\" check timed out. "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setProblem(null);
              if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
            }}
          >
            try again
          </button>
          .
        </p>
      )}
    </div>
  );
}
