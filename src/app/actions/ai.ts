"use server";

import { aiJson } from "@/lib/ai/client";
import { ASK_LIMITS, askMessages, checkAsk, type AskAnswer, type AskTurn } from "@/lib/ai/ask";
import { checkDealerRead, dealerMessages, jsonLdListing, mergeDealer, pageHasVin, pageText, relevantText, type DealerPage } from "@/lib/ai/dealer-check";
import { checkHistoryRead, HISTORY_IMAGE, HISTORY_LIMITS, historyMessages, type AiHistory } from "@/lib/ai/history-read";
import { checkDash, dashMessages, type DashRead } from "@/lib/ai/dash-read";
import { PROVIDER_NAME } from "@/lib/ai/providers";
import { currentUser } from "@/lib/auth/session";
import { clientIp } from "@/lib/client-ip";
import { allowanceMessage, takeGuestAllowance } from "@/lib/guest/allowance";
import { verifyTurnstile } from "@/lib/guest/turnstile";
import { rateLimit } from "@/lib/rate-limit";
import { allowedUrl, safeFetchPage } from "@/lib/net/safe-fetch";
import { redact } from "@/lib/report/redact";
import { checkVin, normalizeVin } from "@/lib/vin";

/**
 * AI mode (PLAN.md "AI mode"): free AI models for visitors and the owner.
 * Every action: a person check (login, or Turnstile for visitors), then the daily
 * allowance (Supabase), then input checks, then the AI call, then the grounding
 * checks. Nothing sent or answered is stored.
 */

export type AiError = { status: "error"; message: string };
export type AskState = ({ status: "ok"; provider: string } & AskAnswer) | AiError;

const PER_IP_PER_MINUTE = 6;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Who's asking, and whether they may: the owner by login, a visitor by Turnstile + allowance. */
async function gate(token: unknown): Promise<AiError | null> {
  const ip = await clientIp();
  if (!rateLimit(`ai:${ip}`, PER_IP_PER_MINUTE, 60_000)) return { status: "error", message: "Too many AI requests in a minute. Wait a moment and try again." };
  const owner = await currentUser();
  if (owner) {
    const a = await takeGuestAllowance("ai_owner", owner.id);
    return a === "ok" ? null : { status: "error", message: allowanceMessage(a, "ai_owner") };
  }
  if (!(await verifyTurnstile(typeof token === "string" ? token : null, "ai"))) {
    return { status: "error", message: "Please complete the \"I'm human\" check, then ask again." };
  }
  const a = await takeGuestAllowance("ai");
  return a === "ok" ? null : { status: "error", message: allowanceMessage(a, "ai") };
}

const BUSY = "The free AI services are busy or out of today's free use. Copy the full report into your own AI assistant instead, or try again later.";
const UNSET = "AI mode isn't set up on this site yet. Copy the full report into your own AI assistant instead.";

export async function askCarAction(input: { report: unknown; question: unknown; earlier: unknown; token: unknown }): Promise<AskState> {
  const report = str(input.report, ASK_LIMITS.report);
  const question = redact(str(input.question, ASK_LIMITS.question).trim()).text;
  if (!report.startsWith("---\nreport: VinVerdict\n")) return { status: "error", message: "Run a check first: questions are answered from its report." };
  if (question.length < 3) return { status: "error", message: "Type a question about this car." };
  const earlier: AskTurn[] = (Array.isArray(input.earlier) ? input.earlier : [])
    .slice(-ASK_LIMITS.turns)
    .map((t) => ({ q: redact(str((t as AskTurn)?.q, ASK_LIMITS.question)).text, a: str((t as AskTurn)?.a, ASK_LIMITS.turnText) }))
    .filter((t) => t.q && t.a);

  const blocked = await gate(input.token);
  if (blocked) return blocked;

  const r = await aiJson({ messages: askMessages(report, question, earlier), validate: (raw) => checkAsk(raw, report, question), maxTokens: 900 });
  if (!r.ok) return { status: "error", message: r.reason === "unconfigured" ? UNSET : BUSY };
  return { status: "ok", provider: PROVIDER_NAME[r.provider], ...r.data };
}

export type HistoryReadState = { status: "ok"; provider: string; ai: AiHistory; sentText: string } | AiError;

