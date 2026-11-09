"use client";

import { useState } from "react";
import type { PriceState } from "@/app/actions/price";
import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import { readBuyerZip } from "@/lib/buyer-zip";
import type { Comp } from "@/lib/value/comps";
import { DEAL_TEXT, fmt, type DealLabel, type Valuation } from "@/lib/value/estimate";
import { LiveFacts } from "./LiveListing";

type Props = {
  /** The analysis with live facts merged in. */
  a: Analysis;
  /** Row in "My cars" to store the result on, if the check was saved. */
  carId: number | null;
  state: PriceState;
  action: (formData: FormData) => void;
  pending: boolean;
  valuation: Valuation | null;
};

const TONE: Record<DealLabel, string> = {
  great: "text-good",
  good: "text-good",
  fair: "text-foreground",
  high: "text-warn",
  over: "text-bad",
};

// Free places to compare by hand. KBB tends to read high (forums and buyer guides agree), so it's listed as a reference only.
const CHECK_YOURSELF = [
  { name: "CarGurus price trends", href: "https://www.cargurus.com/research/price-trends" },
  { name: "Edmunds appraisal", href: "https://www.edmunds.com/appraisal/" },
  { name: "Kelley Blue Book", href: "https://www.kbb.com/whats-my-car-worth/" },
];

