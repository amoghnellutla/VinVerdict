/**
 * Read the proof a person attaches in "Check it yourself": a screenshot (read
 * on their device) or pasted text from a Carfax or AutoCheck report, NICB
 * VINCheck, a recall lookup, NMVTIS or an auction page. Pure and
 * browser-safe; nothing here touches the network.
 *
 * Accuracy rule (lib/history-report.ts): only clear, unambiguous phrases
 * count. Anything the reader isn't sure about is left out rather than
 * guessed, and the person can always set the answers themselves.
 */

import type { Damage, ReportAnswers } from "@/lib/history-report";
import { checkVin } from "@/lib/vin";

/** Which "Check it yourself" row a proof belongs to. */
export type ProofKind = "history" | "nhtsa" | "maker" | "nicb" | "nmvtis" | "google";
export type ProofSource = "carfax" | "autocheck" | "nicb" | "nhtsa" | "maker" | "nmvtis" | "auction" | "unknown";
export type FindingStatus = "good" | "bad" | "warn" | "info";
export type Finding = { key: string; label: string; status: FindingStatus };

export type ProofRead = {
  source: ProofSource;
  kind: ProofKind | null;
  /** Valid VINs found in the text (check digit passes). */
  vins: string[];
  findings: Finding[];
  /** History-report answers this proof settles. */
  report: Partial<ReportAnswers>;
  odometer: { miles: number; date: string | null } | null;
  openRecalls: number | null;
  /** Owner count the report states, or null. */
  owners?: number | null;
};

export const SOURCE_NAME: Record<ProofSource, string> = {
  carfax: "Carfax",
  autocheck: "AutoCheck",
  nicb: "NICB VINCheck",
  nhtsa: "NHTSA recall lookup",
  maker: "Maker recall lookup",
  nmvtis: "NMVTIS",
  auction: "Auction listing",
  unknown: "Unrecognized",
};

const KIND_OF: Record<ProofSource, ProofKind | null> = {
  carfax: "history",
  autocheck: "history",
  nicb: "nicb",
  nhtsa: "nhtsa",
  maker: "maker",
  nmvtis: "nmvtis",
  auction: "google",
  unknown: null,
};

/** Text as OCR or a copy gives it: one line, single spaces, "®" and similar dropped. */
function tidy(text: string): string {
  return text.replace(/[®©™]/g, "").replace(/\s+/g, " ").trim();
}

export function classifyProof(text: string): ProofSource {
  const t = tidy(text).toLowerCase();
  // NICB's results page mentions Carfax too, so it goes first.
  if (/vincheck|national insurance crime bureau|\bnicb\b/.test(t)) return "nicb";
  if (/autocheck|experian/.test(t)) return "autocheck";
  if (/carfax/.test(t)) return "carfax";
  if (/nmvtis|national motor vehicle title/.test(t)) return "nmvtis";
  if (/copart|\biaai\b|insurance auto auctions?|salvage auction|auction (lot|sale date)/.test(t)) return "auction";
  if (/nhtsa|safercar|unrepaired recalls?/.test(t)) return "nhtsa";
  if (/recall/.test(t) && /toyota|lexus|honda|acura|mazda|subaru|nissan|hyundai|kia|ford|chevrolet|gm\b/.test(t)) return "maker";
  return "unknown";
}

export function findVins(text: string): string[] {
  const found = text.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) ?? [];
  return [...new Set(found)].filter((v) => checkVin(v).ok);
}

const SEVERITY: Damage[] = ["none", "minor", "moderate", "severe"];
const worse = (a: Damage | undefined, b: Damage): Damage => (!a || a === "unknown" || SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a);
const num = (s: string) => Number(s.replace(/,/g, ""));

/** Recall counts as recall lookups word them. */
function openRecalls(t: string): number | null {
  if (/\b(no|0|zero) (open|unrepaired|incomplete|outstanding) (safety )?recalls?\b/i.test(t)) return 0;
  const m = t.match(/\b(\d{1,2}) (open|unrepaired|incomplete|outstanding) (safety )?recalls?\b/i);
  if (m) return Number(m[1]);
  if (/recall status:? (incomplete|remedy not yet available)/i.test(t)) return 1;
  return null;
}

