/**
 * "What VinVerdict knows": the things that decide a used-car purchase, which ones this
 * page has, and the one-tap way to get each missing one. Pure. It fills in as the person
 * tells VinVerdict things, pastes pages or runs checks.
 */

const $ = (n: number) => `$${n.toLocaleString("en-US")}`;

export type KnownAction =
  | { kind: "tell"; label: string; prefill: string }
  | { kind: "attach"; label: string }
  | { kind: "go"; label: string; target: string }
  | { kind: "link"; label: string; href: string };

export type Known = { key: string; label: string; done: boolean; detail: string; action: KnownAction | null };

export type KnowsInput = {
  car: string | null;
  vin: string | null;
  price: number | null;
  miles: number | null;
  /** History report answers (from a report the person read or attached). */
  history: { damage: string; title: string; owners: number | null } | null;
  carfax: string | null;
  estimate: { low: number; high: number; basis?: string | null } | null;
  /** Past listings of this VIN (from the price check), or null when not looked up. */
  listings: number | null;
  /** The recall lookup for this VIN was checked (proof attached). */
  recallsChecked: boolean;
  recalls: number | null;
  recallLookup: string | null;
  sellerAnswers: number;
  auctionSold: number | null;
  /** The price check has run (a lean check finds no listing history). */
  priced?: boolean;
  /** Bad news about the car's history from listing data, before any report. */
  feedHistory?: string[];
};

export function knowsList(k: KnowsInput): Known[] {
  const list: Known[] = [
    k.vin
      ? { key: "vin", label: "The exact car", done: true, detail: `${k.car ?? "Decoded"} (VIN checked)`, action: null }
      : { key: "vin", label: "The exact car", done: false, detail: "No valid VIN yet", action: { kind: "tell", label: "Add the VIN", prefill: "VIN: " } },
    k.price
      ? { key: "price", label: "Asking price", done: true, detail: $(k.price), action: null }
      : { key: "price", label: "Asking price", done: false, detail: "Not known", action: { kind: "tell", label: "Tell the price", prefill: "They're asking $" } },
    k.miles
      ? { key: "miles", label: "Miles", done: true, detail: `${k.miles.toLocaleString("en-US")} miles`, action: null }
      : { key: "miles", label: "Miles", done: false, detail: "Not known", action: { kind: "tell", label: "Tell the miles", prefill: "It has  miles" } },
    k.history
      ? {
          key: "history", label: "Accidents, title, owners", done: true,
          detail: [k.history.damage, k.history.title, k.history.owners ? `${k.history.owners} owner${k.history.owners > 1 ? "s" : ""}` : null].filter(Boolean).join(", "),
          action: null,
        }
      : { key: "history", label: "Accidents, title, owners", done: false, detail: k.feedHistory?.length ? `Known so far: ${k.feedHistory[0]}; the report has the details` : k.carfax ? "The dealer has a free Carfax" : "Needs the Carfax or AutoCheck", action: { kind: "attach", label: "Add the report" } },
    k.estimate
      ? { key: "estimate", label: "Fair price", done: true, detail: k.estimate.basis ? `${$(k.estimate.low)}–${$(k.estimate.high)} from ${k.estimate.basis}` : `Similar cars ${$(k.estimate.low)}–${$(k.estimate.high)}`, action: null }
      : {
          key: "estimate", label: "Fair price", done: false,
          detail: k.auctionSold ? `Sold at auction for ${$(k.auctionSold)}; not compared yet` : k.vin ? "Not compared with similar cars" : "Tell a KBB or Edmunds value to price it",
          // Without a VIN the price check can't run, but a guide value the person looks up can.
          action: k.vin && !k.priced ? { kind: "go", label: "Run the price check", target: "#price-check" } : { kind: "tell", label: "Tell a guide value", prefill: "KBB private party value $" },
        },
    k.listings !== null
      ? { key: "listings", label: "Where else it's been listed", done: true, detail: `${k.listings} past listing${k.listings === 1 ? "" : "s"} found`, action: null }
      : !k.vin
        ? { key: "listings", label: "Where else it's been listed", done: false, detail: "Needs the VIN", action: null }
        : k.priced
          ? { key: "listings", label: "Where else it's been listed", done: false, detail: "Not looked up in this check", action: null }
          : { key: "listings", label: "Where else it's been listed", done: false, detail: "Comes with the price check", action: { kind: "go", label: "Run the price check", target: "#price-check" } },
    k.recallsChecked
      ? { key: "recalls", label: "Open recalls on this car", done: true, detail: "Checked by VIN", action: null }
      : { key: "recalls", label: "Open recalls on this car", done: false, detail: k.recalls ? `${k.recalls} for the model year; which are open?` : "Not checked by VIN", action: k.recallLookup ? { kind: "link", label: "Check by VIN", href: k.recallLookup } : null },
    k.sellerAnswers > 0
      ? { key: "seller", label: "Seller's answers", done: true, detail: `${k.sellerAnswers} answered`, action: null }
      : { key: "seller", label: "Seller's answers", done: false, detail: "Not asked yet", action: { kind: "go", label: "See what to ask", target: "#before-you-buy" } },
    { key: "inspection", label: "Your mechanic's inspection", done: false, detail: "Do this before you pay", action: { kind: "go", label: "See the inspection list", target: "#before-you-buy" } },
  ];
  return list;
}
