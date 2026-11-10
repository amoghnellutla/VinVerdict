"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { saveProofAction } from "@/app/actions/cars";
import { makeName } from "@/lib/format";
import { priceCheckAction, type PriceState } from "@/app/actions/price";
import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import { savedProof, summarizeProof } from "@/lib/evidence/combine";
import { accidentHistoryConfirmed, EMPTY_REPORT, mergeAnswers, type ReportAnswers } from "@/lib/history-report";
import { recentMiles, summarizeHistory } from "@/lib/history/summary";
import type { AccidentStatus, TitleStatus, Usage } from "@/lib/listing/parse";
import { mergeLive } from "@/lib/live/merge";
import type { LiveListing as Live } from "@/lib/live/parse";
import type { SellerChecklist } from "@/lib/scam/rules";
import { decide, EVIDENCE_LABEL, SEVERITY_LABEL, type Finding, type Severity } from "@/lib/decision";
import { ON_PAGE, raw, RULE_SOURCE } from "@/lib/sources";
import { fmt, revalue, valueCar, type ValueInput, type Valuation } from "@/lib/value/estimate";
import { buildVerdict } from "@/lib/verdict";
import { Bookmarklet } from "./Bookmarklet";
import { BuyerProtection } from "./BuyerProtection";
import { BuyingDay } from "./BuyingDay";
import { VinDecode } from "@/components/VinDecode";
import { findSameCar } from "@/lib/value/samecar";
import { CarGallery } from "./CarGallery";
import { SameCarCard } from "./SameCar";
import { CheckYourself, type Attached } from "./CheckYourself";
import { Checklist } from "./Checklist";
import { CostPerYear } from "./CostPerYear";
import { HistoryReport } from "./HistoryReport";
import { InspectionList } from "./InspectionList";
import { ListingHistory } from "./ListingHistory";
import { OutTheDoor } from "./OutTheDoor";
import { PriceCheck, type Details } from "./PriceCheck";
import { ReportSources } from "./ReportSources";
import { SectionNav } from "./SectionNav";
import { RunningCost } from "./RunningCost";
import { Safety } from "./Safety";
import { SectionTabs } from "./SectionTabs";
import { SellerMessage } from "./SellerMessage";
import { SellerReplies } from "./SellerReplies";
import { SaveToList } from "./SaveToList";
import { CopyButton } from "@/components/CopyButton";
import { shareSummary } from "@/lib/share-summary";
import { PhotoCheck } from "./PhotoCheck";
import { carId as listCarId } from "@/lib/workspace/local";
import { DealerCheck } from "./DealerCheck";
import { checkReplies } from "@/lib/seller-replies";
import { proofPhrase } from "@/lib/seller-message";
import { knownIssuesFor } from "@/lib/inspection";
import { VerdictCard } from "./VerdictCard";

const money = (n: number | null) => (n == null ? null : `$${n.toLocaleString("en-US")}`);
const miles = (n: number | null) => (n == null ? null : `${n.toLocaleString("en-US")} mi`);
const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : null);

const SEVERITY_STYLE: Record<Severity, string> = {
  stop: "bg-bad-soft text-bad",
  verify: "bg-warn-soft text-warn",
  note: "bg-surface-muted text-muted",
};

/** The lookup, with a lost connection or a server cut-off turned into a message instead of a broken page. */
async function safePriceCheck(prev: PriceState, form: FormData): Promise<PriceState> {
  try {
    return await priceCheckAction(prev, form);
  } catch {
    return { status: "error", message: "The lookup didn't come back: the connection dropped or the server took too long." };
  }
}

