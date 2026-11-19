import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import { PageHeader } from "@/components/PageHeader";
import { OwnerHub } from "@/components/cars/OwnerHub";
import { SetupNote } from "@/components/cars/SetupNote";
import { ModelCard } from "@/components/shortlist/ModelCard";
import { currentUser } from "@/lib/auth/session";
import { listCars } from "@/lib/cars/store";
import { usd } from "@/lib/format";
import { OUTSIDE_SITES } from "@/lib/search-links";
import { myShortlist } from "@/lib/shortlist/mine";
import { shortlist, SHORTLIST_DATE } from "@/lib/shortlist/shortlist";

export const metadata: Metadata = { title: "Shortlist" };

type Params = Record<string, string | string[] | undefined>;

/**
 * Visitors get the whole guide. The owner gets it inside the "My cars" hub, narrowed to the models of the cars
 * they've checked, with the full guide one link away (?all=1).
 */
export default function ShortlistPage({ searchParams }: PageProps<"/shortlist">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      {searchParams.then((sp) => <ForViewer sp={sp} />)}
    </Suspense>
  );
}

async function ForViewer({ sp }: { sp: Params }) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const budget = Number(one("budget").replace(/\D/g, "")) || null;
  const zip = /^\d{5}$/.test(one("zip")) ? one("zip") : null;
  const body = ["Sedan", "SUV"].includes(one("body")) ? one("body") : "";
  const owner = await currentUser();
  if (!owner) {
    return (
      <>
        <PageHeader
          title="Shortlist"
          description="Everyday cars, and which model years owners reported the most problems with to NHTSA. Set a budget and ZIP to get ready-made searches."
        />
        <Guide budget={budget} zip={zip} body={body} />
      </>
    );
  }
  if (one("all") === "1") {
    return (
      <>
        <OwnerHub active="/shortlist" description="Every model in the guide, and which model years owners reported the most problems with to NHTSA." />
        <p className="mb-6">
          <Link href="/shortlist" className="link font-semibold">Back to your models</Link>
        </p>
        <Guide budget={budget} zip={zip} body={body} all />
      </>
    );
  }
  return (
    <>
      <OwnerHub
        active="/shortlist"
        description="The models of the cars you've checked, with the model years owners reported the most problems with to NHTSA. Your cars' years are ringed."
      />
      <Mine />
    </>
  );
}

/** The owner's models only: one card per model they've checked, their cars and years marked on it. */
async function Mine() {
  const r = await listCars();
  if (!r.ok) return r.error === "not-set-up" ? <SetupNote /> : <p className="text-bad">Couldn&apos;t load your cars just now. Reload to try again.</p>;
  const cars = r.value.map((c) => ({ id: c.id, title: c.title, price: c.price, year: c.facts.year ?? null, make: c.facts.make ?? null, model: c.facts.model ?? null }));
  const { mine, notInGuide } = myShortlist(shortlist(), cars);
  return (
    <>
      {cars.length === 0 ? (
        <p className="text-lg">
          No cars checked yet. <Link href="/" className="link">Check a car</Link> and its model&apos;s problem years show up here.
        </p>
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <Legend />
              <ul className="mt-6 space-y-10">
                {mine.map(({ model, cars: own }) => (
                  <ModelCard key={`${model.make}-${model.model}`} m={model} mine={own} />
                ))}
              </ul>
            </>
          )}
          {notInGuide.length > 0 && (
            <section className="mt-10 border-t border-border pt-6">
              <h2 className="text-xl">Not in the guide yet</h2>
              <p className="mt-2 text-muted">The guide covers everyday Toyota, Honda, Mazda, Lexus and Subaru models; these have no owner-report trend here.</p>
              <ul className="mt-3 space-y-1">
                {notInGuide.map((c) => (
                  <li key={c.id}>
                    <Link href={`/car/${c.id}`} className="link">{c.title}</Link>
                    {c.price != null && <span className="nums text-muted"> · {usd(c.price)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <p className="mt-10">
        <Link href="/shortlist?all=1" className="link font-semibold">See every model in the guide</Link>
      </p>
      <section className="mt-10">
        <h2 className="section-title">Find more cars on other sites</h2>
        <ul className="divide-y divide-border border-y border-border">
          {OUTSIDE_SITES.map((s) => (
            <li key={s.name} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
              <ExternalLink href={s.href} className="link font-semibold">{s.name}</ExternalLink>
              <span className="text-muted">{s.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Legend() {
  return (
    <p className="mt-2 text-muted">
      <span className="tag bg-good-soft text-good">Fewer owner reports</span>{" "}
      <span className="tag bg-bad-soft text-bad">Many owner reports</span>{" "}
      <span className="tag bg-warn-soft text-warn">! Known issue</span>{" "}
      <span className="tag border border-dashed border-border-strong text-muted">Not enough data</span>{" "}
      Owner complaints filed with NHTSA per year on the road, compared with other years of the same model (data from {SHORTLIST_DATE}).
      This is a trend, not a reliability rating: counts also depend on how many were sold, and newer years have had less time for
      problems to show. Hover a year for its complaint and recall counts. Safety recalls are repaired free at the brand&apos;s authorized
      dealers; check the car&apos;s VIN on NHTSA to see whether its recalls were done.
    </p>
  );
}

/** The whole guide, with a budget, ZIP and body type for the searches. */
function Guide({ budget, zip, body, all = false }: { budget: number | null; zip: string | null; body: string; all?: boolean }) {
  const models = shortlist().filter((m) => !body || m.body === body || (body === "Sedan" && m.body === "Hatchback"));
  return (
    <>
      <form method="get" className="card flex flex-wrap items-end gap-4">
        {all && <input type="hidden" name="all" value="1" />}
        <label>
          <span className="text-sm font-semibold">Budget (max $)</span>
          <input name="budget" defaultValue={budget ?? ""} inputMode="numeric" placeholder="15000" className="field mt-1 w-36" />
        </label>
        <label>
          <span className="text-sm font-semibold">ZIP</span>
          <input name="zip" defaultValue={zip ?? ""} inputMode="numeric" maxLength={5} placeholder="08540" className="field mt-1 w-28" />
        </label>
        <label>
          <span className="text-sm font-semibold">Type</span>
          <select name="body" defaultValue={body} className="field mt-1 w-32">
            <option value="">Any</option>
            <option value="Sedan">Sedan</option>
            <option value="SUV">SUV</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary">Update</button>
      </form>

      <h2 className="mt-8 text-xl">Reported owner-problem trends</h2>
      <Legend />

      <ul className="mt-6 space-y-10">
        {models.map((m) => (
          <ModelCard key={`${m.make}-${m.model}`} m={m} zip={zip} budget={budget} />
        ))}
      </ul>
    </>
  );
}
