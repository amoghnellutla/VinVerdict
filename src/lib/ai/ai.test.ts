import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { askMessages, checkAsk, reportSections } from "./ask";
import { aiJson, parseJsonReply } from "./client";
import { foreignLinks, inventedNumbers, numbersIn, plain, quoteIn } from "./guard";
import { PROVIDERS } from "./providers";

const ENV = { ZAI_API_KEY: "z", GEMINI_API_KEY: "g", GROQ_API_KEY: "q" };
const reply = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { "Content-Type": "application/json" } });
const ok = (raw: unknown) => (raw && typeof raw === "object" ? (raw as { v: number }) : null);

describe("aiJson: free providers in order, moving on when one fails", () => {
  it("uses GLM first, with JSON output and its text model", async () => {
    const fetchImpl = vi.fn(async () => reply('{"v":1}'));
    const r = await aiJson({ messages: [{ role: "user", content: "hi" }], validate: ok, fetchImpl, env: ENV });
    expect(r).toEqual({ ok: true, data: { v: 1 }, provider: "glm" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PROVIDERS[0].url);
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "glm-4.7-flash", response_format: { type: "json_object" } });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer z");
  });

  it("falls back on a 429, a network error and an answer that fails the checks, in that order", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply("", 429))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(reply('```json\n{"v":3}\n```'));
    const r = await aiJson({ messages: [], validate: ok, fetchImpl, env: ENV });
    expect(r).toEqual({ ok: true, data: { v: 3 }, provider: "groq" });
    const bad = vi.fn(async () => reply("not json"));
    expect(await aiJson({ messages: [], validate: ok, fetchImpl: bad, env: ENV })).toEqual({ ok: false, reason: "busy" });
    expect(bad).toHaveBeenCalledTimes(3);
  });

  it("skips providers without a key, and Groq for images (no vision model)", async () => {
    const fetchImpl = vi.fn(async () => reply('{"v":1}'));
    expect(await aiJson({ messages: [], validate: ok, fetchImpl, env: {} })).toEqual({ ok: false, reason: "unconfigured" });
    expect(await aiJson({ messages: [], validate: ok, fetchImpl, env: { GROQ_API_KEY: "q" }, vision: true })).toEqual({ ok: false, reason: "unconfigured" });
    await aiJson({ messages: [], validate: ok, fetchImpl, env: { GEMINI_API_KEY: "g" }, vision: true });
    expect(JSON.parse(String((fetchImpl.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body)).model).toBe("gemini-3.8-flash");
  });

  it("reads JSON with or without a fence, and nothing else", () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonReply('Sure!\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonReply("no json here")).toBeUndefined();
    expect(parseJsonReply(42)).toBeUndefined();
  });
});

describe("guards: nothing the source can't back", () => {
  const src = "Asking $20,167. 82,633 miles. Fast Track Motors lists it for $17,985. https://www.fasttrackmotors.com/car/1";

  it("finds invented numbers, but not the source's own (with or without commas and cents)", () => {
    expect(numbersIn("Offer $17,500 at 82633 miles in 2026")).toEqual(["17500", "82633", "2026"]);
    expect(inventedNumbers("It's $20,167 with 82633 miles; Fast Track asks $17,985.00", src)).toEqual([]);
    expect(inventedNumbers("Offer $17,000; it's $2,182 cheaper", src)).toEqual(["17000", "2182"]);
  });

  it("finds links that aren't https or aren't in the source", () => {
    expect(foreignLinks("See https://www.fasttrackmotors.com/car/1.", src)).toEqual([]);
    expect(foreignLinks("See https://evil.example/pay and http://www.fasttrackmotors.com/car/1", src)).toHaveLength(2);
  });

  it("quotes must be in the source, and long enough to mean something", () => {
    expect(quoteIn("fast track MOTORS lists it", src)).toBe(true);
    expect(quoteIn("Fast Track Motors has no accidents", src)).toBe(false);
    expect(quoteIn("$20", src)).toBe(false);
  });

  it("plain text only, bounded", () => {
    expect(plain("<script>alert(1)</script>Hi\u0007", 50)).toBe("alert(1)Hi");
    expect(plain(5, 10)).toBe("");
    expect(plain("x".repeat(20), 5)).toBe("xxxxx");
  });
});

describe("Ask about this car", () => {
  const report = readFileSync("src/lib/ai/fixtures/short-report-case32.md", "utf8");

  it("fences the report, marks the ad untrusted, and keeps earlier turns", () => {
    const m = askMessages(report, "Is it fair?", [{ q: "Who has it?", a: "Two dealers list it." }]);
    expect(m[0].content).toContain("untrusted");
    expect(m[1].content).toMatch(/^REPORT:\n<<<\n---\nreport: VinVerdict/);
    expect(m[1].content).toContain("Q: Who has it?\nA: Two dealers list it.");
    expect(String(m[1].content).endsWith("QUESTION: Is it fair?")).toBe(true);
  });

  it("knows the report's sections", () => {
    expect([...reportSections(report)].sort()).toEqual(["1", "10", "14", "2", "4", "5", "6", "7", "9", "At a glance"].sort());
  });

  it("accepts a grounded answer and drops claims citing sections that don't exist", () => {
    const a = checkAsk(
      {
        answer: "At $20,167 it's above the estimate of $14,700–$18,700, and Fast Track Motors lists the same car for $17,985.",
        claims: [{ text: "Another dealer lists this same car for $2,357 less", section: "2" }, { text: "made up", section: "17" }],
        unknowns: ["Accident details"],
        next: "Call both dealers to confirm who has the car.",
      },
      report,
      "Is it fair?",
    );
    expect(a?.claims).toEqual([{ text: "Another dealer lists this same car for $2,357 less", section: "2" }]);
    expect(a?.unknowns).toEqual(["Accident details"]);
  });

  it("rejects an answer with a number or link the report doesn't have", () => {
    expect(checkAsk({ answer: "Offer $16,250.", claims: [], unknowns: [], next: "" }, report, "What should I offer?")).toBeNull();
    expect(checkAsk({ answer: "Pay here: https://evil.example/pay", claims: [], unknowns: [], next: "" }, report, "How do I pay?")).toBeNull();
    // A number the person typed is fine to repeat.
    expect(checkAsk({ answer: "$18,000 is inside the estimate.", claims: [], unknowns: [], next: "" }, report, "Is $18,000 a good offer?")).not.toBeNull();
    expect(checkAsk(null, report, "q")).toBeNull();
    expect(checkAsk({ answer: "" }, report, "q")).toBeNull();
  });
});
