import Link from "next/link";
import { ExternalLink } from "@/components/ExternalLink";
import { cleanRecord, mpgText, powertrainText, titleText, accidentText } from "@/lib/cars/display";
import type { CarFacts } from "@/lib/cars/store";
import { mi, usd } from "@/lib/format";
import { searchLinks } from "@/lib/search-links";
import type { ShortlistModel, ShortlistYear } from "@/lib/shortlist/shortlist";
import { SHORTLIST_YEARS } from "@/lib/shortlist/years";
import { REF } from "@/lib/sources";

/** A saved car: from My cars (the owner's account) or My list (a visitor's device); `href` opens it there. */
export type ShortlistCar = { id: number | string; href: string; title: string; price: number | null; miles: number | null; vin: string | null; facts: CarFacts };

/** The latest run of consecutive years in a list ("2017, 2020, 2021, 2022" → 2020–2022), for one search link. */
export function latestRun(years: number[]): { from: number; to: number } | null {
  const s = [...new Set(years)].sort((a, b) => b - a);
  if (!s.length) return null;
  let from = s[0];
  for (let i = 1; i < s.length && s[i] === from - 1; i++) from = s[i];
  return { from, to: s[0] };
}

/** The investigations worth a buyer's attention: open ones, and closed ones with a recall number (NHTSA's "related
 * recall": one it led to, or one it checked the repair of, so "linked to", never "led to"). Closed without one
 * means NHTSA found no defect to recall, or moved it into a newer investigation, which is listed itself). */
export function shownInvestigations(list: ShortlistYear["investigations"]): ShortlistYear["investigations"] {
  return list.filter((v) => v.closed == null || v.recall).slice(0, 3);
}

/**
 * One saved car on the owner's Shortlist, with only what helps decide: the car's own facts, whether its model year
 * is a good one for that model (NHTSA owner complaints), a known issue or recalls for that year, and the better
 * years of the same model with one search for them.
 */
