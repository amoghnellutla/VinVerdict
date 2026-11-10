"use client";

import { ExternalLink } from "@/components/ExternalLink";
import type { SameCar } from "@/lib/value/samecar";
import { fmt } from "@/lib/value/estimate";

/**
 * A pasted listing without a VIN that closely matches a car a dealer has for
 * sale nearby: show that car's photo and VIN, and let the person check it.
 * Worded as a likely match to confirm, never as a fact.
 */
export function SameCarCard({ match, onCheckVin, onUsePhotos, usingPhotos }: {
  match: SameCar;
  onCheckVin: ((vin: string) => void) | null;
  onUsePhotos: () => void;
  usingPhotos: boolean;
}) {
  const c = match.comp;
  const where = [c.city, c.state].filter(Boolean).join(", ");
  return (
    <section className="proof-in overflow-hidden rounded-xl border-2 border-accent bg-surface" aria-labelledby="same-car-title">
      <div className="grid sm:grid-cols-[14rem_1fr]">
        {c.photos?.[0] && (
          // Listing photo from Auto.dev's photo host (allowed by the CSP).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photos[0]} alt="" width={448} height={280} referrerPolicy="no-referrer" className="h-full max-h-56 w-full object-cover sm:max-h-none" />
        )}
        <div className="p-5">
          <h2 id="same-car-title" className="text-xl">This may be the same car, listed by a dealer</h2>
          <p className="nums mt-1">
            A {c.year} {c.trim ?? ""} for <strong>{fmt(c.price)}</strong> with <strong>{c.miles.toLocaleString("en-US")}</strong> miles
            {where ? ` in ${where}` : ""}: price within {fmt(match.priceDiff)} and miles within {match.milesDiff.toLocaleString("en-US")} of this ad.
          </p>
          <p className="mt-1 text-sm text-muted">
            Its VIN is <code className="font-mono text-foreground">{c.vin}</code>. Ask the seller whether that&apos;s their VIN before you trust anything
            here: matching numbers can be a coincidence, or a copied listing.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {onCheckVin && c.vin && (
              <button type="button" className="btn btn-primary" onClick={() => onCheckVin(c.vin!)}>
                Check this VIN
              </button>
            )}
            {(c.photos?.length ?? 0) > 0 && (
              <button type="button" className="btn btn-secondary" onClick={onUsePhotos} aria-pressed={usingPhotos}>
                {usingPhotos ? "Showing its photos above" : "Show its photos"}
              </button>
            )}
            {c.url && <ExternalLink href={c.url} className="link text-sm">Open the dealer&apos;s listing</ExternalLink>}
          </div>
        </div>
      </div>
    </section>
  );
}
