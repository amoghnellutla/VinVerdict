/**
 * Pre-filled search links for outside sites (PLAN.md §3 layer 2). Pure.
 *
 * AutoTempest's format was checked 2026-11-09 (it read make, model, zip,
 * radius, minyear/maxyear and maxprice from the link) and it searches many
 * sites at once, so it's the main link. Facebook takes a keyword search plus
 * a max price; the radius has to be set on Facebook itself.
 */

export type SearchQuery = {
  make: string;
  model: string;
  zip?: string | null;
  radius?: number | null;
  minYear?: number | null;
  maxYear?: number | null;
  maxPrice?: number | null;
};

export type SearchLink = { site: string; href: string; note: string };

const set = (u: URL, k: string, v: string | number | null | undefined) => {
  if (v !== null && v !== undefined && v !== "") u.searchParams.set(k, String(v));
};

export function searchLinks(q: SearchQuery): SearchLink[] {
  const at = new URL("https://www.autotempest.com/results");
  set(at, "make", q.make.toLowerCase());
  set(at, "model", q.model.toLowerCase());
  set(at, "zip", q.zip);
  set(at, "radius", q.radius ?? (q.zip ? 100 : null));
  set(at, "minyear", q.minYear);
  set(at, "maxyear", q.maxYear);
  set(at, "maxprice", q.maxPrice);

  const fb = new URL("https://www.facebook.com/marketplace/search/");
  const years = q.minYear && q.maxYear ? ` ${q.minYear === q.maxYear ? q.minYear : `${q.minYear}-${q.maxYear}`}` : "";
  set(fb, "query", `${q.make} ${q.model}${years}`);
  set(fb, "maxPrice", q.maxPrice);

  return [
    { site: "AutoTempest", href: at.toString(), note: "Searches AutoTrader, Cars.com, Craigslist, eBay and more at once" },
    { site: "Facebook Marketplace", href: fb.toString(), note: "Private sellers: check every listing here" },
  ];
}

/** Sites to search by hand (PLAN.md §3 layer 2), with what each is best for. Shown under the owner's Shortlist. */
export const OUTSIDE_SITES = [
  { name: "AutoTempest", href: "https://www.autotempest.com", note: "Many sites at once" },
  { name: "CarGurus", href: "https://www.cargurus.com", note: "Dealer deal labels" },
  { name: "Cars.com", href: "https://www.cars.com", note: "Large inventory" },
  { name: "Facebook Marketplace", href: "https://www.facebook.com/marketplace", note: "Private sellers: highest scam risk" },
  { name: "Craigslist", href: "https://www.craigslist.org", note: "Private sellers: highest scam risk" },
  { name: "CarMax", href: "https://www.carmax.com", note: "10-day money-back return" },
  { name: "Carvana", href: "https://www.carvana.com", note: "7-day / 400-mile return" },
  { name: "Enterprise Car Sales", href: "https://www.enterprisecarsales.com", note: "7-day buyback" },
  { name: "Hertz Car Sales", href: "https://www.hertzcarsales.com", note: "Ex-rental cars" },
] as const;
