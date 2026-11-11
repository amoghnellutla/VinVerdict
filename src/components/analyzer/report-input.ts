/**
 * Gathers everything the result page shows into the report builder's input
 * (lib/report/markdown.ts). One place, used by the page and its tests, so the
 * downloadable report can't drift from the page.
 */

import { vinParts } from "@/components/VinDecode";
import type { Analysis } from "@/lib/analyze";
import { outTheDoor } from "@/lib/costs/outTheDoor";
import { DEFAULT_MILES_PER_YEAR } from "@/lib/costs/running";
import type { Decision, Finding } from "@/lib/decision";
import type { ProofSummary } from "@/lib/evidence/combine";
import type { Finding as ProofFinding, ProofKind, ProofSource } from "@/lib/evidence/parse";
import type { StateCode } from "@/lib/geo/zip";
import type { ReportAnswers } from "@/lib/history-report";
import type { HistoryRecord } from "@/lib/history/parse";
import type { HistorySummary } from "@/lib/history/summary";
import { buildChecklist } from "@/lib/inspection";
import type { LiveListing } from "@/lib/live/parse";
import { buyerProtection } from "@/lib/protection";
import { checkRows } from "@/lib/report/checks";
import { buyingDay, carFactRows, dealerCheck, photoCheck } from "@/lib/report/content";
import { costPerYear, defaultOtdInput, runningFor, type CostParts } from "@/lib/report/costs";
import type { ReportInput } from "@/lib/report/markdown";
import { reportSourceItems } from "@/lib/report/sources";
import type { SellerChecklist } from "@/lib/scam/rules";
import { sellerMessage } from "@/lib/seller-message";
import type { ReplyHit } from "@/lib/seller-replies";
import { basisText, priceBasis } from "@/lib/value/basis";
import type { PriceSources, Valuation } from "@/lib/value/estimate";
import { PRIVATE_ONLY, QUESTIONS } from "./Checklist";
import { MANUAL_VERDICT } from "./ManualCompare";
import { shownPhotos } from "./PhotoCheck";

export type ReportState = {
  generated: string;
  listingUrl: string | null;
  /** The buyer's state (their saved ZIP), for costs and paperwork. */
  state: StateCode;
  name: string;
  /** The check as returned, and as shown (live facts and corrected miles merged in). */
  a: Analysis;
  m: Analysis;
  decision: Decision;
  hits: Finding[];
  goodVin: string | null;
  make: string | null;
  live: LiveListing | null;
  history: HistorySummary | null;
  rawHistory: HistoryRecord[] | null;
  sources: PriceSources | null;
  valuation: Valuation | null;
  milesUsed: number | null;
  recordedAt: string | null;
  answers: ReportAnswers;
  proofSum: ProofSummary;
  proofs: { kind: ProofKind; findings: ProofFinding[]; source: ProofSource; screenshot: boolean }[];
  checklist: SellerChecklist;
  replies: string;
  replyHits: ReplyHit[];
  knownIssues: { title: string; label: string }[];
  phrase: string;
  selling: boolean;
  /** What the cost panels last showed; missing ones are worked out with the page's defaults. */
  parts: CostParts;
};

export function reportInput(s: ReportState): ReportInput {
  const { a, m, live, sources, valuation, parts: p, state } = s;
  const dealer = m.listing.sellerType === "dealer";
  const otdIn = p.otd ? null : defaultOtdInput(m, state);
  const comps = sources?.sold ?? sources?.active ?? null;
  const perYearDefault = p.perYear ? null : costPerYear(m, valuation, comps, state, 3, DEFAULT_MILES_PER_YEAR);
  const runDefault = p.running ? null : runningFor(m, 0, DEFAULT_MILES_PER_YEAR);
  return {
    generated: s.generated,
    site: "vinverdict.vercel.app",
    listingUrl: s.listingUrl,
    name: s.name,
    a: m,
    decision: s.decision,
    vinParts: s.goodVin ? vinParts(s.goodVin, a.decoded) : null,
    facts: carFactRows(a, live),
    live,
    history: s.history,
    valuation,
    priceSources: sources,
    basis: sources?.comps ? basisText(priceBasis({ ...sources.comps, target: { ...sources.comps.target, miles: s.milesUsed ?? sources.comps.target.miles } })) : null,
    recordedAt: s.recordedAt,
    answers: s.answers,
    answersFrom: s.proofSum.from,
    checks: checkRows(s.goodVin, s.make, live, s.proofSum.rating, s.proofs),
    photos: photoCheck(shownPhotos(live?.photos ?? []), dealer).photos,
    photoSteps: photoCheck([], dealer),
    dealer,
    checklist: s.checklist,
    checklistQuestions: dealer ? QUESTIONS.filter((x) => !PRIVATE_ONLY.includes(x.key)) : QUESTIONS,
    message: sellerMessage({
      carName: s.name, listing: m.listing, hits: s.hits, checklist: s.checklist, recallCount: a.recalls?.length ?? null,
      topComplaint: a.complaints?.topComponents[0]?.component ?? null, knownIssues: s.knownIssues, phrase: s.phrase,
    }),
    replies: s.replies,
    replyHits: s.replyHits,
    dealerSteps: dealer ? dealerCheck(live?.sellerName ?? null) : null,
    protection: buyerProtection({ text: m.text, sourceHost: m.listing.sourceHost, sellerType: m.listing.sellerType, year: m.decoded?.year ?? m.listing.year, price: m.listing.price, miles: m.listing.miles }),
    inspection: buildChecklist({
      year: m.vehicle?.year ?? null, make: m.vehicle?.make ?? null, model: m.vehicle?.model ?? null,
      displacementL: m.decoded?.displacementL ?? null,
      cvt: /cvt|continuously variable/i.test(m.decoded?.transmission ?? "") || /\bcvt\b/i.test(m.text),
      complaintAreas: m.complaints?.topComponents.map((c) => c.component) ?? [],
    }),
    buying: buyingDay(a.listing.vin, m.listing.sellerType, state),
    otd: p.otd ? { ...p.otd, fromPage: true } : otdIn ? { input: otdIn, result: outTheDoor(otdIn), fromPage: false } : null,
    perYear: p.perYear ? { ...p.perYear, fromPage: true } : perYearDefault ? { years: 3, milesPerYear: DEFAULT_MILES_PER_YEAR, state, result: perYearDefault, fromPage: false } : null,
    running: p.running ? { ...p.running, fromPage: true } : runDefault ? { ...runDefault, fromPage: false } : null,
    manual: p.manual ? { ...p.manual, verdictText: MANUAL_VERDICT[p.manual.result.verdict].text } : null,
    sources: reportSourceItems({
      a: m, hits: s.selling ? [] : s.hits, live, sources, history: s.rawHistory, recordedAt: s.recordedAt, report: s.answers,
      proofs: s.proofs.map((x) => ({ source: x.source, screenshot: x.screenshot })),
    }),
  };
}