export function Result({ analysis: a, carId = null, saveNote = null, phoneMatches = [], guest = false, recorded = null, shots = [], onCheckVin = null }: {
  analysis: Analysis;
  carId?: number | null;
  saveNote?: string | null;
  phoneMatches?: { title: string }[];
  /** Demo visitor: nothing is saved; the live price check is rationed (bot check + daily limit). */
  guest?: boolean;
  /** Demo example: a price check recorded earlier, shown instead of the live button. */
  recorded?: { price: PriceState; recordedAt: string } | null;
  /** The listing screenshots the check was read from (local blob: previews), shown when there are no listing photos. */
  shots?: string[];
  /** Start a new check for a VIN (from "This may be the same car"). */
  onCheckVin?: ((vin: string) => void) | null;
}) {
  const [checklist, setChecklist] = useState<SellerChecklist>({});
  const [report, setReport] = useState<ReportAnswers>(EMPTY_REPORT);
  // Proof attached in "Check it yourself" (read on this device, never uploaded).
  const [proofs, setProofs] = useState<Attached[]>([]);
  const [purpose, setPurpose] = useState<"buy" | "sell">("buy");
  const [details, setDetails] = useState<Details>({ miles: null, trim: null });
  // Photos of a likely same car, shown only when the person asks.
  const [matchPhotos, setMatchPhotos] = useState(false);
  const [liveState, priceAction, pricePending] = useActionState(safePriceCheck, { status: "idle" } as PriceState);
  const priceState = recorded?.price ?? liveState;
  const done = priceState.status === "done" ? priceState : null;
  const live = done?.live ?? null;
  const sources = done?.sources ?? null;
  const rawHistory = done?.history ?? null;
  const history = useMemo(() => (rawHistory ? summarizeHistory(rawHistory) : null), [rawHistory]);
  const vinOnly = a.listing.kind === "vin";
  const selling = vinOnly && purpose === "sell";

  // What's known about miles and trim: the listing, then the live listing, then its listing history.
  // A VIN-only check can correct them; the price follows instantly (revalue).
  const known = useMemo(() => {
    const merged = mergeLive(a.listing, live);
    const seen = rawHistory ? recentMiles(rawHistory) : null;
    const carMiles = done?.car?.miles ?? null;
    const milesFound = merged.miles ?? seen?.miles ?? carMiles;
    const milesFrom = a.listing.miles !== null ? null
      : live?.miles != null ? `from its listing on ${live.source}`
        : seen ? `from its last listing (${seen.date})` : null;
    return { merged, miles: milesFound, milesFrom, trim: a.decoded?.trim ?? live?.trim ?? done?.car?.trim ?? null };
  }, [a, live, rawHistory, done]);
  const milesUsed = vinOnly && details.miles !== null ? (details.miles ? Number(details.miles) : null) : known.miles;
  const trimUsed = vinOnly && details.trim !== null ? details.trim.trim() || null : known.trim;
  const m: Analysis = useMemo(() => ({ ...a, listing: { ...known.merged, miles: milesUsed } }), [a, known, milesUsed]);

  // What the seller wrote back (checked on this device), and a random phrase for their "photo with a note".
  const [replies, setReplies] = useState("");
  const [phrase] = useState(() => proofPhrase());
  const replyHits = useMemo(() => checkReplies(replies, a.listing), [replies, a.listing]);
  const knownIssues = useMemo(
    () =>
      knownIssuesFor({
        year: a.vehicle?.year ?? null, make: a.vehicle?.make ?? null, model: a.vehicle?.model ?? null,
        displacementL: a.decoded?.displacementL ?? null,
        cvt: /cvt|continuously variable/i.test(a.decoded?.transmission ?? "") || /\bcvt\b/i.test(a.text),
        complaintAreas: [],
      }).map((k) => ({ title: k.title, label: k.source.label })),
    [a],
  );

  const goodVin = a.vinCheck?.ok ? a.listing.vin : null;
  const proofSum = useMemo(() => summarizeProof(proofs, goodVin, known.merged.miles), [proofs, goodVin, known]);
  // Your answers plus the proof: bad news wins (lib/history-report.ts).
  const answers = useMemo(() => mergeAnswers(report, proofSum.report), [report, proofSum]);

  // Owner: keep the findings with the saved car (labels only), a moment after the last change.
  const [proofSaved, setProofSaved] = useState(false);
  const proofTouched = useRef(false);
  useEffect(() => {
    if (!carId || (!proofs.length && !proofTouched.current)) return;
    proofTouched.current = true;
    const t = setTimeout(() => {
      void saveProofAction(carId, JSON.stringify(savedProof(proofs, goodVin))).then((r) => setProofSaved(r.ok));
    }, 800);
    return () => clearTimeout(t);
  }, [carId, proofs, goodVin]);

  const { result, valuation, sellV } = useMemo(() => {
    const first = buildVerdict({ ...a, live, phoneMatches, history, report: answers, proofHits: [...proofSum.hits, ...replyHits] }, checklist);
    if (!sources) return { result: first, valuation: null, sellV: null };
    const l = m.listing;
    const year = a.decoded?.year ?? l.year ?? done?.car?.year ?? null;
    const srcs = revalue(sources, { year, miles: milesUsed, trim: trimUsed });
    // Accidents: the history report first, then the listing; a seller admitting one counts too.
    const accident: AccidentStatus = checklist.anyAccidents === true ? "reported" : l.accident;
    const titleStatus: TitleStatus = answers.title === "branded" ? "branded" : answers.title === "clean" && l.titleStatus === "unknown" ? "clean" : l.titleStatus;
    const usage: Usage = answers.commercial ? "fleet" : l.usage;
    const base: ValueInput = {
      price: l.price, miles: milesUsed, sellerType: l.sellerType, accident, titleStatus, usage, damage: answers.damage,
      daysOnMarket: live?.daysOnMarket ?? history?.daysListed ?? null, highMiles: first.hits.some((h) => h.id === "high-miles"),
      priceCut: history?.priceCut ?? null,
    };
    const valuation = valueCar(srcs, base);
    // Selling your own car: what a private buyer pays, and a dealer's retail for comparison.
    const sellV = vinOnly
      ? {
          privateV: valueCar(srcs, { ...base, price: null, sellerType: "private", daysOnMarket: null, priceCut: null }),
          dealerV: valueCar(srcs, { ...base, price: null, sellerType: "dealer", daysOnMarket: null, priceCut: null }),
          active: srcs.active,
        }
      : null;
    // A real market value lets the "far below market" scam rules run.
    const result = valuation?.pctUnder != null ? buildVerdict({ ...a, live, phoneMatches, history, report: answers, proofHits: [...proofSum.hits, ...replyHits], valuePct: valuation.pctUnder }, checklist) : first;
    return { result, valuation, sellV };
  }, [a, m, live, sources, history, checklist, phoneMatches, answers, proofSum, replyHits, milesUsed, trimUsed, done, vinOnly]);

  if (a.listing.kind === "url") {
    return <LinkOnly host={a.listing.sourceHost} />;
  }

  const decision = decide({
    hits: result.hits,
    kind: a.listing.kind,
    hasVin: !!goodVin,
    hasPrice: m.listing.price != null,
    decoded: !!a.decoded,
    recalls: a.recalls?.length ?? null,
    report: answers,
    checklist,
    dealer: m.listing.sellerType === "dealer",
    adTitle: m.listing.titleStatus,
    listingStatesHistory: accidentHistoryConfirmed(m.listing, EMPTY_REPORT),
    priced: !!sources,
    price: valuation ? { label: valuation.label, low: valuation.low, high: valuation.high, confidence: valuation.confidence, unpriced: valuation.unpriced } : null,
  });
  const hits: Finding[] = decision.findings;
  const make = a.decoded?.make ?? a.listing.make;
  const recordedAt = recorded?.recordedAt ?? null;

  const priceCheck = (
    <PriceCheck
      a={m}
      carId={carId}
      state={priceState}
      action={priceAction}
      pending={pricePending}
      valuation={valuation}
      guest={guest}
      recordedAt={recordedAt}
      purpose={selling ? "sell" : "buy"}
      vinOnly={vinOnly}
      details={details}
      onDetails={setDetails}
      known={{ miles: known.miles, trim: known.trim, milesFrom: known.milesFrom }}
      sell={sellV}
    />
  );
  const historyReport = (
    <HistoryReport value={answers} onChange={(patch) => setReport((r) => ({ ...r, ...patch }))} from={proofSum.from} live={live} vin={goodVin} selling={selling} />
  );
  const checkYourself = (
    <CheckYourself
      vin={goodVin}
      make={make}
      live={live}
      proofs={proofs}
      onProofs={setProofs}
      summary={proofSum}
      savedNote={carId ? (proofSaved ? "The findings (not the images) are saved with this car in My cars." : "The findings (not the images) are saved with this car in My cars as you add them.") : null}
    />
  );
  const sourcesList = <ReportSources a={m} hits={selling ? [] : hits} live={live} sources={sources} history={rawHistory} recordedAt={recordedAt} report={answers} proofs={proofs} />;

  // A pasted ad without a VIN: one close match among the dealer cars for sale nearby (no extra lookup).
  const sameCar = !goodVin && !selling && sources?.comps ? findSameCar(m.listing, a.decoded?.year ?? m.listing.year, sources.comps.active) : null;
  const photos = live?.photos?.length ? live.photos : matchPhotos && sameCar?.comp.photos?.length ? sameCar.comp.photos : shots;
  const nav = selling
    ? [
        { id: "verdict", label: "Your car" },
        { id: "history-report", label: "History report" },
        { id: "price-check", label: "Value" },
        ...(history ? [{ id: "listing-history", label: "Listings" }] : []),
        { id: "safety", label: "Safety" },
        { id: "check-yourself", label: "Check it yourself" },
        { id: "sources", label: "Sources" },
      ]
    : [
        { id: "verdict", label: "Verdict" },
        { id: "history-report", label: "History report" },
        { id: "price-check", label: "Price" },
        { id: "check-yourself", label: "Check it yourself" },
        { id: "photo-check", label: "Photos" },
        { id: "safety", label: "Safety" },
        { id: "costs", label: "Costs" },
        { id: "before-you-buy", label: "Before you buy" },
        { id: "sources", label: "Sources" },
      ];

  return (
    <div className="space-y-10">
      <header id="verdict" className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <CarLine a={m} />
          <span className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm print:hidden">
            {!selling && (
              <SaveToList
                build={() => ({
                  id: listCarId(goodVin, a.text),
                  savedAt: new Date().toISOString(),
                  title: carName(m),
                  text: a.text,
                  vin: goodVin,
                  price: m.listing.price,
                  miles: m.listing.miles,
                  level: decision.level,
                  verdict: decision.title,
                  areas: decision.areas.map(({ area, status, line }) => ({ area, status, line })),
                  unknown: decision.areas.reduce((n, r) => n + r.unknown.length, 0),
                  warnings: decision.findings.filter((f) => f.severity !== "note").slice(0, 5).map((f) => f.title),
                  note: "",
                })}
              />
            )}
            {!selling && (
              <CopyButton
                text={shareSummary({ name: carName(m), price: m.listing.price, miles: m.listing.miles, vin: goodVin }, decision)}
                label="Copy summary"
                className="link"
              />
            )}
            <a href="#sources" className="link">Sources</a>
            <PrintButton />
          </span>
        </div>
        {goodVin && a.decoded && <VinDecode vin={goodVin} decoded={a.decoded} size="sm" />}
        {photos.length > 0 && (
          <CarGallery
            photos={photos}
            label={carName(m)}
            caption={
              live?.photos?.length
                ? `Photos from its listing${live.sellerName ? ` at ${live.sellerName}` : ""} (via ${live.source}).`
                : matchPhotos && sameCar
                  ? "Photos of the likely same car at a dealer (via Auto.dev). Confirm with the seller that it's the same car."
                  : "Your screenshots, shown on this device only."
            }
          />
        )}
        {vinOnly && <PurposeToggle value={purpose} onChange={setPurpose} />}

        {selling ? (
          <SellBox v={sellV?.privateV ?? null} looking={!done} />
        ) : (
          <VerdictCard d={decision} />
        )}
      </header>

      <SectionNav items={nav} />

      {sameCar && <SameCarCard match={sameCar} onCheckVin={onCheckVin} onUsePhotos={() => setMatchPhotos((x) => !x)} usingPhotos={matchPhotos} />}

      {!selling && hits.length > 0 && (
        <ul className="-mt-4 divide-y divide-border">
          {hits.map((h) => (
            <HitRow key={h.id} hit={h} vin={goodVin} />
          ))}
        </ul>
      )}

      {historyReport}
      {priceCheck}
      {history && <ListingHistory h={history} />}

      {selling ? (
        <>
          <Facts a={a} live={live} />
          <Safety a={m} />
          {checkYourself}
          {sourcesList}
        </>
      ) : (
        <>
          {checkYourself}
          {/* Listing photos with a public address can be reverse-searched; screenshots stay on the device, so those get the steps instead. */}
          <PhotoCheck photos={live?.photos ?? []} dealer={m.listing.sellerType === "dealer"} />
          <BuyerProtection a={m} />
          <Facts a={a} live={live} />
          <SectionTabs
            id="costs"
            title="What it'll cost"
            intro="The price is only the start: tax and fees on the day, then what it costs to own each year."
            tabs={[
              /* key: start the calculator again with the live price once it arrives */
              { id: "otd", label: "Out the door", content: <OutTheDoor key={live ? "live" : "pasted"} a={m} /> },
              { id: "year", label: "Cost per year", content: <CostPerYear key={`${m.listing.price}-${valuation?.fair ?? 0}`} a={m} valuation={valuation} comps={sources?.sold ?? sources?.active ?? null} /> },
              { id: "running", label: "Fuel and upkeep", content: <RunningCost a={m} /> },
            ]}
          />
          <Safety a={m} />
          <SectionTabs
            id="before-you-buy"
            title="Before you buy"
            intro="What to ask, what to have checked, and how to pay safely."
            tabs={[
              {
                id: "ask",
                label: "Ask the seller",
                content: (
                  <Checklist value={checklist} onChange={setChecklist} dealer={m.listing.sellerType === "dealer"}>
                    <SellerMessage
                      carName={carName(m)}
                      listing={m.listing}
                      hits={hits}
                      checklist={checklist}
                      recallCount={a.recalls?.length ?? null}
                      topComplaint={a.complaints?.topComponents[0]?.component ?? null}
                      knownIssues={knownIssues}
                      phrase={phrase}
                    />
                    <SellerReplies value={replies} onChange={setReplies} hits={replyHits} />
                    {m.listing.sellerType === "dealer" && <DealerCheck name={live?.sellerName ?? null} />}
                  </Checklist>
                ),
              },
              { id: "inspect", label: "Inspection list", content: <InspectionList a={m} /> },
              { id: "day", label: "Buying day", content: <BuyingDay vin={a.listing.vin} seller={m.listing.sellerType} /> },
            ]}
          />
          {sourcesList}
        </>
      )}

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

/** VIN only: checking a car to buy, or valuing your own. */
function PurposeToggle({ value, onChange }: { value: "buy" | "sell"; onChange: (v: "buy" | "sell") => void }) {
  const opts: ["buy" | "sell", string][] = [["buy", "I'm thinking of buying it"], ["sell", "It's mine: what's it worth?"]];
  return (
    <fieldset className="flex flex-wrap gap-1.5 print:hidden">
      <legend className="sr-only">Buying or selling</legend>
      {opts.map(([v, label]) => (
        <label
          key={v}
          className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
            value === v ? "border-foreground bg-foreground font-semibold text-background" : "border-border-strong text-muted hover:border-foreground hover:text-foreground"
          }`}
        >
          <input type="radio" name="purpose" className="sr-only" checked={value === v} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

/** Selling: the headline value, in the same place the buyer's verdict goes. */
function SellBox({ v, looking }: { v: Valuation | null; looking: boolean }) {
  const title = v?.unpriced ? "Needs an in-person appraisal" : v ? `About ${fmt(v.fair)} to a private buyer` : looking ? "Looking it up…" : "Confirm the details to price it";
  const text = v?.unpriced
    ? "Severe damage can't be priced from listing data. Details below."
    : v
      ? `Estimated range ${fmt(v.low)}–${fmt(v.high)}, from the advertised prices of similar cars near you (listed now or recently ended).${v.assumesClean ? " Priced as a car with no accidents: set the history report below if it has any." : ""}`
      : "VinVerdict looks the VIN up online, then prices it from similar cars near you.";
  return (
    <section className="rise d1 rounded-lg border-l-4 border-l-accent bg-accent-soft px-5 py-5">
      <h2 className="nums text-[2.2rem] font-extrabold tracking-tight sm:text-[2.9rem]">{title}</h2>
      <p className="mt-1 text-[1.05rem]">{text}</p>
    </section>
  );
}

/** The three things that matter most, inside the verdict box (feature 4). */
function HitRow({ hit, vin }: { hit: Finding; vin: string | null }) {
  const ref = RULE_SOURCE[hit.id];
  const here = ON_PAGE[hit.id];
  const decode = (hit.id === "vin-mismatch" || hit.id === "vin-decode-warning") && vin;
  return (
    <li className="grid gap-1 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
      <span className={`tag h-fit w-fit ${SEVERITY_STYLE[hit.severity]}`}>{SEVERITY_LABEL[hit.severity]}</span>
      <div>
        <p className="font-semibold">
          {hit.title} <span className="ml-1 whitespace-nowrap text-sm font-normal text-muted">· {EVIDENCE_LABEL[hit.evidence]}</span>
        </p>
        <p className="text-muted">{hit.reason}</p>
        {(ref || here || decode) && (
          <p className="mt-1 text-sm text-muted">
            Source:{" "}
            {decode ? (
              <ExternalLink href={raw.decode(vin)}>NHTSA&apos;s decode of this VIN</ExternalLink>
            ) : here ? (
              <a href={here.anchor} className="text-accent underline underline-offset-2 hover:decoration-2">{here.name}</a>
            ) : (
              <ExternalLink href={ref!.href}>{ref!.name}</ExternalLink>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

/** Opens every collapsed detail first, so the printout (or PDF) has the full report. */
function PrintButton() {
  return (
    <button
      type="button"
      className="link"
      onClick={() => {
        document.querySelectorAll<HTMLDetailsElement>("#result details").forEach((d) => (d.open = true));
        window.print();
      }}
    >
      Print or save as PDF
    </button>
  );
}

function carName(a: Analysis): string {
  const l = a.listing;
  const d = a.decoded;
  return [d?.year ?? l.year, d?.make ? makeName(d.make) : l.make, d?.model ?? l.model, d?.trim].filter(Boolean).join(" ") || "car";
}

/** What the result is about: the car's name as the title, then its asking price and miles. */
function CarLine({ a }: { a: Analysis }) {
  const l = a.listing;
  const name = carName(a);
  const facts = [
    l.price != null && { value: money(l.price), label: "asking" },
    l.miles != null && { value: miles(l.miles)?.replace(" mi", ""), label: l.miles === 1 ? "mile" : "miles" },
  ].filter((x): x is { value: string; label: string } => !!x && !!x.value);
  return (
    <div className="rise min-w-0">
      <h1 className="text-[2rem] leading-tight sm:text-[2.6rem]">{name === "car" ? "This car" : name}</h1>
      {facts.length > 0 && (
        <p className="nums mt-1 flex flex-wrap gap-x-6 text-lg">
          {facts.map((f) => (
            <span key={f.label}>
              <strong className="font-bold">{f.value}</strong> <span className="text-muted">{f.label}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

const USAGE_LABEL = { personal: "Personal", fleet: "Fleet / commercial", rental: "Rental", unknown: null } as const;

function Facts({ a, live }: { a: Analysis; live: Live | null }) {
  const l = a.listing;
  const d = a.decoded;
  const vinStatus = !l.vin ? null : a.vinCheck?.ok ? (d?.clean === false ? "Decoded with warnings" : "Valid") : "Invalid check digit";
  // A feed's "0 accidents" isn't a history report, so it's never shown as "none".
  const liveAccidents = live?.accidentCount ? `${live.accidentCount} reported` : live ? "Not confirmed" : null;
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
    ["Title", l.titleStatus === "unknown" ? null : cap(l.titleStatus), null, live?.cleanTitle ? "Carfax clean-title flag on the listing" : null],
    ["Accidents", l.accident === "unknown" ? null : l.accident === "none" ? "None mentioned" : "Reported", null, liveAccidents],
    ["Exterior", cap(l.exteriorColor), null, live?.exteriorColor ?? null],
    ["Owners", l.ownerCount?.toString() ?? null, null, null],
    ["Prior use", USAGE_LABEL[l.usage], null, live && (live.usage === "fleet" || live.usage === "rental") ? USAGE_LABEL[live.usage] : null],
    ["Seller", l.sellerType === "unknown" ? null : cap(l.sellerType), null, live?.sellerName ?? (live?.sellerType !== "unknown" ? cap(live?.sellerType ?? null) : null)],
    ["Distance", miles(l.distanceMiles), null, null],
    ["VIN", l.vin, vinStatus, null],
  ];
  const shown = rows.filter(([, x, y, z]) => x || y || z);
  return (
    <Panel title="The car">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="The car's details">
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
