import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "@/components/ExternalLink";
import { CATALOG, findModel, loadMake } from "@/lib/catalog/catalog";
import { bodyText, engineText, fuelText, performanceFacts, powerText } from "@/lib/catalog/describe";
import type { ModelYear } from "@/lib/catalog/types";
import { raw } from "@/lib/sources";

export function generateStaticParams() {
  return CATALOG.makes.flatMap((m) => m.models.map((x) => ({ make: m.slug, model: x.slug })));
}

export async function generateMetadata({ params }: PageProps<"/cars/[make]/[model]">): Promise<Metadata> {
  const { make, model } = await params;
  const hit = findModel(make, model);
  if (!hit) return {};
  const name = `${hit.make.name} ${hit.model.name}`;
  return { title: name, description: `${name} by year: versions, engines and EPA fuel cost per month and year, with sources.` };
}

const yearsText = (ys: number[]) => (ys[0] === ys.at(-1) ? `${ys[0]}` : `${ys[0]}–${ys.at(-1)}`);

export default async function ModelPage({ params }: PageProps<"/cars/[make]/[model]">) {
  const { make: makeSlug, model: modelSlug } = await params;
  const hit = findModel(makeSlug, modelSlug);
  const detail = await loadMake(makeSlug);
  const data = detail?.models[modelSlug];
  if (!hit || !data) notFound();
  const { make, model } = hit;
  const years = Object.entries(data.years)
    .map(([y, d]) => ({ year: Number(y), d }))
    .sort((a, b) => b.year - a.year);
  const latest = years[0];
  const facts = performanceFacts(latest.d);
  const name = `${make.name} ${model.name}`;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/cars" className="link">Car guide</Link>
        <span className="mx-2 text-muted" aria-hidden="true">/</span>
        <Link href={`/cars/${make.slug}`} className="link">{make.name}</Link>
      </p>
      <div className="mb-8">
        <h1 className="text-3xl sm:text-[2.5rem]">{name}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          {bodyText(latest.d)}, sold {yearsText(model.years)}. {powerText(latest.d)} in {latest.year}.
        </p>
      </div>

      {(make.luxury || model.sporty) && (
        <ul className="mb-8 max-w-2xl space-y-3">
          {make.luxury && (
            <li>
              <span className="tag mr-2 border border-accent/40 text-accent">Luxury brand</span>
              <span className="text-muted">
                “{make.luxury.reason}” <ExternalLink href={make.luxury.source}>Wikipedia</ExternalLink>
              </span>
            </li>
          )}
          {model.sporty && (
            <li>
              <span className="tag mr-2 border border-border-strong text-foreground">Sports car</span>
              <span className="text-muted">
                “{model.sporty.reason}” <ExternalLink href={model.sporty.source}>Wikipedia</ExternalLink>
              </span>
            </li>
          )}
        </ul>
      )}

      {facts.length > 0 && (
        <p className="mb-8 max-w-2xl">
          <span className="font-semibold">From the EPA ({latest.year}):</span> {facts.join(", ")}.
        </p>
      )}

      <section>
        <h2 className="section-title">Year by year</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Fuel cost is the EPA&apos;s estimate for 15,000 miles a year (55% city driving); a range covers the model&apos;s different versions.
          Each year links to the EPA&apos;s page for one of its versions.
        </p>
        <YearList name={name} years={years} />
      </section>

      <p className="mt-10 max-w-2xl text-sm text-muted">
        Source: <ExternalLink href={CATALOG.sources.epa.about}>EPA / DOE fueleconomy.gov data</ExternalLink> (file of {CATALOG.sources.epa.downloaded}).
        Labels: each brand&apos;s or model&apos;s Wikipedia article, checked {CATALOG.labelsChecked}; a label is shown only when the article&apos;s
        opening says so.
      </p>
    </>
  );
}

function YearList({ name, years }: { name: string; years: { year: number; d: ModelYear }[] }) {
  return (
    <>
      <ul className="mt-4 divide-y divide-border border-y border-border sm:hidden">
        {years.map(({ year, d }) => {
          const fuel = fuelText(d);
          return (
            <li key={year} id={`y${year}`} className="scroll-mt-20 py-3">
              <p className="flex items-baseline justify-between gap-3">
                <span className="nums text-lg font-semibold">{year}</span>
                <EpaLink id={d.epaIds[0]} label={`EPA page for a ${year} ${name}`} />
              </p>
              <p className="text-sm text-muted">{bodyText(d)}, {powerText(d).toLowerCase()}, {engineText(d)}</p>
              <p className="nums mt-1">
                {fuel ? <>Fuel {fuel.year} a year ({fuel.month} a month)</> : "Fuel cost not listed"}
                {d.mpg && <span className="text-muted">, {mpgText(d)}</span>}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 hidden overflow-x-auto sm:block" tabIndex={0} role="region" aria-label={`${name} by year`}>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border-strong text-sm text-muted">
              <th className="py-2 pr-4 font-medium">Year</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium">Engine</th>
              <th className="py-2 pr-4 font-medium">MPG</th>
              <th className="py-2 pr-4 font-medium">Fuel a year</th>
              <th className="py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {years.map(({ year, d }) => {
              const fuel = fuelText(d);
              return (
                <tr key={year} id={`y${year}`} className="scroll-mt-20 align-top">
                  <th scope="row" className="nums py-2 pr-4 text-left font-semibold">{year}</th>
                  <td className="py-2 pr-4">
                    {bodyText(d)}
                    <span className="block text-sm text-muted">{powerText(d)}</span>
                  </td>
                  <td className="py-2 pr-4">{engineText(d)}</td>
                  <td className="nums py-2 pr-4">{d.mpg ? mpgText(d) : "–"}</td>
                  <td className="nums py-2 pr-4">
                    {fuel ? fuel.year : "–"}
                    {fuel && <span className="block text-sm text-muted">{fuel.month} a month</span>}
                  </td>
                  <td className="py-2">
                    <EpaLink id={d.epaIds[0]} label={`EPA page for a ${year} ${name}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function mpgText(d: ModelYear): string {
  if (!d.mpg) return "";
  const [a, b] = d.mpg;
  const unit = d.power.length === 1 && d.power[0] === "electric" ? "MPGe" : "MPG";
  return `${a === b ? a : `${a}–${b}`} ${unit}`;
}

function EpaLink({ id, label }: { id: number | undefined; label: string }) {
  if (!id) return null;
  return (
    <ExternalLink href={raw.fuel(id)} className="link inline-flex min-h-6 items-center text-sm" aria-label={label}>
      EPA
    </ExternalLink>
  );
}
