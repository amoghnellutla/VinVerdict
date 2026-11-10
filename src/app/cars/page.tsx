import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { CATALOG, POPULAR_MAKES, searchCatalog } from "@/lib/catalog/catalog";
import { BODY_LABEL } from "@/lib/catalog/describe";

export const metadata: Metadata = {
  title: "Car guide",
  description: "Every car sold in the US since 2000: body type, engines, fuel cost per month and year, and which are luxury or sports cars, each with its source.",
};

const yearsText = (ys: number[]) => (ys[0] === ys.at(-1) ? `${ys[0]}` : `${ys[0]}–${ys.at(-1)}`);

export default function CarsPage({ searchParams }: PageProps<"/cars">) {
  const popular = POPULAR_MAKES.map((s) => CATALOG.makes.find((m) => m.slug === s)).filter((m) => m !== undefined);
  const models = CATALOG.makes.reduce((n, m) => n + m.models.length, 0);
  return (
    <>
      <PageHeader
        title="Car guide"
        description={`Every car sold in the US since 2000: ${CATALOG.makes.length} makes, ${models.toLocaleString("en-US")} models. What each one is, what it costs in fuel, and where every fact comes from.`}
      />

      <form method="get" action="/cars" role="search" className="flex max-w-xl flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-sm font-semibold">Find a car</span>
          <input name="q" type="search" maxLength={60} placeholder="Range Rover, Camry, Mustang…" className="field mt-1 w-full" />
        </label>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      <Suspense fallback={null}>
        {searchParams.then((sp) => {
          const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
          return q.trim() ? <Results q={q} /> : null;
        })}
      </Suspense>

      <section className="mt-10">
        <h2 className="section-title">Popular makes</h2>
        <MakeList makes={popular} />
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="section-title">All makes, A–Z</h2>
        <MakeList makes={CATALOG.makes} />
      </section>

      <p className="mt-10 max-w-2xl text-sm text-muted">
        Models, years, engines and fuel costs come from the EPA&apos;s fuel economy data (fueleconomy.gov, file of{" "}
        {CATALOG.sources.epa.downloaded}). Heavy-duty pickups and vans (like the F-250) aren&apos;t in it: the EPA doesn&apos;t rate them.
      </p>
    </>
  );
}

function MakeList({ makes }: { makes: typeof CATALOG.makes }) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
      {makes.map((m) => (
        <li key={m.slug}>
          <Link href={`/cars/${m.slug}`} className="link inline-flex min-h-8 items-center">
            {m.name}
          </Link>
          <span className="nums ml-2 text-sm text-muted">{m.models.length}</span>
        </li>
      ))}
    </ul>
  );
}

function Results({ q }: { q: string }) {
  const hits = searchCatalog(q);
  return (
    <section className="mt-6" aria-live="polite">
      <h2 className="text-lg">
        {hits.length ? `${hits.length === 40 ? "First 40" : hits.length} matches for “${q}”` : `Nothing matches “${q}”`}
      </h2>
      {hits.length === 0 && <p className="mt-1 text-muted">Try just the model name, like “Camry” or “F150”.</p>}
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {hits.map(({ make, model }) => (
          <li key={`${make.slug}/${model.slug}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <Link href={`/cars/${make.slug}/${model.slug}`} className="link font-semibold">
              {make.name} {model.name}
            </Link>
            <span className="nums text-sm text-muted">
              {BODY_LABEL[model.body]}, {yearsText(model.years)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
