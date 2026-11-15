"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { useReportPart } from "./report-parts";
import { readDealSheetAction } from "@/app/actions/ai";
import { Turnstile } from "@/components/Turnstile";
import { compareReads, type AiDealRead } from "@/lib/ai/dealsheet-read";
import { EXAMPLES } from "@/lib/dealsheet/example";
import { diffPapers, forgetPapers, keepPaper, loadPapers, snapshot, type PaperChange, type PaperSnapshot } from "@/lib/dealsheet/diff";
import { CopyButton } from "@/components/CopyButton";
import { ExternalLink } from "@/components/ExternalLink";
import { readBuyerZip } from "@/lib/buyer-zip";
import { checkDealSheet, type AdFacts, type Verdict } from "@/lib/dealsheet/check";
import { negotiationPlan } from "@/lib/dealsheet/negotiate";
import { parseDealSheet } from "@/lib/dealsheet/parse";
import { redactDealSheet } from "@/lib/dealsheet/redact";
import { isStateCode, STATES, type StateCode } from "@/lib/geo/zip";
import type { OcrProgress } from "@/lib/ocr";

const MAX_TEXT = 40_000;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cents = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const subscribeNever = () => () => {};

/** One change between two papers, in words. */
function changeText(c: PaperChange): string {
  if (c.type === "added") return `Added: ${c.line.label}, ${cents(c.line.amount)}.`;
  if (c.type === "removed") return `Gone: ${c.line.label}, ${cents(c.line.amount)}.`;
  return `${c.label}: ${cents(c.from)} then, ${cents(c.to)} now.`;
}

/** The assistant sends a pasted buyer's order here (its text, already on this device). */
export const DEAL_EVENT = "vinverdict:deal-sheet";

const BADGE: Record<Verdict, { word: string; cls: string }> = {
  right: { word: "Right", cls: "bg-good-soft text-good" },
  wrong: { word: "Wrong", cls: "bg-bad-soft text-bad" },
  remove: { word: "Remove", cls: "bg-warn-soft text-warn" },
  check: { word: "Check this", cls: "bg-warn-soft text-warn" },
  credit: { word: "Credit", cls: "bg-surface-muted text-foreground" },
  info: { word: "Info", cls: "bg-surface-muted text-muted" },
};

/**
 * "Check the dealer's numbers": attach or paste the buyer's order, worksheet, contract or quote (PDF, photo or
 * text), and every line is read and checked on this device, with a negotiation plan that assumes every add-on is
 * refused. Nothing is uploaded; the buyer's own details are taken out before anything is shown.
 */
