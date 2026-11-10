/**
 * One-time recorder for the demo examples (src/lib/demo/examples.json →
 * src/lib/demo/data/<id>.json). SPENDS API QUOTA (~11 MarketCheck + ~7
 * Auto.dev calls), so it is skipped unless RECORD_DEMO=1:
 *
 *   RECORD_DEMO=1 npx vitest run src/lib/demo/record
 *
 * It runs the app's own code (analyzeListing, live lookup, listing history,
 * price sources) with the owner's full check, so the examples show exactly
 * what a real check shows. Keys come from .env.local.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const RUN = process.env.RECORD_DEMO === "1";
const FREE_ONLY = process.env.RECORD_DEMO === "analysis";
// RECORD_ONLY=lexus,camry re-records just those examples (fewer calls).
const ONLY = process.env.RECORD_ONLY?.split(",").map((x) => x.trim()) ?? null;
const ZIP = "08540";
const DIR = join(__dirname, "data");

type Example = { id: string; title: string; text: string; realVin: boolean };

describe.skipIf(!FREE_ONLY)("refresh demo analyses (free NHTSA data only)", () => {
  it("re-runs the free analysis and keeps each recorded price check", { timeout: 300_000 }, async () => {
    const { analyzeListing } = await import("@/lib/analyze");
    const examples = JSON.parse(readFileSync(join(__dirname, "examples.json"), "utf8")) as Example[];
    for (const ex of examples) {
      const file = join(DIR, `${ex.id}.json`);
      const saved = JSON.parse(readFileSync(file, "utf8")) as { recordedAt: string };
      const analysis = await analyzeListing(ex.text);
      // The analysis date stays the recording date, so the page shows one date for the example.
      writeFileSync(file, JSON.stringify({ ...saved, analysis: { ...analysis, checkedAt: saved.recordedAt } }) + "\n");
      console.log(`${ex.id}: recalls ${analysis.recalls?.length ?? "-"} · complaints ${analysis.complaints?.total ?? "-"} · years ${analysis.years?.map((y) => y.year).join("/") ?? "-"}`);
    }
  });
});

describe.skipIf(!RUN)("record demo examples (spends API quota)", () => {
  it("records every example", { timeout: 300_000 }, async () => {
    if (existsSync(".env.local")) process.loadEnvFile(".env.local");
    const { analyzeListing } = await import("@/lib/analyze");
    const { lookupLiveListing } = await import("@/lib/live/client");
    const { fetchVinHistory } = await import("@/lib/history/client");
    const { fetchPriceSources } = await import("@/lib/value/client");
    const { recentMiles } = await import("@/lib/history/summary");
    const { checkVin } = await import("@/lib/vin");

    const file = join(__dirname, "examples.json");
    const examples = JSON.parse(readFileSync(file, "utf8")) as Example[];

    // Example 5: a real 2016 Lexus RX 350 for sale near the demo ZIP (1 MarketCheck search).
    const lexus = examples.find((e) => e.id === "lexus")!;
    if (!lexus.text) {
      const q = new URLSearchParams({ api_key: process.env.MARKETCHECK_API_KEY!, year: "2016", make: "lexus", model: "rx 350", zip: ZIP, radius: "100", rows: "10", car_type: "used" });
      const res = await fetch(`https://api.marketcheck.com/v2/search/car/active?${q}`);
      const body = (await res.json()) as { listings?: { vin?: string; miles?: number; price?: number }[] };
      const pick = body.listings?.find((l) => l.vin && checkVin(l.vin).ok && l.price && l.miles);
      expect(pick, "no 2016 RX 350 with VIN, price and miles near 08540").toBeTruthy();
      lexus.text = pick!.vin!;
      writeFileSync(file, JSON.stringify(examples, null, 1) + "\n");
    }

    for (const ex of examples) {
      if (ONLY && !ONLY.includes(ex.id)) continue;
      const analysis = await analyzeListing(ex.text);
      const l = analysis.listing;
      const d = analysis.decoded;
      const vin = ex.realVin && l.vin && analysis.vinCheck?.ok ? l.vin : null;
      const notes: string[] = [];
      let live = null;
      let history = null;
      if (vin) {
        const [r, h] = await Promise.all([lookupLiveListing(vin), fetchVinHistory(vin)]);
        live = r.listing;
        history = h;
      }
      const year = d?.year ?? l.year ?? live?.year ?? null;
      const make = (d?.make ? d.make[0] + d.make.slice(1).toLowerCase() : null) ?? l.make ?? live?.make ?? null;
      const model = d?.model ?? l.model ?? live?.model ?? null;
      let miles = l.miles ?? live?.miles ?? null;
      if (miles === null && history) miles = recentMiles(history)?.miles ?? null;
      expect(year && make && model, `${ex.id}: year/make/model`).toBeTruthy();
      const sources = await fetchPriceSources({ vin, year: year!, make: make!, model: model!, trim: d?.trim ?? live?.trim ?? null, miles, zip: ZIP });
      if (sources.failed.length) notes.push(`Couldn't reach ${sources.failed.join(", ")} when this example was recorded.`);
      const price = { status: "done", live, history, sources, car: { year, make, model, trim: d?.trim ?? live?.trim ?? null, miles }, notes };
      writeFileSync(join(DIR, `${ex.id}.json`), JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), zip: ZIP, analysis, price }) + "\n");
      console.log(`${ex.id}: ${year} ${make} ${model} · live ${live ? "yes" : "no"} · history ${history?.length ?? "-"} · sold ${sources.sold?.n ?? 0} · for sale ${sources.active?.n ?? 0} · model ${sources.predicted ?? "-"}`);
    }
  });
});
