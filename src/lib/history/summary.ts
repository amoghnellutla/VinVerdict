/**
 * What a car's listing history says (PLAN.md §6): odometer rollbacks, a
 * "private" car that was just at a dealer, price cuts, how long it has been
 * for sale, and how often it has changed hands. Pure and browser-safe, so the
 * verdict updates the moment the price check returns.
 */

import type { ParsedListing } from "@/lib/listing/parse";
import type { RuleHit } from "@/lib/scam/rules";
import type { HistoryRecord } from "./parse";

/** One seller's run of listings (records from the same seller close together). */
export type Stint = {
  seller: string;
  sellerType: HistoryRecord["sellerType"];
  place: string | null;
  url: string | null;
  firstSeen: string;
  lastSeen: string;
  firstPrice: number | null;
  lastPrice: number | null;
  miles: number | null;
  isNew: boolean;
};

export type HistorySummary = {
  records: number;
  /** Oldest first. */
  stints: Stint[];
  /** Stints seen in the last few days: on sale now. */
  active: Stint[];
  /** When the seller(s) listing it now started, and days since. Earlier sellers aren't counted in. */
  forSaleSince: string | null;
  daysListed: number | null;
  /** Sellers that had it earlier in this same time on sale (it changed hands, e.g. through an auction). */
  earlierSellers: Stint[];
  priceCut: { from: number; to: number; since: string } | null;
  /** Highest odometer reading on record. `count` = readings that agree with it. */
  maxMiles: { miles: number; date: string; seller: string; count: number } | null;
  rollback: { from: number; fromDate: string; to: number; toDate: string; confirmed: boolean } | null;
  /** Separate times it was for sale as a used car (gaps of 90+ days). */
  salePeriods: { start: string; end: string }[];
  states: string[];
};

const ACTIVE_DAYS = 10;
const SAME_STINT_DAYS = 60;
const NEW_PERIOD_DAYS = 90;
const RECENT_DEALER_DAYS = 180;
const DAY_MS = 86_400_000;

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const daysBetween = (a: string, b: Date) => Math.max(0, Math.floor((b.getTime() - toDate(a).getTime()) / DAY_MS));
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const mi = (n: number) => `${n.toLocaleString("en-US")} miles`;
const monthYear = (s: string) => toDate(s).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
export const shortDate = (s: string) => toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** How far a reading must drop before it counts: 1,000 miles or 3%. */
const rollbackGap = (miles: number) => Math.max(1_000, miles * 0.03);

const sellerKey = (r: HistoryRecord) => (r.sellerName ?? r.host ?? "Unknown seller").toLowerCase();

