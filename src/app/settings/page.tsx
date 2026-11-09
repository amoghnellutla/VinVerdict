import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ZipSetting } from "@/components/settings/ZipSetting";
import { listCars } from "@/lib/cars/store";
import { getUsage, MONTHLY_LIMIT } from "@/lib/usage";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your home ZIP and the status of VinVerdict's data sources." />
      <section>
        <h2 className="section-title">Location</h2>
        <ZipSetting />
      </section>
      <section className="mt-10 border-t border-border pt-8">
        <h2 className="section-title">Setup status</h2>
        <Suspense fallback={<p className="text-muted">Checking…</p>}>
          <Status />
        </Suspense>
      </section>
    </>
  );
}

async function Status() {
  const [cars, usage] = await Promise.all([listCars(), getUsage()]);
  const keys = { marketcheck: !!process.env.MARKETCHECK_API_KEY, autodev: !!process.env.AUTODEV_API_KEY };
  const rows: [string, boolean, string][] = [
    ["Saved cars (My cars, Compare, price drops)", cars.ok, cars.ok ? `${cars.value.length} saved` : "Run supabase/migrations/20261109_checked_cars.sql (docs/SETUP.md step 8)"],
    ["Usage meter", usage !== null, usage ? `${usage.marketcheck}/${MONTHLY_LIMIT.marketcheck} MarketCheck, ${usage.autodev}/${MONTHLY_LIMIT.autodev} Auto.dev this month` : "Run supabase/migrations/20261109_api_usage.sql"],
    ["MarketCheck key (price model, sold cars, search)", keys.marketcheck, keys.marketcheck ? "Set" : "Add MARKETCHECK_API_KEY"],
    ["Auto.dev key (live listing, cars for sale)", keys.autodev, keys.autodev ? "Set" : "Add AUTODEV_API_KEY"],
  ];
  return (
    <ul className="divide-y divide-border border-y border-border">
      {rows.map(([label, ok, note]) => (
        <li key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
          <span>
            <span className={`mr-2 font-semibold ${ok ? "text-good" : "text-warn"}`}>{ok ? "✓" : "!"}</span>
            {label}
          </span>
          <span className="nums text-muted">{note}</span>
        </li>
      ))}
    </ul>
  );
}
