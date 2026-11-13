/**
 * Live checks of AI mode on the free AI services (free calls, but rate-limited).
 * Off by default so `npm test` stays offline; run with:
 *   AI_LIVE=1 npx vitest run src/lib/ai/ai.live --silent=false
 * Keys come from .env.local (never printed). Prints what each feature returned, for a person to read.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const live = process.env.AI_LIVE === "1";
if (live) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && /^(ZAI|GEMINI|GROQ)_API_KEY$/.test(m[1])) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

describe.skipIf(!live)("AI mode, live", () => {
  it("answers a question from the case 32 report, grounded", async () => {
    const { aiJson } = await import("./client");
    const { askMessages, checkAsk } = await import("./ask");
    const report = readFileSync("src/lib/ai/fixtures/short-report-case32.md", "utf8");
    const q = "Is the price fair, and what should I do first?";
    const r = await aiJson({ messages: askMessages(report, q, []), validate: (raw) => checkAsk(raw, report, q), maxTokens: 900 });
    console.log("ASK", JSON.stringify(r, null, 1));
    expect(r.ok).toBe(true);
  }, 90_000);

  it("open questions the page can't answer (they reach the AI) all pass the guards", async () => {
    const { aiJson } = await import("./client");
    const { askMessages, checkAsk } = await import("./ask");
    const report = readFileSync("src/lib/ai/fixtures/short-report-case32.md", "utf8");
    const qs = [
      "The check engine light came on during the test drive. Should I still buy it?",
      "Should I get an extended warranty on this one?",
      "How does this compare with a Honda Accord of the same year?",
      "Is rust a problem on this model?",
      "Can I finance it, and is a credit union better than the dealer?",
      "The seller says it has new tires and brakes. Does that change anything?",
    ];
    let ok = 0;
    for (const q of qs) {
      const r = await aiJson({ messages: askMessages(report, q, []), validate: (raw) => checkAsk(raw, report, q), maxTokens: 900 });
      if (r.ok) ok++;
      console.log(`Q: ${q}
${r.ok ? `[${r.provider}] ${(r.data as { answer: string }).answer}` : `FAILED: ${r.reason}`}`);
      await new Promise((res) => setTimeout(res, 2_500));
    }
    expect(ok).toBe(qs.length);
  }, 600_000);

  it("reads a Carfax-style report: every event, with quotes found in the text", async () => {
    const { aiJson } = await import("./client");
    const { checkHistoryRead, historyMessages, aiProofRead } = await import("./history-read");
    const text = readFileSync("src/lib/ai/fixtures/carfax-like-case32.txt", "utf8");
    const r = await aiJson({ messages: historyMessages(text, null), validate: (raw) => checkHistoryRead(raw, text), maxTokens: 2_500 });
    console.log("HISTORY", JSON.stringify(r, null, 1));
    expect(r.ok).toBe(true);
    if (r.ok) console.log("PROOF", JSON.stringify(aiProofRead(r.data, text, false, r.provider).findings, null, 1));
  }, 90_000);

  it("checks the real dealer pages for the case 32 Camry", async () => {
    const { safeFetchPage } = await import("@/lib/net/safe-fetch");
    const { pageText, pageHasVin, jsonLdListing, dealerMessages, checkDealerRead, relevantText, mergeDealer } = await import("./dealer-check");
    const { aiJson } = await import("./client");
    const vin = "4T1F11AK9LU310542";
    for (const url of [
      "https://www.fasttrackmotors.com/2020-Toyota-Camry-Paterson-NJ-Clifton-NJ-Newark-NJ-Mahwah-NJ-Passaic/used_car/A0xGRVBlsfU=",
      "https://www.dchwappingerstoyota.com/inventory/certified-used-2020-toyota-camry-fwd-4-door-xle-sedan-4t1f11ak9lu310542/",
    ]) {
      const page = await safeFetchPage(url);
      if (!page.ok) {
        console.log("DEALER", url, page.reason);
        continue;
      }
      const text = pageText(page.html);
      const ld = jsonLdListing(page.html, vin);
      const hasVin = pageHasVin(text, vin);
      const ai = hasVin && !(ld?.price && ld.status) ? await aiJson({ messages: dealerMessages(relevantText(text, vin), vin), validate: (raw) => checkDealerRead(raw, text), maxTokens: 600 }) : null;
      console.log("DEALER", url, JSON.stringify({ hasVin, ld, ai, merged: hasVin ? mergeDealer(ld, ai?.ok ? ai.data : null) : null }, null, 1));
    }
  }, 180_000);
});
