import type { PriceState } from "@/app/actions/price";
import type { Analysis } from "@/lib/analyze";

/**
 * Demo examples: real checks recorded once (src/lib/demo/record.test.ts), so
 * visitors see the full result, including the price check and listing history,
 * with zero API calls. Each example's data loads only when it's opened.
 */

export type DemoExample = { id: ExampleId; title: string; site: string; shows: string; photo?: string };
export type DemoData = { recordedAt: string; zip: string; analysis: Analysis; price: Extract<PriceState, { status: "done" }> };

export type ExampleId = "camry" | "scam" | "accord" | "civic" | "lexus";

// Two real cars (real VINs, real listings) and three typical ads written to show common cases (made-up VINs).
// Recalls, complaints, prices and history are always real data.
export const EXAMPLES: DemoExample[] = [
  { id: "lexus", title: "2016 Lexus RX 350, VIN only", site: "Real car: just the VIN", shows: "Finds where it's listed, its reported accident and its free Carfax, then prices it. Switch to \"It's mine\" to value it for selling", photo: "https://retail.photos.vin/2T2BZMCA2GC041915-1.jpg" },
  { id: "camry", title: "2021 Toyota Camry, 183k miles", site: "Real car: AutoTrader dealer listing", shows: "A reported accident, two dealers selling the same car, a price cut and the fair price" },
  { id: "scam", title: "2019 Honda Civic for $4,500", site: "Typical Facebook ad (illustration)", shows: "The classic \"deployed overseas, pay a deposit by gift card\" scam" },
  { id: "accord", title: "2017 Honda Accord EX-L", site: "Typical private-seller ad (illustration)", shows: "Looks clean: fair price, suggested offer, and what's still unconfirmed" },
  { id: "civic", title: "2017 Honda Civic LX", site: "Typical Craigslist ad (illustration)", shows: "Title not in the seller's name, a loan still on it, a rushed sale" },
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
