"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { searchAction, type SearchState } from "@/app/actions/search";
import { ExternalLink } from "@/components/ExternalLink";
import { readBuyerZip } from "@/lib/buyer-zip";
import { resultAsListing, type SearchResult } from "@/lib/search/rank";
import { searchLinks } from "@/lib/search-links";
import { DEAL_TEXT } from "@/lib/value/estimate";

const idle: SearchState = { status: "idle" };
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const LABEL_TONE = { great: "text-good", good: "text-good", fair: "text-foreground", high: "text-warn", over: "text-bad" } as const;

/** In-app search (Phase 7): filters → ranked results, each one a click away from the full check. */
export function SearchForm() {
  const [state, action, pending] = useActionState(searchAction, idle);
  const [zip, setZip] = useState("");

  return (
    <>
      <form
        action={action}
        className="card grid gap-4 sm:grid-cols-4"
        onFocus={() => {
          if (!zip) setZip(readBuyerZip().zip);
        }}
      >
        <Field label="Make" name="make" placeholder="Toyota" required />
        <Field label="Model" name="model" placeholder="Camry" required />
        <Field label="From year" name="minYear" placeholder="2017" inputMode="numeric" />
        <Field label="To year" name="maxYear" placeholder="2024" inputMode="numeric" />
        <Field label="Max price ($)" name="maxPrice" placeholder="15000" inputMode="numeric" />
        <Field label="Max miles" name="maxMiles" placeholder="120000" inputMode="numeric" />
        <label>
          <span className="text-sm font-semibold">ZIP</span>
          <input name="zip" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} required inputMode="numeric" placeholder="08540" className="field mt-1" />
        </label>
        <label>
          <span className="text-sm font-semibold">Within</span>
          <select name="radius" defaultValue="100" className="field mt-1">
            {[25, 50, 75, 100].map((r) => <option key={r} value={r}>{r} miles</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="private" className="size-4 accent-[var(--accent)]" /> Include private sellers (1 more lookup)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="blackOnly" className="size-4 accent-[var(--accent)]" /> Black paint only
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-4">
          <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Searching…" : "Search"}</button>
          <span className="text-sm text-muted">Automatic only. Uses 1 MarketCheck lookup (2 with private sellers); the same search again today is free.</span>
        </div>
      </form>

      <div aria-live="polite" className="mt-10">
        {state.status === "error" && <p role="alert" className="rounded-md bg-bad-soft px-4 py-3 text-bad">{state.message}</p>}
        {state.status === "done" && <Results state={state} />}
      </div>
    </>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <input {...rest} className="field mt-1" />
    </label>
  );
}

function Results({ state }: { state: Extract<SearchState, { status: "done" }> }) {
  const f = state.filters;
  const outside = searchLinks({ make: f.make, model: f.model, zip: f.zip, radius: f.radius, minYear: f.minYear, maxYear: f.maxYear, maxPrice: f.maxPrice });
  return (
    <>
      <h2 className="section-title">
        {state.results.length} {f.make} {f.model}
        {state.results.length === 1 ? "" : "s"} near {f.zip}, best value first
      </h2>
      <p className="text-muted">
        &quot;Under fair value&quot; compares each car with the others in these results at its miles and year. Check any car before you
        contact the seller.
      </p>
      {state.notes.map((n) => <p key={n} className="mt-2 text-sm text-muted">Note: {n}</p>)}
      {state.results.length === 0 ? (
        <p className="mt-6 text-lg">Nothing matched. Widen the years, price or miles, or try the sites below.</p>
      ) : (
        <ol className="mt-4 divide-y divide-border border-y border-border">
          {state.results.map((r, i) => <Row key={`${r.vin ?? r.url ?? i}`} r={r} />)}
        </ol>
      )}
      <p className="mt-6 flex flex-wrap gap-x-5 gap-y-1">
        <span className="font-semibold">Also search:</span>
        {outside.map((l) => <ExternalLink key={l.site} href={l.href} className="link">{l.site}</ExternalLink>)}
      </p>
    </>
  );
}

function Row({ r }: { r: SearchResult }) {
  return (
    <li className="nums grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:gap-6">
      <div className="min-w-0">
        <p className="font-serif text-lg font-semibold">{r.title}</p>
        <p className="text-muted">
          {r.miles.toLocaleString("en-US")} mi
          {r.color ? ` · ${r.color}` : ""}
          {` · ${r.sellerType === "dealer" ? r.sellerName ?? "Dealer" : "Private seller"}`}
          {r.city ? ` · ${r.city}${r.state ? `, ${r.state}` : ""}` : ""}
          {r.distance != null ? ` (${Math.round(r.distance)} mi)` : ""}
          {r.daysOnMarket != null ? ` · listed ${r.daysOnMarket} days` : ""}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4">
          <Link href={`/#listing=${encodeURIComponent(resultAsListing(r))}`} className="link font-semibold">Check this car</Link>
          {r.url && <ExternalLink href={r.url} className="link">Open listing</ExternalLink>}
        </p>
      </div>
      <div className="sm:text-right">
        <p className="text-xl font-semibold">{usd(r.price)}</p>
        {r.suspicious && r.pctUnder != null ? (
          <p className="font-semibold text-warn">
            Unusually cheap
            <span className="block text-sm font-normal text-muted">{Math.round(r.pctUnder * 100)}% under: find out why</span>
          </p>
        ) : r.label && r.pctUnder != null && (
          <p className={`font-semibold ${LABEL_TONE[r.label]}`}>
            {DEAL_TEXT[r.label]}
            <span className="block text-sm font-normal text-muted">
              {r.pctUnder >= 0 ? `${Math.round(r.pctUnder * 100)}% under` : `${Math.round(-r.pctUnder * 100)}% over`} fair value
            </span>
          </p>
        )}
      </div>
    </li>
  );
}
