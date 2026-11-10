import { describe, expect, it } from "vitest";
import { features, leaveOneOut, predict, scoreText, train } from "./learned";

const DATA = [
  { scam: true, text: "I'm deployed overseas, send a Zelle deposit and the shipping company delivers it." },
  { scam: true, text: "Send the deposit by gift card, the car is with a shipping company." },
  { scam: true, text: "Zelle deposit first, I'm overseas, it ships from storage." },
  { scam: false, text: "Clean title, come see it, test drives welcome, cash at the bank." },
  { scam: false, text: "Come see it this weekend. Cash or cashier's check at the bank." },
  { scam: false, text: "One owner, service records, come see it and bring your mechanic." },
];

describe("trained model (naive Bayes)", () => {
  it("counts each word and word pair once, with numbers folded", () => {
    const f = features("Send $200 send $300");
    expect(f.has("send")).toBe(true);
    expect(f.has("$#")).toBe(true);
    expect(f.has("send $#")).toBe(true);
  });

  it("learns from labelled examples and scores new text", () => {
    const m = train(DATA);
    expect(m.trainedOn).toBe(6);
    expect(predict(m, "Overseas right now, Zelle deposit and the shipping company brings it.")).toBe(true);
    expect(predict(m, "Come see it, test drives welcome, pay at the bank.")).toBe(false);
  });

  it("is deterministic: the same data gives the same score", () => {
    const t = "Zelle deposit, come see it";
    expect(scoreText(train(DATA), t)).toBe(scoreText(train([...DATA]), t));
  });

  it("leave-one-out never scores an example with a model that saw it", () => {
    const rows = leaveOneOut(DATA);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.scam)).toEqual(DATA.map((d) => d.scam));
  });
});
