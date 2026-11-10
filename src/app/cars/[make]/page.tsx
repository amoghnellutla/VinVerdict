import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "@/components/ExternalLink";
import { PageHeader } from "@/components/PageHeader";
import { CATALOG, findMake } from "@/lib/catalog/catalog";
import { BODY_LABEL } from "@/lib/catalog/describe";
import type { Body } from "@/lib/catalog/types";

export function generateStaticParams() {
  return CATALOG.makes.map((m) => ({ make: m.slug }));
}

export async function generateMetadata({ params }: PageProps<"/cars/[make]">): Promise<Metadata> {
  const make = findMake((await params).make);
  return make ? { title: `${make.name} models`, description: `Every ${make.name} sold in the US since 2000, with fuel costs and sources.` } : {};
}

const ORDER: Body[] = ["suv", "car", "pickup", "minivan", "wagon", "van"];
const HEADING: Record<Body, string> = { suv: "SUVs", car: "Cars", pickup: "Pickup trucks", minivan: "Minivans", wagon: "Wagons", van: "Vans" };
const yearsText = (ys: number[]) => (ys[0] === ys.at(-1) ? `${ys[0]}` : `${ys[0]}–${ys.at(-1)}`);

export default async function MakePage({ params }: PageProps<"/cars/[make]">) {
  const make = findMake((await params).make);
  if (!make) notFound();
  const groups = ORDER.map((b) => ({ body: b, models: make.models.filter((m) => m.body === b) })).filter((g) => g.models.length);
  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/cars" className="link">Car guide</Link>
      </p>
      <PageHeader title={make.name} description={`${make.models.length} models sold in the US since 2000. Pick one to see each year's versions and fuel cost.`} />

      {make.luxury && (
        <p className="-mt-4 mb-8 max-w-2xl">
          <span className="tag mr-2 border border-accent/40 text-accent">Luxury brand</span>
          <span className="text-muted">
            “{make.luxury.reason}” <ExternalLink href={make.luxury.source}>Wikipedia</ExternalLink>
          </span>
        </p>
      )}

      {groups.map((g) => (
        <section key={g.body} className="mb-8">
          <h2 className="section-title">{HEADING[g.body]}</h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {g.models.map((m) => (
              <li key={m.slug} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                <span>
                  <Link href={`/cars/${make.slug}/${m.slug}`} className="link font-semibold">
                    {m.name}
                  </Link>
                  {m.sporty && <span className="tag ml-2 border border-border-strong text-muted">Sports car</span>}
                </span>
                <span className="nums text-sm text-muted">{yearsText(m.years)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-muted">The body type shown is the most common one across the model&apos;s years ({BODY_LABEL.suv}, {BODY_LABEL.car.toLowerCase()} and so on), from the EPA&apos;s size class.</p>
    </>
  );
}
