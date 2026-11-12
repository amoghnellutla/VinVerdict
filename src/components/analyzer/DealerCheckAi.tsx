"use client";

import { useMemo, useState } from "react";
import { checkDealersAction, type DealerState } from "@/app/actions/ai";
import { ExternalLink } from "@/components/ExternalLink";
import { Turnstile } from "@/components/Turnstile";
import { useReportPart } from "./report-parts";

const money = (n: number | null) => (n == null ? "not shown" : `$${n.toLocaleString("en-US")}`);
const STATUS = { listed: "Still listed", sold: "Says sold or no longer available", unclear: "Can't tell from the page" } as const;
const NOT_READ = { "not-this-car": "This VIN isn't on the page any more (sold or replaced)", robots: "The site asks robots not to read it: open it yourself", failed: "Couldn't open it: open it yourself" } as const;

/**
 * "Check the dealers for me": opens this car's current and recent dealer pages (links already
 * in its listing history) and says what each shows now: still listed, price, fees, certified.
 * Informational: it doesn't change the verdict.
 */
export function DealerCheckAi({ urls, vin, guest }: { urls: string[]; vin: string; guest: boolean }) {
  const [state, setState] = useState<DealerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // What it found goes into the downloadable report too.
  useReportPart(
    "aiDealers",
    useMemo(
      () =>
        state?.status === "ok"
          ? {
              at: state.at,
              lines: state.results.map((r) => ({
                name: r.page?.dealer ?? r.host,
                url: r.url,
                line: r.page
                  ? `${STATUS[r.page.status]}; price ${money(r.page.price)}${r.page.fees.length ? `; fees shown: ${r.page.fees.map((f) => `${f.label} ${money(f.amount)}`).join(", ")}` : ""}${r.page.certified ? "; says certified pre-owned" : ""} (read from ${r.by ?? "the page"})`
                  : NOT_READ[r.checked as keyof typeof NOT_READ],
              })),
            }
          : null,
      [state],
    ),
  );

  async function run() {
    if (busy || (guest && !token)) return;
    setBusy(true);
    try {
      setState(await checkDealersAction({ urls, vin, token }));
    } catch {
      setState({ status: "error", message: "Couldn't reach VinVerdict. Check your connection and try again." });
    }
    setBusy(false);
    setToken(null);
    setAttempt((n) => n + 1);
  }

  return (
    <div className="mt-4 rounded-lg border border-border px-4 py-3 print:hidden">
      <p className="font-semibold">Is the car still there, and at what price?</p>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        VinVerdict opens {urls.length === 1 ? "this car's dealer page" : `these ${urls.length} dealer pages`} now and reads what each says: still
        listed, price, fees. A free AI service reads a page only when the page doesn&apos;t say it in a standard form; every number it gives must be on
        the page.
      </p>
      {guest && <Turnstile key={attempt} action="ai" onToken={setToken} />}
      <button type="button" className="btn btn-secondary mt-2" disabled={busy || (guest && !token)} onClick={() => void run()}>
        {busy ? "Checking the dealers…" : "Check the dealers now"}
      </button>
      {state?.status === "error" && <p role="alert" className="mt-2 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{state.message}</p>}
      {state?.status === "ok" && (
        <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
          {state.results.map((r) => (
            <li key={r.url} className="py-2">
              <ExternalLink href={r.url} className="link font-semibold">{r.page?.dealer ?? r.host}</ExternalLink>
              {r.page ? (
                <span className="block">
                  {STATUS[r.page.status]}. Price {money(r.page.price)}
                  {r.page.miles ? `, ${r.page.miles.toLocaleString("en-US")} miles` : ""}
                  {r.page.fees.length ? `. Fees shown: ${r.page.fees.map((f) => `${f.label} ${money(f.amount)}`).join(", ")}` : ""}
                  {r.page.certified ? ". Says certified pre-owned" : ""}.
                  <span className="block text-xs text-muted">Read from {r.by ?? "the page"}, {new Date(state.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.</span>
                </span>
              ) : (
                <span className="block text-muted">{NOT_READ[r.checked as keyof typeof NOT_READ]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
