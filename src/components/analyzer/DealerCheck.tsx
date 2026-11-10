import { ExternalLink } from "@/components/ExternalLink";
import { REF } from "@/lib/sources";

/**
 * Fake dealer websites copy a real dealer's name, logo and cars (FTC, Sept 2026).
 * A short way to check the dealer is real before paying anything. Links only:
 * there's no "trust score", because a cloned site looks exactly like the real one.
 */
export function DealerCheck({ name }: { name: string | null }) {
  const q = encodeURIComponent(name ? `${name} car dealer` : "car dealer near me");
  const reviews = encodeURIComponent(`${name ?? "dealer name"} scam OR complaint OR review`);
  return (
    <div className="mt-8 border-t border-border pt-6">
      <h3 className="font-semibold">Is this dealer real?</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Scammers clone real dealers&apos; websites (logos, cars, photos) and take payment for cars that don&apos;t exist.{" "}
        <ExternalLink href={REF.ftcFakeDealer.href} className="link">{REF.ftcFakeDealer.name}</ExternalLink>
      </p>
      <ol className="mt-3 max-w-2xl list-decimal space-y-1.5 pl-5">
        <li>
          Find the dealer yourself on{" "}
          <ExternalLink href={`https://www.google.com/maps/search/${q}`} className="link">Google Maps</ExternalLink>, not through the ad&apos;s links. Its website
          address should match the one you&apos;re buying from.
        </li>
        <li>Call the number you found there (not the one in the ad) and ask them to confirm this exact car, by VIN or stock number.</li>
        <li>
          Search the name with &quot;scam&quot; or &quot;complaint&quot;:{" "}
          <ExternalLink href={`https://www.google.com/search?q=${reviews}`} className="link">search now</ExternalLink>.
        </li>
        <li>See the car at the dealership, or send a mobile inspection service if it&apos;s far. A dealer that refuses both is a warning sign.</li>
        <li>Never pay by &quot;wire transfer only&quot; before you&apos;ve seen the car. Pay at the dealership, with a signed buyer&apos;s order.</li>
      </ol>
    </div>
  );
}
