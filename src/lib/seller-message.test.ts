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

  it("makes three-word phrases from the word list", () => {
    let i = 0;
    const seq = [0, 24, 47];
    expect(proofPhrase(() => seq[i++])).toBe("maple jasmine jungle");
    expect(proofPhrase()).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
  });
});