export function summarizeHistory(records: HistoryRecord[], now: Date = new Date()): HistorySummary {
  const recs = [...records].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));

  // Stints: same seller, records within 60 days of each other.
  const stints: Stint[] = [];
  const open = new Map<string, Stint>();
  for (const r of recs) {
    const key = sellerKey(r);
    const s = open.get(key);
    if (s && s.isNew === r.isNew && daysBetween(s.lastSeen, toDate(r.firstSeen)) <= SAME_STINT_DAYS) {
      if (r.lastSeen > s.lastSeen) s.lastSeen = r.lastSeen;
      if (r.price !== null) s.lastPrice = r.price;
      if (r.miles !== null) s.miles = Math.max(s.miles ?? 0, r.miles);
      s.url = r.url ?? s.url;
      continue;
    }
    const stint: Stint = {
      seller: r.sellerName ?? r.host ?? "Unknown seller",
      sellerType: r.sellerType,
      place: [r.city, r.state].filter(Boolean).join(", ") || null,
      url: r.url,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      firstPrice: r.price,
      lastPrice: r.price,
      miles: r.miles,
      isNew: r.isNew,
    };
    stints.push(stint);
    open.set(key, stint);
  }

  const active = stints.filter((s) => daysBetween(s.lastSeen, now) <= ACTIVE_DAYS);

  // Separate times on sale as a used car.
  const salePeriods: { start: string; end: string }[] = [];
  for (const s of [...stints].filter((x) => !x.isNew).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))) {
    const last = salePeriods[salePeriods.length - 1];
    if (last && daysBetween(last.end, toDate(s.firstSeen)) <= NEW_PERIOD_DAYS) {
      if (s.lastSeen > last.end) last.end = s.lastSeen;
    } else salePeriods.push({ start: s.firstSeen, end: s.lastSeen });
  }
  const current = active.length ? salePeriods.find((p) => active.some((s) => s.firstSeen >= p.start && s.lastSeen <= p.end)) ?? null : null;

  // Price cut: one seller lowering its own asking price. Another seller's price isn't a cut (a car that
  // went through an auction to a cheaper dealer), and a first price over 1.5× the price now is more likely a
  // list-price or "retail value" figure than an asking price, so it isn't counted.
  let priceCut: HistorySummary["priceCut"] = null;
  if (current) {
    for (const s of active) {
      if (s.lastPrice === null) continue;
      const own = recs.filter((r) => !r.isNew && r.price !== null && r.firstSeen >= current.start && sellerKey(r) === s.seller.toLowerCase());
      const top = own.reduce<HistoryRecord | null>((m, r) => (!m || r.price! > m.price! ? r : m), null);
      if (!top || top.price! > s.lastPrice * 1.5) continue;
      const cut = top.price! - s.lastPrice;
      if (cut >= Math.max(200, top.price! * 0.02) && (!priceCut || cut > priceCut.from - priceCut.to)) priceCut = { from: top.price!, to: s.lastPrice, since: top.firstSeen };
    }
  }

  // Odometer: the highest reading so far, and any later reading clearly below it.
  let maxMiles: HistorySummary["maxMiles"] = null;
  let rollback: HistorySummary["rollback"] = null;
  for (const r of recs) {
    if (r.miles === null) continue;
    if (maxMiles && r.miles < maxMiles.miles - rollbackGap(maxMiles.miles)) {
      rollback ??= { from: maxMiles.miles, fromDate: maxMiles.date, to: r.miles, toDate: r.firstSeen, confirmed: maxMiles.count >= 2 };
      continue;
    }
    if (!maxMiles || r.miles > maxMiles.miles) {
      const agreeing: number = maxMiles && maxMiles.miles >= r.miles - rollbackGap(r.miles) ? maxMiles.count : 0;
      maxMiles = { miles: r.miles, date: r.firstSeen, seller: r.sellerName ?? r.host ?? "a seller", count: agreeing + 1 };
    } else if (r.miles >= maxMiles.miles - rollbackGap(maxMiles.miles)) maxMiles.count++;
  }

  const since = active.length ? active.map((x) => x.firstSeen).sort()[0] : null;

  const states: string[] = [];
  for (const r of recs) if (r.state && states[states.length - 1] !== r.state) states.push(r.state);

  return {
    records: recs.length,
    stints,
    active,
    forSaleSince: since,
    daysListed: since ? daysBetween(since, now) : null,
    earlierSellers: current ? stints.filter((x) => !x.isNew && !active.includes(x) && x.firstSeen >= current.start && !active.some((a) => a.seller === x.seller)) : [],
    priceCut,
    maxMiles,
    rollback,
    salePeriods,
    states,
  };
}

