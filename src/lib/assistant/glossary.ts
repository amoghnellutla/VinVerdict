/**
 * Car-buying words a buyer asks about ("what does CR grade mean?", "what's a doc fee?").
 * Pure. Fixed, careful definitions, so these never need the AI and always read the same.
 * Anything not here still goes to the AI.
 */

export type Term = { key: string; name: string; aliases: RegExp; text: string; points?: string[] };

export const TERMS: Term[] = [
  { key: "mmr", name: "MMR", aliases: /^(?:the )?mmr$|^manheim market report$/i,
    text: "MMR is the Manheim Market Report: Manheim's wholesale value for a car, from recent dealer-auction sales.",
    points: ["It's roughly what dealers pay at auction, not a retail price: a dealer's asking price is normally above it."] },
  { key: "cr", name: "CR grade", aliases: /^(?:the )?(?:cr|cr grade|condition report|condition grade|condition report grade|cr score)$/i,
    text: "A CR grade is the auction's condition report score, usually 0 to 5 (5 is best), from an inspector's walk-around.",
    points: ["It covers what an inspector sees, not a mechanical inspection: your own mechanic should still check it."] },
  { key: "doc", name: "doc fee", aliases: /^(?:an? |the )?(?:doc|documentation|documentary|dealer doc) fee$/i,
    text: "A doc fee is what a dealer charges for the sale's paperwork. It's the dealer's fee, not a government one, and some states cap it.",
    points: ["Ask for it inside the out-the-door price, and negotiate the total, not just the car's price."] },
  { key: "otd", name: "out the door", aliases: /^(?:the )?(?:out[- ]the[- ]door|otd)$/i,
    text: "Out the door is the total you pay: the price plus sales tax, title, registration and every dealer fee.",
    points: ["Ask for it in writing, with each fee listed, before you go."] },
  { key: "clean", name: "clean title", aliases: /^(?:an? |the )?clean title$/i,
    text: "A clean title has no brand on it (salvage, rebuilt, flood and so on).",
    points: ["It doesn't mean no accidents: most accidents never brand a title, so check the history report too."] },
  { key: "salvage", name: "salvage title", aliases: /^(?:an? |the )?salvage(?: title)?$/i,
    text: "A salvage title means an insurer or the state declared the car a total loss.",
    points: ["In most states it can't be registered for the road until it's repaired and passes a state inspection, when it becomes a rebuilt title."] },
  { key: "rebuilt", name: "rebuilt title", aliases: /^(?:an? |the )?(?:rebuilt|reconstructed)(?: title)?$/i,
    text: "A rebuilt title is a salvage car that was repaired and passed a state inspection.",
    points: ["It can be driven, but it's worth much less, and it can be harder to insure, finance and resell. Get the repair records and an inspection."] },
  { key: "branded", name: "branded title", aliases: /^(?:an? |the )?(?:branded|title brand|brand on the title)(?: title)?$/i,
    text: "A branded title carries a mark of a serious past problem: salvage, rebuilt, flood, lemon buyback and similar.",
    points: ["The brand stays with the car and lowers its value; NICB VINCheck and NMVTIS show reported brands."] },
  { key: "lien", name: "lien", aliases: /^(?:an? |the )?(?:lien|lienholder|lien holder)(?: on the title)?$/i,
    text: "A lien means a lender still has a claim on the car: the loan isn't paid off.",
    points: ["Finish the deal at the seller's bank or pay the lender directly, and get the lien release before the title is signed over."] },
  { key: "cpo", name: "certified pre-owned", aliases: /^(?:an? )?(?:cpo|certified pre-?owned|certified used)$/i,
    text: "Certified pre-owned (CPO) means a maker's program: the brand's dealer inspects the car and it comes with an extended maker warranty.",
    points: ["\"Certified\" from a dealer that doesn't sell that brand is the dealer's own label, not the maker's warranty: ask whose warranty it is, in writing."] },
  { key: "asis", name: "as-is", aliases: /^(?:sold )?as[- ]is$/i,
    text: "As-is means there's no warranty from the seller: repairs after you buy are yours.",
    points: ["Dealers must say so on the Buyers Guide sticker in the window (FTC Used Car Rule). It's why an inspection before you buy matters."] },
  { key: "ppi", name: "pre-purchase inspection", aliases: /^(?:an? |the )?(?:ppi|pre-?purchase inspection)$/i,
    text: "A pre-purchase inspection (PPI) is your own mechanic checking the car before you buy, for a fee.",
    points: ["A seller who won't allow one is a serious warning sign."] },
  { key: "curb", name: "curbstoning", aliases: /^(?:a )?curbston(?:ing|er)$/i,
    text: "Curbstoning is an unlicensed dealer posing as a private seller, often selling cars whose titles aren't in their name.",
    points: ["The name on the title must match the seller's ID."] },
  { key: "rollback", name: "odometer rollback", aliases: /^(?:an? )?(?:odometer )?(?:rollback|roll ?back|rolled back odometer)$/i,
    text: "An odometer rollback is turning the miles back so a car looks less used.",
    points: ["Compare the odometer with service records and the history report's readings: miles that go down between readings are the giveaway."] },
  { key: "vin", name: "VIN", aliases: /^(?:a |the )?vin(?: number)?$/i,
    text: "The VIN is the car's 17-character ID, on the dashboard by the windshield and on the driver's door sticker.",
    points: ["It must match the title and the paperwork. VinVerdict uses it for the exact model, recalls and title checks."] },
];

/** "what does CR grade mean?", "what's a doc fee", "what is MMR" → the term; null when it isn't one. */
export function termIn(text: string): Term | null {
  const m = /^\s*(?:what(?:'s| is| are| does| do)|define|meaning of|explain)\s+(?:an? |the )?["']?(.+?)["']?\s*(?:mean|means|stand for)?\s*\??\s*$/i.exec(text.trim());
  if (!m) return null;
  const phrase = m[1].replace(/\s+(?:mean|means|stand for)$/i, "").trim();
  return TERMS.find((t) => t.aliases.test(phrase)) ?? null;
}
