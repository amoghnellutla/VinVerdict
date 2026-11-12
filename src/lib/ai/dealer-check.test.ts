import { describe, expect, it } from "vitest";
import { checkDealerRead, dealerMessages, jsonLdListing, mergeDealer, pageHasVin, pageText, relevantText } from "./dealer-check";

const VIN = "4T1F11AK9LU310542";
const PAGE = `<html><head><script>var tracking = "${VIN} $99,999";</script><style>p{}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Car","vehicleIdentificationNumber":"${VIN}","mileageFromOdometer":{"@type":"QuantitativeValue","value":"82654"},"offers":{"@type":"Offer","price":"17985","availability":"https://schema.org/InStock","seller":{"@type":"AutoDealer","name":"Fast Track Motors"}}}]}</script></head>
<body><h1>2020 Toyota Camry XLE</h1><p>VIN: ${VIN} &amp; Stock A0xG</p><p>Price $17,985 &nbsp; Doc fee $999</p><!-- hidden $1 --></body></html>`;

describe("Check the dealers for me", () => {
  it("reads the page's text, without scripts, styles or comments", () => {
    const t = pageText(PAGE);
    expect(t).toContain(`VIN: ${VIN} & Stock A0xG`);
    expect(t).not.toContain("tracking");
    expect(t).not.toContain("$99,999");
    expect(t).not.toContain("hidden");
    expect(pageHasVin(t, VIN.toLowerCase())).toBe(true);
    expect(pageHasVin(t, "1HGCR2F8XHA000123")).toBe(false);
  });

  it("reads the page's own listing data first, no AI needed", () => {
    expect(jsonLdListing(PAGE, VIN)).toEqual({ price: 17985, miles: 82654, status: "listed", dealer: "Fast Track Motors" });
    expect(jsonLdListing(PAGE, "1HGCR2F8XHA000123")).toBeNull();
    expect(jsonLdListing("<script type='application/ld+json'>{broken</script>", VIN)).toBeNull();
    const sold = PAGE.replace("InStock", "SoldOut");
    expect(jsonLdListing(sold, VIN)?.status).toBe("sold");
  });

  it("keeps only the AI's numbers that are on the page", () => {
    const t = pageText(PAGE);
    expect(checkDealerRead({ status: "listed", price: 17985, miles: 82654, fees: [{ label: "Doc fee", amount: 999 }, { label: "Prep", amount: 495 }], certified: false, dealer: "Fast Track Motors" }, t)).toEqual({
      // 82,654 is only in the page's hidden listing data, not its visible text: the AI's figure isn't kept.
      status: "listed", price: 17985, miles: null, fees: [{ label: "Doc fee", amount: 999 }], certified: false, dealer: "Fast Track Motors",
    });
    expect(checkDealerRead({ status: "whatever", price: 15000 }, t)).toMatchObject({ status: "unclear", price: null });
    expect(checkDealerRead("x", t)).toBeNull();
  });

  it("structured data wins over the AI; the AI fills the gaps", () => {
    const merged = mergeDealer({ price: 17985, status: "listed" }, { status: "sold", price: 1, miles: 82654, fees: [{ label: "Doc fee", amount: 999 }], certified: true, dealer: "X" });
    expect(merged).toEqual({ status: "listed", price: 17985, miles: 82654, fees: [{ label: "Doc fee", amount: 999 }], certified: true, dealer: "X" });
  });

  it("sends a long page's text around the VIN, fenced as data", () => {
    const long = `${"filler ".repeat(5000)} VIN ${VIN} price $17,985 ${"more ".repeat(5000)}`;
    const part = relevantText(long, VIN);
    expect(part.length).toBeLessThanOrEqual(12_000);
    expect(part).toContain(VIN);
    expect(String(dealerMessages(part, VIN)[1].content)).toMatch(/^VIN: 4T1F11AK9LU310542\nPAGE TEXT:\n<<</);
  });
});
