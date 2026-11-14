import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SetupNote } from "@/components/cars/SetupNote";
import { getCars, priceChange, type SavedCar } from "@/lib/cars/store";
import { mi, usd, usdWithFee, VERDICT_TAG, VERDICT_TEXT } from "@/lib/format";
import { DEAL_TEXT } from "@/lib/value/estimate";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <>
      <PageHeader title="Compare" description="Two or three saved cars side by side." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        {searchParams.then((sp) => (
          <CompareTable ids={[sp.ids].flat().filter((x): x is string => typeof x === "string")} />
        ))}
      </Suspense>
    </>
  );
}

async function CompareTable({ ids: raw }: { ids: string[] }) {
  const ids = [...new Set(raw.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 4);
  if (ids.length < 2) {
    return (
      <p className="text-lg">
        Pick at least two cars on <Link href="/checked" className="link">My cars</Link>, then press Compare.
      </p>
    );
  }
  const r = await getCars(ids);
  if (!r.ok) return r.error === "not-set-up" ? <SetupNote /> : <p className="text-bad">Couldn&apos;t load those cars. Reload to try again.</p>;
  const cars = r.value;
  if (cars.length < 2) return <p>Those cars weren&apos;t found. Go back to <Link href="/checked" className="link">My cars</Link>.</p>;

  // Highlight the best value in rows where lower (or higher) is clearly better.
  const best = (vals: (number | null | undefined)[], lower = true) => {
    const nums = vals.filter((v): v is number => typeof v === "number");
    if (nums.length < 2) return null;
    return lower ? Math.min(...nums) : Math.max(...nums);
  };
  const under = (c: SavedCar) => (c.facts.fair && c.price ? c.facts.fair - c.price : null);
  const rows: { label: string; cell: (c: SavedCar) => ReactNode; bestOf?: number | null; num?: (c: SavedCar) => number | null | undefined }[] = [
    { label: "Verdict", cell: (c) => <span className={`tag ${VERDICT_TAG[c.verdict]}`}>{VERDICT_TEXT[c.verdict]}</span> },
    { label: "Price", cell: (c) => usdWithFee(c.price, c.facts.docFee), num: (c) => c.price, bestOf: best(cars.map((c) => c.price)) },
    { label: "Price check", cell: (c) => (c.dealLabel ? DEAL_TEXT[c.dealLabel] : "Not checked") },
    { label: "Fair range", cell: (c) => (c.fairLow && c.fairHigh ? `${usd(c.fairLow)}–${usd(c.fairHigh)}` : "—") },
    { label: "Under fair price by", cell: (c) => { const u = under(c); return u === null ? "—" : u >= 0 ? usd(u) : `over by ${usd(-u)}`; }, num: under, bestOf: best(cars.map(under), false) },
    { label: "Miles", cell: (c) => mi(c.miles), num: (c) => c.miles, bestOf: best(cars.map((c) => c.miles)) },
    { label: "Year", cell: (c) => c.facts.year ?? "—", num: (c) => c.facts.year, bestOf: best(cars.map((c) => c.facts.year), false) },
    { label: "Accidents", cell: (c) => ({ none: "None reported", reported: "Reported", unknown: "Unknown" })[c.facts.accident as "none"] ?? "Unknown" },
    { label: "Title", cell: (c) => (c.facts.title && c.facts.title !== "unknown" ? c.facts.title : "Unknown") },
    { label: "Owners", cell: (c) => c.facts.owners ?? "—" },
    { label: "Seller", cell: (c) => (c.facts.seller && c.facts.seller !== "unknown" ? c.facts.seller : "—") },
    { label: "Price change", cell: (c) => { const ch = priceChange(c); return ch ? `${ch.diff < 0 ? "Dropped" : "Up"} ${usd(Math.abs(ch.diff))}` : "None seen"; } },
    { label: "On sale for", cell: (c) => (c.facts.history?.daysListed != null ? `${c.facts.history.daysListed} days` : "—"), num: (c) => c.facts.history?.daysListed, bestOf: best(cars.map((c) => c.facts.history?.daysListed), false) },
    { label: "Listing history", cell: (c) => historyCell(c) },
    { label: "Top concerns", cell: (c) => (c.facts.findings?.length ? <ul className="space-y-1">{c.facts.findings.slice(0, 3).map((f) => <li key={f}>{f}</li>)}</ul> : "None") },
  ];

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="nums w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-foreground">
            <th className="w-36 py-3 pr-4" />
            {cars.map((c) => (
              <th key={c.id} scope="col" className="py-3 pr-4 align-bottom">
                <Link href={`/car/${c.id}`} className="font-serif text-lg font-semibold hover:underline">{c.title}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="py-3 pr-4 align-top font-normal text-muted">{row.label}</th>
              {cars.map((c) => {
                const isBest = row.num && row.bestOf != null && row.num(c) === row.bestOf;
                return (
                  <td key={c.id} className={`py-3 pr-4 align-top ${isBest ? "font-semibold text-good" : ""}`}>
                    {row.cell(c)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-muted">Green marks the best value in a row.</p>
    </div>
  );
}

/** One line from the saved listing history: the worst thing first. */
function historyCell(c: SavedCar): string {
  const h = c.facts.history;
  if (!h) return c.vin ? "Not checked" : "Needs a VIN";
  if (h.rollback) return "Miles went down: possible rollback";
  const parts = [`${h.listings} listing${h.listings === 1 ? "" : "s"} on record`];
  if (h.cutFrom) parts.push(`cut from ${usd(h.cutFrom)}`);
  return parts.join(", ");
}
