import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { OwnerHub } from "@/components/cars/OwnerHub";
import { SetupNote } from "@/components/cars/SetupNote";
import { CarYearCard } from "@/components/shortlist/CarYearCard";
import { DeviceShortlist } from "@/components/shortlist/DeviceShortlist";
import { ModelCard } from "@/components/shortlist/ModelCard";
import { currentUser } from "@/lib/auth/session";
import { listCars } from "@/lib/cars/store";
import { guideModelFor } from "@/lib/shortlist/mine";
import { allModels, shortlist, SHORTLIST_DATE } from "@/lib/shortlist/shortlist";

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
          description="Your saved cars: whether each one's model year is a good one, what to confirm, and the better years to look at. Below, every model in the guide."
        />
        <DeviceShortlist />
        <h2 className="section-title">Every model in the guide</h2>
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
        description="Your saved cars: whether each one's model year is a good one, what to confirm, and the better years to look at instead."
      />
      <Mine />
    </>
  );
}

/** The owner's Shortlist: one card per saved car, newest first, with only what helps decide on it. */
async function Mine() {
  const r = await listCars();
  if (!r.ok) return r.error === "not-set-up" ? <SetupNote /> : <p className="text-bad">Couldn&apos;t load your cars just now. Reload to try again.</p>;
  if (r.value.length === 0) {
    return (
      <p className="text-lg">
        No cars saved yet. <Link href="/" className="link">Check a car</Link> and save it, and it shows up here with how its model year rates.
      </p>
    );
  }
  const models = allModels();
  return (
    <>
      <ul className="space-y-5">
        {r.value.map((c) => (
          <CarYearCard
            key={c.id}
            car={{ id: c.id, href: `/car/${c.id}`, title: c.title, price: c.price, miles: c.miles, vin: c.vin, facts: c.facts }}
            model={guideModelFor(models, { make: c.facts.make ?? null, model: c.facts.model ?? null, powertrain: c.facts.powertrain ?? null })}
          />
        ))}
      </ul>
      <p className="mt-8 text-sm text-muted">
        Year ratings compare each model year&apos;s owner complaints to NHTSA (per year on the road) with the same model&apos;s other years, from{" "}
        {SHORTLIST_DATE}. <Link href="/shortlist?all=1" className="link">Every model&apos;s years</Link>
      </p>
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
