import { describe, expect, it } from "vitest";
import { decide } from "./decision";
import { EMPTY_REPORT } from "./history-report";
import { parseListing } from "./listing/parse";
import { checkReplies } from "./seller-replies";

const AD = parseListing("2017 Honda Accord EX-L $9,000\n98,000 miles, clean title, no accidents\nPrivate seller in Princeton. VIN 1HGCR2F8XHA000123");
const ids = (r: string) => checkReplies(r, AD).map((h) => h.id);

describe("checkReplies", () => {
  it("nothing to check: no findings", () => {
    expect(checkReplies("", AD)).toEqual([]);
    expect(ids("Sure, it's still available. You can come see it Saturday morning, bring your mechanic.")).toEqual([]);
  });

  it("catches a deposit request that only shows up in the chat, quotes it and suggests a reply", () => {
    const [h] = checkReplies("Hi! Yes available. Lots of interest though.\nSend $200 on Zelle to hold it before you come and I'll text you the address.", AD);
    expect(h.id).toBe("msg-pay-app-upfront");
    expect(h.quote).toMatch(/Send \$200 on Zelle/);
    expect(h.suggest).toMatch(/don't send money before/);
  });

  it("catches the away-now and shipping story", () => {
    expect(ids("I'm currently deployed overseas so the car is with a transport company, they deliver it after payment.")).toEqual(
      expect.arrayContaining(["msg-seller-remote", "msg-shipping-only"]),
    );
  });

  it("catches stories that change from the ad", () => {
    expect(ids("It actually has 131,000 miles, the ad was a typo.")).toContain("msg-story-miles");
    expect(ids("To be honest it has a rebuilt title, but it drives great.")).toContain("msg-story-title");
    expect(ids("It had a small fender bender last year, all fixed.")).toContain("msg-story-accident");
    // Small differences and denials aren't contradictions.
    expect(ids("It has 98,400 miles now.")).not.toContain("msg-story-miles");
    expect(ids("No accidents, never been hit.")).not.toContain("msg-story-accident");
  });

  it("feeds the verdict: a payment demand in the chat stops it, labelled as the seller's messages", () => {
    const hits = checkReplies("Send the deposit by Cash App first, then we meet.", AD);
    const d = decide({ hits, kind: "text", hasVin: true, hasPrice: true, decoded: false, recalls: null, report: EMPTY_REPORT, checklist: {}, listingStatesHistory: false, priced: false, price: null });
    expect(d.level).toBe("stop");
    expect(d.text).toMatch(/seller's messages/);
    expect(d.findings[0].evidence).toBe("messages");
    expect(d.areas.find((a) => a.area === "deal")!.status).toBe("stop");
  });
});