export function CarYearCard({ car, model }: { car: ShortlistCar; model: ShortlistModel | null }) {
  const f = car.facts;
  const y = model && f.year != null ? model.years.find((x) => x.year === f.year) ?? null : null;
  const better = model ? model.best.filter((b) => b !== f.year).sort((a, b) => b - a).slice(0, 5) : [];
  const run = latestRun(better);
  const search = model && run ? searchLinks({ make: model.make, model: model.model, minYear: run.from, maxYear: run.to })[0] : null;
  const facts = [car.price != null ? usd(car.price) : null, car.miles != null ? mi(car.miles) : null, mpgText(f), powertrainText(f)].filter(Boolean);
  const record = cleanRecord(f) ? "Clean title, no accidents reported" : `${titleText(f)}, ${accidentText(f).toLowerCase()}`;
  const badRecord = (f.title && !["clean", "unknown"].includes(f.title)) || f.accident === "reported";

  let verdict: { mark: string; tone: string; text: string } | null = null;
  if (model && f.year != null) {
    const covered = f.year >= SHORTLIST_YEARS.from && f.year <= SHORTLIST_YEARS.to;
    if (!y)
      verdict = covered
        ? { mark: "", tone: "text-muted", text: `${f.year}: no owner complaints on file with NHTSA for a ${model.model} of this year.` }
        : { mark: "", tone: "text-muted", text: `${f.year}: VinVerdict rates model years ${SHORTLIST_YEARS.from} to ${SHORTLIST_YEARS.to} only.` };
    else if (y.sparse) verdict = { mark: "", tone: "text-muted", text: `${f.year}: too few owner complaints on record to judge.` };
    else if (y.rating === "fewer") verdict = { mark: "✓", tone: "text-good", text: `${f.year}: fewer owner complaints than usual for a ${model.model}.` };
    else if (y.rating === "many") verdict = { mark: "✗", tone: "text-bad", text: `${f.year}: many more owner complaints than usual for a ${model.model}${y.topArea ? `, mostly ${y.topArea.toLowerCase()}` : ""}.` };
    else verdict = { mark: "", tone: "text-foreground", text: `${f.year}: about as many owner complaints as a usual ${model.model} year.` };
  }

  return (
    <li className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <Link href={car.href} className="font-serif text-lg font-semibold hover:underline">{car.title}</Link>
        <span className={`text-sm font-semibold ${cleanRecord(f) ? "text-good" : badRecord ? "text-bad" : "text-muted"}`}>{record}</span>
      </div>
      {facts.length > 0 && <p className="nums mt-1 text-muted">{facts.join(" · ")}</p>}

      {!model ? (
        <p className="mt-3 text-muted">VinVerdict doesn&apos;t have enough NHTSA owner complaints on file for this model to compare its years.</p>
      ) : f.year == null ? (
        <p className="mt-3 text-muted">Its model year wasn&apos;t read, so its year can&apos;t be rated.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {verdict && (
            <li className={`font-semibold ${verdict.tone}`}>
              {verdict.mark && <span aria-hidden="true">{verdict.mark} </span>}
              {verdict.text}
            </li>
          )}
          {y?.stars && (
            <li>
              NHTSA crash test:{" "}
              <strong className="nums">
                {y.stars.low === y.stars.high ? `${y.stars.low} stars overall` : `${y.stars.low} to ${y.stars.high} stars overall, depending on the version`}
              </strong>{" "}
              (<ExternalLink href={REF.nhtsaRatings.href} className="link">NHTSA 5-Star Safety Ratings</ExternalLink>)
            </li>
          )}
          {y && shownInvestigations(y.investigations).map((v) => (
            <li key={v.id}>
              <span className="tag bg-warn-soft text-warn">NHTSA investigation</span> {v.subject}:{" "}
              {v.closed == null ? `open since ${v.opened}.` : `${v.opened === v.closed ? v.opened : `${v.opened} to ${v.closed}`}, linked to recall ${v.recall}.`}
            </li>
          ))}
          {y?.knownIssues.map((k) => (
            <li key={k.title}>
              <span className="tag bg-warn-soft text-warn">Known issue</span> {k.title} (<ExternalLink href={k.url} className="link">{k.label}</ExternalLink>)
            </li>
          ))}
          {y && (y.parkIt > 0 || y.parkOutside > 0) && (
            <li>
              <span className="tag bg-bad-soft text-bad">{y.parkIt > 0 ? "Don't drive" : "Park outside"}</span>{" "}
              {y.parkIt > 0 ? "A recall for this year says not to drive it until it's repaired." : "A recall for this year says to park it outside until it's repaired (fire risk)."}{" "}
              Not every car is affected: check this one&apos;s VIN.
            </li>
          )}
          {y && y.recalls > 0 && (
            <li>
              {y.recalls} recall{y.recalls === 1 ? "" : "s"} for {f.year}: confirm {y.recalls === 1 ? "it was" : "they were"} fixed on the{" "}
              <ExternalLink href={REF.nhtsaRecalls.href} className="link">NHTSA recall lookup</ExternalLink>
              {car.vin ? <> with VIN <span className="nums">{car.vin}</span></> : " with the car's VIN"}.
            </li>
          )}
          {better.length > 0 ? (
            <li>
              Better years of the {model.model}: <strong className="nums">{better.join(", ")}</strong>
              {search && run && (
                <>
                  {" "}
                  <ExternalLink href={search.href} className="link font-semibold">
                    Find a {run.from === run.to ? run.from : `${run.from}–${run.to}`} {model.model}
                  </ExternalLink>
                </>
              )}
            </li>
          ) : (
            y?.rating === "fewer" && <li className="text-muted">No year of the {model.model} has clearly fewer complaints than this one.</li>
          )}
        </ul>
      )}
    </li>
  );
}
