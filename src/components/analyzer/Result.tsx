"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { priceCheckAction, type PriceState } from "@/app/actions/price";
import type { Analysis } from "@/lib/analyze";
import { recentMiles, summarizeHistory } from "@/lib/history/summary";
import { mergeLive } from "@/lib/live/merge";
import type { LiveListing as Live } from "@/lib/live/parse";
import type { RuleAction, RuleHit, SellerChecklist, Verdict } from "@/lib/scam/rules";
import { valueCar, DEAL_TEXT, fmt, type Valuation } from "@/lib/value/estimate";
import { buildVerdict } from "@/lib/verdict";
import { Bookmarklet } from "./Bookmarklet";
import { BuyerProtection } from "./BuyerProtection";
import { BuyingDay } from "./BuyingDay";
import { Checklist } from "./Checklist";
import { InspectionList } from "./InspectionList";
import { ListingHistory } from "./ListingHistory";
import { CostPerYear } from "./CostPerYear";
import { PriceCheck } from "./PriceCheck";
import { OutTheDoor } from "./OutTheDoor";
import { RunningCost } from "./RunningCost";

const money = (n: number | null) => (n == null ? null : `$${n.toLocaleString("en-US")}`);
const miles = (n: number | null) => (n == null ? null : `${n.toLocaleString("en-US")} mi`);
const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : null);

// tone = colored left bar + soft background; title color matches.
const VERDICT: Record<Verdict, { label: string; text: string; tone: string; title: string }> = {
  hide: { label: "Walk away", text: "There's at least one deal-breaker below.", tone: "border-l-bad bg-bad-soft", title: "text-bad" },
  verify: { label: "Check it in person first", text: "Looks clean, but a price this low needs a reason. See the car, title and seller's ID before paying.", tone: "border-l-warn bg-warn-soft", title: "text-warn" },
  caution: { label: "Go carefully", text: "No deal-breakers, but ask the seller about the points below.", tone: "border-l-warn bg-warn-soft", title: "text-warn" },
  clear: { label: "No red flags found", text: "Still have a mechanic inspect it and check the title in person.", tone: "border-l-good bg-good-soft", title: "text-good" },
};

const ACTION_STYLE: Record<RuleAction, { badge: string; label: string }> = {
  hide: { badge: "bg-bad-soft text-bad", label: "Deal-breaker" },
  flag: { badge: "bg-warn-soft text-warn", label: "Ask about it" },
  info: { badge: "bg-surface-muted text-muted", label: "Good to know" },
};

// A bare VIN with nothing wrong isn't "no red flags": the deal hasn't been checked yet.
const VIN_ONLY_CLEAR = {
  label: "The car checks out so far",
  text: "A VIN shows the car, not the deal. Press \"Check price & history\" below, or paste the listing, to check the price, history and seller.",
  tone: "border-l-border-strong bg-surface",
  title: "text-foreground",
};

