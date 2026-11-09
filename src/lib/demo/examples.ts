import type { PriceState } from "@/app/actions/price";
import type { Analysis } from "@/lib/analyze";

/**
 * Demo examples: real checks recorded once (src/lib/demo/record.test.ts), so
 * visitors see the full result, including the price check and listing history,
 * with zero API calls. Each example's data loads only when it's opened.
 */

export type DemoExample = { id: ExampleId; title: string; site: string; shows: string };
export type DemoData = { recordedAt: string; zip: string; analysis: Analysis; price: Extract<PriceState, { status: "done" }> };

export type ExampleId = "camry" | "scam" | "accord" | "civic" | "lexus";

export const EXAMPLES: DemoExample[] = [
  { id: "camry", title: "2021 Toyota Camry, 183k miles", site: "AutoTrader dealer listing", shows: "A hidden accident, two dealers selling the same car, a price cut and the fair price" },
  { id: "scam", title: "2019 Honda Civic for $4,500", site: "Facebook Marketplace", shows: "The classic \"deployed overseas, pay a deposit by gift card\" scam" },
  { id: "accord", title: "2017 Honda Accord EX-L", site: "Facebook Marketplace, private seller", shows: "A clean private sale: fair price, suggested offer, cost per year" },
  { id: "civic", title: "2017 Honda Civic LX", site: "Craigslist, \"by owner\"", shows: "Title not in the seller's name, a loan still on it, a rushed sale" },
  { id: "lexus", title: "2016 Lexus RX 350, VIN only", site: "Just the VIN", shows: "Recalls, crash stars, every place it was listed, and its price" },
];

const LOADERS: Record<ExampleId, () => Promise<{ default: unknown }>> = {
  camry: () => import("./data/camry.json"),
  scam: () => import("./data/scam.json"),
  accord: () => import("./data/accord.json"),
  civic: () => import("./data/civic.json"),
  lexus: () => import("./data/lexus.json"),
};

export async function loadExample(id: ExampleId): Promise<DemoData> {
  return (await LOADERS[id]()).default as DemoData;
}
