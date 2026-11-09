import { Analyzer } from "@/components/analyzer/Analyzer";
import { PageHeader } from "@/components/PageHeader";

const COMING = [
  { title: "Deal score", text: "Price vs. similar cars at this mileage, price per remaining mile, and a deal label (Phase 4)." },
  { title: "Saved checks", text: "Every car you check, saved with its source link and price history, once login is on (Phase 2b, 8)." },
];

export default function CheckListingPage() {
  return (
    <>
      <PageHeader
        title="Check a listing"
        description="Paste a listing's text or VIN from Facebook Marketplace, Craigslist or any dealer site. VinVerdict checks it before any money moves."
      />

      <Analyzer />

      <section className="mt-12">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Coming next</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {COMING.map((c) => (
            <li key={c.title} className="rounded-2xl border border-dashed border-border bg-surface p-5">
              <h3 className="font-medium">{c.title}</h3>
              <p className="mt-1 text-sm text-muted">{c.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
