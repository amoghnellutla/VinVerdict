import { ExternalLink } from "@/components/ExternalLink";
import type { LiveListing } from "@/lib/live/parse";
import type { CompEstimate } from "@/lib/value/comps";
import { ASKING_GAP, fmt, type Valuation } from "@/lib/value/estimate";

// Free instant offers to compare with a private sale (each needs the VIN and miles).
const OFFERS = [
  { name: "CarMax", href: "https://www.carmax.com/sell-my-car" },
  { name: "Carvana", href: "https://www.carvana.com/sell-my-car" },
  { name: "Kelley Blue Book Instant Cash Offer", href: "https://www.kbb.com/instant-cash-offer/" },
];

const round100 = (n: number) => Math.round(n / 100) * 100;

/** Selling your own car: what a private buyer would pay, what to list it at, and how to compare. */
export function SellValue({ privateV, dealerV, live, active, zip }: {
  privateV: Valuation;
  dealerV: Valuation | null;
  live: LiveListing | null;
  active: CompEstimate | null;
  zip: string;
}) {
  if (privateV.unpriced) {
    return (
      <div className="space-y-3">
        <p className="rounded-md bg-warn-soft px-4 py-3">{privateV.unpriced}</p>
        <p>Get an in-person appraisal, or compare free instant offers (below): they inspect the car and make a firm offer.</p>
        <Offers />
      </div>
    );
  }
  const listAt = round100(privateV.fair / (1 - ASKING_GAP));
  const yours = live && !live.removedAt && live.price ? live.price : null;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-muted">Selling it yourself, near {zip}</p>
        <p className="nums font-serif text-3xl font-semibold">
          {fmt(privateV.low)}–{fmt(privateV.high)}
        </p>
        <p className="nums mt-1 text-lg">
          Most likely <strong>{fmt(privateV.fair)}</strong>. List it at about <strong>{fmt(listAt)}</strong>: buyers usually talk the price down a
          few percent (used cars sell about 4–11% under their first asking price).
        </p>
        <p className="mt-1 text-sm text-muted">
          Confidence: <strong className="text-foreground">{privateV.confidence}</strong> ({privateV.confidenceWhy}).
        </p>
        {privateV.assumesClean && (
          <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-sm">
            Priced as a car with no accidents and a clean title. If its history report shows damage, pick it under &quot;Your car&apos;s history
            report&quot; and this updates.
          </p>
        )}
      </div>

      <ul className="nums divide-y divide-border border-y border-border">
        {dealerV && (
          <li className="flex flex-wrap justify-between gap-x-4 py-2">
            <span>
              A dealer would ask about
              <span className="block text-sm text-muted">Retail price for a car like yours; dealers pay you less than this when they buy it</span>
            </span>
            <strong>{fmt(dealerV.fair)}</strong>
          </li>
        )}
        {active && (
          <li className="flex flex-wrap justify-between gap-x-4 py-2">
            <span>
              Your competition
              <span className="block text-sm text-muted">{active.n} similar cars for sale within 100 miles of {zip}, at your miles</span>
            </span>
            <strong>{fmt(active.low)}–{fmt(active.high)}</strong>
          </li>
        )}
        {yours && (
          <li className="flex flex-wrap justify-between gap-x-4 py-2">
            <span>
              It&apos;s listed now{live?.sellerName ? ` by ${live.sellerName}` : ""}
              <span className="block text-sm text-muted">
                {yours > privateV.high ? "Above the private-sale range" : yours < privateV.low ? "Below the private-sale range" : "Inside the private-sale range"}
                {live?.sellerType === "dealer" ? " (a dealer's asking price, which is higher than a private sale)" : ""}
              </span>
            </span>
            <strong>{fmt(yours)}</strong>
          </li>
        )}
      </ul>

      <div>
        <h3 className="font-semibold">Compare instant offers</h3>
        <p className="mt-1 text-sm text-muted">
          Selling to a dealer is faster but pays less than a private sale. These give a firm offer for free in a few minutes; take the best one if you
          don&apos;t want to sell it yourself.
        </p>
        <Offers />
      </div>

      <div>
        <h3 className="font-semibold">Before you list it</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Get any open recalls fixed (free at the brand&apos;s dealer). Buyers check, and the list is in &quot;Recalls and safety&quot;.</li>
          <li>Have the title ready. If there&apos;s a loan, ask your lender for the payoff amount and how they release the title.</li>
          <li>Gather service records and put the VIN in the listing: serious buyers look it up.</li>
          <li>Meet buyers in daylight somewhere public. Take payment as a bank transfer or a cashier&apos;s check you verify with the bank that issued it.</li>
        </ol>
      </div>
    </div>
  );
}

function Offers() {
  return (
    <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
      {OFFERS.map((o) => (
        <ExternalLink key={o.name} href={o.href} className="link">{o.name}</ExternalLink>
      ))}
    </p>
  );
}