/** Features 2 + 2b: "Is the price fair?" plus the live listing, behind one button. */
export function PriceCheck({ a, carId, state, action, pending, valuation: v }: Props) {
  const l = a.listing;
  const d = a.decoded;
  // Client-only component (rendered after a check), so localStorage is safe here.
  const [zip, setZip] = useState(() => readBuyerZip().zip || l.zip || "");
  const year = d?.year ?? l.year;
  const make = d?.make ?? l.make;
  const model = d?.model ?? l.model;
  const canCheck = (l.vin && a.vinCheck?.ok) || (year && make && model);
  if (!canCheck) return null;
  const done = state.status === "done" ? state : null;

  return (
    <section className="border-t border-border pt-8">
      <h2 className="section-title">Is the price fair?</h2>

      {!done && (
        <form action={action} className="space-y-3">
          <p className="max-w-2xl">
            Compares this car with similar ones that sold or are for sale near you, plus a price model trained on real sales
            {l.vin ? ", and finds where this exact car is listed now and every place it was listed before" : ""}.
          </p>
          <input type="hidden" name="vin" value={a.vinCheck?.ok ? l.vin ?? "" : ""} />
          <input type="hidden" name="year" value={year ?? ""} />
          <input type="hidden" name="make" value={make ? make[0] + make.slice(1).toLowerCase() : ""} />
          <input type="hidden" name="model" value={model ?? ""} />
          <input type="hidden" name="trim" value={d?.trim ?? ""} />
          <input type="hidden" name="miles" value={l.miles ?? ""} />
          <input type="hidden" name="carId" value={carId ?? ""} />
          <input type="hidden" name="price" value={l.price ?? ""} />
          <input type="hidden" name="sellerType" value={l.sellerType} />
          <input type="hidden" name="accident" value={l.accident} />
          <input type="hidden" name="titleStatus" value={l.titleStatus} />
          <input type="hidden" name="usage" value={l.usage} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="w-36">
              <span className="text-sm font-semibold">Your ZIP code</span>
              <input
                name="zip"
                className="field mt-1"
                inputMode="numeric"
                autoComplete="postal-code"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="08540"
                required
              />
            </label>
            <button type="submit" disabled={pending || zip.length !== 5} className="btn btn-primary">
              {pending ? "Checking prices…" : l.vin ? "Check price & history" : "Check the price"}
            </button>
          </div>
          <p className="text-sm text-muted">Uses up to 5 free listing-data lookups. Checking the same car again today is free.</p>
          {state.status === "error" && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-bad">{state.message}</p>}
        </form>
      )}

      {done && (
        <div className="space-y-8">
          {v ? <ValueSummary v={v} price={l.price} /> : done.sources && <p>Not enough similar cars nearby to price this one. Try the links below.</p>}
          {done.live ? <LiveFacts l={done.live} /> : l.vin && <p className="text-muted">This exact car isn&apos;t listed on the sites we can check (common for Facebook and Craigslist cars).</p>}
          {v && <Sources v={v} />}
          {done.sources?.marketDays && (
            <p>
              Similar cars near {done.sources.zip} sold in about <strong>{done.sources.marketDays} days</strong>
              {done.live?.daysOnMarket ? <>; this one has been listed for <strong>{done.live.daysOnMarket}</strong>.</> : "."}{" "}
              <span className="text-muted">Cars that sit longer than usual have more room to negotiate.</span>
            </p>
          )}
          {done.sources && <SimilarCars comps={[...(done.sources.sold?.closest ?? []), ...(done.sources.active?.closest ?? [])]} />}
          <div>
            <h3 className="font-semibold">Compare by hand</h3>
            <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              {CHECK_YOURSELF.map((c) => (
                <ExternalLink key={c.name} href={c.href} className="link">{c.name}</ExternalLink>
              ))}
            </p>
          </div>
          {done.notes.length > 0 && (
            <ul className="space-y-1 text-sm text-muted">
              {done.notes.map((n) => <li key={n}>Note: {n}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ValueSummary({ v, price }: { v: Valuation; price: number | null }) {
  // Where the asking price sits on a bar from 20% under the low end to 20% over the high end.
  const min = v.low * 0.8;
  const max = v.high * 1.2;
  const pos = (n: number) => `${Math.min(100, Math.max(0, ((n - min) / (max - min)) * 100))}%`;
  const diff = price !== null ? v.fair - price : null;
  return (
    <div className="space-y-5">
      <div>
        {v.label && <p className={`font-serif text-3xl font-semibold ${TONE[v.label]}`}>{DEAL_TEXT[v.label]}</p>}
        <p className="nums mt-1 text-lg">
          Fair price for this car: <strong>{fmt(v.low)}–{fmt(v.high)}</strong>
          <span className="text-muted">, most likely {fmt(v.fair)}</span>
        </p>
        {diff !== null && Math.abs(diff) >= 100 && (
          <p className="nums text-muted">
            The asking price is {fmt(Math.abs(diff))} {diff > 0 ? "under" : "over"} the most likely price.
          </p>
        )}
        <p className="mt-1 text-sm text-muted">
          Confidence: <strong className="text-foreground">{v.confidence}</strong> ({v.confidenceWhy}).
        </p>
      </div>

      <div aria-hidden className="relative h-10">
        <div className="absolute inset-x-0 top-4 h-2 rounded-full bg-surface-muted" />
        <div className="absolute top-4 h-2 rounded-full bg-good/50" style={{ left: pos(v.low), width: `calc(${pos(v.high)} - ${pos(v.low)})` }} />
        {price !== null && (
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: pos(price) }}>
            <div className="mx-auto h-10 w-0.5 bg-foreground" />
          </div>
        )}
        <span className="nums absolute top-7 -translate-x-1/2 text-xs text-muted" style={{ left: pos(v.low) }}>{fmt(v.low)}</span>
        <span className="nums absolute top-7 -translate-x-1/2 text-xs text-muted" style={{ left: pos(v.high) }}>{fmt(v.high)}</span>
      </div>
      {price !== null && <p className="-mt-2 text-sm text-muted">The black line is the asking price; green is the fair range.</p>}

      {v.offer && (
        <div className="rounded-md border-l-4 border-l-accent bg-accent-soft px-5 py-4">
          <p className="nums text-lg">
            Offer <strong>{fmt(v.offer.open)}</strong> to start. Don&apos;t go above <strong>{fmt(v.offer.max)}</strong>.
          </p>
          {v.offer.reasons.length > 0 && (
            <>
              <p className="mt-2 font-semibold">Reasons to give the seller</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {v.offer.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Sources({ v }: { v: Valuation }) {
  return (
    <div>
      <h3 className="font-semibold">How we worked it out</h3>
      <ul className="nums mt-2 divide-y divide-border border-y border-border">
        {v.sources.map((s) => (
          <li key={s.name} className="flex flex-wrap justify-between gap-x-4 py-2">
            <span>
              {s.name}
              <span className="block text-sm text-muted">{s.note}</span>
            </span>
            <span className="font-semibold">{fmt(s.value)}</span>
          </li>
        ))}
        {v.adjustments.map((x) => (
          <li key={x.label} className="flex justify-between gap-4 py-2">
            <span>{x.label}</span>
            <span className="font-semibold text-bad">{Math.round(x.pct * 100)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Clean-history dealer prices first, then this car&apos;s history and seller. Used cars usually sell 4–11% under their first
        asking price, private sellers ask 10–20% less than dealers, and a reported accident takes about 10–30% off.
      </p>
    </div>
  );
}

function SimilarCars({ comps }: { comps: Comp[] }) {
  const list = comps.slice(0, 8);
  if (!list.length) return null;
  return (
    <div>
      <h3 className="font-semibold">Similar cars nearby</h3>
      <p className="text-sm text-muted">The closest matches by year and miles. Their prices are before any accident or seller adjustment.</p>
      <ul className="nums mt-2 divide-y divide-border border-y border-border">
        {list.map((c, i) => (
          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <span>
              {[c.year, c.trim].filter(Boolean).join(" ")} · {c.miles.toLocaleString("en-US")} mi
              <span className="text-sm text-muted">
                {" "}· {c.sold ? `sold${c.seen ? ` around ${c.seen}` : ""}` : "for sale now"}
                {c.city ? ` · ${c.city}${c.state ? `, ${c.state}` : ""}` : ""}
              </span>
            </span>
            <span>
              {c.url ? <ExternalLink href={c.url} className="link font-semibold">{fmt(c.price)}</ExternalLink> : <strong>{fmt(c.price)}</strong>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
