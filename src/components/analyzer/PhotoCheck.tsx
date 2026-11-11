import { ExternalLink } from "@/components/ExternalLink";
import { LineText } from "@/components/LineText";
import { isSafeImageSrc } from "@/lib/live/parse";
import { photoCheck } from "@/lib/report/content";

/** Listing photos the report and this section may show: a public address on the approved host, never local previews. */
export function shownPhotos(photos: string[]): string[] {
  return photos.filter((p) => isSafeImageSrc(p) && !p.startsWith("blob:")).slice(0, 3);
}

/**
 * "Are these photos really this car?" Fake listings often reuse photos from an
 * older or faraway ad. VinVerdict can't search every listing site itself, so it
 * hands each photo to a free reverse image search, and explains how to read
 * what comes back (dealers legitimately post the same photos on many sites).
 * Text from lib/report/content.ts, so the downloadable report says the same.
 */
export function PhotoCheck({ photos, dealer }: { photos: string[]; dealer: boolean }) {
  const guide = photoCheck(shownPhotos(photos), dealer);
  return (
    <section className="border-t border-border pt-8" id="photo-check">
      <h2 className="section-title">Are the photos really this car?</h2>
      <p className="max-w-2xl">
        Fake listings often reuse photos from an older or faraway ad. Search where the photos appear elsewhere.
      </p>
      {guide.photos.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-4">
          {guide.photos.map((p, i) => (
            <li key={p.src} className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={`Listing photo ${i + 1}`} width={72} height={48} loading="lazy" referrerPolicy="no-referrer" className="h-12 w-18 rounded object-cover" />
              <span className="flex flex-col gap-1 text-sm">
                <ExternalLink href={p.lens} className="link inline-flex min-h-6 items-center">Google Lens</ExternalLink>
                <ExternalLink href={p.bing} className="link inline-flex min-h-6 items-center">Bing</ExternalLink>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="mt-3 max-w-2xl list-decimal space-y-1 pl-5">
          {guide.steps.map((s, i) => <li key={i}><LineText line={s} /></li>)}
        </ol>
      )}
      <p className="mt-3 max-w-2xl text-sm text-muted">How to read it: {guide.howToRead}</p>
    </section>
  );
}