/** Carfax and AutoCheck: accidents, title, owners, use, odometer. */
function readHistoryReport(t: string, src: "carfax" | "autocheck", out: ProofRead) {
  const name = SOURCE_NAME[src];
  const add = (f: Finding) => out.findings.push(f);

  // Accidents and damage. "No accidents or damage reported" contains "damage reported", so the "no" check comes first.
  let damage: Damage | undefined;
  const noDamage = /no (accidents? or damage|accidents?|damage) reported/i.test(t);
  const t2 = t.replace(/no (accidents? or damage|accidents?|damage) reported/gi, " ");
  for (const m of t2.matchAll(/\b(minor|moderate|severe|functional|disabling) damage\b/gi)) {
    const lvl = m[1].toLowerCase();
    damage = worse(damage, lvl === "minor" ? "minor" : lvl === "moderate" || lvl === "functional" ? "moderate" : "severe");
  }
  if (/air ?bags? deployed|structural damage|frame damage/i.test(t2)) damage = worse(damage, "severe");
  if (!damage && /\b(accident|damage) reported\b|\b\d+ accidents?\b/i.test(t2)) damage = worse(damage, "moderate");
  if (damage) {
    out.report.damage = damage;
    add({ key: "damage", label: `${name}: ${damage === "severe" ? "severe damage (structural or airbag)" : `${damage} damage`} reported`, status: "bad" });
  } else if (noDamage) {
    out.report.damage = "none";
    add({ key: "damage", label: `${name}: no accidents or damage reported`, status: "good" });
  }

  // Title.
  if (/\b(salvage|rebuilt|reconstructed|flood|junk|lemon|fire) (title|brand)\b(?! problems? (none|no))/i.test(t) && !/no (salvage|rebuilt|flood|junk|lemon)/i.test(t)) {
    out.report.title = "branded";
    add({ key: "title", label: `${name}: branded title (salvage, rebuilt, flood or similar)`, status: "bad" });
  } else if (/no (reported )?(major )?(state )?title brands?|guaranteed no problem|no title (problems?|brands?|issues?)|clean title/i.test(t)) {
    out.report.title = "clean";
    add({ key: "title", label: `${name}: no title brands`, status: "good" });
  }

  // Owners.
  const owners = t.match(/\bowners?\s*[-:]\s*(\d{1,2})\b/i) ?? t.match(/\b(\d{1,2})\s+(previous\s+)?owners?\b/i) ?? t.match(/\b(\d)-owner\b/i);
  if (owners) {
    const n = Number(owners[1]);
    if (n >= 1 && n <= 20) {
      out.owners = n;
      add({ key: "owners", label: `${name}: ${n} owner${n > 1 ? "s" : ""}`, status: n >= 4 ? "warn" : "info" });
    }
  }

  // Use.
  const use = t.match(/(vehicle usage|types? of owners?|usage)\s*:?\s*((personal|lease|rental|fleet|commercial|taxi|government|police|corporate)([\s,/&]+(and\s+)?(personal|lease|rental|fleet|commercial|taxi|government|police|corporate))*)/i);
  if (use) {
    const words = use[2].toLowerCase();
    const risky = /rental|fleet|commercial|taxi|government|police|corporate/.test(words);
    out.report.commercial = risky;
    add({ key: "use", label: `${name}: used as ${words.replace(/\s*[,/&]\s*/g, ", ")}`, status: risky ? "warn" : "info" });
  }

  // Odometer.
  const odo = t.match(/last reported odometer:?\s*([\d,]{3,9})\s*(?:mi(?:les)?)?\s*\(?(\d{1,2}\/\d{1,2}\/\d{4})?/i);
  if (odo && num(odo[1]) > 0) out.odometer = { miles: num(odo[1]), date: odo[2] ?? null };
  // Carfax's header: "126,357 mi | VIN: 4T1B11HK8JU145889" (real case 34).
  const head = !out.odometer ? t.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,6})\s*mi\b\s*\|?\s*VIN\b/i) : null;
  if (head && num(head[1]) > 0) out.odometer = { miles: num(head[1]), date: null };
  if (/odometer (problem|rollback|discrepancy|not actual|exceeds mechanical)|not actual mileage/i.test(t)) {
    add({ key: "odometer", label: `${name}: odometer problem reported`, status: "bad" });
  }

  if (/duplicate title/i.test(t)) add({ key: "duplicate", label: `${name}: duplicate title issued (ask why: often a lost title, sometimes hiding a lien)`, status: "info" });
  // The score sits just above "Similar vehicles usually range between X and Y"; anything looser is skipped.
  const near = t.match(/\b(\d{1,3})\b[^\d]{0,40}similar vehicles usually range between (\d{1,3}) and (\d{1,3})/i);
  const labelled = t.match(/autocheck score:?\s*(\d{1,3})\b/i);
  const range = t.match(/range between (\d{1,3}) and (\d{1,3})/i);
  const score = labelled?.[1] ?? near?.[1];
  if (src === "autocheck" && score && range) {
    const s = Number(score);
    const [lo, hi] = [Number(range[1]), Number(range[2])];
    if (s <= 100) add({ key: "score", label: `AutoCheck score ${s} (similar cars score ${lo}–${hi})`, status: s > hi ? "good" : s < lo ? "warn" : "info" });
  }
  const services = t.match(/(\d{1,3}) service history records?/i);
  if (services) add({ key: "service", label: `${name}: ${services[1]} service records`, status: "info" });
}

