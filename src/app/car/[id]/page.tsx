import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import { CarActions } from "@/components/cars/CarActions";
import { SetupNote } from "@/components/cars/SetupNote";
import { getCars, priceChange } from "@/lib/cars/store";
import { mi, shortDate, usd, VERDICT_TAG, VERDICT_TEXT } from "@/lib/format";
import { DEAL_TEXT } from "@/lib/value/estimate";

export const metadata: Metadata = { title: "Car" };

// With Cache Components, a param with no generateStaticParams is runtime data,
// so it is read inside Suspense and the rest of the page stays prerendered.
export default function CarDetailPage({ params }: PageProps<"/car/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      {params.then(({ id }) => <Car id={Number(id)} />)}
    </Suspense>
  );
}

async function Car({ id }: { id: number }) {
  if (!Number.isSafeInteger(id) || id <= 0) return <NotFound />;
  const r = await getCars([id]);
  if (!r.ok) return r.error === "not-set-up" ? <SetupNote /> : <p className="text-bad">Couldn&apos;t load this car. Reload to try again.</p>;
  const c = r.value[0];
  if (!c) return <NotFound />;
  const change = priceChange(c);
  // "Check again" re-runs the full check from the saved text, through the same #listing= handoff the bookmark uses.
  const again = c.listingText ?? c.vin;
  const f = c.facts;
  const facts: [string, string | number | null | undefined][] = [
    ["Price", usd(c.price)],
    ["Miles", mi(c.miles)],
    ["Year", f.year],
    ["Seller", f.seller !== "unknown" ? f.seller : null],
    ["Accidents", f.accident === "none" ? "None reported" : f.accident === "reported" ? "Reported" : "Unknown"],
    ["Title", f.title !== "unknown" ? f.title : "Unknown"],
    ["Owners", f.owners],
    ["On sale for", f.history?.daysListed != null ? `${f.history.daysListed} days` : null],
    ["Past listings", f.history ? `${f.history.listings}${f.history.rollback ? " (miles went down: possible rollback)" : ""}` : null],
    ["Price cut from", f.history?.cutFrom ? usd(f.history.cutFrom) : null],
    ["VIN", c.vin],
    ["First checked", shortDate(c.createdAt)],
  ];

  return (
    <article className="space-y-10">
      <header>
        <p className="text-sm">
          <Link href="/checked" className="link">My cars</Link>
        </p>
        <h1 className="mt-2 text-3xl sm:text-[2.5rem]">{c.title}</h1>
        <div className="nums mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-lg">
          <span className={`tag ${VERDICT_TAG[c.verdict]}`}>{VERDICT_TEXT[c.verdict]}</span>
          <strong>{usd(c.price)}</strong>
          {c.dealLabel && <span>{DEAL_TEXT[c.dealLabel]}{c.fairLow && c.fairHigh ? ` (fair ${usd(c.fairLow)}–${usd(c.fairHigh)})` : ""}</span>}
        </div>
        {c.sourceUrl && (
          <p className="mt-2">
            <ExternalLink href={c.sourceUrl} className="link">Open the original listing{c.sourceHost ? ` on ${c.sourceHost}` : ""}</ExternalLink>
          </p>
        )}
      </header>

      {f.findings && f.findings.length > 0 && (
        <section className="border-t border-border pt-8">
          <h2 className="section-title">What we found</h2>
          <ul className="list-disc space-y-1 pl-5">
            {f.findings.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </section>
      )}

      <section className="border-t border-border pt-8">
        <h2 className="section-title">Price history</h2>
        {change && (
          <p className={`mb-3 text-lg font-semibold ${change.diff < 0 ? "text-good" : "text-bad"}`}>
            {change.diff < 0 ? "Dropped" : "Up"} {usd(Math.abs(change.diff))} since you first saw it.
          </p>
        )}
        {c.history.length ? (
          <ul className="nums max-w-md divide-y divide-border border-y border-border">
            {c.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-4 py-2">
                <span>{shortDate(h.seenAt)} <span className="text-sm text-muted">({h.source})</span></span>
                <strong>{usd(h.price)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No prices recorded yet.</p>
        )}
        <div className="mt-4">
          <CarActions id={c.id} hasVin={!!c.vin} />
        </div>
      </section>

      <section className="border-t border-border pt-8">
        <h2 className="section-title">The car</h2>
        <dl className="nums max-w-md divide-y divide-border border-y border-border">
          {facts.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right first-letter:uppercase">{v}</dd>
            </div>
          ))}
        </dl>
        {again && (
          <p className="mt-4">
            <Link href={`/#listing=${encodeURIComponent(again)}`} className="btn btn-primary">Check it again</Link>
            <span className="ml-3 text-sm text-muted">Runs the full check, including safety, costs and the price check.</span>
          </p>
        )}
      </section>
    </article>
  );
}

function NotFound() {
  return (
    <p className="text-lg">
      That car isn&apos;t in your list. Go back to <Link href="/checked" className="link">My cars</Link>.
    </p>
  );
}
