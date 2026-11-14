import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SetupNote } from "@/components/cars/SetupNote";
import { listCars, priceChange } from "@/lib/cars/store";
import { mi, shortDate, usd, usdWithFee, VERDICT_TAG, VERDICT_TEXT } from "@/lib/format";
import { DEAL_TEXT } from "@/lib/value/estimate";

export const metadata: Metadata = { title: "My cars" };

export default function CheckedCarsPage() {
  return (
    <>
      <PageHeader title="My cars" description="Every car you've checked, newest first. Tick two or three to compare them." />
      {/* The list reads your login cookie, so it renders at request time inside Suspense. */}
      <Suspense fallback={<p className="text-muted">Loading your cars…</p>}>
        <CarList />
      </Suspense>
    </>
  );
}

async function CarList() {
  const r = await listCars();
  if (!r.ok) return r.error === "not-set-up" ? <SetupNote /> : <p className="text-bad">Couldn&apos;t load your cars just now. Reload to try again.</p>;
  if (r.value.length === 0) {
    return (
      <p className="text-lg">
        No cars yet. <Link href="/" className="link">Check a car</Link> and it&apos;s saved here automatically.
      </p>
    );
  }
  return (
    <form action="/compare" method="get">
      <ul className="divide-y divide-border border-y border-border">
        {r.value.map((c) => {
          const change = priceChange(c);
          return (
            <li key={c.id} className="flex gap-4 py-4">
              <input type="checkbox" name="ids" value={c.id} aria-label={`Compare ${c.title}`} className="mt-1.5 size-4 shrink-0 accent-[var(--accent)]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <Link href={`/car/${c.id}`} className="font-serif text-lg font-semibold hover:underline">{c.title}</Link>
                  <span className="nums font-semibold">{usdWithFee(c.price, c.facts.docFee)}</span>
                </div>
                <div className="nums mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.95rem] text-muted">
                  <span className={`tag ${VERDICT_TAG[c.verdict]}`}>{VERDICT_TEXT[c.verdict]}</span>
                  {c.dealLabel && <span className="font-semibold text-foreground">{DEAL_TEXT[c.dealLabel]}</span>}
                  <span>{mi(c.miles)}</span>
                  {c.sourceHost && <span>{c.sourceHost}</span>}
                  <span>Checked {shortDate(c.updatedAt)}</span>
                  {change && (
                    <span className={change.diff < 0 ? "font-semibold text-good" : "font-semibold text-bad"}>
                      {change.diff < 0 ? "Price dropped" : "Price up"} {usd(Math.abs(change.diff))}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="submit" className="btn btn-primary mt-5">Compare selected</button>
    </form>
  );
}
