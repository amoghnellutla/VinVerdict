import { PageHeader } from "@/components/PageHeader";

const CHECKS = [
  { title: "Deal score", text: "Price vs. similar cars at this mileage, price per remaining mile, and a plain deal label." },
  { title: "Scam check", text: "Title, lien, curbstoning and payment red flags, each with its reason." },
  { title: "Recalls and safety", text: "Open recalls, crash-test stars and top complaint areas from NHTSA." },
  { title: "Out-the-door cost", text: "Price plus NJ sales tax, title and registration fees, and an inspection." },
];

export default function CheckListingPage() {
  return (
    <>
      <PageHeader
        title="Check a listing"
        phase="Phase 3"
        description="Paste a listing's text, link or VIN from Facebook Marketplace, Craigslist or any dealer site, and VinVerdict scores it before any money moves."
      />

      {/* UI preview only: the form does nothing until Phase 3. */}
      <form className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6" aria-describedby="analyze-note">
        <label htmlFor="listing" className="text-sm font-medium">
          Listing text, link or VIN
        </label>
        <textarea
          id="listing"
          name="listing"
          rows={7}
          maxLength={20000}
          placeholder={"2017 Honda Accord EX-L, 100k miles, $9,000, clean title, one owner…\nor https://…\nor 1HGCR2F8XHA000123"}
          className="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p id="analyze-note" className="text-xs text-muted">
            Facebook needs pasted text, because its pages require login. Text is treated as plain text, never run.
          </p>
          <button
            type="button"
            disabled
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground opacity-50"
          >
            Analyze
          </button>
        </div>
      </form>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">What you&apos;ll get</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {CHECKS.map((c) => (
            <li key={c.title} className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="font-medium">{c.title}</h3>
              <p className="mt-1 text-sm text-muted">{c.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
