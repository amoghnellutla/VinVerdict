import { describe, expect, it } from "vitest";
import { parseListing } from "./listing/parse";
import { proofPhrase, sellerMessage } from "./seller-message";

const listing = parseListing("2016 Honda Accord EX $9,000\n98,000 miles\nPrivate seller");
const base = { carName: "2016 Honda Accord", listing, hits: [], checklist: {}, recallCount: 3, topComplaint: "POWER TRAIN" };

describe("sellerMessage", () => {
  it("asks about the model year's known issue, naming the maker's document", () => {
    const text = sellerMessage({ ...base, knownIssues: [{ title: "CVT slipping at highway speed (code P1890)", label: "Honda service bulletin 16-053" }] });
    expect(text).toMatch(/known issue \(cvt slipping .*covered by Honda service bulletin 16-053\)/i);
  });

  it("always keeps the photo-with-a-note check for a private seller, with the random phrase", () => {
    const many = { ...base, knownIssues: [{ title: "A", label: "X" }, { title: "B", label: "Y" }] };
    const text = sellerMessage({ ...many, phrase: "copper tulip harbor" });
    expect(text).toMatch(/handwritten note saying "copper tulip harbor"/);
    expect(text.split("\n").filter((l) => /^\d+\. /.test(l))).toHaveLength(8);
  });

  it("asks about the miles in words that fit why they're in doubt", () => {
    const hit = (id: string) => [{ id, action: "flag" as const, title: "", reason: "" }];
    expect(sellerMessage({ ...base, hits: hit("mileage-low") })).toMatch(/very low for its age/);
    expect(sellerMessage({ ...base, hits: hit("mileage-low") })).not.toMatch(/earlier listing/);
    expect(sellerMessage({ ...base, hits: hit("history-rollback") })).toMatch(/earlier listing of this car/);
    expect(sellerMessage({ ...base, hits: hit("odometer-unknown") })).toMatch(/title say about the mileage/);
  });

  it("asks about a branded title and an auction the ad admits, instead of 'is it clean?' (real case 29)", () => {
    const hits = [
      { id: "title-brand", action: "hide" as const, title: "Rebuilt title", reason: "" },
      { id: "auction", action: "hide" as const, title: "Auction car", reason: "" },
    ];
    const text = sellerMessage({ ...base, hits });
    expect(text).toMatch(/The ad says it has a rebuilt title\. What happened to it, what was repaired/);
    expect(text).toMatch(/auction listing or its photos/);
    expect(text).not.toMatch(/is it clean/);
  });

  it("asks which car it is when the description names another model (real case 30)", () => {
    const hits = [{ id: "model-conflict", action: "flag" as const, title: "Listed as a Renegade, described as a Cherokee", reason: "" }];
    expect(sellerMessage({ ...base, hits })).toMatch(/name different models \(listed as a Renegade, described as a Cherokee\)\. Which is it\?/);
  });

  it("makes three-word phrases from the word list", () => {
    let i = 0;
    const seq = [0, 24, 47];
    expect(proofPhrase(() => seq[i++])).toBe("maple jasmine jungle");
    expect(proofPhrase()).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
  });
});