export function Result({ analysis: a, carId = null, saveNote = null, phoneMatches = [], guest = false, recorded = null }: {
  analysis: Analysis;
  carId?: number | null;
  saveNote?: string | null;
  phoneMatches?: { title: string }[];
  /** Demo visitor: nothing is saved; the live price check is rationed (bot check + daily limit). */
  guest?: boolean;
  /** Demo example: a price check recorded earlier, shown instead of the live button. */
  recorded?: { price: PriceState; recordedAt: string } | null;
}) {
  const [checklist, setChecklist] = useState<SellerChecklist>({});
  const [liveState, priceAction, pricePending] = useActionState(priceCheckAction, { status: "idle" } as PriceState);
  const priceState = recorded?.price ?? liveState;
  const live = priceState.status === "done" ? priceState.live : null;
  const sources = priceState.status === "done" ? priceState.sources : null;
  const rawHistory = priceState.status === "done" ? priceState.history : null;
  const history = useMemo(() => (rawHistory ? summarizeHistory(rawHistory) : null), [rawHistory]);
  // Panels below see the pasted facts with gaps filled from the live listing.
  // Unknown miles (a bare VIN) come from the latest listing in its history, as the price check did.
  const m = useMemo(() => {
    const l = mergeLive(a.listing, live);
    return { ...a, listing: l.miles === null && rawHistory ? { ...l, miles: recentMiles(rawHistory)?.miles ?? null } : l };
  }, [a, live, rawHistory]);
  const { result, valuation } = useMemo(() => {
    const first = buildVerdict({ ...a, live, phoneMatches, history }, checklist);
    if (!sources) return { result: first, valuation: null };
    const l = m.listing;
    // The seller's checklist answer about accidents counts too.
    const accident = checklist.anyAccidents === true ? "reported" : checklist.anyAccidents === false && l.accident === "unknown" ? "none" : l.accident;
    const valuation = valueCar(sources, {
      price: l.price, miles: l.miles, sellerType: l.sellerType, accident, titleStatus: l.titleStatus, usage: l.usage,
      daysOnMarket: live?.daysOnMarket ?? history?.daysListed ?? null, highMiles: first.hits.some((h) => h.id === "high-miles"),
      priceCut: history?.priceCut ?? null,
    });
    // A real market value lets the "far below market" scam rules run.
    const result = valuation?.pctUnder != null ? buildVerdict({ ...a, live, phoneMatches, history, valuePct: valuation.pctUnder }, checklist) : first;
    return { result, valuation };
  }, [a, m, live, sources, history, checklist, phoneMatches]);

  if (a.listing.kind === "url") {
    return <LinkOnly host={a.listing.sourceHost} />;
  }

  const order: RuleAction[] = ["hide", "flag", "info"];
  const hits = [...result.hits].sort((x, y) => order.indexOf(x.action) - order.indexOf(y.action));
  const vinOnly = a.listing.kind === "vin";
  const v = vinOnly && !live && result.verdict === "clear" ? VIN_ONLY_CLEAR : VERDICT[result.verdict];

  return (
    <div className="space-y-10">
      <div>
        <CarLine a={m} />
        <section className={`mt-3 rounded-md border-l-4 px-5 py-4 ${v.tone}`}>
          <h2 className={`text-2xl sm:text-3xl ${v.title}`}>{v.label}</h2>
          <p className="mt-1 text-[1.05rem]">{v.text}</p>
          <Summary hits={hits} valuation={valuation} price={m.listing.price} />
          <p className="mt-2 text-sm text-muted">Risk score {result.risk} out of 100</p>
        </section>

        {hits.length > 0 && (
          <ul className="mt-6 divide-y divide-border">
            {hits.map((h) => (
              <HitRow key={h.id} hit={h} />
            ))}
          </ul>
        )}
      </div>

      <PriceCheck a={m} carId={carId} state={priceState} action={priceAction} pending={pricePending} valuation={valuation} guest={guest} recordedAt={recorded?.recordedAt ?? null} />
      {history && <ListingHistory h={history} />}
      <BuyerProtection a={m} />
      <Facts a={a} live={live} />
      {/* key: start the calculator again with the live price once it arrives */}
      <OutTheDoor key={live ? "live" : "pasted"} a={m} />
      <CostPerYear key={`${m.listing.price}-${valuation?.fair ?? 0}`} a={m} valuation={valuation} comps={sources?.sold ?? sources?.active ?? null} />
      <RunningCost a={m} />
      <Safety a={m} />
      <InspectionList a={m} />
      <Checklist value={checklist} onChange={setChecklist} />
      <BuyingDay vin={a.listing.vin} seller={m.listing.sellerType} />

      <p className="border-t border-border pt-6 text-sm text-muted">
        {carId ? (
          <>Saved to <a href="/checked" className="link">My cars</a>, so you can compare it and see price drops later.</>
        ) : (
          saveNote
        )}
      </p>

      {a.notices.length > 0 && (
        <ul className="space-y-1 text-sm text-muted">
          {a.notices.map((n) => (
            <li key={n}>Note: {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The three things that matter most, inside the verdict box (feature 4). */
function Summary({ hits, valuation, price }: { hits: RuleHit[]; valuation: Valuation | null; price: number | null }) {
  const points: string[] = [];
  if (valuation?.label && price) {
    const diff = valuation.fair - price;
    points.push(`${DEAL_TEXT[valuation.label]}: ${Math.abs(diff) < 100 ? "right at" : `${fmt(Math.abs(diff))} ${diff > 0 ? "under" : "over"}`} the fair price of about ${fmt(valuation.fair)}`);
  }
  for (const h of hits) {
    if (points.length >= 3) break;
    if (h.action !== "info") points.push(h.title);
  }
  if (points.length === 0) return null;
  return (
    <ul className="mt-3 list-disc space-y-0.5 pl-5 font-semibold">
      {points.map((p) => <li key={p}>{p}</li>)}
    </ul>
  );
}

function HitRow({ hit }: { hit: RuleHit }) {
  const s = ACTION_STYLE[hit.action];
  return (
    <li className="grid gap-1 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
      <span className={`tag h-fit w-fit ${s.badge}`}>{s.label}</span>
      <div>
        <p className="font-semibold">{hit.title}</p>
        <p className="text-muted">{hit.reason}</p>
      </div>
    </li>
  );
}

/** "2021 Toyota Camry LE · $9,900 · 183,086 mi": what the result is about, in one line. */
function CarLine({ a }: { a: Analysis }) {
  const l = a.listing;
  const d = a.decoded;
  const name = [d?.year ?? l.year, d?.make ? cap(d.make.toLowerCase()) : l.make, d?.model ?? l.model, d?.trim].filter(Boolean).join(" ");
  const parts = [name || "This car", money(l.price), miles(l.miles)].filter(Boolean);
  return <p className="nums text-lg font-semibold">{parts.join(" · ")}</p>;
}

const USAGE_LABEL = { personal: "Personal", fleet: "Fleet / commercial", rental: "Rental", unknown: null } as const;

function Facts({ a, live }: { a: Analysis; live: Live | null }) {
  const l = a.listing;
  const d = a.decoded;
  const vinStatus = !l.vin ? null : a.vinCheck?.ok ? (d?.clean === false ? "Decoded with warnings" : "Valid") : "Invalid check digit";
  const liveAccidents = live?.accidentCount == null ? null : live.accidentCount === 0 ? "None reported" : `${live.accidentCount} reported`;
  // [label, listing says, VIN decode, live listing]
  const rows: [string, string | null, string | null, string | null][] = [
    ["Year", l.year?.toString() ?? null, d?.year?.toString() ?? null, live?.year?.toString() ?? null],
    ["Make", l.make, d?.make ?? null, live?.make ?? null],
    ["Model", l.model, d?.model ?? null, live?.model ?? null],
    ["Trim", null, d?.trim ?? null, live?.trim ?? null],
    ["Body", null, d?.body ?? null, null],
    ["Transmission", l.transmission === "unknown" ? null : cap(l.transmission), d?.transmission ?? null, null],
    ["Drive", null, d?.driveType ?? null, null],
    ["Fuel", null, d?.fuel ?? null, null],
    ["Price", money(l.price), null, money(live?.price ?? null)],
    ["Miles", miles(l.miles), null, miles(live?.miles ?? null)],
    ["Title", l.titleStatus === "unknown" ? null : cap(l.titleStatus), null, live?.cleanTitle ? "Clean (Carfax flag)" : null],
    ["Accidents", l.accident === "unknown" ? null : l.accident === "none" ? "None mentioned" : "Reported", null, liveAccidents],
    ["Exterior", cap(l.exteriorColor), null, live?.exteriorColor ?? null],
    ["Owners", l.ownerCount?.toString() ?? null, null, live?.ownerCount?.toString() ?? null],
    ["Prior use", USAGE_LABEL[l.usage], null, live ? USAGE_LABEL[live.usage] : null],
    ["Seller", l.sellerType === "unknown" ? null : cap(l.sellerType), null, live?.sellerName ?? (live?.sellerType !== "unknown" ? cap(live?.sellerType ?? null) : null)],
    ["Distance", miles(l.distanceMiles), null, null],
    ["VIN", l.vin, vinStatus, null],
  ];
  const shown = rows.filter(([, x, y, z]) => x || y || z);
  return (
    <Panel title="The car">
      <div className="overflow-x-auto">
        <table className="nums w-full">
          <thead>
            <tr className="text-left text-sm text-muted">
              <th className="py-2 pr-4 font-medium" />
              <th className="py-2 pr-4 font-medium">Listing says</th>
              <th className="py-2 pr-4 font-medium">VIN decode (NHTSA)</th>
              {live && <th className="py-2 font-medium">Live listing ({live.source})</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map(([label, x, y, z]) => (
              <tr key={label}>
                <th scope="row" className="py-2 pr-4 text-left font-normal text-muted">{label}</th>
                <td className="py-2 pr-4 break-all">{x ?? "—"}</td>
                <td className="py-2 pr-4 break-all">{y ?? "—"}</td>
                {live && <td className="py-2 break-all">{z ?? "—"}</td>}
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
          <h3 className="font-semibold">Recalls</h3>
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
                <p className="mt-2 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
                  {parkIt.length} recall{parkIt.length > 1 ? "s say" : " says"} don&apos;t drive or park it outside until fixed.
                </p>
              )}
              <ul className="mt-2 space-y-2">
                {a.recalls.slice(0, 5).map((r) => (
                  <li key={r.campaign} className="text-sm">
                    <span className="font-medium">{r.component}</span>
                    <span className="text-muted"> · {r.campaign}{r.reportDate ? ` · ${r.reportDate.slice(0, 4)}` : ""}</span>
                  </li>
                ))}
              </ul>
              {a.recalls.length > 5 && <p className="mt-1 text-sm text-muted">+ {a.recalls.length - 5} more</p>}
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
            <ul className="mt-1 space-y-2 text-sm">
              {a.ratings.map((r) => (
                <li key={r.vehicleId}>
                  <p className="text-sm text-muted">{r.description}</p>
                  <p>
                    Overall <Stars n={r.overall} />
                  </p>
                  <p className="text-sm text-muted">
                    Front {r.front ?? "–"} · Side {r.side ?? "–"} · Rollover {r.rollover ?? "–"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="font-semibold">Owner complaints</h3>
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
                  <p className="mt-2 text-sm text-muted">Most common areas: have your mechanic check these.</p>
                  <ul className="mt-1 space-y-1 text-sm">
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

/** A link with no VIN in it. The server never opens links, so offer the two ways that work. */
function LinkOnly({ host }: { host: string | null }) {
  return (
    <div className="space-y-4">
      <Panel title={`VinVerdict can't open ${host ?? "that link"} itself`}>
        <p className="text-sm text-muted">
          Listing sites block apps from reading their pages, and Facebook needs your login. Letting a server open any pasted link is also a
          security risk. Two ways that work:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <span className="font-medium">On a phone:</span> take screenshots of the listing (title and price, details, description) and press{" "}
            <span className="font-medium">Read screenshots</span> at the top. They&apos;re read on your phone.
          </li>
          <li>
            <span className="font-medium">On a computer, Paste &amp; check:</span> on the listing page press{" "}
            <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">A</kbd>, then{" "}
            <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">C</kbd>, come
            back and press <span className="font-medium">Paste &amp; check</span> at the top. Menus and ads are fine; VinVerdict picks out the price,
            miles, VIN and history box.
          </li>
        </ol>
        <p className="mt-3 text-sm text-muted">
          Or type the basics in the box, like &quot;2017 Accord EX-L 100k miles $9,000&quot;, or paste just the VIN to check the car and find where
          it&apos;s listed.
        </p>
      </Panel>
      <div className="pointer-coarse:hidden">
        <Bookmarklet />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-8">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}
