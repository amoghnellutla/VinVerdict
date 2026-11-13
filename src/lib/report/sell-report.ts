/**
 * The report when the person is selling their own car. It reuses the full report's shared sections
 * (the car, its history report, listing history, safety and recalls, sources: the same facts and
 * links as the buyer's report) and replaces the buyer's parts (verdict, offer, buyer protection,
 * before you buy, buying day) with the seller's: what it's worth, selling safely, what buyers will
 * ask. Pure.
 */

import { SAFE_SELL } from "@/lib/assistant/sell";
import type { Valuation } from "@/lib/value/estimate";

export type SellReportInput = {
  private: Valuation;
  dealer: Valuation | null;
  listAt: number;
  zip: string | null;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Sections of the buyer's report kept for the seller, by their heading text (numbers are re-done). */
const SHARED = ["The car", "History report", "Listing history", "Safety", "Sources"];

/** "## 3. The car" → { title: "The car", body } for each top-level section of a built report. */
function sections(full: string): { heading: string; title: string; body: string }[] {
  const parts = full.split(/\n(?=## )/);
  return parts.slice(1).map((p) => {
    const [first, ...rest] = p.split("\n");
    const title = first.replace(/^##\s+(?:\d+\.\s+)?/, "");
    return { heading: first, title, body: rest.join("\n") };
  });
}

export function sellReport(full: string, o: { name: string; generated: string; site: string; vin: string | null; miles: number | null; recalls: number | null; historyKnown: string | null; sell: SellReportInput | null }): string {
  const out: string[] = [];
  const push = (...xs: string[]) => out.push(...xs);
  const p = o.sell?.private && !o.sell.private.unpriced ? o.sell.private : null;
  push(
    "---",
    "report: VinVerdict",
    "report_kind: selling",
    `generated: ${o.generated}`,
    `car: ${JSON.stringify(o.name)}`,
    `vin: ${o.vin ? JSON.stringify(o.vin) : "null"}`,
    `miles: ${o.miles ?? "null"}`,
    `private_sale_value_usd: ${p ? `[${p.low}, ${p.high}]` : "null"}`,
    `list_at_usd: ${p && o.sell ? o.sell.listAt : "null"}`,
    `dealer_retail_usd: ${o.sell?.dealer && !o.sell.dealer.unpriced ? o.sell.dealer.fair : "null"}`,
    "---",
    "",
    `# VinVerdict report: ${o.name} (selling it)`,
    "",
    `- **Made:** ${o.generated} with VinVerdict (${o.site}), for selling this car.`,
    "",
    "## At a glance",
    "",
    p && o.sell
      ? `- **Worth to a private buyer:** ${money(p.low)}–${money(p.high)}, most likely ${money(p.fair)}${o.sell.zip ? ` near ${o.sell.zip}` : ""}. **List it at about ${money(o.sell.listAt)}**: buyers usually talk the price down a few percent.`
      : `- **Worth:** ${o.sell?.private?.unpriced ?? "not priced yet: run the price check, or tell VinVerdict a KBB or Edmunds private-party value."}`,
    ...(o.sell?.dealer && !o.sell.dealer.unpriced ? [`- **A dealer would ask about ${money(o.sell.dealer.fair)}** for a car like this (retail); a dealer buying it pays you less than that.`] : []),
    ...(p ? [`- **Confidence:** ${p.confidence} (${p.confidenceWhy}).`] : []),
    `- **History report:** ${o.historyKnown ?? "not added yet. Buyers will ask for it: have a Carfax or AutoCheck ready."}`,
    ...(o.recalls ? [`- **Recalls:** ${o.recalls} on record for this model year. Open ones are fixed free at a dealer of the brand: do it before you sell.`] : []),
    "",
  );

  let n = 1;
  push(`## ${n++}. What it's worth`, "");
  if (p && o.sell) {
    push(
      `Selling it yourself: ${money(p.low)}–${money(p.high)}, most likely ${money(p.fair)}. List at about ${money(o.sell.listAt)}.`,
      "",
      "How it was worked out:",
      "",
      ...p.sources.map((s) => `- **${s.name}:** ${money(s.value)}. ${s.note}.`),
      ...p.adjustments.map((x) => `- **${x.label}:** ${x.pct > 0 ? "+" : ""}${Math.round(x.pct * 100)}%`),
      "",
    );
    if (p.assumesClean) push("_Priced as a car with no accidents and a clean title. If its history report shows damage, the value is lower._", "");
  } else {
    push(o.sell?.private?.unpriced ?? "Not priced yet. Run the price check on the page, or tell VinVerdict a KBB or Edmunds private-party value.", "");
  }

  for (const s of sections(full)) {
    if (!SHARED.some((t) => s.title.startsWith(t))) continue;
    push(`## ${n++}. ${s.title}`, s.body.trimEnd(), "");
  }

  push(`## ${n++}. Selling safely`, "", ...SAFE_SELL.map((x) => `- ${x}`), "",
    "Showing the car:", "",
    "- Meet in daylight in a busy public place, or at your bank (handy for the payment too).",
    "- See the buyer's license before a test drive, and go along on the drive.",
    "- Let their mechanic inspect it if they ask: serious buyers do.",
    "- Don't hand over the keys, the title or the plates until the money has cleared.",
    "",
    "What buyers will ask (have answers ready):", "",
    "- Is the title in your name and clean? Is there a loan on it, and how is it released?",
    "- Any accidents? (They'll check the history report anyway: say it first.)",
    "- Service records, open recalls, why you're selling, and can their mechanic inspect it?",
    "");

  push(`## ${n++}. Questions to ask your AI`, "", "Paste this report into your AI assistant, then ask, for example:", "",
    "- What should I list it at, and how low should I go?",
    "- Write an honest listing for this car from the facts above.",
    "- A buyer sent me this message: is it a scam?",
    "- What should I fix or have ready before I sell it?",
    "");
  return out.join("\n");
}
