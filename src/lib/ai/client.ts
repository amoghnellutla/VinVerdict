import "server-only";
import { PROVIDERS, type Provider, type ProviderId } from "./providers";

/**
 * One JSON answer from the first free AI service that gives a valid one.
 * Tries each provider in order (skipping any without a key, or without a vision model
 * when images are sent); moves on after an HTTP error, a timeout, unreadable JSON, or
 * JSON that fails `validate`. Plain fetch, no SDK. Nothing is cached or logged except
 * which provider failed and why (never the content).
 */

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export type AiResult<T> = { ok: true; data: T; provider: ProviderId } | { ok: false; reason: "busy" | "unconfigured" };

export type AiRequest<T> = {
  messages: ChatMessage[];
  /** Sends images: only providers with a vision model are tried. */
  vision?: boolean;
  /** Returns the typed answer, or null when it's not acceptable (then the next provider is tried). */
  validate: (raw: unknown) => T | null;
  maxTokens?: number;
  /** Whole request budget across providers. */
  deadlineMs?: number;
  /** Tests inject these. */
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  providers?: readonly Provider[];
};

const PER_PROVIDER_MS = 20_000;

/** The JSON inside a reply: plain, or wrapped in a ```json fence. */
export function parseJsonReply(content: unknown): unknown {
  if (typeof content !== "string") return undefined;
  const t = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  const body = fenced ? fenced[1] : t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export async function aiJson<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  const env = req.env ?? process.env;
  const doFetch = req.fetchImpl ?? fetch;
  const list = (req.providers ?? PROVIDERS).filter((p) => env[p.keyEnv] && (!req.vision || p.vision));
  if (!list.length) return { ok: false, reason: "unconfigured" };
  const until = Date.now() + (req.deadlineMs ?? 45_000);

  for (const p of list) {
    const left = until - Date.now();
    if (left < 2_000) break;
    try {
      const res = await doFetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env[p.keyEnv]}` },
        body: JSON.stringify({
          model: req.vision ? p.vision : p.text,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 1_500,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(Math.min(PER_PROVIDER_MS, left)),
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(`ai: ${p.id} answered HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
      const data = req.validate(parseJsonReply(body.choices?.[0]?.message?.content));
      if (data === null) {
        console.warn(`ai: ${p.id} gave an answer that failed the checks`);
        continue;
      }
      return { ok: true, data, provider: p.id };
    } catch (err) {
      console.warn(`ai: ${p.id} failed`, err instanceof Error ? err.name : "error");
    }
  }
  return { ok: false, reason: "busy" };
}