/** Rule hits from the history, next to the listing being checked. */
export function historyRuleHits(pasted: ParsedListing, h: HistorySummary | null, now: Date = new Date()): RuleHit[] {
  if (!h || !h.records) return [];
  const hits: RuleHit[] = [];
  const isListing = pasted.kind !== "vin";

  if (h.rollback) {
    const r = h.rollback;
    hits.push({
      id: "history-rollback",
      action: r.confirmed ? "hide" : "flag",
      title: "Miles went down between listings",
      reason: `This VIN was listed with ${mi(r.from)} in ${monthYear(r.fromDate)}, then ${mi(r.to)} in ${monthYear(r.toDate)}. Odometers don't go backwards: this is a sign of a rollback${r.confirmed ? "" : " (or one listing's typo)"}. Compare the title's odometer reading and the service records with the dashboard.`,
    });
  }

  if (isListing && pasted.miles !== null && h.maxMiles && pasted.miles < h.maxMiles.miles - rollbackGap(h.maxMiles.miles)) {
    hits.push({
      id: "history-miles-lower",
      action: h.maxMiles.count >= 2 ? "hide" : "flag",
      title: "Fewer miles than the car had before",
      reason: `This listing says ${mi(pasted.miles)}, but ${h.maxMiles.seller} listed this VIN with ${mi(h.maxMiles.miles)} in ${monthYear(h.maxMiles.date)}${h.maxMiles.count >= 2 ? `, and ${h.maxMiles.count - 1} other listing${h.maxMiles.count > 2 ? "s" : ""} agree` : ""}. Miles never go down: odometer rollback, or the wrong VIN. Check the dashboard and the title yourself.`,
    });
  }

  // A private seller with a car a dealer was selling a few months ago.
  const lastDealer = [...h.stints].reverse().find((s) => s.sellerType === "dealer" && !s.isNew) ?? null;
  if (isListing && pasted.sellerType === "private" && lastDealer && daysBetween(lastDealer.lastSeen, now) <= RECENT_DEALER_DAYS) {
    const ago = daysBetween(lastDealer.lastSeen, now);
    const stillThere = ago <= ACTIVE_DAYS;
    hits.push({
      id: "history-dealer-recent",
      action: "flag",
      title: stillThere ? "A dealer is selling this car too" : "This car was at a dealer recently",
      reason: `${lastDealer.seller}${lastDealer.place ? ` (${lastDealer.place})` : ""} listed it${lastDealer.lastPrice ? ` for ${money(lastDealer.lastPrice)}` : ""} ${stillThere ? "and still does" : `until ${shortDate(lastDealer.lastSeen)}`}. Ask the seller when and where they bought it and to show the title in their name. People who flip dealer or auction cars as "private" sellers often hide problems${pasted.price && lastDealer.lastPrice && pasted.price < lastDealer.lastPrice * 0.85 ? "; and a price far under the dealer's can mean a copied listing" : ""}.`,
    });
  }

  const recentPeriods = h.salePeriods.filter((p) => daysBetween(p.end, now) <= 3 * 365);
  if (recentPeriods.length >= 3) {
    hits.push({
      id: "history-turnover",
      action: "flag",
      title: `For sale ${recentPeriods.length} separate times in 3 years`,
      reason: `Cars that change hands this often sometimes have a problem owners keep passing on. Ask why the last owners sold it and get the service records.`,
    });
  }

  if (h.priceCut) {
    hits.push({
      id: "history-price-cut",
      action: "info",
      title: `Price already cut from ${money(h.priceCut.from)} to ${money(h.priceCut.to)}`,
      reason: `Listed at ${money(h.priceCut.from)} on ${shortDate(h.priceCut.since)}. A seller who has cut the price once usually takes a little more off.`,
    });
  }

  // The pasted ad's own dealer, when the page names it ("DCH Wappingers Falls Toyota").
  const own = isListing && pasted.dealerName ? h.stints.filter((s) => sameSeller(s.seller, pasted.dealerName!)) : [];
  const ownActive = own.some((s) => h.active.includes(s));
  const others = h.active.filter((s) => !own.includes(s));
  const place = (s: Stint) => (s.place ? ` (${s.place})` : "");
  const line = (s: Stint) => `${s.seller}${place(s)} since ${shortDate(s.firstSeen)}${s.lastPrice ? ` for ${money(s.lastPrice)}` : ""}`;

  if (own.length && !ownActive && others.length) {
    // The ad's dealer stopped listing it, and another dealer lists it now: the ad is probably out of date.
    const last = own.reduce((a, b) => (b.lastSeen > a.lastSeen ? b : a));
    hits.push({
      id: "history-moved",
      action: "flag",
      title: "This ad may be out of date: another dealer lists the car now",
      reason: `${last.seller} last listed this VIN on ${shortDate(last.lastSeen)}. Since then: ${others.map(line).join("; ")}. Before you travel or pay a deposit, call ${last.seller} on a number you look up yourself and ask whether they still have it. A warranty or "certified" label in the old ad doesn't come with the car.`,
    });
  } else {
    const sellersNow = new Set(h.active.map((s) => s.seller.toLowerCase()));
    if (sellersNow.size >= 2) {
      const prices = h.active.map((s) => s.lastPrice).filter((p): p is number => p !== null);
      const gap = prices.length >= 2 ? Math.max(...prices) - Math.min(...prices) : 0;
      const earlier = h.earlierSellers.length ? ` Before that: ${h.earlierSellers.map((s) => `${s.seller}${place(s)}, ${shortDate(s.firstSeen)} to ${shortDate(s.lastSeen)}`).join("; ")}.` : "";
      hits.push({
        id: "history-two-sellers",
        action: "info",
        title: ownActive && others.length ? `Another dealer lists this same car${gap >= 500 ? ` for ${money(gap)} ${others.some((o) => o.lastPrice !== null && o.lastPrice === Math.min(...prices)) ? "less" : "more"}` : ""}` : `Listed by ${sellersNow.size} sellers at once`,
        reason: `Same VIN: ${[...h.active].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen)).map(line).join("; ")}.${earlier} One car can't be at two dealers: one ad is probably out of date (sites and feeds keep showing sold cars), or it's a wholesaler or consignment. Call each dealer on a number you look up yourself and ask who has the car and its title today. Buy from that one, use the lower price in your offer, and don't count on a warranty or "certified" label from the other dealer's ad.`,
      });
    }
  }
  return hits;
}

