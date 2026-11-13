"use client";

import { useEffect, useId, useRef, useState } from "react";
import { loadThread, saveThread, toldKey } from "@/lib/assistant/store";
import { askCarAction, readHistoryAction } from "@/app/actions/ai";
import { ExternalLink } from "@/components/ExternalLink";
import { Turnstile } from "@/components/Turnstile";
import type { AskAction } from "@/lib/ai/ask";
import { answerIntent, followUps, SMALL_TALK, smallTalk, starters, type Action, type PageContext, type Reply } from "@/lib/assistant/answers";
import type { Told } from "@/lib/assistant/apply";
import { factText, type Fact } from "@/lib/assistant/facts";
import { routeMessage } from "@/lib/assistant/route";
import { pickImages, readEachScreenshot, type OcrProgress } from "@/lib/ocr";
import { shrink } from "./AiHistoryRead";
import { aiReadAttached, proofFromText, type Attached } from "./CheckYourself";
import { ATTACH_EVENT, TELL_EVENT } from "./KnowsPanel";

/** `read`: a history report waiting for the person's tap (and "I'm human" check) to be read closely. */
type Msg = { id: string; who: "you" | "vv"; text: string; points?: string[]; actions?: Action[]; note?: string; by?: string; vin?: string; read?: { text: string; label: string; thumb: string | null }; quote?: string; next?: string[] };

/** Quick starts shown before the first message. */

const $ = (n: number) => `$${n.toLocaleString("en-US")}`;
const uid = () => crypto.randomUUID();

/** The sections a change shows up in, so they can light up. */
function changedSections(before: PageContext, after: PageContext): string[] {
  const s = new Set<string>();
  if (before.verdict.title !== after.verdict.title || before.stops.join() !== after.stops.join() || before.checks.join() !== after.checks.join()) s.add("#verdict");
  if (before.price !== after.price || before.auctionSold !== after.auctionSold || before.estimate?.low !== after.estimate?.low) s.add("#price-check");
  if (before.price !== after.price || before.otd?.total !== after.otd?.total) s.add("#costs");
  if (before.historyRead !== after.historyRead) s.add("#history-report");
  if (s.size) s.add("#knows");
  return [...s];
}

/** Briefly light up the sections that just changed (a steady outline with reduced motion). */
function flash(targets: string[]) {
  for (const t of targets) {
    const el = document.querySelector(t);
    if (!el) continue;
    el.classList.remove("vv-flash");
    void (el as HTMLElement).offsetWidth; // restart the animation
    el.classList.add("vv-flash");
    setTimeout(() => el.classList.remove("vv-flash"), 2_400);
  }
}

/** What changed on the page between two moments, in plain words. */
function changes(before: PageContext, after: PageContext): string[] {
  const out: string[] = [];
  if (before.verdict.title !== after.verdict.title) out.push(`verdict: ${before.verdict.title} → ${after.verdict.title}`);
  if (before.price !== after.price && after.price) out.push(`asking price: ${$(after.price)}`);
  if (before.auctionSold !== after.auctionSold && after.auctionSold) out.push(`auction sale: ${$(after.auctionSold)} (shown with the price)`);
  const added = (a: string[], b: string[]) => b.filter((x) => !a.includes(x));
  const newStops = added(before.stops, after.stops);
  const newChecks = added(before.checks, after.checks);
  if (newStops.length) out.push(`new serious warning: ${newStops.join("; ")}`);
  if (newChecks.length) out.push(`new to check: ${newChecks.join("; ")}`);
  const gone = [...added(after.stops, before.stops), ...added(after.checks, before.checks)];
  if (gone.length) out.push(`no longer flagged: ${gone.join("; ")}`);
  if (!before.historyRead && after.historyRead) out.push("history report answers filled in");
  if (after.otd && (before.otd?.total !== after.otd.total || before.otd?.state !== after.otd.state)) out.push(`out the door: about ${$(Math.round(after.otd.total))} in ${after.otd.state}`);
  if (before.estimate?.low !== after.estimate?.low || before.estimate?.high !== after.estimate?.high) {
    if (after.estimate) out.push(`price estimate: ${$(after.estimate.low)}–${$(after.estimate.high)}`);
  }
  return out;
}

