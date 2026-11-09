"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import { AAA_MAINTENANCE, DEFAULT_MILES_PER_YEAR, defaultMaintenance, FUEL_SOURCE, FUEL_UNIT, yearlyRunningCost } from "@/lib/costs/running";

const usd = (n: number, cents = false) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0 });
const input =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
const money = (v: string) => v.replace(/[^\d.]/g, "");
const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Feature C: fuel (EPA rating) + maintenance per year, with editable assumptions. */
export function RunningCost({ a }: { a: Analysis }) {
  const match = a.fuel;
  const [pick, setPick] = useState(0);
  const v = match?.vehicles[Math.min(pick, (match?.vehicles.length ?? 1) - 1)];
  const defaultPrice = v && match?.prices ? match.prices[v.fuel] : null;

  const [miles, setMiles] = useState(String(DEFAULT_MILES_PER_YEAR));
  const [price, setPrice] = useState<string | null>(null); // null = use the national average
  const [maint, setMaint] = useState<string | null>(null); // null = AAA default for the miles

  const milesNum = Math.min(100_000, num(miles));
  const priceNum = price != null ? num(price) : (defaultPrice ?? 0);
  const maintNum = maint != null ? num(maint) : defaultMaintenance(milesNum);
  const cost = useMemo(
    () => (v && priceNum > 0 ? yearlyRunningCost({ vehicle: v, milesPerYear: milesNum, fuelPrice: priceNum, maintenancePerYear: maintNum }) : null),
    [v, milesNum, priceNum, maintNum],
  );

  if (!a.vehicle) return null;
  if (!match || !v) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="font-semibold">Yearly running cost</h2>
        <p className="mt-2 text-sm text-muted">
          No EPA fuel-economy match for this {a.vehicle.year} {a.vehicle.make} {a.vehicle.model}. Look it up on{" "}
          <ExternalLink href={FUEL_SOURCE}>FuelEconomy.gov</ExternalLink>.
        </p>
      </section>
    );
  }

  const ev = v.fuel === "electric";
  const unit = FUEL_UNIT[v.fuel];

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Yearly running cost</h2>
        {cost && (
          <p className="text-xl font-semibold">
            {usd(cost.total)}
            <span className="text-sm font-normal text-muted">/year · {usd(cost.perMonth)}/month</span>
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">Fuel and upkeep only. Insurance depends on you, not the car, so it isn&apos;t included.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {match.vehicles.length > 1 && (
            <label className="col-span-2">
              <span className="text-xs text-muted">Version ({match.vehicles.length} possible matches)</span>
              <select className={input} value={pick} onChange={(e) => setPick(Number(e.target.value))}>
                {match.vehicles.map((x, i) => (
                  <option key={x.id} value={i}>
                    {x.label} ({x.comb} {x.fuel === "electric" ? "MPGe" : "MPG"})
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="col-span-2 rounded-lg bg-surface-muted px-3 py-2">
            <span className="font-medium">
              {v.comb} {ev ? "MPGe" : "MPG"} combined
            </span>
            <span className="text-muted">
              {" "}
              ({v.city} city / {v.hwy} highway{ev && v.kwhPer100 ? ` · ${v.kwhPer100.toFixed(1)} kWh per 100 mi` : ""})
              {v.atvType && !ev ? ` · ${v.atvType}` : ""}
            </span>
          </p>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Miles per year</span>
            <input className={input} inputMode="numeric" value={miles} onChange={(e) => setMiles(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Price per {unit} ($)</span>
            <input
              className={input}
              inputMode="decimal"
              placeholder={defaultPrice?.toFixed(2) ?? "Enter price"}
              value={price ?? defaultPrice?.toFixed(2) ?? ""}
              onChange={(e) => setPrice(money(e.target.value))}
            />
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
              {defaultPrice != null ? "US average this week. Change it to your local price." : "Enter your local price."}
            </span>
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">Maintenance, repairs, tires ($/year)</span>
            <input
              className={input}
              inputMode="decimal"
              value={maint ?? String(defaultMaintenance(milesNum))}
              onChange={(e) => setMaint(money(e.target.value))}
            />
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
              AAA average ({AAA_MAINTENANCE.centsPerMile}¢/mile) for newer cars; older cars often cost more.
            </span>
          </label>
        </div>

        {cost ? (
          <table className="w-full self-start text-sm">
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-1.5 pr-3">
                  {ev ? "Electricity" : "Fuel"}
                  <span className="block text-xs text-muted">
                    {milesNum.toLocaleString("en-US")} mi at {usd(priceNum, true)} per {unit}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">{usd(cost.fuel)}</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3">Maintenance, repairs and tires</td>
                <td className="py-1.5 text-right tabular-nums">{usd(cost.maintenance)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2">Per year</td>
                <td className="py-2 text-right tabular-nums">{usd(cost.total)}</td>
              </tr>
              <tr className="text-muted">
                <td className="py-1.5">Per mile</td>
                <td className="py-1.5 text-right tabular-nums">{cost.centsPerMile.toFixed(1)}¢</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">Enter a fuel price to see the total.</p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        <ExternalLink href={`https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${v.id}`}>EPA rating on FuelEconomy.gov</ExternalLink>
        {" "}(fuel prices from FuelEconomy.gov) ·{" "}
        <ExternalLink href={AAA_MAINTENANCE.source}>AAA Your Driving Costs {AAA_MAINTENANCE.year}</ExternalLink>
      </p>
    </section>
  );
}
