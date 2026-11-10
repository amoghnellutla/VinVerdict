import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis, YearRow } from "@/lib/analyze";
import { sameBuildCount, type ComplaintSample, type Recall } from "@/lib/nhtsa/parse";
import { raw } from "@/lib/sources";

/**
 * Recalls, crash stars and owner complaints, straight from NHTSA. Every
 * number links to the public record it came from, so it can be checked.
 */
export function Safety({ a }: { a: Analysis }) {
  if (!a.vehicle) return null;
  const { year, make, model } = a.vehicle;
  const key = a.nhtsaVehicle ?? a.vehicle;
  const dontDrive = a.recalls?.filter((r) => r.parkIt) ?? [];
  const parkOut = a.recalls?.filter((r) => r.parkOutside && !r.parkIt) ?? [];
  // The VIN decode wins over what the listing says, so say which one this is.
  const basis = a.decoded?.year && a.decoded.model ? "per the VIN" : "per the listing";
  const vin = a.vinCheck?.ok ? a.listing.vin : null;
  const sameBuild = sameBuildCount(a.complaints, vin);

  return (
    <section className="border-t border-border pt-8" id="safety">
      <h2 className="section-title">Recalls and safety: {year} {make} {model} ({basis})</h2>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div>
          <h3 className="font-semibold">Recalls</h3>
          {a.recalls == null ? (
            <p className="mt-1 text-sm text-muted">Unavailable right now.</p>
          ) : a.recalls.length === 0 ? (
            <p className="mt-1 text-sm text-muted">
              None for this model and year. <ExternalLink href={raw.recalls(key)}>NHTSA record</ExternalLink>
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm">
                {a.recalls.length} on record for the {year} {model}. Not every car of that year is affected.{" "}
                <span className="text-muted">Open one for what&apos;s wrong and the free fix. Whether this car is affected, and whether it was repaired, is in &quot;Check it yourself&quot;.</span>
              </p>
              {dontDrive.length > 0 && (
                <p className="mt-2 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
                  <strong>Don&apos;t drive:</strong> {dontDrive.length} recall{dontDrive.length > 1 ? "s say" : " says"} affected cars shouldn&apos;t be driven until repaired.
                </p>
              )}
              {parkOut.length > 0 && (
                <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
                  <strong>Park outside:</strong> {parkOut.length} recall{parkOut.length > 1 ? "s say" : " says"} affected cars should be parked outside, away from buildings, until repaired (fire risk).
                </p>
              )}
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {a.recalls.map((r) => (
                  <RecallRow key={r.campaign} r={r} />
                ))}
              </ul>
            </>
          )}
        </div>

        <div>
          <h3 className="font-semibold">Crash-test stars</h3>
          {a.ratings == null ? (
            <p className="mt-1 text-sm text-muted">Unavailable right now.</p>
          ) : a.ratings.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Not tested by NHTSA.</p>
          ) : (
            <ul className="mt-1 space-y-3 text-sm">
              {a.ratings.map((r) => (
                <li key={r.vehicleId}>
                  <p className="text-muted">{r.description}</p>
                  <p>
                    Overall <Stars n={r.overall} />
                  </p>
                  <p className="text-muted">
                    Front {r.front ?? "–"} · Side {r.side ?? "–"} · Rollover {r.rollover ?? "–"} ·{" "}
                    <ExternalLink href={raw.rating(r.vehicleId)}>NHTSA record</ExternalLink>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="font-semibold">What owners report</h3>
        {a.complaints == null ? (
          <p className="mt-1 text-sm text-muted">Unavailable right now.</p>
        ) : (
          <>
            <p className="mt-1">
              <strong>{a.complaints.total.toLocaleString("en-US")}</strong> complaints filed with NHTSA for the {year} {model}
              {a.complaints.crashes + a.complaints.fires > 0 && (
                <span className="text-muted">
                  {" "}· {[a.complaints.crashes && `${a.complaints.crashes} involved a crash`, a.complaints.fires && `${a.complaints.fires} a fire`].filter(Boolean).join(", ")}
                </span>
              )}
              .{" "}
              <ExternalLink href={raw.complaints(key)} className="link text-sm">All of them (raw data)</ExternalLink>
            </p>
            {sameBuild !== null && a.complaints.total > 0 && vin && (
              <p className="mt-1 text-sm text-muted">
                <strong className="text-foreground">{sameBuild}</strong> came from cars whose VIN starts{" "}
                <code className="font-mono">{vin.slice(0, 8)}</code>, like this one: the same maker, body and engine.
              </p>
            )}
            {a.complaints.topComponents.length > 0 && (
              <>
                <p className="mt-3 text-sm text-muted">The most common problem areas, with the latest reports in the owners&apos; own words. Have your mechanic check these.</p>
                <ul className="mt-2 divide-y divide-border border-y border-border">
                  {a.complaints.topComponents.map((c) => (
                    <li key={c.component}>
                      {c.samples?.length ? (
                        <details className="group py-2">
                          <summary className="flex cursor-pointer justify-between gap-3">
                            <span>
                              <span className="font-medium">{area(c.component)}</span>{" "}
                              <span className="text-sm text-muted group-open:hidden">· read reports</span>
                            </span>
                            <span className="nums text-muted">{c.count}</span>
                          </summary>
                          <ul className="mt-2 space-y-3 pb-1">
                            {c.samples.map((x) => (
                              <OwnerReport key={x.odi} x={x} />
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <p className="flex justify-between gap-3 py-2">
                          <span className="font-medium">{area(c.component)}</span>
                          <span className="nums text-muted">{c.count}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {a.years && <YearCompare rows={a.years} year={year} model={model} />}
    </section>
  );
}

function RecallRow({ r }: { r: Recall }) {
  return (
    <li>
      <details className="py-2">
        <summary className="cursor-pointer">
          <span className="font-medium">{area(r.component)}</span>
          <span className="text-sm text-muted"> · {r.campaign}{r.reportDate ? ` · ${r.reportDate.slice(0, 4)}` : ""}</span>
          {r.parkIt ? <span className="tag ml-2 bg-bad-soft text-bad">Don&apos;t drive</span> : r.parkOutside ? <span className="tag ml-2 bg-warn-soft text-warn">Park outside</span> : null}
        </summary>
        <dl className="mt-2 space-y-2 text-sm">
          {r.summary && <Field label="What's wrong" text={r.summary} />}
          {r.consequence && <Field label="The risk" text={r.consequence} />}
          {r.remedy && <Field label="The fix" text={r.remedy} />}
        </dl>
        <p className="mt-2 pb-1 text-sm text-muted">
          Recall repairs are free at the brand&apos;s dealers. <ExternalLink href={raw.recall(r.campaign)}>NHTSA record {r.campaign}</ExternalLink>
        </p>
      </details>
    </li>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="font-semibold">{label}</dt>
      <dd>{readable(text)}</dd>
    </div>
  );
}

function OwnerReport({ x }: { x: ComplaintSample }) {
  return (
    <li className="text-sm">
      <blockquote className="border-l-2 border-border-strong pl-3">&ldquo;{readable(x.text)}&rdquo;</blockquote>
      <p className="mt-1 pl-3 text-muted">
        {[x.filed && `Filed ${x.filed}`, x.crash && "crash", x.fire && "fire"].filter(Boolean).join(" · ")}
        {x.filed ? " · " : ""}
        <ExternalLink href={raw.complaint(x.odi)}>NHTSA complaint {x.odi}</ExternalLink>
      </p>
    </li>
  );
}

/** "Is this a good year?": the same model a year either side, from the same NHTSA data. */
function YearCompare({ rows, year, model }: { rows: YearRow[]; year: number; model: string }) {
  const mine = rows.find((r) => r.year === year);
  const others = rows.filter((r) => r.year !== year && r.complaints !== null);
  const fewest = mine?.complaints != null && others.length > 0 && others.every((o) => (o.complaints ?? 0) > mine.complaints!);
  const most = mine?.complaints != null && others.length > 0 && others.every((o) => (o.complaints ?? 0) < mine.complaints!);
  const worstCrashFire = mine?.crashOrFire != null && mine.crashOrFire > 0 && others.length > 0 && others.every((o) => (o.crashOrFire ?? 0) < mine.crashOrFire!);
  return (
    <div className="mt-8">
      <h3 className="font-semibold">Compared with the years either side</h3>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Compared with the years either side">
        <table className="nums mt-2 w-full max-w-md text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 pr-4 font-medium">{model}</th>
              <th className="py-1.5 pr-4 font-medium">Recalls</th>
              <th className="py-1.5 pr-4 font-medium">Complaints</th>
              <th className="py-1.5 font-medium">Crash or fire</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-y border-border">
            {rows.map((r) => (
              <tr key={r.year} className={r.year === year ? "font-semibold" : ""}>
                <th scope="row" className="py-1.5 pr-4 text-left font-[inherit]">{r.year}{r.year === year ? " (this car)" : ""}</th>
                <td className="py-1.5 pr-4">{r.recalls ?? "–"}</td>
                <td className="py-1.5 pr-4">{r.complaints?.toLocaleString("en-US") ?? "–"}</td>
                <td className="py-1.5">{r.crashOrFire ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-muted">
        {fewest ? `${year} has the fewest complaints of these years${worstCrashFire ? ", but the most crash or fire reports" : ""}. ` : most ? `${year} has the most complaints of these years: read the reports above before buying. ` : worstCrashFire ? `${year} has the most crash or fire reports of these years. ` : ""}
        Counts grow with how many were sold and how long they&apos;ve been on the road, so compare years close together.
      </p>
    </div>
  );
}

function Stars({ n }: { n: number | null }) {
  if (n == null) return <span className="text-muted">Not rated</span>;
  return (
    <span aria-label={`${n} of 5 stars`}>
      <span className="text-warn">{"★".repeat(n)}</span>
      <span className="text-border">{"★".repeat(5 - n)}</span>
    </span>
  );
}

/** NHTSA problem areas: "AIR BAGS:SENSOR:OCCUPANT CLASSIFICATION" → "Air bags, sensor, occupant classification". */
export function area(component: string): string {
  const t = component.split(":").map((x) => x.trim().toLowerCase()).filter(Boolean).join(", ");
  return t ? t[0].toUpperCase() + t.slice(1) : component;
}

/** NHTSA text is often ALL CAPS. Shown in sentence case so it's readable; the words are unchanged. */
export function readable(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length < 4 || upper / letters.length < 0.7) return s;
  return s.toLowerCase().replace(/(^|[.!?]\s+|:\s*)([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}
