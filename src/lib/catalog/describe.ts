import type { Body, ModelYear } from "./types";

/** Plain words for the facts EPA gives about a model year. Pure. */

export const BODY_LABEL: Record<Body, string> = {
  car: "Car",
  suv: "SUV",
  pickup: "Pickup truck",
  minivan: "Minivan",
  van: "Van",
  wagon: "Wagon",
};

/** The body word inside a sentence ("SUV" keeps its capitals). */
const BODY_WORD: Record<Body, string> = { car: "car", suv: "SUV", pickup: "pickup truck", minivan: "minivan", van: "van", wagon: "wagon" };

/** "Midsize car", "Small SUV", "Two-seater car". */
export function bodyText(y: Pick<ModelYear, "body" | "size">): string {
  if (!y.size) return BODY_LABEL[y.body];
  if (y.size === "two-seater") return "Two-seater car";
  return `${y.size[0].toUpperCase()}${y.size.slice(1)} ${BODY_WORD[y.body]}`;
}

/** "4 or 6 cylinders, 2.5–3.5 L, turbo" / "Electric". */
export function engineText(y: ModelYear): string {
  if (y.power.length === 1 && y.power[0] === "electric") return "Electric";
  const parts: string[] = [];
  if (y.cylinders.length) {
    const c = y.cylinders;
    parts.push(`${c.length === 1 ? c[0] : `${c.slice(0, -1).join(", ")} or ${c.at(-1)}`} cylinders`);
  }
  if (y.displacementL) {
    const [a, b] = y.displacementL;
    parts.push(a === b ? `${a.toFixed(1)} L` : `${a.toFixed(1)}–${b.toFixed(1)} L`);
  }
  if (y.turbo) parts.push("turbo");
  if (y.supercharged) parts.push("supercharged");
  return parts.join(", ") || "Not listed";
}

export function powerText(y: ModelYear): string {
  const order = ["gas", "diesel", "hybrid", "plug-in hybrid", "electric"] as const;
  const list = order.filter((p) => y.power.includes(p));
  const word = (p: (typeof order)[number]) => (p === "gas" ? "Gas" : p === "diesel" ? "Diesel" : p === "hybrid" ? "Hybrid" : p === "plug-in hybrid" ? "Plug-in hybrid" : "Electric");
  return list.map(word).join(", ");
}

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "$1,450 a year ($121 a month)", or a range across versions. */
export function fuelText(y: ModelYear): { year: string; month: string } | null {
  const f = y.fuelCostYear;
  if (!f) return null;
  const range = (a: number, b: number) => (a === b ? money(a) : `${money(a)}–${money(b)}`);
  return { year: range(f.min, f.max), month: range(f.min / 12, f.max / 12) };
}

/** The EPA facts that matter for "is it sporty?", stated as facts (never a score). */
export function performanceFacts(y: ModelYear): string[] {
  const out: string[] = [];
  if (y.size === "two-seater") out.push("two seats");
  if (y.drive.includes("RWD")) out.push("rear-wheel drive available");
  if (y.turbo || y.supercharged) out.push(y.supercharged ? "supercharged engine available" : "turbo engine available");
  if (y.manual) out.push("manual transmission available");
  if (y.premiumFuel) out.push("some versions need premium fuel");
  return out;
}
