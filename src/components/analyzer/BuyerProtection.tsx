import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import { buyerProtection, PROTECTION_AS_OF, type Protection } from "@/lib/protection";

const TONE: Record<Protection["level"], { badge: string; label: string }> = {
  strong: { badge: "bg-good-soft text-good", label: "Return window + warranty" },
  some: { badge: "bg-warn-soft text-warn", label: "Limited protection" },
  none: { badge: "bg-bad-soft text-bad", label: "No protection" },
  unknown: { badge: "bg-surface-muted text-muted", label: "Depends on the seller" },
};

/** Feature O: what you can fall back on if the car turns out bad. */
export function BuyerProtection({ a }: { a: Analysis }) {
  const p = buyerProtection({
    text: a.text,
    sourceHost: a.listing.sourceHost,
    sellerType: a.listing.sellerType,
    year: a.decoded?.year ?? a.listing.year,
    price: a.listing.price,
    miles: a.listing.miles,
  });
  const t = TONE[p.level];

  return (
    <section className="border-t border-border pt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Buyer protection: {p.name}</h2>
        <span className={`tag ${t.badge}`}>{t.label}</span>
      </div>
      {(p.returns || p.warranty) && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {p.returns && (
            <div>
              <dt className="text-sm text-muted">Returns</dt>
              <dd>{p.returns}</dd>
            </div>
          )}
          {p.warranty && (
            <div>
              <dt className="text-sm text-muted">Included warranty</dt>
              <dd>{p.warranty}</dd>
            </div>
          )}
        </dl>
      )}
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
        {p.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        Policies as of {PROTECTION_AS_OF}; get the terms in writing.{" "}
        {p.links.map((l, i) => (
          <span key={l.url}>
            {i > 0 && " · "}
            <ExternalLink href={l.url}>{l.label}</ExternalLink>
          </span>
        ))}
      </p>
    </section>
  );
}
