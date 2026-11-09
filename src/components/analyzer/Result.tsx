"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import type { RuleAction, RuleHit, SellerChecklist, Verdict } from "@/lib/scam/rules";
import { buildVerdict } from "@/lib/verdict";
import { Checklist } from "./Checklist";

const money = (n: number | null) => (n == null ? null : `$${n.toLocaleString("en-US")}`);
const miles = (n: number | null) => (n == null ? null : `${n.toLocaleString("en-US")} mi`);
const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : null);

const VERDICT: Record<Verdict, { label: string; text: string; tone: string }> = {
  hide: { label: "Walk away", text: "One or more deal-breakers below.", tone: "border-bad/40 bg-bad/10 text-bad" },
  verify: { label: "Verify in person", text: "Looks clean, but the price needs a reason. See the car, title and seller ID first.", tone: "border-warn/40 bg-warn/10 text-warn" },
  caution: { label: "Proceed with caution", text: "No deal-breakers, but ask about the flags below.", tone: "border-warn/40 bg-warn/10 text-warn" },
  clear: { label: "No red flags found", text: "Still get a pre-purchase inspection and check the title in person.", tone: "border-good/40 bg-good/10 text-good" },
};

const ACTION_STYLE: Record<RuleAction, { badge: string; label: string }> = {
  hide: { badge: "bg-bad/15 text-bad", label: "Deal-breaker" },
  flag: { badge: "bg-warn/15 text-warn", label: "Ask about it" },
  info: { badge: "bg-surface-muted text-muted", label: "Missing info" },
};