/** "Read my Carfax / AutoCheck": the report's text (pasted or OCR) and, optionally, the screenshot. */
export async function readHistoryAction(input: { text: unknown; image: unknown; token: unknown }): Promise<HistoryReadState> {
  // Phone numbers and emails out before anything leaves; the quotes are checked against exactly what was sent.
  const sentText = redact(str(input.text, HISTORY_LIMITS.text)).text;
  const image = typeof input.image === "string" && input.image.length <= HISTORY_LIMITS.image && HISTORY_IMAGE.test(input.image) ? input.image : null;
  if (sentText.trim().length < 40 && !image) return { status: "error", message: "Paste more of the report, or attach a clearer screenshot." };

  const blocked = await gate(input.token);
  if (blocked) return blocked;

  const r = await aiJson({
    messages: historyMessages(sentText, image),
    vision: !!image,
    validate: (raw) => checkHistoryRead(raw, sentText),
    maxTokens: 2_500,
  });
  if (!r.ok) return { status: "error", message: r.reason === "unconfigured" ? UNSET : BUSY };
  return { status: "ok", provider: PROVIDER_NAME[r.provider], ai: r.data, sentText };
}

export type DashState = { status: "ok"; provider: string; dash: DashRead } | AiError;

/** "Dashboard photo check": the odometer and the warning lights in a photo of the instrument cluster. */
export async function readDashAction(input: { image: unknown; token: unknown }): Promise<DashState> {
  const image = typeof input.image === "string" && input.image.length <= HISTORY_LIMITS.image && HISTORY_IMAGE.test(input.image) ? input.image : null;
  if (!image) return { status: "error", message: "Attach a photo of the dashboard (engine running)." };

  const blocked = await gate(input.token);
  if (blocked) return blocked;

  const r = await aiJson({ messages: dashMessages(image), vision: true, validate: checkDash, maxTokens: 400 });
  if (!r.ok) return { status: "error", message: r.reason === "unconfigured" ? UNSET : BUSY };
  return { status: "ok", provider: PROVIDER_NAME[r.provider], dash: r.data };
}

export type DealerResult = { url: string; host: string; checked: "read" | "not-this-car" | "robots" | "failed"; page: DealerPage | null; by: string | null };
export type DealerState = { status: "ok"; results: DealerResult[]; at: string } | AiError;

/** "Check the dealers for me": up to 5 listing pages of this VIN, opened safely, read for status, price and fees. */
export async function checkDealersAction(input: { urls: unknown; vin: unknown; token: unknown }): Promise<DealerState> {
  const vin = normalizeVin(str(input.vin, 20));
  if (!vin || !checkVin(vin).ok) return { status: "error", message: "Needs the car's VIN." };
  const urls = [...new Set((Array.isArray(input.urls) ? input.urls : []).map((u) => str(u, 600)).filter((u) => allowedUrl(u)))].slice(0, 5);
  if (!urls.length) return { status: "error", message: "No dealer pages to check for this car." };

  const blocked = await gate(input.token);
  if (blocked) return blocked;

  const results = await Promise.all(
    urls.map(async (url): Promise<DealerResult> => {
      const host = new URL(url).hostname.replace(/^www\./, "");
      const page = await safeFetchPage(url);
      if (!page.ok) return { url, host, checked: page.reason === "robots" ? "robots" : "failed", page: null, by: null };
      const text = pageText(page.html);
      if (!pageHasVin(text, vin)) return { url, host, checked: "not-this-car", page: null, by: null };
      const ld = jsonLdListing(page.html, vin);
      if (ld?.price && ld.status) return { url, host, checked: "read", page: mergeDealer(ld, null), by: "the page's own listing data" };
      const r = await aiJson({ messages: dealerMessages(relevantText(text, vin), vin), validate: (raw) => checkDealerRead(raw, text), maxTokens: 600, deadlineMs: 25_000 });
      return { url, host, checked: "read", page: mergeDealer(ld, r.ok ? r.data : null), by: r.ok ? PROVIDER_NAME[r.provider] : ld ? "the page's own listing data" : null };
    }),
  );
  return { status: "ok", results, at: new Date().toISOString() };
}
