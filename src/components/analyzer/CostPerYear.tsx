"use client";

import { useMemo, useState } from "react";
import type { Analysis } from "@/lib/analyze";
import { readBuyerZip } from "@/lib/buyer-zip";
import { guessWeightClass } from "@/lib/costs/nj";
import { outTheDoor } from "@/lib/costs/outTheDoor";
import { ownershipCost, TYPICAL_DECLINE } from "@/lib/costs/ownership";
import { defaultMaintenance, DEFAULT_MILES_PER_YEAR, yearlyRunningCost } from "@/lib/costs/running";
import { STATES } from "@/lib/geo/zip";
import type { CompEstimate } from "@/lib/value/comps";
import { fmt, type Valuation } from "@/lib/value/estimate";

type Props = { a: Analysis; valuation: Valuation | null; comps: CompEstimate | null };

/** Feature 5: one number to compare cars by: what owning this one costs per year. */
export function CostPerYear({ a, valuation, comps }: Props) {
  const [years, setYears] = useState(3);
  const [milesPerYear, setMilesPerYear] = useState(DEFAULT_MILES_PER_YEAR);
  // Client-only (rendered after a check), so localStorage is safe.
  const [where] = useState(readBuyerZip);
  const price = a.listing.price;

  const result = useMemo(() => {
    if (!price) return null;
    const otd = outTheDoor({
      state: where.state,
      price,
      docFee: a.listing.docFee,
      seller: a.listing.sellerType === "private" ? "private" : "dealer",
      modelYear: a.decoded?.year ?? a.listing.year,
      inspection: 0,
      nj: { weightClass: guessWeightClass(a.decoded?.curbWeightLb ?? null, a.decoded?.body ?? null).value, financed: false },
    });
    const v = a.fuel?.vehicles[0];
    const fuelPrice = v && a.fuel?.prices ? a.fuel.prices[v.fuel] : 0;
    const running = v && fuelPrice > 0
      ? yearlyRunningCost({ vehicle: v, milesPerYear, fuelPrice, maintenancePerYear: defaultMaintenance(milesPerYear) }).total
      : null;
    return ownershipCost({
      price,
      taxAndFees: otd.total - price,
      years,
      milesPerYear,
      running,
      marketValue: valuation?.fair ?? price,
      perModelYear: comps?.perYear ?? null,
      perMile: comps?.perMile ?? null,
    });
  }, [price, where.state, a, years, milesPerYear, valuation, comps]);

  if (!result) return null;
  return (
    <section className="border-t border-border pt-8">
      <h2 className="section-title">What it really costs per year</h2>
      <p className="nums text-lg">
        Owning it for {years} years costs about <strong>{fmt(result.perYear)} a year</strong>
        <span className="text-muted"> ({fmt(result.perMonth)} a month)</span>.
      </p>
      <p className="text-muted">Use this number to compare a cheap high-mileage car with a pricier newer one.</p>

      <dl className="nums mt-4 max-w-md divide-y divide-border border-y border-border">
        <Row label="Value it loses" value={result.lostPerYear} note={`Worth about ${fmt(result.resale)} when you sell`} />
        <Row label={`Tax and fees (${STATES[where.state]}), spread out`} value={result.taxAndFeesPerYear} />
        {result.running !== null && <Row label="Fuel and maintenance" value={result.running} />}
      </dl>

      <div className="mt-4 flex flex-wrap gap-4">
        <label>
          <span className="text-sm font-semibold">Years you&apos;ll keep it</span>
          <select className="field mt-1 w-32" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[2, 3, 4, 5, 7].map((y) => <option key={y} value={y}>{y} years</option>)}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Miles a year</span>
          <select className="field mt-1 w-36" value={milesPerYear} onChange={(e) => setMilesPerYear(Number(e.target.value))}>
            {[6_000, 9_000, 12_000, 15_000, 20_000].map((m) => <option key={m} value={m}>{m.toLocaleString("en-US")}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm text-muted">
        {result.method === "local-sales"
          ? "Value lost is worked out from nearby sales: how much one model year older and the extra miles cost."
          : `Value lost assumes a typical ${Math.round(TYPICAL_DECLINE * 100)}% a year. Run the price check above for a local estimate.`}{" "}
        Insurance isn&apos;t included: it depends on you, not the car.
      </p>
    </section>
  );
}

function Row({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt>
        {label}
        {note && <span className="block text-sm text-muted">{note}</span>}
      </dt>
      <dd className="font-semibold">{fmt(value)}/yr</dd>
    </div>
  );
}
