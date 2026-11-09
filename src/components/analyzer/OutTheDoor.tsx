"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import { guessWeightClass, NJ_RATES, type WeightClass } from "@/lib/costs/nj";
import { outTheDoor } from "@/lib/costs/outTheDoor";
import { FL_CHART, STATE_TAX, STATE_TAX_AS_OF, type Seller } from "@/lib/costs/stateTax";
import { isStateCode, STATES, zipToState, type StateCode } from "@/lib/geo/zip";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const input =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
const money = (v: string) => v.replace(/[^\d.]/g, "");
const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Per-viewer convenience: remember the buyer's ZIP on this device only.
const SAVED_KEY = "vinverdict.buyerZip";
function savedZip(): { zip: string; state: StateCode } {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null") as { zip?: unknown; state?: unknown } | null;
    if (raw && typeof raw.zip === "string" && typeof raw.state === "string" && isStateCode(raw.state)) {
      return { zip: raw.zip.replace(/\D/g, "").slice(0, 5), state: raw.state };
    }
  } catch {}
  return { zip: "", state: "NJ" };
}
function saveZip(zip: string, state: StateCode) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ zip, state }));
  } catch {}
}

/** Feature A: what you'll actually pay where you register the car, with editable assumptions. */
export function OutTheDoor({ a }: { a: Analysis }) {
  const guess = guessWeightClass(a.decoded?.curbWeightLb ?? null, a.decoded?.body ?? null);
  // Only rendered after a check runs (client-side), so reading localStorage here is safe.
  const [where, setWhere] = useState(savedZip);
  const [seller, setSeller] = useState<Seller>(a.listing.sellerType === "private" ? "private" : "dealer");
  const [price, setPrice] = useState(a.listing.price?.toString() ?? "");
  const [docFee, setDocFee] = useState(a.listing.docFee?.toString() ?? "");
  const [localPct, setLocalPct] = useState("");
  const [otherFees, setOtherFees] = useState("");
  const [financed, setFinanced] = useState(false);
  const [inspection, setInspection] = useState("175");
  const [weight, setWeight] = useState<WeightClass>(guess.value);

  const state = where.state;
  const rule = STATE_TAX[state];
  const zipState = where.zip.length === 5 ? zipToState(where.zip) : null;

  function changeZip(v: string) {
    const zip = v.replace(/\D/g, "").slice(0, 5);
    const st = zip.length === 5 ? zipToState(zip) : null;
    const next = { zip, state: st ?? state };
    if (next.state !== state) {
      setLocalPct("");
      setOtherFees("");
    }
    setWhere(next);
    if (st) saveZip(zip, st);
  }
  function changeState(st: StateCode) {
    setLocalPct("");
    setOtherFees("");
    setWhere({ zip: where.zip, state: st });
    saveZip(where.zip, st);
  }

  const priceNum = Number(price);
  const valid = Number.isFinite(priceNum) && priceNum > 0 && priceNum < 1_000_000;
  const result = useMemo(
    () =>
      valid
        ? outTheDoor({
            state,
            price: priceNum,
            docFee: seller === "dealer" ? num(docFee) : 0,
            seller,
            modelYear: a.decoded?.year ?? a.listing.year,
            localPct: Math.min(15, num(localPct)),
            inspection: Math.max(0, num(inspection)),
            nj: { weightClass: weight, financed },
            otherFees: num(otherFees),
          })
        : null,
    [valid, priceNum, state, seller, docFee, a, localPct, inspection, weight, financed, otherFees],
  );

  const weightNote = a.decoded?.curbWeightLb
    ? `From NHTSA curb weight (${a.decoded.curbWeightLb.toLocaleString("en-US")} lb).`
    : "Estimated from body type: check the title or door sticker.";

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Out-the-door cost ({STATES[state]})</h2>
        {result && <p className="text-xl font-semibold">{usd(result.total)}</p>}
      </div>
      <p className="mt-1 text-xs text-muted">Car tax depends on where you&apos;ll register the car, not where it&apos;s listed.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Your ZIP code</span>
            <input
              className={input}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="e.g. 07030"
              value={where.zip}
              onChange={(e) => changeZip(e.target.value)}
              aria-describedby="zip-status"
            />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">State you&apos;ll register in</span>
            <select className={input} value={state} onChange={(e) => isStateCode(e.target.value) && changeState(e.target.value)}>
              {(Object.keys(STATES) as StateCode[]).map((s) => (
                <option key={s} value={s}>
                  {STATES[s]}
                </option>
              ))}
            </select>
          </label>
          <p id="zip-status" className="col-span-2 -mt-1 text-xs text-muted" aria-live="polite">
            {where.zip.length === 5
              ? zipState
                ? zipState === state
                  ? `ZIP ${where.zip} is in ${STATES[zipState]}. ${rule.summary}.`
                  : `ZIP ${where.zip} looks like ${STATES[zipState]}; you picked ${STATES[state]}. ${rule.summary}.`
                : `${where.zip} isn't a US state ZIP. Pick your state instead. ${rule.summary}.`
              : `${rule.summary}.`}
          </p>

          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Buying from</span>
            <select className={input} value={seller} onChange={(e) => setSeller(e.target.value === "private" ? "private" : "dealer")}>
              <option value="dealer">A dealer</option>
              <option value="private">A private seller</option>
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Price ($)</span>
            <input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(money(e.target.value))} />
          </label>
          {seller === "dealer" && (
            <label className="col-span-2 sm:col-span-1">
              <span className="text-xs text-muted">Dealer doc fee ($)</span>
              <input className={input} inputMode="decimal" placeholder="0" value={docFee} onChange={(e) => setDocFee(money(e.target.value))} />
            </label>
          )}
          {rule.local && (
            <label className="col-span-2 sm:col-span-1">
              <span className="text-xs text-muted">{rule.local.label}</span>
              <input className={input} inputMode="decimal" placeholder="0" value={localPct} onChange={(e) => setLocalPct(money(e.target.value))} title={rule.local.hint} />
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{rule.local.hint}</span>
            </label>
          )}
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Inspection ($)</span>
            <input className={input} inputMode="decimal" value={inspection} onChange={(e) => setInspection(money(e.target.value))} />
          </label>

          {state === "NJ" ? (
            <>
              <label className="col-span-2 sm:col-span-1">
                <span className="text-xs text-muted">Weight class</span>
                <select className={input} value={weight} onChange={(e) => setWeight(e.target.value === "heavy" ? "heavy" : "light")}>
                  <option value="light">Under 3,500 lb</option>
                  <option value="heavy">Over 3,500 lb</option>
                </select>
              </label>
              <label className="col-span-2 flex items-center gap-2">
                <input type="checkbox" checked={financed} onChange={(e) => setFinanced(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                <span>Paying with a car loan (adds a lien to the title)</span>
              </label>
              <p className="col-span-2 text-xs text-muted">{weightNote}</p>
            </>
          ) : (
            <label className="col-span-2 sm:col-span-1">
              <span className="text-xs text-muted">Title and registration ($)</span>
              <input className={input} inputMode="decimal" placeholder="0" value={otherFees} onChange={(e) => setOtherFees(money(e.target.value))} />
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                Varies in {STATES[state]}: see the <ExternalLink href={rule.dmv}>official DMV site</ExternalLink>.
              </span>
            </label>
          )}
        </div>

        {result ? (
          <div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {result.lines.map((l) => (
                  <tr key={l.label}>
                    <td className="py-1.5 pr-3">
                      {l.label}
                      {l.note && <span className="block text-xs text-muted">{l.note}</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{usd(l.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right tabular-nums">{usd(result.total)}</td>
                </tr>
              </tbody>
            </table>
            {(result.notes.length > 0 || (rule.local && !(num(localPct) > 0)) || (state !== "NJ" && !(num(otherFees) > 0))) && (
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {rule.local && !(num(localPct) > 0) && state !== "DC" && <li>Local tax not included: enter your rate if your city or county has one.</li>}
                {state !== "NJ" && !(num(otherFees) > 0) && <li>Title and registration not included: enter them from your DMV&apos;s fee page.</li>}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Enter the price to see the total.</p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        {state === "NJ" ? (
          <>
            NJ rates as of {NJ_RATES.asOf}: <ExternalLink href={NJ_RATES.sources.salesTax}>sales tax</ExternalLink>,{" "}
            <ExternalLink href={NJ_RATES.sources.fees}>MVC title and registration fees</ExternalLink>,{" "}
            <ExternalLink href={NJ_RATES.sources.privateSale}>private-sale paperwork</ExternalLink>.
          </>
        ) : (
          <>
            {STATES[state]} rules as of {STATE_TAX_AS_OF}: <ExternalLink href={rule.source}>tax</ExternalLink>,{" "}
            <ExternalLink href={rule.dmv}>title and registration</ExternalLink>. State rates from the{" "}
            <ExternalLink href={FL_CHART}>Florida DOR 50-state chart</ExternalLink>.
          </>
        )}{" "}
        Insurance is not included.
      </p>
    </section>
  );
}
