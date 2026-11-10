"use client";

import { useEffect, useRef, useState } from "react";
import type { PriceState } from "@/app/actions/price";
import { ExternalLink } from "@/components/ExternalLink";
import { Turnstile } from "@/components/Turnstile";
import type { Analysis } from "@/lib/analyze";
import { readBuyerZip } from "@/lib/buyer-zip";
import type { HistoryRecord } from "@/lib/history/parse";
import type { LiveListing } from "@/lib/live/parse";
import type { Comp, CompEstimate } from "@/lib/value/comps";
import { DEAL_TEXT, fmt, type DealLabel, type Valuation } from "@/lib/value/estimate";
import { LiveFacts } from "./LiveListing";
import { SellValue } from "./SellValue";

/** Details the person can correct after the lookup (VIN only). null = use what was found. */
export type Details = { miles: string | null; trim: string | null };

type Props = {
  /** The analysis with live facts merged in. */
  a: Analysis;
  /** Row in "My cars" to store the result on, if the check was saved. */
  carId: number | null;
  state: PriceState;
  action: (formData: FormData) => void;
  pending: boolean;
  valuation: Valuation | null;
  /** Demo visitor: show the limits and the "I'm human" check. */
  guest?: boolean;
  /** Demo example: the date its data was recorded. */
  recordedAt?: string | null;
  /** Buying it (is the price fair?) or selling your own (what's it worth?). */
  purpose: "buy" | "sell";
  /** Only a VIN was entered: show the details to confirm. */
  vinOnly: boolean;
  details: Details;
  onDetails: (d: Details) => void;
  /** Miles and trim as found (listing, live listing or history), shown until edited. */
  known: { miles: number | null; trim: string | null; milesFrom: string | null };
  /** Selling: the private-sale and dealer valuations, and the for-sale comps. */
  sell: { privateV: Valuation | null; dealerV: Valuation | null; active: CompEstimate | null } | null;
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

/**
 * Features 2 + 2b: the live listing, listing history and price. With a valid
 * VIN it runs by itself (visitors once the "I'm human" check passes), so the
 * car is always looked up online before the result claims anything.
 */
export function PriceCheck(props: Props) {
  const { a, carId, state, action, pending, valuation: v, guest = false, recordedAt = null, purpose, vinOnly, details, onDetails, known, sell } = props;
  const l = a.listing;
  const d = a.decoded;
  // Client-only component (rendered after a check), so localStorage is safe here.
  const [zip, setZip] = useState(() => readBuyerZip().zip || l.zip || "");
  const [humanToken, setHumanToken] = useState<string | null>(null);
  // A Turnstile token works once: a new widget for each try.
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const fired = useRef(false);
  const year = d?.year ?? l.year;
  const make = d?.make ?? l.make;
  const model = d?.model ?? l.model;
  const vinOk = !!(l.vin && a.vinCheck?.ok);
  const done = state.status === "done" ? state : null;
  const selling = purpose === "sell";

  // Look the VIN up straight away: no button to press, and nothing is claimed before it's checked.
  const autoRun = vinOk && !recordedAt;
  useEffect(() => {
    if (!autoRun || fired.current || state.status !== "idle" || pending) return;
    if (guest && !humanToken) return;
    fired.current = true;
    formRef.current?.requestSubmit();
  }, [autoRun, state.status, pending, guest, humanToken]);

  if (!(vinOk || (year && make && model))) return null;
  // Looked up, but not priced yet (no ZIP anywhere): ask for one.
  const needsZip = !!done && !done.sources && !!done.car && !recordedAt;
  const zipOk = zip.length === 5 || (vinOk && zip.length === 0 && !done);
  const shown = selling ? sell?.privateV ?? null : v;

  const form = (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => {
        setAttempt((n) => n + 1);
        setHumanToken(null);
      }}
      className="space-y-3"
    >
      {!done && (
        <p className="max-w-2xl">
          {vinOk
            ? "Looking this VIN up online: where it's listed now, every place it was listed before, and what similar cars near you sold for."
            : "Compares this car with similar ones that sold or are for sale near you."}
        </p>
      )}
      <input type="hidden" name="vin" value={vinOk ? l.vin ?? "" : ""} />
      <input type="hidden" name="year" value={year ?? ""} />
      <input type="hidden" name="make" value={make ? make[0] + make.slice(1).toLowerCase() : ""} />
      <input type="hidden" name="model" value={model ?? ""} />
      <input type="hidden" name="trim" value={details.trim ?? d?.trim ?? ""} />
      <input type="hidden" name="miles" value={details.miles ?? l.miles ?? ""} />
      <input type="hidden" name="carId" value={carId ?? ""} />
      <input type="hidden" name="price" value={l.price ?? ""} />
      <input type="hidden" name="sellerType" value={l.sellerType} />
      <input type="hidden" name="accident" value={l.accident} />
      <input type="hidden" name="titleStatus" value={l.titleStatus} />
      <input type="hidden" name="usage" value={l.usage} />
      <input type="hidden" name="listingZip" value={l.zip ?? ""} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-40">
          <span className="text-sm font-semibold">Your ZIP code</span>
          <input
            name="zip"
            className="field mt-1"
            inputMode="numeric"
            autoComplete="postal-code"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="08540"
          />
        </label>
        <button type="submit" disabled={pending || !zipOk || (guest && !humanToken)} className="btn btn-primary">
          {pending ? (vinOk && !done ? "Looking it up…" : "Checking prices…") : needsZip ? "Price it" : vinOk ? "Look it up" : "Check the price"}
        </button>
      </div>
      {vinOk && !done && <p className="text-sm text-muted">The ZIP sets where prices are compared. Without one, it&apos;s priced where the car is listed.</p>}
      {guest ? (
        <>
          <p className="text-sm text-muted">
            Demo: two live lookups per visitor per day, and a few for everyone each day, because the listing data comes from free plans with small
            monthly limits. It starts by itself once the &quot;I&apos;m human&quot; check passes. The example cars above include full lookups.
          </p>
          <Turnstile key={attempt} action="price" onToken={setHumanToken} />
        </>
      ) : (
        <p className="text-sm text-muted">Uses up to 5 free listing-data lookups. The same car again today is free.</p>
      )}
      {state.status === "error" && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-bad">{state.message}</p>}
    </form>
  );

  return (
    <section className="border-t border-border pt-8" id="price-check">
      <h2 className="section-title">{selling ? "What your car is worth" : "Is the price fair?"}</h2>

      {!done && form}

      {done && (
        <div className="space-y-8">
          {recordedAt && (
            <p className="text-sm text-muted">
              Example data recorded on {recordedAt}
              {done.sources ? ` for ZIP ${done.sources.zip}` : ""}, from the same sources a live check uses.
            </p>
          )}

          {vinOk && <FoundOnline vin={l.vin!} live={done.live} history={done.history} guest={guest} />}

          {vinOnly && done.car && <ConfirmDetails car={done.car} details={details} onDetails={onDetails} known={known} canReprice={!!done.sources?.comps} />}

          {needsZip && form}

          {selling ? (
            sell?.privateV ? (
              <SellValue privateV={sell.privateV} dealerV={sell.dealerV} live={done.live} active={sell.active} zip={done.sources!.zip} />
            ) : (
              done.sources && <p>Not enough similar cars nearby to price it. Try the links below.</p>
            )
          ) : v ? (
            <ValueSummary v={v} price={l.price} />
          ) : (
            done.sources && <p>Not enough similar cars nearby to price this one. Try the links below.</p>
          )}
          {!selling && done.live && <LiveFacts l={done.live} />}
          {shown && !shown.unpriced && <Sources v={shown} />}
          {done.sources?.marketDays && (
            <p>
              Similar cars near {done.sources.zip} sold in about <strong>{done.sources.marketDays} days</strong>
              {done.live?.daysOnMarket ? <>; this one has been listed for <strong>{done.live.daysOnMarket}</strong>.</> : "."}{" "}
              <span className="text-muted">
                {selling ? "Priced inside the range, yours should sell in about that time." : "Cars that sit longer than usual have more room to negotiate."}
              </span>
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
  if (v.unpriced) {
    return (
      <div className="space-y-2">
        <p className="rounded-md bg-warn-soft px-4 py-3">{v.unpriced}</p>
        <p className="nums text-muted">For reference, the same car with a clean history: {fmt(v.low)}–{fmt(v.high)}.</p>
      </div>
    );
  }
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
        {v.assumesClean && (
          <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-sm">
            Priced as a car with no accidents and a clean title, which isn&apos;t confirmed yet. Record what the history report says (above) and
            this updates.
          </p>
        )}
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
        asking price, private sellers ask 10–20% less than dealers, and a past accident takes about 3–12% off (
        <ExternalLink href="https://www.cargurus.com/press/20121213.html">CarGurus study, 2012</ExternalLink>), so damage is shown as that whole
        range.
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

/** After a VIN lookup: say plainly what was found online, and what wasn't. */
function FoundOnline({ vin, live, history, guest }: { vin: string; live: LiveListing | null; history: HistoryRecord[] | null; guest: boolean }) {
  if (live && !live.removedAt) return null; // the listing is shown in detail below
  const past = history?.length ?? 0;
  const searched = `listing data covering most US dealer websites (${guest ? "Auto.dev" : "Auto.dev and MarketCheck"}) and this VIN's listing history since 2015 (MarketCheck)`;
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="font-semibold">{past > 0 || live ? "Not for sale online right now" : `No online listing found for VIN ${vin}`}</p>
      <p className="mt-1 text-sm">
        We searched {searched}.{" "}
        {past > 0
          ? `It was listed ${past} time${past === 1 ? "" : "s"} before: see "Where this car has been listed" below.`
          : live
            ? "Its last listing has ended."
            : "It hasn't been listed on any of them."}
      </p>
      <p className="mt-1 text-sm text-muted">
        Facebook Marketplace and most Craigslist ads aren&apos;t in this data. If it&apos;s listed there, paste the listing text or screenshots at the
        top for the full check. Otherwise confirm the details below to price it.
      </p>
    </div>
  );
}

/** VIN only: what the VIN says, plus the miles and trim to price it at. Edits re-price instantly. */
function ConfirmDetails({ car, details, onDetails, known, canReprice }: {
  car: { year: number; make: string; model: string };
  details: Details;
  onDetails: (d: Details) => void;
  known: Props["known"];
  canReprice: boolean;
}) {
  const miles = details.miles ?? known.miles?.toString() ?? "";
  const trim = details.trim ?? known.trim ?? "";
  return (
    <div>
      <h3 className="font-semibold">Confirm the details</h3>
      <p className="mt-1 text-sm text-muted">
        Year, make and model come from the VIN (NHTSA decode). Check the miles and trim: they move the price most.
        {canReprice ? " Changes re-price instantly from the same similar cars, with no new lookup." : ""}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <p className="min-w-40">
          <span className="block text-sm font-semibold">Car (from the VIN)</span>
          <span className="mt-1 block py-2">
            {car.year} {car.make[0].toUpperCase() + car.make.slice(1).toLowerCase()} {car.model}
          </span>
        </p>
        <label className="w-40">
          <span className="text-sm font-semibold">Trim</span>
          <input
            className="field mt-1"
            value={trim}
            maxLength={40}
            onChange={(e) => onDetails({ ...details, trim: e.target.value.replace(/[^\w .\/-]/g, "") })}
            placeholder="e.g. LE, EX-L"
          />
        </label>
        <label className="w-36">
          <span className="text-sm font-semibold">Miles</span>
          <input
            className="field mt-1"
            inputMode="numeric"
            value={miles}
            onChange={(e) => onDetails({ ...details, miles: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="e.g. 95000"
          />
        </label>
      </div>
      {details.miles === null && known.milesFrom && <p className="mt-1 text-sm text-muted">Miles {known.milesFrom}. Change them if the odometer says otherwise.</p>}
      <p className="mt-2 text-sm text-muted">Accidents and title: set them under the history report above.</p>
    </div>
  );
}
