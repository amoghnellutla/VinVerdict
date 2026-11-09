import { CopyButton } from "@/components/CopyButton";
import { ExternalLink } from "@/components/ExternalLink";
import { verifyLinks } from "@/lib/sources";

/**
 * Free outside checks for this exact VIN, so nobody has to take VinVerdict's
 * word for it. Links never carry anything but the VIN.
 */
export function CheckYourself({ vin, make }: { vin: string | null; make: string | null }) {
  return (
    <section className="border-t border-border pt-8" id="check-yourself">
      <h2 className="section-title">Check it yourself</h2>
      {!vin ? (
        <p className="max-w-2xl">
          No valid VIN yet. Ask the seller for it: with the VIN you can check open recalls, theft and insurance write-offs, and title
          brands for free or a few dollars. A seller who won&apos;t share it is a reason to walk away.
        </p>
      ) : (
        <>
          <p className="max-w-2xl">
            Don&apos;t take our word for it. These are the official and free places to check this car, and the raw government data this page used.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[1.05rem] tracking-wide">{vin}</code>
            <CopyButton text={vin} label="Copy VIN" />
          </div>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {verifyLinks(vin, make).map((l) => (
              <li key={l.name} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
                <span>
                  <ExternalLink href={l.href} className="link font-semibold">{l.name}</ExternalLink>
                  <span className="block text-sm text-muted">{l.cost}{l.vinInLink ? "" : " · paste the VIN"}</span>
                </span>
                <span>{l.what}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
