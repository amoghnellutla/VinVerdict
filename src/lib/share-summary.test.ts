import { describe, expect, it } from "vitest";
import { decide } from "./decision";
import { EMPTY_REPORT } from "./history-report";
import { shareSummary } from "./share-summary";

const base = { kind: "text" as const, hasVin: true, hasPrice: true, decoded: true, recalls: 2, report: EMPTY_REPORT, checklist: {}, listingStatesHistory: false, priced: false, price: null };

describe("shareSummary", () => {
  it("summarises the verdict, the four checks, warnings and unknowns, with a VIN link", () => {
    const d = decide({ ...base, hits: [{ id: "deposit-first", action: "hide", title: "Deposit before viewing", reason: "" }] });
    const text = shareSummary({ name: "2017 Honda Accord EX-L", price: 9000, miles: 98000, vin: "1HGCR2F8XHA000123" }, d);
    expect(text).toMatch(/^VinVerdict check: 2017 Honda Accord EX-L \(\$9,000, 98,000 miles\)\nNext step: Stop: serious warning/);
    expect(text).toContain("- Listing trust: Warning, Deposit before viewing");
    expect(text).toContain("Main warnings:\n- Deposit before viewing");
    expect(text).toContain("Still unknown:");
    expect(text).toMatch(/Check it yourself: https:\/\/vinverdict\.vercel\.app\/#listing=1HGCR2F8XHA000123$/);
  });

  it("without a VIN, links the site only (the ad text is never included)", () => {
    const d = decide({ ...base, hasVin: false, hits: [] });
    const text = shareSummary({ name: "2017 Honda Civic", price: null, miles: null, vin: null }, d);
    expect(text).toMatch(/^VinVerdict check: 2017 Honda Civic\n/);
    expect(text).toMatch(/Check a listing yourself: https:\/\/vinverdict\.vercel\.app$/);
    expect(text).not.toContain("#listing=");
    const vinOnly = shareSummary({ name: "2016 Lexus RX 350", price: null, miles: null, vin: null }, decide({ ...base, kind: "vin", hits: [] }));
    expect(vinOnly).toContain("- Listing trust: Not checked: paste the ad");
    expect(vinOnly).not.toContain("Not checked, Not checked");
  });
});
