import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { ExternalLink } from "@/components/ExternalLink";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Search" };

// PLAN.md §3 layer 2. Phase 7 turns these into pre-filled searches from your filters.
const SITES = [
  { name: "AutoTempest", href: "https://www.autotempest.com", note: "Many sites at once" },
  { name: "CarGurus", href: "https://www.cargurus.com", note: "Dealer deal labels" },
  { name: "AutoTrader", href: "https://www.autotrader.com", note: "KBB price labels" },
  { name: "Cars.com", href: "https://www.cars.com", note: "Large inventory" },
  { name: "Facebook Marketplace", href: "https://www.facebook.com/marketplace", note: "Private sellers: highest scam risk" },
  { name: "Craigslist", href: "https://www.craigslist.org", note: "Private sellers: highest scam risk" },
  { name: "CarMax", href: "https://www.carmax.com", note: "10-day money-back return" },
  { name: "Carvana", href: "https://www.carvana.com", note: "7-day / 400-mile return" },
  { name: "Enterprise Car Sales", href: "https://www.enterprisecarsales.com", note: "7-day buyback" },
  { name: "Hertz Car Sales", href: "https://www.hertzcarsales.com", note: "Ex-rental cars" },
  { name: "iSeeCars", href: "https://www.iseecars.com", note: "Price and history stats" },
];

export default function SearchPage() {
  return (
    <>
      <PageHeader
        title="Search"
        phase="Phase 7"
        description="Filter by brand, model, year, price, miles and distance. Results are ranked by bang for buck, and every one links to its source."
      />
      <EmptyState title="In-app search">
        Filters, a usage meter for the free API quota, and ranked results from MarketCheck and Auto.dev, cached for 24 hours.
      </EmptyState>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Search other sites</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SITES.map((s) => (
            <li key={s.name} className="rounded-xl border border-border bg-surface p-4">
              <ExternalLink href={s.href} className="font-medium text-accent underline-offset-2 hover:underline">
                {s.name} ↗
              </ExternalLink>
              <p className="mt-1 text-xs text-muted">{s.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