export function DealSheet({ ad, car = null, modelYear = null, standalone = false, guest = true, ai = false, onChecked = null, onExample = null, defaultCondition = "used" }: {
  ad: AdFacts | null;
  car?: string | null;
  modelYear?: number | null;
  /** On its own page, under the page's own title. */
  standalone?: boolean;
  /** "Try it with an example": the page fills in the example's ad price and fee; the paper is checked here. */
  onExample?: ((ad: { price: number; docFee: number | null }) => void) | null;
  /** New or used to start with (the buyer's button changes it). VinVerdict's listings are used cars. */
  defaultCondition?: "new" | "used";
  /** A visitor (the AI double-check needs the "I'm human" check). */
  guest?: boolean;
  /** AI mode is on. */
  ai?: boolean;
  /** The result's verdict shows the outcome in its "Ready to pay" row. */
  onChecked?: ((s: { summary: string; wrong: number; remove: number } | null) => void) | null;
}) {
  const [text, setText] = useState("");
  const [read, setRead] = useState<{ text: string; from: string; removed: number; at: string } | null>(null);
  // Papers the buyer chose to keep on this device, to compare with the final one.
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [savedState, setSaved] = useState<PaperSnapshot[] | null>(null);
  const saved = savedState ?? (inBrowser ? loadPapers() : []);
  const [compareId, setCompareId] = useState<string>("");
  const [keptMsg, setKeptMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<StateCode | "">(() => {
    const z = readBuyerZip();
    return z.saved ? z.state : "";
  });
  const [myApr, setMyApr] = useState("");
  const [condition, setCondition] = useState<"new" | "used">(defaultCondition);
  const [aiRead, setAiRead] = useState<{ read: AiDealRead; provider: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);

  async function readFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    const progress = (p: OcrProgress) => setBusy(p.loading ? "Getting the reader ready (first time only)…" : `Reading page ${p.image} of ${p.of}… ${p.pct}%`);
    try {
      const texts: string[] = [];
      const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
      const images = files.filter((f) => f.type.startsWith("image/") && !f.type.includes("svg"));
      if (!pdfs.length && !images.length) throw new Error("type");
      for (const f of pdfs.slice(0, 3)) {
        setBusy("Reading the PDF…");
        const { readPdf } = await import("@/lib/pdf-read");
        texts.push((await readPdf(f, progress)).text);
      }
      if (images.length) {
        const { pickImages, readEachScreenshot } = await import("@/lib/ocr");
        texts.push(...(await readEachScreenshot(pickImages(images).files, progress)));
      }
      const joined = texts.join("\n\n").slice(0, MAX_TEXT);
      if (joined.replace(/\s/g, "").length < 20) throw new Error("empty");
      check(joined, files.length === 1 ? files[0].name : `${files.length} files`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg === "type" ? "Attach a PDF or a photo (JPG or PNG)."
          : msg === "too large" ? "That PDF is over 15 MB. Attach a photo of each page instead."
          : msg === "empty" ? "Couldn't find any text in it. Try a clearer photo, straight on and well lit, or paste the numbers."
          : "Couldn't read that file. Try a photo of each page, or paste the numbers.",
      );
    }
    setBusy(null);
  }

  function check(raw: string, from: string) {
    const red = redactDealSheet(raw.slice(0, MAX_TEXT));
    // The box shows what was checked: the paper without the buyer's own details.
    setText(red.text);
    setRead({ text: red.text, from, removed: red.removed, at: new Date().toISOString() });
    setKeptMsg(null);
    // A new paper: an earlier AI reading was of another one.
    setAiRead(null);
    setAiMsg(null);
  }

  const st = state && isStateCode(state) ? state : null;
  const apr = myApr.trim() ? Number(myApr) : null;
  const result = useMemo(() => {
    if (!read) return null;
    const both = compareReads(parseDealSheet(read.text), aiRead?.read ?? null);
    const sheet = both.sheet;
    const c = checkDealSheet({ sheet, ad, state: st, modelYear, condition, myAprPct: apr != null && Number.isFinite(apr) ? apr : null, aiAgrees: aiRead ? both.aiAgrees : undefined });
    const plan = negotiationPlan({ sheet, check: c, ad, state: st, modelYear, car, myAprPct: apr != null && Number.isFinite(apr) ? apr : null });
    return { sheet, c, plan, both };
  }, [read, ad, st, modelYear, car, apr, aiRead, condition]);

  const current = useMemo(() => (result && read && result.sheet.lines.length ? snapshot(result.sheet, result.c, { car, from: read.from, at: new Date(read.at) }) : null), [result, read, car]);
  const others = saved.filter((x) => x.id !== current?.id);
  const earlier = others.find((x) => x.id === compareId) ?? others[0] ?? null;
  const diff = current && earlier ? diffPapers(earlier, current) : null;

  // A buyer's order pasted into the assistant is checked here.
  useEffect(() => {
    const onPaste = (e: Event) => {
      const t = (e as CustomEvent<unknown>).detail;
      if (typeof t !== "string" || !t.trim()) return;
      check(t, "what you pasted to the assistant");
      document.getElementById("dealer-numbers")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(DEAL_EVENT, onPaste);
    return () => window.removeEventListener(DEAL_EVENT, onPaste);
  });

  // The downloadable report and the verdict's "Ready to pay" row follow what's shown here.
  useReportPart(
    "dealSheet",
    useMemo(
      () =>
        result && result.sheet.lines.length
          ? {
              summary: result.c.summary,
              hiddenTotal: result.c.hiddenTotal,
              target: result.plan.target,
              plusTax: result.plan.plusTax,
              rows: result.c.rows.map((r) => ({ label: r.line.label, amount: r.line.amount, verdict: BADGE[r.verdict].word, note: r.note })),
              loan: result.c.loan?.note ?? null,
              message: result.plan.message,
              ai: aiRead?.provider ?? null,
            }
          : null,
      [result, aiRead],
    ),
  );
  useEffect(() => {
    if (!onChecked) return;
    if (!result || !result.sheet.lines.length) return onChecked(null);
    onChecked({
      summary: result.c.summary,
      wrong: result.c.rows.filter((r) => r.verdict === "wrong").length + (result.c.loan?.verdict === "wrong" ? 1 : 0),
      remove: result.c.rows.filter((r) => r.verdict === "remove").length,
    });
  }, [result, onChecked]);

  async function askAi() {
    if (!read || aiBusy || (guest && !token)) return;
    setAiBusy(true);
    setAiMsg(null);
    try {
      const r = await readDealSheetAction({ text: read.text, token });
      if (r.status === "error") setAiMsg(r.message);
      else if (!r.read) setAiMsg(`${r.provider} couldn't read a line it could quote from the paper, so nothing changed.`);
      else setAiRead({ read: r.read, provider: r.provider });
    } catch {
      setAiMsg("Couldn't reach VinVerdict. Check your connection and try again.");
    }
    setAiBusy(false);
    setToken(null);
    setAttempt((n) => n + 1);
  }

  return (
    <section id="dealer-numbers" aria-labelledby="dealer-numbers-title" className="space-y-4 rounded-lg border border-border px-4 py-4">
      <div>
        <h2 id="dealer-numbers-title" className={standalone ? "sr-only" : "text-xl font-semibold"}>Check the dealer&apos;s numbers</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Before you sign, attach the buyer&apos;s order, worksheet, contract, or the quote they emailed or texted. VinVerdict reads every line,
          says what&apos;s right and what&apos;s wrong, and plans how to bring the price down, with every add-on refused. It&apos;s read on this
          device: your name, address and licence number are taken out first, and nothing is uploaded.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm print:hidden" role="group" aria-label="New or used car">
        <span className="font-semibold">This car is</span>
        {(["used", "new"] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={condition === c}
            className={`rounded-md border px-3 py-1.5 font-semibold ${condition === c ? "border-accent bg-accent text-accent-foreground" : "border-border-strong"}`}
            onClick={() => setCondition(c)}
          >
            {c === "used" ? "Used car" : "New car"}
          </button>
        ))}
        <span className="text-muted">
          {condition === "used" ? "Checks the Buyers Guide, and flags new-car charges like destination." : "Checks against the window sticker, destination charge and rebates."}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="btn btn-secondary cursor-pointer">
          Attach PDF or photo
          <input type="file" accept="application/pdf,image/*" multiple className="sr-only" onChange={(e) => void readFiles(e)} disabled={!!busy} />
        </label>
        <span className="text-sm text-muted">or paste it below</span>
        {onExample && (
          <button
            type="button"
            className="link text-sm"
            disabled={!!busy}
            onClick={() => {
              const ex = EXAMPLES[condition];
              onExample({ price: ex.ad.price, docFee: ex.ad.docFee });
              setState(ex.state);
              check(ex.paper, `the made-up ${condition}-car example`);
            }}
          >
            No paper yet? Try it with an example
          </button>
        )}
      </div>
      <div className="print:hidden">
        <label htmlFor="deal-text" className="sr-only">The dealer&apos;s numbers</label>
        <textarea
          id="deal-text"
          className="field resize-y"
          rows={4}
          maxLength={MAX_TEXT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Vehicle Price $21,998.00\nDoc Fee $799.00\nVIN Etching $399.00\n…"}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!text.trim() || !!busy} onClick={() => check(text, "what you pasted")}>
            Check the numbers
          </button>
          <label className="text-sm">
            Where you&apos;ll register it{" "}
            <select className="field ml-1 inline-block w-auto py-1" value={state} onChange={(e) => setState(e.target.value as StateCode | "")}>
              <option value="">Choose a state</option>
              {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
        </div>
        {busy && <p role="status" className="mt-2 text-sm">{busy}</p>}
        {error && <p role="alert" className="mt-2 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      </div>

      {result && read && (
        <div className="space-y-5">
          <div className={`rounded-md px-4 py-3 ${result.c.hiddenTotal > 0 ? "bg-warn-soft" : "bg-good-soft"}`}>
            <p className="text-lg font-semibold">
              {result.c.hiddenTotal > 0
                ? `Up to ${usd(result.c.hiddenTotal)} you can ask them to take off`
                : !result.sheet.lines.length
                  ? "No lines read"
                  : result.c.rows.some((r) => r.verdict === "check" || r.verdict === "wrong") || result.c.loan?.verdict === "check"
                    ? "Nothing to take off, but some lines to ask about"
                    : "Every line checks out"}
            </p>
            <p className="text-sm">
              {result.sheet.lines.length
                ? `${result.c.summary.replace(/^Dealer's numbers: /, "").replace(/; up to \$[\d,]+ to take off\.$/, ".")} Read from ${read.from}${read.removed ? `; ${read.removed} personal ${read.removed === 1 ? "detail" : "details"} taken out` : ""}.`
                : "Couldn't find lines with amounts. Paste the numbers as text, or attach a clearer photo."}
            </p>
            {!result.c.confirmed && result.c.reconcile.totals.length > 0 && result.sheet.lines.length > 0 && (
              <p className="mt-1 text-sm">
                The lines read don&apos;t add up to a total on the paper yet, so nothing is called wrong: lines that look off say &quot;Check this&quot;.
                Compare them with the paper.
              </p>
            )}
          </div>

          {result.c.lease && (
            <p className="rounded-md border border-border px-4 py-3 text-sm">
              <span className="font-semibold">This is a lease.</span> The selling price, fees and add-ons are checked below. The lease payment itself (money
              factor and residual) isn&apos;t: ask for both in writing. The money factor times 2,400 is roughly the interest rate.
            </p>
          )}
          {result.c.negativeEquity > 0 && (
            <p className="rounded-md bg-warn-soft px-4 py-3 text-sm">
              <span className="font-semibold">{usd(result.c.negativeEquity)} of your old loan is in this deal.</span> Your trade-in is worth less than what you
              owe on it, and the difference is added to what you finance, with interest. Paying it down first, or selling the trade-in yourself, may cost less.
            </p>
          )}
          {result.c.paymentOptions.length >= 2 && (
            <div className="rounded-md border border-border px-4 py-3 text-sm">
              <p className="font-semibold">Payment options on this worksheet</p>
              <ul className="nums mt-1">
                {result.c.paymentOptions.map((o) => (
                  <li key={o.months}>{o.months} months at {cents(o.payment)}: {usd(o.total)} in total</li>
                ))}
              </ul>
              <p className="mt-1 text-muted">A longer term lowers the payment, not the price. Ask for the out-the-door price and the interest rate before choosing.</p>
            </div>
          )}

          {result.sheet.lines.length > 0 && (
            // Phones: one card per line, so the reason is never cut off.
            <ul className="divide-y divide-border border-y border-border text-sm sm:hidden" aria-label="Every line on the dealer's paper, checked">
              {result.c.rows.map((r, i) => (
                <li key={i} className="py-2">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{r.line.label}</span>
                    <span className="nums shrink-0">{r.line.declined && r.line.amount > 0 ? "Declined" : cents(r.line.amount)}</span>
                  </span>
                  <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold ${BADGE[r.verdict].cls}`}>{BADGE[r.verdict].word}</span>{" "}
                  {r.note}
                  {r.source && <> <ExternalLink href={r.source.href} className="link">{r.source.name}</ExternalLink></>}
                </li>
              ))}
            </ul>
          )}
          {result.sheet.lines.length > 0 && (
            <div className="hidden sm:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Every line on the dealer&apos;s paper, checked</caption>
                <thead className="border-b border-border text-muted">
                  <tr><th className="py-2 pr-3 font-medium">Line on the paper</th><th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 pr-3 font-medium">Verdict</th><th className="py-2 font-medium">Why</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.c.rows.map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="py-2 pr-3">{r.line.label}</td>
                      <td className="nums py-2 pr-3 text-right">{r.line.declined && r.line.amount > 0 ? "Declined" : cents(r.line.amount)}</td>
                      <td className="py-2 pr-3"><span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${BADGE[r.verdict].cls}`}>{BADGE[r.verdict].word}</span></td>
                      <td className="py-2">
                        {r.note}
                        {r.source && <> <ExternalLink href={r.source.href} className="link">{r.source.name}</ExternalLink></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {aiRead && (
            <p className="text-sm">
              A free AI ({aiRead.provider}) read the paper too, quoting its words: it read the same on {result.both.aiAgrees.filter(Boolean).length} of {result.sheet.lines.length - result.both.aiOnly} lines
              {result.both.aiOnly ? `, and found ${result.both.aiOnly} more (marked "read by the AI": compare them with the paper)` : ""}
              {result.both.differs ? `; ${result.both.differs} read differently say "Check this"` : ""}.
            </p>
          )}
          {ai && !aiRead && result.sheet.lines.length > 0 && (
            <div className="rounded-md border border-border px-4 py-3 text-sm print:hidden">
              <p>
                <span className="font-semibold">Double-check with free AI.</span> Every dealer&apos;s paper is laid out differently. A second reader, a free AI
                service (GLM by Z.ai, or Gemini by Google, or Groq), reads the paper&apos;s text with your details already taken out, and must quote the paper for
                every line. Lines both readers agree on are confirmed; any difference is shown for you to compare. Google&apos;s free tier may keep what&apos;s sent.
              </p>
              {/* Nothing is contacted until the buyer asks: the "I'm human" check (Cloudflare) loads only after this tap. */}
              {guest && !aiOpen ? (
                <button type="button" className="btn btn-secondary mt-2" onClick={() => setAiOpen(true)}>Double-check with free AI</button>
              ) : (
                <>
                  {guest && <Turnstile key={attempt} action="ai" onToken={setToken} />}
                  <button type="button" className="btn btn-secondary mt-2" disabled={aiBusy || (guest && !token)} onClick={() => void askAi()}>
                    {aiBusy ? "Reading…" : guest ? "Send to the free AI" : "Double-check with free AI"}
                  </button>
                </>
              )}
              {aiMsg && <p role="status" className="mt-2">{aiMsg}</p>}
            </div>
          )}

          {result.c.leaseMath && (
            <div className="rounded-md border border-border px-4 py-3 text-sm">
              <p className="font-semibold">The lease payment</p>
              <p className="mt-1"><span className={`mr-2 inline-block rounded px-2 py-0.5 text-xs font-semibold ${BADGE[result.c.leaseMath.verdict].cls}`}>{BADGE[result.c.leaseMath.verdict].word}</span>{result.c.leaseMath.note}</p>
            </div>
          )}

          {(result.c.loan || result.sheet.loan.aprPct != null) && !result.c.lease && (
            <div className="rounded-md border border-border px-4 py-3 text-sm">
              <p className="font-semibold">The loan</p>
              {result.c.loan ? (
                <>
                  <p className="mt-1"><span className={`mr-2 inline-block rounded px-2 py-0.5 text-xs font-semibold ${BADGE[result.c.loan.verdict].cls}`}>{BADGE[result.c.loan.verdict].word}</span>{result.c.loan.note}</p>
                  {result.c.loan.without && result.c.loan.without.drop > 0 && (
                    <p className="mt-1 font-semibold">
                      Without the {usd(result.c.loan.without.amount)} to take off, the payment would be {cents(result.c.loan.without.payment)}: {cents(result.c.loan.without.drop)} less
                      a month. Inside this loan, those charges cost {usd(result.c.loan.without.withInterest)} with interest.
                    </p>
                  )}
                  {result.c.loan.longTerm && <p className="mt-1">{result.c.loan.longTerm}</p>}
                </>
              ) : (
                <p className="mt-1 text-muted">The rate was read, but not the amount financed, term and payment together, so the payment can&apos;t be checked. Ask for the full loan terms in writing.</p>
              )}
              <label className="mt-2 block">
                Your bank or credit union&apos;s pre-approved rate (APR %){" "}
                <input className="field ml-1 inline-block w-24 py-1" inputMode="decimal" maxLength={6} value={myApr} onChange={(e) => setMyApr(e.target.value.replace(/[^\d.]/g, ""))} placeholder="6.5" />
              </label>
              {result.c.loan?.atMyRate ? <p className="mt-1">At {myApr}% instead of {result.c.loan.aprPct}%, you&apos;d pay {usd(result.c.loan.atMyRate)} less interest over the loan.</p> : null}
            </div>
          )}

          <div className="rounded-md border border-border px-4 py-3 text-sm print:hidden">
            <p className="font-semibold">Compare with the final paper</p>
            {diff && earlier ? (
              <>
                <label className="mt-1 block">
                  Compared with{" "}
                  <select className="field ml-1 inline-block w-auto py-1" value={earlier.id} onChange={(e) => setCompareId(e.target.value)}>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>{new Date(o.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}, {o.car ?? "a car"}, {o.from}</option>
                    ))}
                  </select>
                </label>
                {diff.changes.length === 0 ? (
                  <p className="mt-2">Same lines and amounts as that paper.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {diff.changes.map((c, i) => {
                      const bad = diff.worse.includes(c);
                      return <li key={i} className={bad ? "font-semibold text-bad" : ""}>{changeText(c)}{bad ? " Ask why: it wasn't agreed on the earlier paper." : ""}</li>;
                    })}
                  </ul>
                )}
                {diff.total.from != null && diff.total.to != null && diff.total.from !== diff.total.to && (
                  <p className="mt-1">Total: {cents(diff.total.from)} then, {cents(diff.total.to)} now ({diff.total.to > diff.total.from ? "+" : "-"}{cents(Math.abs(diff.total.to - diff.total.from))}).</p>
                )}
                {diff.payment.from != null && diff.payment.to != null && diff.payment.from !== diff.payment.to && (
                  <p className="mt-1">Monthly payment: {cents(diff.payment.from)} then, {cents(diff.payment.to)} now.</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-muted">
                Keep this paper, and when they hand you the final contract, check it here too: VinVerdict shows anything added or changed since. Products are
                often added in the finance office after the price is agreed.
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!current || saved.some((x) => x.id === current?.id)}
                onClick={() => {
                  if (!current) return;
                  setKeptMsg(keepPaper(current) ? "Kept on this device (its lines only; your details were already taken out)." : "This browser won't keep it (private mode or storage blocked).");
                  setSaved(loadPapers());
                }}
              >
                {current && saved.some((x) => x.id === current.id) ? "Kept" : "Keep this paper to compare"}
              </button>
              {saved.length > 0 && (
                <button type="button" className="link text-sm" onClick={() => { forgetPapers(); setSaved([]); setKeptMsg("Forgotten."); }}>Forget kept papers</button>
              )}
              {keptMsg && <span role="status" className="text-muted">{keptMsg}</span>}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Your negotiation plan</h3>
            {result.plan.target != null && (
              <div className="rounded-md bg-surface-muted px-4 py-3">
                <p className="text-sm text-muted">Out-the-door price to ask for, with every add-on refused</p>
                <p className="nums text-2xl font-bold">{usd(result.plan.target)}{result.plan.plusTax ? " plus tax" : ""}</p>
                <ul className="mt-1 text-sm">
                  {result.plan.parts.map((p) => (
                    <li key={p.label}>{p.label}: {p.amount != null ? usd(p.amount) : "—"}{p.note ? <span className="text-muted"> ({p.note})</span> : null}</li>
                  ))}
                </ul>
              </div>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {result.plan.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <div>
              <p className="text-sm font-semibold">Message to send the dealer</p>
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-border px-3 py-2 text-sm">{result.plan.message}</p>
              <CopyButton text={result.plan.message} label="Copy message" className="btn btn-secondary mt-2" />
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">If they say…</summary>
              <ul className="mt-2 space-y-2">
                {result.plan.scripts.map((s) => (
                  <li key={s.they}>
                    <span className="text-muted">&ldquo;{s.they}&rdquo;</span>
                    <span className="block">You: &ldquo;{s.you}&rdquo;{s.source && <> <ExternalLink href={s.source.href} className="link">{s.source.name}</ExternalLink></>}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}
    </section>
  );
}
