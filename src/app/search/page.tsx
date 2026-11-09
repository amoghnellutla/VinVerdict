import type { Metadata } from "next";
import { Suspense } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import { PageHeader } from "@/components/PageHeader";
import { SearchForm } from "@/components/search/SearchForm";
import { getUsage, MONTHLY_LIMIT } from "@/lib/usage";

export const metadata: Metadata = { title: "Search" };

// PLAN.md §3 layer 2: sites to search by hand, with what each is best for.
const SITES = [
  { name: "AutoTempest", href: "https://www.autotempest.com", note: "Many sites at once" },
  { name: "CarGurus", href: "https://www.cargurus.com", note: "Dealer deal labels" },
  { name: "Cars.com", href: "https://www.cars.com", note: "Large inventory" },
  { name: "Facebook Marketplace", href: "https://www.facebook.com/marketplace", note: "Private sellers: highest scam risk" },
  { name: "Craigslist", href: "https://www.craigslist.org", note: "Private sellers: highest scam risk" },
  { name: "CarMax", href: "https://www.carmax.com", note: "10-day money-back return" },
  { name: "Carvana", href: "https://www.carvana.com", note: "7-day / 400-mile return" },
  { name: "Enterprise Car Sales", href: "https://www.enterprisecarsales.com", note: "7-day buyback" },
  { name: "Hertz Car Sales", href: "https://www.hertzcarsales.com", note: "Ex-rental cars" },
];

export default function SearchPage() {
  return (
    <>
      <PageHeader title="Search" description="Dealer and private listings near you, ranked by how far under fair value they are." />
      <SearchForm />
      <Suspense fallback={null}>
        <Usage />
      </Suspense>

      <section className="mt-14">
        <h2 className="section-title">Search other sites</h2>
        <ul className="divide-y divide-border border-y border-border">
          {SITES.map((s) => (
            <li key={s.name} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
              <ExternalLink href={s.href} className="link font-semibold">
                {s.name}
              </ExternalLink>
              <span className="text-muted">{s.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Monthly API usage (upper bound; see lib/usage.ts). Hidden until the database table exists. */
async function Usage() {
  const u = await getUsage();
  if (!u) return null;
  return (
    <p className="nums mt-6 text-sm text-muted">
      This month: about {u.marketcheck} of {MONTHLY_LIMIT.marketcheck} MarketCheck and {u.autodev} of {MONTHLY_LIMIT.autodev} Auto.dev lookups
      used (counted generously, including repeats served from cache).
    </p>
  );
}
