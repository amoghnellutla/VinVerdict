import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Why not just Google it?" };

// An honest comparison: what each tool is good at, for the questions that decide a used-car purchase.
const ROWS: { q: string; search: string; chatbot: string; us: string }[] = [
  {
    q: "Is the VIN real, and is it this car?",
    search: "No way to check it.",
    chatbot: "Can describe what a VIN is, but often gets the check-digit math or the decode wrong.",
    us: "Runs the federal check-digit math, decodes the VIN with NHTSA and compares year, make, model and gearbox with the ad.",
  },
  {
    q: "Where has this exact car been listed before?",
    search: "Sometimes, if you search the VIN and dig through old pages.",
    chatbot: "No access to listing data.",
    us: "Every past listing of the VIN with dates, prices, miles and sellers. Flags odometer drops, quick dealer resales and price cuts.",
  },
  {
    q: "Recalls and known problems for this year",
    search: "NHTSA's site has them, one search at a time.",
    chatbot: "May mix up model years or miss recent recalls, and rarely shows the record.",
    us: "Live from NHTSA: each recall with its fix and campaign number, owners' own reports with their NHTSA numbers, and the years either side.",
  },
  {
    q: "Is the price fair where I live?",
    search: "Generic estimates you fill in by hand on each site.",
    chatbot: "A national ballpark at best.",
    us: "Real cars that sold or are for sale near your ZIP, each linked, adjusted for accidents, seller type and miles, with an opening offer and a walk-away price.",
  },
  {
    q: "Is the ad a scam?",
    search: "General advice articles.",
    chatbot: "Good general advice, if you think to ask.",
    us: "More than 30 checks on the ad's own words and data, each tied to FBI, FTC or NICB guidance.",
  },
  {
    q: "What will it cost me in total?",
    search: "Separate calculators.",
    chatbot: "A rough estimate.",
    us: "Out-the-door price with your state's tax and fees, plus fuel (EPA ratings) and upkeep (AAA averages) per year.",
  },
  {
    q: "Can I check the answer?",
    search: "Yes, you're reading the sources yourself.",
    chatbot: "Often no sources, or links that don't say what it claims.",
    us: "A numbered source list on every report, with the raw government data and the listings behind each fact.",
  },
];

export default function WhyPage() {
  return (
    <>
      <PageHeader
        title="Why not just Google it, or ask a chatbot?"
        description="Both are good for general advice. Buying one particular used car needs facts about that car, from records you can check. That's the part VinVerdict does."
      />

      <div className="space-y-8 sm:hidden">
        {ROWS.map((r) => (
          <section key={r.q}>
            <h2 className="text-xl">{r.q}</h2>
            <dl className="mt-2 space-y-2">
              <div><dt className="text-sm font-semibold text-muted">Search engine</dt><dd>{r.search}</dd></div>
              <div><dt className="text-sm font-semibold text-muted">AI chatbot</dt><dd>{r.chatbot}</dd></div>
              <div><dt className="text-sm font-semibold text-accent">VinVerdict</dt><dd>{r.us}</dd></div>
            </dl>
          </section>
        ))}
      </div>

      <table className="hidden w-full text-left align-top sm:table">
        <thead>
          <tr className="border-b border-border-strong text-sm text-muted">
            <th className="w-[22%] py-2 pr-4 font-medium">The question</th>
            <th className="w-[22%] py-2 pr-4 font-medium">Search engine</th>
            <th className="w-[22%] py-2 pr-4 font-medium">AI chatbot</th>
            <th className="py-2 font-medium text-accent">VinVerdict</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ROWS.map((r) => (
            <tr key={r.q} className="align-top">
              <th scope="row" className="py-4 pr-4 font-serif text-lg font-semibold">{r.q}</th>
              <td className="py-4 pr-4 text-muted">{r.search}</td>
              <td className="py-4 pr-4 text-muted">{r.chatbot}</td>
              <td className="py-4">{r.us}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="section-title">What it can&apos;t do</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Full accident history needs Carfax or AutoCheck, which are paid. VinVerdict uses what the listing and live listing data say, and points you to the free checks.</li>
          <li>Whether a recall was fixed on one particular car is only in NHTSA&apos;s and the maker&apos;s own lookups. Every report links to them with the VIN ready to copy.</li>
          <li>It doesn&apos;t replace a mechanic. Every report includes an inspection list built from the owner complaints for that model year.</li>
        </ul>
      </section>

      <p className="mt-10">
        <Link href="/" className="btn btn-primary">Try it on an example</Link>
      </p>
    </>
  );
}
