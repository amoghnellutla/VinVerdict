"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import type { LiveListing as Live } from "@/lib/live/parse";

const money = (n: number | null) => (n == null ? null : `$${n.toLocaleString("en-US")}`);
// Only risky use is shown: a feed's "personal" can be wrong (see lib/history-report.ts).
const USAGE = { personal: null, fleet: "Fleet or commercial", rental: "Rental", unknown: null } as const;

/**
 * Feature 2b: what the car's current (or last) listing says, found by VIN.
 * Display only. A feed's good news (no accidents, one owner) isn't a history
 * report and can be out of date, so it's shown as "not confirmed" or left out.
 */
export function LiveFacts({ l }: { l: Live }) {
  const where = [l.city, l.state].filter(Boolean).join(", ");
  const accidents = l.accidentCount ? `${l.accidentCount} reported` : "Not confirmed: check the history report";
  const rows: [string, ReactNode][] = [
    ["Price", money(l.price)],
    ["Miles", l.miles == null ? null : `${l.miles.toLocaleString("en-US")} mi`],
    ["Seller", [l.sellerName, where].filter(Boolean).join(", ") || null],
    ["Accidents", accidents],
    ["Use", USAGE[l.usage]],
    ["Certified pre-owned", l.certified ? "Yes" : null],
    ["Days listed", l.daysOnMarket?.toString() ?? null],
    ["Status", l.removedAt ? `Ended ${l.removedAt.slice(0, 10)}` : "For sale now"],
  ];
  return (
    <div>
      <h3 className="font-semibold">
        Where it&apos;s listed <span className="font-normal text-muted">(from {l.source})</span>
      </h3>
      <dl className="nums mt-2 grid gap-x-8 sm:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5">
              <dt className="text-muted">{k}</dt>
              <dd className={`text-right ${k === "Accidents" && l.accidentCount ? "font-semibold text-bad" : ""}`}>{v}</dd>
            </div>
          ))}
      </dl>
      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {l.url && <ExternalLink href={l.url} className="link">Open the listing</ExternalLink>}
        {l.carfaxUrl && <ExternalLink href={l.carfaxUrl} className="link">Free Carfax report (from the dealer)</ExternalLink>}
      </p>
    </div>
  );
}