const SELLER_STOP = new Set(["of", "the", "inc", "llc", "co", "and", "auto", "autos", "motors", "group", "dealership", "cars"]);
const sellerWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !SELLER_STOP.has(w));

/** Two names for the same dealer ("DCH Wappingers Falls Toyota" / "Dch Wappingers Falls Toyota"): most distinctive words shared. */
export function sameSeller(a: string, b: string): boolean {
  const x = sellerWords(a);
  const y = new Set(sellerWords(b));
  if (!x.length || !y.size) return false;
  const shared = x.filter((w) => y.has(w)).length;
  return shared >= 2 && shared >= Math.min(x.length, y.size) * 0.6;
}

/** Plain one-line facts for the history panel. */
export function historyHighlights(h: HistorySummary): string[] {
  const out: string[] = [];
  const firstNew = h.stints.find((s) => s.isNew);
  if (firstNew) out.push(`Sold new around ${monthYear(firstNew.firstSeen)}${firstNew.place ? ` in ${firstNew.place}` : ""}.`);
  const used = h.salePeriods.length - (h.forSaleSince ? 1 : 0);
  if (used > 0) out.push(`Was for sale as a used car ${used === 1 ? "once" : `${used} times`} before now.`);
  if (h.forSaleSince && h.daysListed !== null) out.push(`On sale now for ${h.daysListed} day${h.daysListed === 1 ? "" : "s"} (since ${shortDate(h.forSaleSince)}).`);
  if (h.earlierSellers.length) out.push(`It changed hands during this time: ${h.earlierSellers.map((s) => `${s.seller} listed it ${shortDate(s.firstSeen)} to ${shortDate(s.lastSeen)}`).join("; ")}.`);
  if (h.states.length >= 2) out.push(`Listed in ${h.states.join(" → ")}. Moving between states is common through auctions; just check the title's history matches.`);
  return out;
}

/**
 * The car's latest odometer reading from a listing seen in the last 180 days.
 * Fills unknown miles (a bare VIN) so the price is for this car's miles, not
 * an average car's. Older readings are too stale to price on.
 */
export function recentMiles(records: HistoryRecord[], now: Date = new Date()): { miles: number; date: string } | null {
  const withMiles = records.filter((r) => r.miles !== null && daysBetween(r.lastSeen, now) <= RECENT_DEALER_DAYS);
  const latest = withMiles.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))[0];
  return latest ? { miles: latest.miles!, date: latest.lastSeen } : null;
}

/** The small part of the history kept with a saved car (My cars, Compare). */
export type SavedHistory = { listings: number; daysListed: number | null; cutFrom: number | null; rollback: boolean; flags: string[] };

export function savedHistory(h: HistorySummary, hits: RuleHit[]): SavedHistory {
  return {
    listings: h.stints.length,
    daysListed: h.daysListed,
    cutFrom: h.priceCut?.from ?? null,
    rollback: hits.some((x) => x.id === "history-rollback" || x.id === "history-miles-lower"),
    flags: hits.filter((x) => x.action !== "info").map((x) => x.title),
  };
}
