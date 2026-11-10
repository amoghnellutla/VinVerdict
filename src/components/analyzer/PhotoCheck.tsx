import { ExternalLink } from "@/components/ExternalLink";
import { isSafeImageSrc } from "@/lib/live/parse";

const enc = encodeURIComponent;

/**
 * "Are these photos really this car?" Fake listings often reuse photos from an
 * older or faraway ad. VinVerdict can't search every listing site itself, so it
 * hands each photo to a free reverse image search, and explains how to read
 * what comes back (dealers legitimately post the same photos on many sites).
 */
export function PhotoCheck({ photos, dealer }: { photos: string[]; dealer: boolean }) {
  // Only listing photos with a public address on the approved host (never local previews, never other hosts).
  const shown = photos.filter((p) => isSafeImageSrc(p) && !p.startsWith("blob:")).slice(0, 3);
  return (
    <section className="border-t border-border pt-8" id="photo-check">
      <h2 className="section-title">Are the photos really this car?</h2>
      <p className="max-w-2xl">
        Fake listings often reuse photos from an older or faraway ad. Search where the photos appear elsewhere.
      </p>
      {shown.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-4">
          {shown.map((src, i) => (
            <li key={src} className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Listing photo ${i + 1}`} width={72} height={48} loading="lazy" referrerPolicy="no-referrer" className="h-12 w-18 rounded object-cover" />
              <span className="flex flex-col text-sm">
                <ExternalLink href={`https://lens.google.com/uploadbyurl?url=${enc(src)}`} className="link">Google Lens</ExternalLink>
                <ExternalLink href={`https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${enc(src)}`} className="link">Bing</ExternalLink>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="mt-3 max-w-2xl list-decimal space-y-1 pl-5">
          <li><strong>On a phone:</strong> in the Facebook or Craigslist app, open a photo, long-press it (or take a screenshot) and choose <em>Search with Google Lens</em>.</li>
          <li><strong>On a computer:</strong> right-click a photo and choose <em>Search image with Google</em>, or upload it at <ExternalLink href="https://lens.google.com/" className="link">Google Lens</ExternalLink>.</li>
        </ol>
      )}
      <p className="mt-3 max-w-2xl text-sm text-muted">
        How to read it: {dealer ? "a dealer's photos on its own site and on listing sites is normal. " : ""}
        <strong className="text-foreground">Worry</strong> if the same photos show a different price, a different city, an older date, a different seller, or a
        dealer&apos;s watermark on a private ad. Then ask the seller for a new photo of the car next to a handwritten note: the message under &quot;Ask the seller&quot; has one ready.
      </p>
    </section>
  );
}
