import camry from "@/lib/demo/data/camry.json";
import type { DemoData } from "@/lib/demo/examples";
import { summarizeHistory } from "@/lib/history/summary";
import { mergeLive } from "@/lib/live/merge";
import { fmt, valueCar } from "@/lib/value/estimate";
import { buildVerdict } from "@/lib/verdict";

const VERDICT = { hide: ["Walk away", "text-bad"], verify: ["Check it in person first", "text-warn"], caution: ["Go carefully", "text-warn"], clear: ["No red flags so far", "text-foreground"] } as const;

/**
 * The home page's "product shot": the real recorded Camry check, worked out
 * with the same code a live check uses (so it can't drift from the example).
 * Clicking it opens that example (Analyzer listens for data-example).
 */
export function HeroSample() {
  const d = camry as unknown as DemoData;
  const live = d.price.live;
  // Worked out as of the day it was recorded (also keeps the page's static shell deterministic).
  const asOf = new Date(`${d.recordedAt}T12:00:00Z`);
  const history = d.price.history ? summarizeHistory(d.price.history, asOf) : null;
  const listing = mergeLive(d.analysis.listing, live);
  const result = buildVerdict({ ...d.analysis, live, history }, {}, asOf);
  const v = d.price.sources
    ? valueCar(d.price.sources, { price: listing.price, miles: listing.miles, sellerType: listing.sellerType, accident: listing.accident, titleStatus: listing.titleStatus, usage: listing.usage })
    : null;
  const top = result.hits.filter((h) => h.action !== "info").slice(0, 3);
  // Where each finding came from (not the guidance behind it): the ad's text, the live listing data, or its listing history.
  const feed = live ? `${live.source} data` : "Listing data";
  const origin = (id: string) =>
    id.startsWith("history-") ? "Listing history"
      : id.startsWith("live-") ? feed
        : id === "fleet" && d.analysis.listing.usage === "unknown" ? feed
          : id === "accident-reported" && d.analysis.listing.accident !== "reported" ? feed
            : "The listing";
  const [label, tone] = VERDICT[result.verdict];
  const name = [d.analysis.decoded?.year, "Toyota", d.analysis.decoded?.model, d.analysis.decoded?.trim].filter(Boolean).join(" ");
  const min = v ? v.low * 0.8 : 0;
  const max = v ? v.high * 1.2 : 1;
  const pos = (n: number) => `${Math.min(100, Math.max(0, ((n - min) / (max - min)) * 100))}%`;

  return (
    <button type="button" data-example="camry" className="rise d3 block w-full text-left" aria-label="Open this sample check: the 2021 Toyota Camry example">
      <div className="float lift rounded-xl border border-border bg-surface p-5 sm:p-6">
        <p className="flex justify-between text-xs font-semibold tracking-wide text-muted">
          <span>SAMPLE CHECK</span>
          <span>Real AutoTrader listing</span>
        </p>
        <p className="nums mt-3 font-semibold">
          {name} · {listing.price ? fmt(listing.price) : ""} · {listing.miles?.toLocaleString("en-US")} mi
        </p>
        <p className={`mt-1 font-serif text-4xl font-semibold ${tone}`}>{label}</p>
        <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
          {top.map((h, i) => (
            <li key={h.id} className={`rise d${i + 4} flex items-baseline justify-between gap-3 py-2`}>
              <span className="font-medium">{h.title}</span>
              <span className="shrink-0 text-xs text-muted">{origin(h.id)}</span>
            </li>
          ))}
        </ul>
        {v && listing.price && (
          <div className="mt-4">
            <p className="nums text-sm">
              Fair price <strong>{fmt(v.low)}–{fmt(v.high)}</strong>
              <span className="text-muted"> · asking {fmt(listing.price)}</span>
            </p>
            <div aria-hidden className="relative mt-2 h-6">
              <div className="absolute inset-x-0 top-2 h-1.5 rounded-full bg-surface-muted" />
              <div className="grow-x absolute top-2 h-1.5 rounded-full bg-good/60" style={{ left: pos(v.low), width: `calc(${pos(v.high)} - ${pos(v.low)})` }} />
              <div className="absolute top-0 h-5 w-0.5 bg-foreground" style={{ left: pos(listing.price) }} />
            </div>
          </div>
        )}
        <p className="mt-3 text-sm font-semibold text-accent">Open the full check →</p>
      </div>
    </button>
  );
}
