import { describe, expect, it } from "vitest";
import { bookmarkletHref, bookmarkletSource, LISTING_HASH, readListingHash } from "./bookmarklet";
import { parseListing, MAX_LISTING_CHARS } from "./listing/parse";

const ORIGIN = "https://vinverdict.example";

// A dealer page as the bookmark sees it: JSON-LD for Google plus visible text.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "BreadcrumbList" },
    {
      "@type": ["Product", "Car"],
      name: "Used 2021 Toyota Camry LE FWD",
      brand: { "@type": "Brand", name: "Toyota" },
      model: "Camry",
      vehicleModelDate: "2021",
      vehicleIdentificationNumber: "4T1C11AK3MU436772",
      mileageFromOdometer: { "@type": "QuantitativeValue", value: 183086, unitCode: "SMI" },
      color: "Blueprint",
      vehicleTransmission: "8-Speed Automatic",
      offers: { "@type": "Offer", price: 9900, priceCurrency: "USD", seller: { "@type": "AutoDealer", name: "Gwatney Buick GMC" } },
    },
  ],
};
const MAIN_TEXT = "Used 2021 Toyota Camry LE FWD\nSherwood, AR (969 mi away)\n183,086 mi\n$9,900\nGreat Price · $460 below market\n" +
  "Vehicle History Report\nAccident or Damage Reported\nMultiple Owners\n" + "Similar cars ".repeat(60);

/** Run the bookmark's code against a fake page and return the URL it opens. */
function runOnFakePage(href: string, opts: { ld?: unknown; mainText?: string; bodyText?: string; title?: string; description?: string | null } = {}) {
  let opened: string | null = null;
  let features = "";
  const doc = {
    title: opts.title ?? "Used 2021 Toyota Camry LE for sale",
    querySelectorAll: () => (opts.ld ? [{ textContent: JSON.stringify(opts.ld) }, { textContent: "{not json" }] : []),
    querySelector: (sel: string) =>
      sel.startsWith("meta") ? (opts.description === null ? null : { getAttribute: () => opts.description ?? "2021 Toyota Camry LE for sale in Sherwood, AR" })
        : sel.startsWith("main") && opts.mainText ? { innerText: opts.mainText }
          : null,
    body: { innerText: opts.bodyText ?? "" },
  };
  const win = { open: (u: string, _t: string, f: string) => { opened = u; features = f; } };
  const code = decodeURIComponent(href.slice("javascript:".length));
  new Function("window", "document", "location", code)(win, doc, { href: "https://www.autotrader.com/cars-for-sale/vehicle/793308375" });
  return { opened: opened as string | null, features };
}

describe("bookmarklet", () => {
  it("builds a javascript: URL for this site's origin only", () => {
    const href = bookmarkletHref(`${ORIGIN}/some/path?x=1`);
    expect(href.startsWith("javascript:")).toBe(true);
    expect(bookmarkletSource(`${ORIGIN}/a`)).toContain(JSON.stringify(ORIGIN));
    expect(() => bookmarkletSource("not a url")).toThrow();
  });

  it("sends structured data first, then page text, in the URL fragment with noopener", () => {
    const { opened, features } = runOnFakePage(bookmarkletHref(ORIGIN), { ld: JSON_LD, mainText: MAIN_TEXT });
    expect(opened).not.toBeNull();
    const url = new URL(opened!);
    expect(url.origin).toBe(ORIGIN);
    expect(url.search).toBe(""); // nothing that a server would log
    expect(features).toContain("noopener");

    const text = readListingHash(url.hash, MAX_LISTING_CHARS)!;
    expect(text).toContain("Source: https://www.autotrader.com/");
    expect(text.indexOf("VIN: 4T1C11AK3MU436772")).toBeLessThan(text.indexOf("[Page text]"));
    expect(text).toContain("Seller: Gwatney Buick GMC (dealer)");

    const p = parseListing(text);
    expect(p).toMatchObject({
      kind: "text", vin: "4T1C11AK3MU436772", year: 2021, make: "Toyota", model: "Camry",
      price: 9900, miles: 183086, sellerType: "dealer", accident: "reported", transmission: "automatic", distanceMiles: 969,
      sourceHost: "autotrader.com",
    });
  });

  it("falls back to the whole page text when there's no structured data or main area", () => {
    const { opened } = runOnFakePage(bookmarkletHref(ORIGIN), {
      title: "2018 Honda Civic - Marketplace", description: null, bodyText: "2018 Honda Civic $12,000 70,000 miles",
    });
    const p = parseListing(readListingHash(new URL(opened!).hash, MAX_LISTING_CHARS)!);
    expect(p).toMatchObject({ year: 2018, make: "Honda", model: "Civic", price: 12000, miles: 70000 });
  });

  it("caps what it sends", () => {
    const { opened } = runOnFakePage(bookmarkletHref(ORIGIN), { bodyText: "x".repeat(50_000) });
    expect(readListingHash(new URL(opened!).hash, 1e9)!.length).toBeLessThanOrEqual(19_000);
  });
});

describe("readListingHash", () => {
  it("reads only its own marker and survives junk", () => {
    expect(readListingHash(`${LISTING_HASH}${encodeURIComponent("2017 Accord $9,000")}`, 100)).toBe("2017 Accord $9,000");
    expect(readListingHash("#other=1", 100)).toBeNull();
    expect(readListingHash(`${LISTING_HASH}%E0%A4%A`, 100)).toBeNull(); // malformed escape
    expect(readListingHash(`${LISTING_HASH}`, 100)).toBeNull();
    expect(readListingHash(`${LISTING_HASH}${"a".repeat(50)}`, 10)).toHaveLength(10);
  });
});