function aiActions(keys: AskAction[], c: PageContext): Action[] {
  const out: Action[] = [];
  for (const k of keys) {
    // Never suggest a step that's already done.
    if ((k === "price-check" && c.priced) || (k === "add-history" && c.historyRead)) continue;
    if (k === "price-check") out.push({ kind: "go", label: "Run the price check", target: "#price-check" });
    else if (k === "add-history") out.push({ kind: "attach", label: "Add a history report" });
    else if (k === "recall-lookup" && c.recallLookup) out.push({ kind: "link", label: "Open the recall lookup", href: c.recallLookup });
    else if (k === "check-dealers") out.push({ kind: "go", label: "See where it's been listed", target: "#listing-history" });
    else if (k === "seller-questions" || k === "inspection") out.push({ kind: "go", label: k === "inspection" ? "See the inspection list" : "See the questions to ask", target: "#before-you-buy" });
  }
  return out;
}

/**
 * "Tell VinVerdict or ask": one box for messages, pasted pages and screenshots. Most
 * messages are handled on this device with no AI (lib/assistant/route.ts): facts and pasted
 * pages update the whole result at once, with Undo; known questions are answered from the
 * page. A free AI model is used only for open questions and a close read of a history report.
 */
export function Assistant(props: {
  ctx: PageContext;
  told: Told[];
  onTell: (t: Told) => void;
  onUndo: (id: string) => void;
  onClear: () => void;
  onProof: (p: Attached) => void;
  onCheckVin: ((vin: string) => void) | null;
  /** The short report, for AI questions (built when asked). */
  build: () => string;
  guest: boolean;
  ai: boolean;
  /** Where this car's conversation is kept on the device (null: not kept). */
  storeKey?: string | null;
  /** The ad had no VIN and the person gave one: check the same ad again with it. */
  onAddVin?: ((vin: string) => void) | null;
}) {
  const { ctx, told, onTell, onUndo, onClear, onProof, onCheckVin, build, guest, ai, storeKey, onAddVin } = props;
  const id = useId();
  // The conversation is kept on this device for this car (lib/assistant/store.ts), like the facts.
  const [thread, setThread] = useState<Msg[]>(() => (storeKey ? loadThread<Msg>(storeKey) : []));
  useEffect(() => {
    if (storeKey) saveThread(storeKey, thread);
  }, [storeKey, thread]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A question waiting for the "I'm human" check (guests), asked as soon as a token arrives.
  const waiting = useRef<{ ask: string } | { read: { text: string; label: string; thumb: string | null } } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // The "What VinVerdict knows" panel asks for a fact ("They're asking $") or a report.
  useEffect(() => {
    const tell = (e: Event) => {
      const prefill = (e as CustomEvent<string>).detail ?? "";
      setInput(prefill);
      boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      requestAnimationFrame(() => {
        const el = boxRef.current;
        if (!el) return;
        el.focus();
        // Put the cursor where the number goes ("It has | miles" or after "$").
        const at = prefill.indexOf("  ");
        el.setSelectionRange(at >= 0 ? at + 1 : prefill.length, at >= 0 ? at + 1 : prefill.length);
      });
    };
    const attachReport = () => fileRef.current?.click();
    window.addEventListener(TELL_EVENT, tell);
    window.addEventListener(ATTACH_EVENT, attachReport);
    return () => {
      window.removeEventListener(TELL_EVENT, tell);
      window.removeEventListener(ATTACH_EVENT, attachReport);
    };
  }, []);
  // After something is applied, say what changed once the page has re-rendered.
  const pending = useRef<{ msgId: string; before: PageContext; said?: boolean } | null>(null);

  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const list = changes(p.before, ctx);
    flash(changedSections(p.before, ctx));
    // What the seller said: the safe reply to the first new warning, ready to copy.
    const tip = p.said ? ctx.replyTips.find((x) => x.suggest && !p.before.replyTips.some((b) => b.title === x.title)) : undefined;
    setThread((t) => t.map((m) => (m.id === p.msgId
      ? {
          ...m,
          note: list.length ? `Updated on this page: ${list.join("; ")}.` : "Applied. The verdict and price didn't change.",
          ...(tip?.suggest ? { quote: tip.suggest, actions: [{ kind: "copy" as const, label: "Copy this reply", text: tip.suggest }, ...(m.actions ?? [])] } : {}),
        }
      : m)));
  }, [ctx]);

  const say = (m: Omit<Msg, "id" | "who">, before?: PageContext, said = false) => {
    const msg: Msg = { id: uid(), who: "vv", ...m };
    if (before) pending.current = { msgId: msg.id, before, said };
    setThread((t) => [...t, msg]);
  };
  const reply = (r: Reply, by?: string) => say({ text: r.text, points: r.points, actions: r.actions, by, quote: r.quote, next: r.next });
  const [copied, setCopied] = useState<string | null>(null);
  // Follow-up questions not already asked in this conversation.
  const unasked = (next: string[] | undefined) => (next ?? []).filter((q) => !thread.some((x) => x.who === "you" && x.text.trim().toLowerCase() === q.toLowerCase()));

  function takeToken(): string | null {
    const t = token;
    setToken(null);
    setAttempt((n) => n + 1);
    return t;
  }

  async function askAi(question: string) {
    if (!ai) return reply({ ...answerIntent("overview", ctx), text: `Free AI isn't switched on here. From the page: ${answerIntent("overview", ctx).text}` });
    if (guest && !token) {
      // Answered as soon as the box is ticked: no need to send it again.
      waiting.current = { ask: question };
      return say({ text: "That one needs the free AI. Tick the \"I'm human\" box below and it's answered straight away." });
    }
    setBusy("Thinking…");
    const r = await askCarAction({ report: build(), question, earlier: [], token: takeToken() }).catch(() => null);
    setBusy(null);
    if (!r || r.status === "error") return say({ text: r?.message ?? "Couldn't reach VinVerdict. Try again." });
    // Facts the AI found in the question (each quoted from it) update the page too.
    if (r.facts.length) {
      const facts = r.facts as Fact[];
      onTell({ id: uid(), label: facts.map(factText).join(", "), facts });
    }
    say({ text: r.answer, points: [...r.claims.map((c) => `${c.text} (${c.section === "At a glance" ? "At a glance" : `section ${c.section}`})`), ...(r.unknowns.length ? [`Not in the report: ${r.unknowns.join("; ")}`] : []), ...(r.next ? [`Next: ${r.next}`] : [])], actions: aiActions(r.actions, ctx), by: r.provider }, r.facts.length ? ctx : undefined);
  }

  useEffect(() => {
    if (!token || !waiting.current || busy) return;
    const w = waiting.current;
    waiting.current = null;
    if ("ask" in w) void askAi(w.ask);
    else {
      setThread((t) => t.map((x) => (x.read ? { ...x, read: undefined } : x)));
      void closeRead(w.read.text, w.read.label, w.read.thumb);
    }
    // askAi reads the latest token itself; only a new token should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function closeRead(text: string, label: string, thumb: string | null) {
    if (!ai) return;
    if (guest && !token) {
      waiting.current = { read: { text, label, thumb } };
      return say({ text: "Want every accident and damage date, the owners and the service work? Tick the \"I'm human\" box below and it's read straight away (or use the button):", read: { text, label, thumb } });
    }
    setBusy("Reading the report closely…");
    const before = ctx;
    const image = thumb ? await shrink(thumb).catch(() => null) : null;
    const r = await readHistoryAction({ text, image, token: takeToken() }).catch(() => null);
    setBusy(null);
    if (!r || r.status === "error") return say({ text: r?.message ?? "Couldn't read it closely right now." });
    const card = aiReadAttached(label, r);
    onProof(card);
    say({ text: `Read closely by ${r.provider}:`, points: card.read.findings.map((f) => f.label), actions: [{ kind: "go", label: "See it in Check it yourself", target: "#check-yourself" }] }, before);
  }

  async function handle(text: string, label: string, thumb: string | null) {
    const route = routeMessage(text, ctx.vin);
    const before = ctx;
    switch (route.kind) {
      case "proof": {
        const card = proofFromText(text, null, label, thumb);
        if (!card) return reply(SMALL_TALK);
        onProof(card);
        say({ text: `Added to Check it yourself as ${route.source === "carfax" ? "a Carfax report" : route.source === "autocheck" ? "an AutoCheck report" : "proof"}:`, points: card.read.findings.map((f) => f.label), actions: [{ kind: "go", label: "See it", target: "#check-yourself" }] }, before);
        if ((route.source === "carfax" || route.source === "autocheck") && card.text) await closeRead(card.text, label, thumb);
        return;
      }
      case "auction": {
        const r = route.record;
        const sold = route.facts[0]?.kind === "auctionSold" ? route.facts[0].value : r.soldPrice;
        onTell({ id: uid(), label: `Auction record${r.house ? ` (${r.house})` : ""}${sold ? `, sold for ${$(sold)}` : ""}`, auction: { ...r, soldPrice: sold ?? null }, text });
        return say({
          text: "Added the auction record. It's a wholesale dealer auction, which is normal for trade-ins and unsold cars, not a salvage auction.",
          points: [
            r.run && `Run ${r.run}`, r.odometer && `Odometer ${r.odometer.toLocaleString("en-US")}${r.odometerActual ? " (declared actual)" : ""}`,
            r.consignor && `Consignor: ${r.consignor}`, `Condition report grade: ${r.crGrade ?? "not given"}`, r.announcements && `Announcements: ${r.announcements}`,
            sold ? `Sold for ${$(sold)}` : "No sold price on it: tell VinVerdict what it sold for, if you know",
          ].filter((x): x is string => !!x),
        }, before);
      }
      case "listing": {
        const l = route.listing;
        onTell({ id: uid(), label: "Listing you pasted", listing: l, text });
        return say({ text: "Added the listing: it fills in what the check didn't know, and its words are checked for warning signs.", points: [l.price && `Price ${$(l.price)}`, l.miles && `${l.miles.toLocaleString("en-US")} miles`, l.sellerType !== "unknown" && `Seller: ${l.sellerType}`].filter((x): x is string => !!x) }, before);
      }
      case "add-vin": {
        if (route.problem) return say({ text: `${route.problem} Copy it again from the seller's message, or from a photo of the windshield plate or the driver's door sticker.` });
        if (!onAddVin) return say({ text: `Got the VIN ${route.vin}. Check it from the home page to add the recall and title checks.` });
        say({ text: `Checking this ad again with VIN ${route.vin}: the exact model, recalls, title checks and the price check by VIN. What you told VinVerdict comes with it.` });
        if (storeKey) saveThread(toldKey(route.vin, ""), thread);
        onAddVin(route.vin);
        return;
      }
      case "other-car":
        return say({ text: `That's a different car (VIN ${route.vin}). Nothing was added to this one.`, vin: route.vin });
      case "chat": {
        if (!route.seller.trim()) return say({ text: "That looks like a chat, but there's nothing from the seller in it yet. Paste it again once they've replied." });
        const lines = route.seller.split("\n").length;
        onTell({ id: uid(), label: `Chat with the seller (${lines} line${lines === 1 ? "" : "s"} from them)`, reply: route.seller, facts: route.facts.length ? route.facts : undefined });
        return say({
          text: `Read as your chat with the seller. Their side (${lines} line${lines === 1 ? "" : "s"}) is checked for warning signs and for stories that change from the ad${route.facts.length ? `, and what they said is applied: ${route.facts.map(factText).join("; ")}` : ""}.`,
          actions: [{ kind: "go", label: "See the seller checks", target: "#before-you-buy" }],
        }, before, true);
      }
      case "said": {
        const short = text.length > 60 ? `${text.slice(0, 57)}…` : text;
        onTell({ id: uid(), label: `Seller said: "${short}"`, reply: text, facts: route.facts.length ? route.facts : undefined });
        return say({
          text: route.facts.length
            ? `Got it: ${route.facts.map(factText).join("; ")}. Also checked as the seller's words, for warning signs and stories that change.`
            : "Got it. Checked as the seller's words, for warning signs and stories that change from the ad.",
          actions: [{ kind: "go", label: "See the seller checks", target: "#before-you-buy" }],
        }, before, true);
      }
      case "facts": {
        // A trade-in value is what a dealer pays you, not a buying price: explained, never applied.
        const trade = route.facts.some((f) => f.kind === "guide" && f.guide === "trade");
        const facts = route.facts.filter((f) => !(f.kind === "guide" && f.guide === "trade"));
        if (facts.length) {
          onTell({ id: uid(), label: facts.map(factText).join(", "), facts });
          say({ text: `Got it: ${facts.map(factText).join("; ")}. Applied to the whole page (marked "you told VinVerdict"; undo it below).` }, before);
        }
        if (trade) {
          say({ text: "A trade-in value is what a dealer would pay you, not what you'd pay, so it isn't used for the price. Tell me the private party or dealer retail value instead (\"KBB private party 12,500\")." });
        }
        if (route.intent) return reply(answerIntent(route.intent, ctx));
        if (route.question) return askAi(text);
        return;
      }
      case "intent":
        return reply({ ...answerIntent(route.intent, ctx), next: followUps(route.intent, ctx) });
      case "intents": {
        // One reply per question; the follow-ups go under the last one.
        route.intents.forEach((i, n) => reply({ ...answerIntent(i, ctx), next: n === route.intents.length - 1 ? followUps(i, ctx) : undefined }));
        return;
      }
      case "link":
        return say({
          text: `VinVerdict doesn't open links (${route.host} and most sites block it, and it keeps you safe). Open the listing, press Ctrl+A then Ctrl+C (on a phone: Select all, Copy), and paste the page here.`,
          actions: [{ kind: "attach", label: "Or attach screenshots" }],
        });
      case "small-talk":
        return reply(smallTalk(text));
      case "ai":
        return askAi(text);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setThread((t) => [...t, { id: uid(), who: "you", text: text.length > 400 ? `${text.slice(0, 400)}… (pasted ${text.length.toLocaleString("en-US")} characters)` : text }]);
    setInput("");
    await handle(text, "Pasted text", null);
  }

  async function attach(list: FileList | null) {
    if (!list || busy) return;
    const { files } = pickImages(list);
    if (!files.length) return say({ text: "Pick screenshots (images)." });
    setThread((t) => [...t, { id: uid(), who: "you", text: `Attached ${files.length} screenshot${files.length > 1 ? "s" : ""}` }]);
    setBusy("Reading the screenshots on this device…");
    try {
      const texts = await readEachScreenshot(files, (p: OcrProgress) => setBusy(p.loading ? "Getting the reader ready…" : `Reading ${p.of > 1 ? `${p.image} of ${p.of}` : ""}… ${p.pct}%`));
      setBusy(null);
      for (const [i, f] of files.entries()) await handle(texts[i] ?? "", f.name || "Screenshot", URL.createObjectURL(f));
    } catch {
      setBusy(null);
      say({ text: "Couldn't read those screenshots on this device. Paste the page's text instead." });
    }
  }

  function act(a: Action) {
    if (a.kind === "attach") return fileRef.current?.click();
    if (a.kind === "copy") {
      void navigator.clipboard?.writeText(a.text).then(() => setCopied(a.text), () => setCopied(null));
      return;
    }
    if (a.kind === "go") document.querySelector(a.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="rounded-lg border border-accent/40 px-4 py-4 print:hidden" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="text-lg font-semibold">Tell VinVerdict or ask</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Paste the seller&apos;s messages, the Carfax or an auction record (or screenshots of them), or say what you know (&quot;he&apos;d take 13,500&quot;). The whole
        result updates. Most answers come from this page{ai ? "; a free AI (GLM by Z.ai, or Gemini or Groq) helps only with open questions and may keep what's sent" : ""}.
      </p>

      {thread.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {starters(ctx).map((s) => (
            <button key={s} type="button" className="btn btn-secondary text-sm" disabled={!!busy} onClick={() => { setThread((t) => [...t, { id: uid(), who: "you", text: s }]); void handle(s, "Question", null); }}>
              {s}
            </button>
          ))}
          {!ctx.historyRead && <button type="button" className="btn btn-secondary text-sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>Add the Carfax (screenshot)</button>}
        </div>
      )}

      {told.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="What you've told VinVerdict">
          {told.map((t) => (
            <li key={t.id} className="tag flex items-center gap-2 border border-accent/40">
              <span>{t.reply ? t.label : `You: ${t.label}`}</span>
              <button type="button" className="link text-xs" onClick={() => onUndo(t.id)} aria-label={`Undo: ${t.label}`}>Undo</button>
            </li>
          ))}
          {told.length > 1 && (
            <li>
              <button type="button" className="link text-xs" onClick={() => { onClear(); setThread([]); }}>Clear all</button>
            </li>
          )}
        </ul>
      )}

      {thread.length > 0 && (
        <ol className="mt-4 space-y-3" aria-live="polite">
          {thread.map((m) => (
            <li key={m.id} className={m.who === "you" ? "ml-auto max-w-[85%] rounded-lg bg-surface-muted px-3 py-2" : "max-w-[95%]"}>
              <p className={m.who === "you" ? "whitespace-pre-line text-sm" : "whitespace-pre-line"}>{m.text}</p>
              {m.points && m.points.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">{m.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
              )}
              {m.quote && <blockquote className="mt-2 whitespace-pre-line rounded-md border-l-4 border-accent bg-surface-muted px-3 py-2 text-sm">{m.quote}</blockquote>}
              {m.note && <p className="mt-1 rounded-md bg-good-soft px-2 py-1 text-sm text-good">{m.note}</p>}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.actions.filter((a) => a.label).map((a, i) =>
                    a.kind === "link" ? (
                      <ExternalLink key={i} href={a.href} className="btn btn-secondary text-sm">{a.label}</ExternalLink>
                    ) : (
                      <button key={i} type="button" className="btn btn-secondary text-sm" onClick={() => act(a)}>{a.kind === "copy" && copied === a.text ? "Copied" : a.label}</button>
                    ),
                  )}
                </div>
              )}
              {m.read && (
                <button
                  type="button"
                  className="btn btn-primary mt-2 text-sm"
                  disabled={!!busy || (guest && !token)}
                  onClick={() => {
                    const r = m.read!;
                    setThread((t) => t.map((x) => (x.id === m.id ? { ...x, read: undefined } : x)));
                    void closeRead(r.text, r.label, r.thumb);
                  }}
                >
                  Read it closely with free AI
                </button>
              )}
              {m.id === thread[thread.length - 1]?.id && !busy && unasked(m.next).length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-muted">Next:</span>
                  {unasked(m.next).map((q) => (
                    <button key={q} type="button" className="link" onClick={() => { setThread((t) => [...t, { id: uid(), who: "you", text: q }]); void handle(q, "Question", null); }}>{q}</button>
                  ))}
                </div>
              )}
              {m.vin && onCheckVin && (
                <button type="button" className="btn btn-secondary mt-2 text-sm" onClick={() => onCheckVin(m.vin!)}>Check that car instead</button>
              )}
              {m.by && <p className="mt-1 text-xs text-muted">Answered by {m.by}, from this page&apos;s report. Check anything important yourself.</p>}
            </li>
          ))}
        </ol>
      )}
      {busy && <p className="mt-3 text-sm text-muted" role="status">{busy}</p>}

      <label htmlFor={id} className="sr-only">Tell VinVerdict or ask</label>
      <textarea
        ref={boxRef}
        id={id}
        rows={3}
        maxLength={20_000}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && input.length < 300) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={`"He'd take 13,500", "is this a scam?", or paste their messages`}
        className="field mt-4 w-full"
      />
      {ai && guest && <div className="mt-2"><Turnstile key={attempt} action="ai" onToken={setToken} /></div>}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={!input.trim() || !!busy} onClick={() => void send()}>Send</button>
        <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}>Attach screenshots</button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label="Attach screenshots" onChange={(e) => { void attach(e.target.files); e.target.value = ""; }} />
        {ai && guest && <span className="text-xs text-muted">The free AI is used only when needed (5 a day per visitor).</span>}
      </div>
    </section>
  );
}
