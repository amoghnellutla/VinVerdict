"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import { guessWeightClass, NJ_RATES, njOutTheDoor, type WeightClass } from "@/lib/costs/nj";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const input =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/** Feature A: what you'll actually pay in NJ, with editable assumptions. */
export function OutTheDoor({ a }: { a: Analysis }) {
  const guess = guessWeightClass(a.decoded?.curbWeightLb ?? null, a.decoded?.body ?? null);
  const [price, setPrice] = useState(a.listing.price?.toString() ?? "");
  const [docFee, setDocFee] = useState(a.listing.docFee?.toString() ?? "");
  const [financed, setFinanced] = useState(false);
  const [inspection, setInspection] = useState("175");
  const [weight, setWeight] = useState<WeightClass>(guess.value);

  const priceNum = Number(price);
  const valid = Number.isFinite(priceNum) && priceNum > 0 && priceNum < 1_000_000;
  const result = useMemo(
    () =>
      valid
        ? njOutTheDoor({
            price: priceNum,
            modelYear: a.decoded?.year ?? a.listing.year,
            weightClass: weight,
            financed,
            docFee: Number(docFee) || 0,
            inspection: Math.max(0, Number(inspection) || 0),
            seller: a.listing.sellerType,
          })
        : null,
    [valid, priceNum, a, weight, financed, docFee, inspection],
  );

  const weightNote = a.decoded?.curbWeightLb
    ? `From NHTSA curb weight (${a.decoded.curbWeightLb.toLocaleString("en-US")} lb).`
    : "Estimated from body type: check the title or door sticker.";

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Out-the-door cost (NJ)</h2>
        {result && <p className="text-xl font-semibold">{usd(result.total)}</p>}
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Price ($)</span>
            <input className={input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Dealer doc fee ($)</span>
            <input className={input} inputMode="numeric" placeholder="0" value={docFee} onChange={(e) => setDocFee(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Inspection ($)</span>
            <input className={input} inputMode="numeric" value={inspection} onChange={(e) => setInspection(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Weight class</span>
            <select className={input} value={weight} onChange={(e) => setWeight(e.target.value as WeightClass)}>
              <option value="light">Under 3,500 lb</option>
              <option value="heavy">Over 3,500 lb</option>
            </select>
          </label>
          <label className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={financed} onChange={(e) => setFinanced(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            <span>Paying with a car loan (adds a lien to the title)</span>
          </label>
          <p className="col-span-2 text-xs text-muted">{weightNote}</p>
        </div>

        {result ? (
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
        ) : (
          <p className="text-sm text-muted">Enter the price to see the total.</p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        NJ rates as of {NJ_RATES.asOf}: <ExternalLink href={NJ_RATES.sources.salesTax}>sales tax</ExternalLink>,{" "}
        <ExternalLink href={NJ_RATES.sources.fees}>MVC title and registration fees</ExternalLink>,{" "}
        <ExternalLink href={NJ_RATES.sources.privateSale}>private-sale paperwork</ExternalLink>. Insurance is not included.
      </p>
    </section>
  );
}
