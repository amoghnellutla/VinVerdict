"use client";

import { useMemo, useState } from "react";
import { compareManually, parsePrice } from "@/lib/value/manual";
import { useReportPart } from "./report-parts";

const SLOTS = 5;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export const MANUAL_VERDICT = {
  "far-below": { text: "Far below the ads you found: a price this low needs a reason. See the car and title before paying anything.", tone: "text-warn" },
  below: { text: "Below the ads you found: possibly a good deal, if the car checks out.", tone: "text-good" },
  "in-line": { text: "In line with the ads you found.", tone: "text-foreground" },
  above: { text: "Above the ads you found: room to negotiate.", tone: "text-warn" },
} as const;

/** The buyer's own comparison: works with no lookup at all. Asking prices only. */
export function ManualCompare({ asking }: { asking: number }) {
  const [prices, setPrices] = useState<string[]>(Array(SLOTS).fill(""));
  const r = compareManually(asking, prices.map(parsePrice));
  // The prices you typed and what they say go into the downloadable report too.
  const key = prices.join("|");
  useReportPart(
    "manual",
    useMemo(() => {
      const typed = key.split("|").map(parsePrice);
      const res = compareManually(asking, typed);
      return res ? { asking, prices: typed.filter((p): p is number => p !== null), result: res } : null;
    }, [asking, key]),
  );
  return (
    <details className="group mt-8 rounded-lg border border-border px-4 py-3">
      <summary className="cursor-pointer font-semibold">Compare it yourself (no lookup needed)</summary>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Find two to five ads for the same model, close in year, miles and trim (the search links above help), and type their prices.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {prices.map((p, i) => (
          <label key={i} className="w-28">
            <span className="sr-only">Similar ad {i + 1} price</span>
            <input
              value={p}
              onChange={(e) => setPrices((xs) => xs.map((x, j) => (j === i ? e.target.value.slice(0, 12) : x)))}
              inputMode="decimal"
              placeholder={`Ad ${i + 1} $`}
              className="field w-full"
            />
          </label>
        ))}
      </div>
      <div aria-live="polite" className="mt-3">
        {r ? (
          <div className="space-y-1">
            <p className={`font-semibold ${MANUAL_VERDICT[r.verdict].tone}`}>{MANUAL_VERDICT[r.verdict].text}</p>
            <p className="nums">
              Asking {usd(asking)} is {Math.abs(Math.round(r.diff * 100))}% {r.diff < 0 ? "below" : "above"} the middle of {r.n} ads ({usd(r.median)}; they ranged{" "}
              {usd(r.low)}–{usd(r.high)}).
            </p>
            <p className="text-sm text-muted">
              Confidence: {r.confidence}. This compares asking prices only; check the trim, miles, condition and title match before treating them as the same car.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">Type at least two prices to compare.</p>
        )}
      </div>
    </details>
  );
}
