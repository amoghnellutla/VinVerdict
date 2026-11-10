/**
 * Facts for the home page's playground, worked out from the recorded demo
 * examples with the same code a live check uses (so nothing on the fun page
 * can disagree with the real result). Pure; dated by each recording.
 */

import camry from "@/lib/demo/data/camry.json";
import lexus from "@/lib/demo/data/lexus.json";
import scam from "@/lib/demo/data/scam.json";
import type { DemoData } from "@/lib/demo/examples";
import { summarizeHistory } from "@/lib/history/summary";
import { mergeLive } from "@/lib/live/merge";
import { fmt, valueCar } from "@/lib/value/estimate";
import { buildVerdict } from "@/lib/verdict";

export type PlayData = {
  vins: { label: string; vin: string }[];
  /** Fair price for the scam ad's car (recorded real data), for "far below market". */
  scamFair: number | null;
  deck: { photos: string[]; cards: string[]; verdict: string };
};

const VERDICT_TEXT = { hide: "Walk away", verify: "Check it in person first", caution: "Go carefully", clear: "No red flags so far" } as const;

function worked(d: DemoData) {
  const asOf = new Date(`${d.recordedAt}T12:00:00Z`);
  const live = d.price.live;
  const history = d.price.history ? summarizeHistory(d.price.history, asOf) : null;
  const listing = mergeLive(d.analysis.listing, live);
  const result = buildVerdict({ ...d.analysis, live, history }, {}, asOf);
  const v = d.price.sources
    ? valueCar(d.price.sources, { price: listing.price, miles: listing.miles, sellerType: listing.sellerType, accident: listing.accident, titleStatus: listing.titleStatus, usage: listing.usage })
    : null;
  return { listing, live, history, result, v };
}

export function playData(): PlayData {
  const L = lexus as unknown as DemoData;
  const S = scam as unknown as DemoData;
  const C = camry as unknown as DemoData;
  const lx = worked(L);
  const sc = worked({ ...S, analysis: { ...S.analysis, listing: { ...S.analysis.listing, price: null } } });

  const name = "2016 Lexus RX 350";
  const cards: string[] = [`${name} with ${lx.listing.miles?.toLocaleString("en-US")} miles`];
  if (lx.live?.price) cards.push(`Listed at ${fmt(lx.live.price)}${lx.live.sellerName ? ` by ${lx.live.sellerName}` : ""}`);
  if (lx.v && lx.live?.price) {
    const over = lx.live.price - lx.v.fair;
    cards.push(over > 100 ? `Fair price is about ${fmt(lx.v.fair)}: ${fmt(over)} over` : `Fair price is about ${fmt(lx.v.fair)}`);
  }
  if (lx.live?.accidentCount) cards.push(`Listing data shows ${lx.live.accidentCount} accident${lx.live.accidentCount > 1 ? "s" : ""}`);
  const first = L.price.history?.map((h) => h.firstSeen).filter((x): x is string => !!x).sort()[0];
  if (lx.history?.stints.length) cards.push(`Listed by ${lx.history.stints.length} sellers${first ? ` since ${first.slice(0, 4)}` : ""}`);
  if (L.analysis.recalls) cards.push(`${L.analysis.recalls.length} recalls for every 2016 RX 350`);
  const stars = L.analysis.ratings?.find((r) => r.overall)?.overall;
  if (stars) cards.push(`${stars} out of 5 stars in NHTSA crash tests`);
  if (L.analysis.complaints) cards.push(`${L.analysis.complaints.total} owner complaints filed with NHTSA`);

  return {
    vins: [
      { label: `${C.analysis.decoded?.year} ${C.analysis.decoded?.model}`, vin: C.analysis.listing.vin! },
      { label: name, vin: L.analysis.listing.vin! },
    ],
    scamFair: sc.v?.fair ?? null,
    deck: { photos: L.price.live?.photos ?? [], cards, verdict: VERDICT_TEXT[lx.result.verdict] },
  };
}