export function Result({ analysis: a }: { analysis: Analysis }) {
  const [checklist, setChecklist] = useState<SellerChecklist>({});
  const result = useMemo(() => buildVerdict(a, checklist), [a, checklist]);

  if (a.listing.kind === "url") {
    return (
      <Panel title="Paste the listing text instead">
        <p className="text-sm text-muted">
          VinVerdict doesn&apos;t open links{a.listing.sourceHost ? ` (${a.listing.sourceHost})` : ""}. Open the listing, copy its
          text (title, price, miles, description and VIN if shown) and paste that here.
        </p>
      </Panel>
    );
  }

  const order: RuleAction[] = ["hide", "flag", "info"];
  const hits = [...result.hits].sort((x, y) => order.indexOf(x.action) - order.indexOf(y.action));
  const v = VERDICT[result.verdict];

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border p-5 sm:p-6 ${v.tone}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">{v.label}</h2>
          <span className="text-sm font-medium">Risk {result.risk}/100</span>
        </div>
        <p className="mt-1 text-sm text-foreground/80">{v.text}</p>
      </section>

      {hits.length > 0 && (
        <Panel title="What we found">
          <ul className="space-y-3">
            {hits.map((h) => (
              <HitRow key={h.id} hit={h} />
            ))}
          </ul>
        </Panel>
      )}

      <Facts a={a} />
      <Safety a={a} />
      <Checklist value={checklist} onChange={setChecklist} />
      <NextSteps vin={a.listing.vin} />

      {a.notices.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">
          {a.notices.map((n) => (
            <li key={n}>Note: {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HitRow({ hit }: { hit: RuleHit }) {
  const s = ACTION_STYLE[hit.action];
  return (
    <li className="flex flex-col gap-1 sm:flex-row sm:gap-3">
      <span className={`h-fit w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.badge}`}>{s.label}</span>
      <div>
        <p className="text-sm font-medium">{hit.title}</p>
        <p className="text-sm text-muted">{hit.reason}</p>
      </div>
    </li>
  );
}

function Facts({ a }: { a: Analysis }) {
  const l = a.listing;
  const d = a.decoded;
  const vinStatus = !l.vin ? null : a.vinCheck?.ok ? (d?.clean === false ? "Decoded with warnings" : "Valid") : "Invalid check digit";
  const rows: [string, string | null, string | null][] = [
    ["Year", l.year?.toString() ?? null, d?.year?.toString() ?? null],
    ["Make", l.make, d?.make ?? null],
    ["Model", l.model, d?.model ?? null],
    ["Trim", null, d?.trim ?? null],
    ["Body", null, d?.body ?? null],
    ["Transmission", l.transmission === "unknown" ? null : cap(l.transmission), d?.transmission ?? null],
    ["Drive", null, d?.driveType ?? null],
    ["Fuel", null, d?.fuel ?? null],
    ["Price", money(l.price), null],
    ["Miles", miles(l.miles), null],
    ["Title", l.titleStatus === "unknown" ? null : cap(l.titleStatus), null],
    ["Accidents", l.accident === "unknown" ? null : l.accident === "none" ? "None mentioned" : "Reported", null],
    ["Exterior", cap(l.exteriorColor), null],
    ["Owners", l.ownerCount?.toString() ?? null, null],
    ["Seller", l.sellerType === "unknown" ? null : cap(l.sellerType), null],
    ["VIN", l.vin, vinStatus],
  ];
  const shown = rows.filter(([, x, y]) => x || y);
  return (
    <Panel title="The car">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-4 font-medium" />
              <th className="py-2 pr-4 font-medium">Listing says</th>
              <th className="py-2 font-medium">VIN decode (NHTSA)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map(([label, x, y]) => (
              <tr key={label}>
                <th scope="row" className="py-2 pr-4 text-left font-normal text-muted">{label}</th>
                <td className="py-2 pr-4 break-all">{x ?? "—"}</td>
                <td className="py-2 break-all">{y ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
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

function Safety({ a }: { a: Analysis }) {
  if (!a.vehicle) return null;
  const { year, make, model } = a.vehicle;
  const parkIt = a.recalls?.filter((r) => r.parkIt || r.parkOutside) ?? [];
  // The VIN decode wins over what the listing says, so say which one this is.
  const source = a.decoded?.year && a.decoded.model ? "per the VIN" : "per the listing";
  return (
    <Panel title={`Recalls and safety: ${year} ${make} ${model} (${source})`}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="text-sm font-medium">Recalls</h3>
          {a.recalls == null ? (
            <p className="mt-1 text-sm text-muted">Unavailable right now.</p>
          ) : a.recalls.length === 0 ? (
            <p className="mt-1 text-sm text-muted">None for this model/year.</p>
          ) : (
            <>
              <p className="mt-1 text-sm">
                {a.recalls.length} for this model/year.{" "}
                <span className="text-muted">Ask whether they were fixed, or check the VIN on NHTSA (below).</span>
              </p>
              {parkIt.length > 0 && (
                <p className="mt-2 rounded-lg bg-bad/10 p-2 text-xs text-bad">
                  {parkIt.length} recall{parkIt.length > 1 ? "s say" : " says"} don&apos;t drive or park it outside until fixed.
                </p>
              )}
              <ul className="mt-2 space-y-2">
                {a.recalls.slice(0, 5).map((r) => (
                  <li key={r.campaign} className="text-xs">
                    <span className="font-medium">{r.component}</span>
                    <span className="text-muted"> · {r.campaign}{r.reportDate ? ` · ${r.reportDate.slice(0, 4)}` : ""}</span>
                  </li>
                ))}
              </ul>
              {a.recalls.length > 5 && <p className="mt-1 text-xs text-muted">+ {a.recalls.length - 5} more</p>}
            </>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium">Crash-test stars</h3>
          {a.ratings == null ? (
            <p className="mt-1 text-sm text-muted">Unavailable right now.</p>
          ) : a.ratings.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Not tested by NHTSA.</p>
          ) : (
            <ul className="mt-1 space-y-2 text-sm">
              {a.ratings.map((r) => (
                <li key={r.vehicleId}>
                  <p className="text-xs text-muted">{r.description}</p>
                  <p>
                    Overall <Stars n={r.overall} />
                  </p>
                  <p className="text-xs text-muted">
                    Front {r.front ?? "–"} · Side {r.side ?? "–"} · Rollover {r.rollover ?? "–"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium">Owner complaints</h3>
          {a.complaints == null ? (
            <p className="mt-1 text-sm text-muted">Unavailable right now.</p>
          ) : (
            <>
              <p className="mt-1 text-sm">
                {a.complaints.total.toLocaleString("en-US")} filed with NHTSA
                {a.complaints.crashes > 0 && <span className="text-muted"> · {a.complaints.crashes} involved a crash</span>}
              </p>
              {a.complaints.topComponents.length > 0 && (
                <>
                  <p className="mt-2 text-xs text-muted">Most common areas: have your mechanic check these.</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {a.complaints.topComponents.map((c) => (
                      <li key={c.component} className="flex justify-between gap-2">
                        <span>{c.component}</span>
                        <span className="text-muted">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

function NextSteps({ vin }: { vin: string | null }) {
  return (
    <Panel title="Before you pay">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Check theft and total-loss records on{" "}
          <ExternalLink href="https://www.nicb.org/vincheck">NICB VINCheck</ExternalLink> (free)
          {vin && (
            <>
              {" "}with VIN <code className="font-mono text-xs">{vin}</code>
            </>
          )}
          .
        </li>
        <li>
          Look up open recalls for this exact car on <ExternalLink href="https://www.nhtsa.gov/recalls">NHTSA</ExternalLink>.
        </li>
        <li>Book a pre-purchase inspection with your own mechanic ($100–250).</li>
        <li>Meet in a safe public place. The name on the title must match the seller&apos;s ID. Pay at a bank, never upfront.</li>
      </ol>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
