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

export function Turnstile({ action, onToken }: { action: string; onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [failed, setFailed] = useState(false);
  // Keep the latest callback without re-rendering the widget.
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;
    let id: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          theme: "auto",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, action]);

  if (!siteKey) return <p className="text-sm text-muted">Live checks aren&apos;t switched on in this demo yet. The example cars above show full price checks.</p>;
  if (failed) return <p className="text-sm text-bad">The &quot;I&apos;m human&quot; check didn&apos;t load. Turn off blockers for this site or try again.</p>;
  return <div ref={box} className="min-h-[65px]" />;
}
