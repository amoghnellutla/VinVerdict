import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/ExternalLink";
import { PageHeader } from "@/components/PageHeader";
import { REF, type SourceRef } from "@/lib/sources";

export const metadata: Metadata = {
  title: "Used-car scam signs",
  description: "The used-car scam patterns on Facebook Marketplace, Craigslist and fake dealer sites, how to spot each one, and what to do. Every sign linked to FBI, FTC, NICB or NHTSA guidance.",
};

type Sign = { title: string; looks: string; why: string; todo: string; sources: SourceRef[]; checks: string };

// Each sign is one VinVerdict checks for; the wording of "looks like" is typical, not quoted from a real ad.
const SIGNS: Sign[] = [
  {
    title: "Money before you've seen the car",
    looks: "\"Lots of interest, send $200 by Zelle to hold it.\" \"I take Apple gift cards for the deposit.\"",
    why: "Deposits by payment app, gift card, wire or crypto can't be reversed. Fake sellers ask for them because the car doesn't exist.",
    todo: "Pay nothing until you've seen the car, the title and the seller's ID in person. Then pay at a bank.",
    sources: [REF.ftcApps, REF.ftcPay, REF.ftcWire],
    checks: "the ad and the seller's messages",
  },
  {
    title: "A seller who's away, and a car that ships",
    looks: "\"I'm deployed overseas, the car is with a transport company. They deliver it with a 5-day inspection.\"",
    why: "The FBI's description of fake vehicle listings: a seller who can't meet, a car held by a shipping company or covered by \"eBay Motors protection\", and payment first.",
    todo: "Only buy a car you can see locally. A real seller who's away has someone show it.",
    sources: [REF.ic3],
    checks: "the ad and the seller's messages",
  },
  {
    title: "A price far below similar cars",
    looks: "A 2019 Civic with 31,000 miles for $4,500 when similar ones ask $15,000 or more.",
    why: "Bait. On its own it isn't proof of a scam (some sellers need money fast), but a big discount next to any other warning sign is the classic pattern.",
    todo: "Ask why it's cheap, and see the car, title and seller before paying anything.",
    sources: [REF.ic3],
    checks: "the price check",
  },
  {
    title: "No inspection, no test drive",
    looks: "\"No inspections, the car is perfect.\" \"No test drives.\"",
    why: "A seller who won't let a mechanic look at the car may be hiding something.",
    todo: "Don't buy without a pre-purchase inspection by a mechanic you choose.",
    sources: [REF.ftcDealer],
    checks: "the ad, the seller's messages and your answers",
  },
  {
    title: "The title isn't in the seller's name",
    looks: "\"Selling for my cousin.\" \"Open title.\" \"Title isn't in my name yet.\"",
    why: "Unlicensed dealers (\"curbstoners\") pose as private sellers to sell cars with hidden problems.",
    todo: "Buy only from the person named on the title, with matching ID.",
    sources: [REF.curbstoning],
    checks: "the ad and your answers",
  },
  {
    title: "A VIN that doesn't add up",
    looks: "The ad says 2019, the VIN decodes to a 2016. Or the VIN fails its check digit.",
    why: "A copied VIN can hide a stolen or different car.",
    todo: "Compare the VIN on the dashboard, the door sticker and the title, and decode it.",
    sources: [REF.vinRule, REF.nicbVincheck],
    checks: "the VIN (NHTSA decode)",
  },
  {
    title: "Miles that don't fit",
    looks: "An 8-year-old car with 18,000 miles, or fewer miles than an earlier listing of the same VIN.",
    why: "Odometer rollback makes a car look worth more than it is.",
    todo: "Check the miles on past listings and service records, and in a history report.",
    sources: [REF.odometer],
    checks: "the ad and the VIN's listing history",
  },
  {
    title: "A branded or recently moved title",
    looks: "\"Rebuilt title, drives great.\" \"Just got a new title from another state.\"",
    why: "Salvage, flood and rebuilt brands mean major past damage. Moving a car between states can wash a brand off the title.",
    todo: "Check the title history (NMVTIS) and NICB VINCheck, and have the repair inspected.",
    sources: [REF.nmvtis, REF.nicb],
    checks: "the ad, the seller's messages and reports you attach",
  },
  {
    title: "A dealer website that's a copy",
    looks: "A real dealer's name, logo and cars, but a different web address or phone number, and \"wire transfer only\".",
    why: "Scammers clone real dealers' websites and take payment for cars that don't exist.",
    todo: "Find the dealer yourself on a map, call the number you found there, and see the car or send a mobile inspection.",
    sources: [REF.ftcFakeDealer],
    checks: "dealer listings (Is this dealer real?)",
  },
];

export default function ScamSignsPage() {
  return (
    <>
      <PageHeader
        title="Used-car scam signs"
        description="The patterns behind fake and risky listings on Facebook Marketplace, Craigslist and fake dealer sites. Any one is a reason to slow down; together they're a reason to stop."
      />
      <p className="max-w-2xl">
        VinVerdict checks every one of these automatically. <Link href="/" className="link font-semibold">Paste a listing to check it</Link>, and paste the
        seller&apos;s replies too.
      </p>

      <ol className="mt-8 space-y-8">
        {SIGNS.map((s, i) => (
          <li key={s.title} className="border-t border-border pt-6">
            <h2 className="text-xl">
              <span className="nums mr-2 text-muted">{i + 1}.</span>
              {s.title}
            </h2>
            <dl className="mt-3 grid max-w-2xl gap-x-4 gap-y-2 sm:grid-cols-[9rem_1fr]">
              <dt className="text-sm font-semibold text-muted">Looks like</dt>
              <dd className="italic">{s.looks}</dd>
              <dt className="text-sm font-semibold text-muted">Why it matters</dt>
              <dd>{s.why}</dd>
              <dt className="text-sm font-semibold text-muted">What to do</dt>
              <dd>{s.todo}</dd>
              <dt className="text-sm font-semibold text-muted">Source</dt>
              <dd className="flex flex-wrap gap-x-4 gap-y-1">
                {s.sources.map((r) => (
                  <ExternalLink key={r.href} href={r.href} className="link inline-flex min-h-6 items-center">{r.name}</ExternalLink>
                ))}
              </dd>
              <dt className="text-sm font-semibold text-muted">VinVerdict checks</dt>
              <dd className="text-sm">{s.checks}</dd>
            </dl>
          </li>
        ))}
      </ol>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="section-title">How well does it catch them?</h2>
        <p className="max-w-2xl">
          Measured on labelled ads and seller replies, including honest ones that use the same words (&quot;no deposits&quot;, &quot;I don&apos;t take Zelle&quot;):{" "}
          <Link href="/accuracy" className="link">see the numbers and their limits</Link>.
        </p>
        <p className="mt-6">
          <Link href="/" className="btn btn-primary">Check a listing</Link>
        </p>
      </section>
    </>
  );
}
