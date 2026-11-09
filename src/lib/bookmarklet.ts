/**
 * The "Check with VinVerdict" bookmark (feature 2a). Clicked on a listing
 * page, it runs in the user's own browser, where the page is already open
 * and logged in, so no server ever fetches the listing (no SSRF, no bot
 * blocks, no scraping). It collects:
 *
 *   1. The page's structured data (schema.org Car/Vehicle JSON-LD, which
 *      most dealer sites and AutoTrader/Cars.com/CarGurus embed for Google):
 *      VIN, price, mileage, color and seller in clean "Label: value" lines
 *      that the parser reads first.
 *   2. The visible text of the main content area (menus and footers skipped
 *      when the page marks them up).
 *
 * It opens VinVerdict with the text in the URL *fragment* (#listing=…),
 * which browsers never send to any server. The page reads it, clears it
 * from the address bar, and runs the normal analysis (still behind login).
 * It uses window.open with noopener rather than a link click, because
 * sites like Facebook route clicked links through their own redirect server.
 */

/** The marker VinVerdict looks for in its own URL. */
export const LISTING_HASH = "#listing=";
/** Leave room under MAX_LISTING_CHARS (20,000) for the labels. */
export const BOOKMARKLET_MAX_CHARS = 19_000;

// Plain ES5 so it runs on any site. Kept readable here; whitespace is
// squeezed when it's turned into a javascript: URL.
const SOURCE = String.raw`(function(){
  var O = __ORIGIN__, MAX = __MAX__, out = [];
  function clean(v){ return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function add(k, v){ v = clean(v); if (v) out.push(k + ": " + v); }
  function name(x){ return x && typeof x === "object" ? (x.name || "") : x; }
  function types(o){ return [].concat(o && o["@type"] || []).join(" "); }
  add("Source", location.href);
  add("Page title", document.title);
  var cars = [];
  function walk(o, d){
    if (!o || typeof o !== "object" || d > 6) return;
    if (Object.prototype.toString.call(o) === "[object Array]") { for (var i = 0; i < o.length; i++) walk(o[i], d + 1); return; }
    if (/Car|Vehicle|Motorcycle/i.test(types(o)) || o.vehicleIdentificationNumber || o.mileageFromOdometer) cars.push(o);
    if (o["@graph"]) walk(o["@graph"], d + 1);
    if (o.itemOffered) walk(o.itemOffered, d + 1);
    if (o.mainEntity) walk(o.mainEntity, d + 1);
  }
  var scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (var s = 0; s < scripts.length; s++) { try { walk(JSON.parse(scripts[s].textContent), 0); } catch (e) {} }
  var c = cars[0];
  if (c) {
    out.push("[Listing data from the page]");
    add("Vehicle", [c.vehicleModelDate || c.modelDate || c.productionDate, name(c.brand) || name(c.manufacturer), name(c.model), c.vehicleConfiguration].join(" "));
    add("Name", c.name);
    add("VIN", c.vehicleIdentificationNumber);
    var of = [].concat(c.offers || [])[0] || {};
    var p = of.price || (of.priceSpecification || {}).price || of.lowPrice;
    if (p) add("Price", "$" + p);
    var m = c.mileageFromOdometer;
    if (m) add("Mileage", (typeof m === "object" ? m.value : m) + " miles");
    add("Exterior color", c.color);
    add("Transmission", c.vehicleTransmission);
    add("Previous owners", c.numberOfPreviousOwners);
    var sel = of.seller || c.seller;
    if (sel) add("Seller", name(sel) + (/Dealer|AutoDealer|Organization|LocalBusiness/i.test(types(sel)) ? " (dealer)" : ""));
  }
  var md = document.querySelector('meta[property="og:description"], meta[name="description"]');
  if (md) add("Summary", md.getAttribute("content"));
  var main = document.querySelector("main, [role=main], article");
  var body = main && main.innerText && main.innerText.length > 500 ? main.innerText : (document.body.innerText || "");
  out.push("[Page text]");
  out.push(body.replace(/\n{3,}/g, "\n\n"));
  var url = O + "/" + "#listing=" + encodeURIComponent(out.join("\n").slice(0, MAX));
  window.open(url, "_blank", "noopener,noreferrer");
})();`;

/** The bookmark's code for this VinVerdict site (origin like "https://vinverdict.vercel.app"). */
export function bookmarkletSource(origin: string): string {
  const safeOrigin = new URL(origin).origin; // drops any path/query; throws on junk
  return SOURCE.replace("__ORIGIN__", JSON.stringify(safeOrigin)).replace("__MAX__", String(BOOKMARKLET_MAX_CHARS));
}

/** The javascript: URL to drag to the bookmarks bar. */
export function bookmarkletHref(origin: string): string {
  const compact = bookmarkletSource(origin)
    .split("\n")
    .map((line) => line.trim())
    .join("");
  return `javascript:${encodeURIComponent(compact)}`;
}

/**
 * Read listing text from a VinVerdict URL fragment. Returns null when there
 * is none or it's malformed. The result is plain text: the analyzer only
 * runs regexes on it and never renders it as HTML.
 */
export function readListingHash(hash: string, maxChars: number): string | null {
  if (!hash.startsWith(LISTING_HASH)) return null;
  try {
    const text = decodeURIComponent(hash.slice(LISTING_HASH.length)).trim();
    return text ? text.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}