/** NICB VINCheck: theft and insurance total-loss (salvage) records. */
function readNicb(t: string, out: ProofRead) {
  for (const m of t.matchAll(/has\s+(not\s+)?been\s+identified\s+as\s+a\s+vehicle\s+listed\s+in\s+the\s+vincheck\W{0,3}\s*(theft|salvage|total loss)/gi)) {
    const clear = !!m[1];
    const theft = m[2].toLowerCase() === "theft";
    out.findings.push(
      theft
        ? { key: "theft", label: clear ? "NICB: no theft record" : "NICB: reported stolen", status: clear ? "good" : "bad" }
        : { key: "total-loss", label: clear ? "NICB: no insurance total-loss record" : "NICB: insurance total loss (salvage) record", status: clear ? "good" : "bad" },
    );
  }
}

export function readProof(text: string, hint: ProofKind | null = null): ProofRead {
  const t = tidy(text);
  const source = classifyProof(t);
  const out: ProofRead = { source, kind: KIND_OF[source] ?? hint, vins: findVins(t), findings: [], report: {}, odometer: null, openRecalls: null };

  if (source === "carfax" || source === "autocheck") readHistoryReport(t, source, out);
  if (source === "nicb") readNicb(t, out);
  if (source === "nmvtis") {
    if (/no (title )?brands? (reported|found)|no brand records/i.test(t)) {
      out.report.title = "clean";
      out.findings.push({ key: "title", label: "NMVTIS: no title brands", status: "good" });
    } else if (/\b(junk|salvage|flood|rebuilt)\b.{0,30}\b(brand|record|reported)/i.test(t)) {
      out.report.title = "branded";
      out.findings.push({ key: "title", label: "NMVTIS: title brand or junk/salvage record", status: "bad" });
    }
  }
  if (source === "auction") {
    const dmg = t.match(/primary damage:?\s*([a-z /-]{3,30}?)(?=\s+(secondary|odometer|title|vin|lot|$))/i)?.[1];
    out.findings.push({ key: "auction", label: `Sold at a salvage auction${dmg ? ` (damage: ${dmg.toLowerCase().trim()})` : ""}`, status: "bad" });
  }

  // Recalls: on recall pages, and the "Open Recall Check" box on history reports.
  const recalls = openRecalls(t);
  if (recalls !== null && (source === "nhtsa" || source === "maker" || source === "carfax" || source === "autocheck" || hint === "nhtsa" || hint === "maker")) {
    out.openRecalls = recalls;
    const who = source === "unknown" ? (hint === "maker" ? "Maker" : "NHTSA") : SOURCE_NAME[source];
    out.findings.push({ key: "recalls", label: recalls === 0 ? `${who}: no open recalls` : `${who}: ${recalls} open recall${recalls > 1 ? "s" : ""}`, status: recalls === 0 ? "good" : "bad" });
  }
  return out;
}
