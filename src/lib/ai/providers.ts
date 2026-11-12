/**
 * The free AI services AI mode uses, in the order they're tried (Amogh, 2026-11-11:
 * GLM first, then Gemini, then Groq). All three take the OpenAI-style chat request,
 * so one client serves them. Endpoints and model ids come from each provider's docs
 * and are checked live by tools/probe_ai.py (workflows/ai_mode.md) before use: when a
 * provider renames a model, change it here and nowhere else.
 *
 * Keys live only in .env.local / Vercel env vars; a provider without a key is skipped.
 */

export type ProviderId = "glm" | "gemini" | "groq";

export type Provider = {
  id: ProviderId;
  /** Shown to the person: who answered. */
  name: string;
  /** OpenAI-compatible chat completions URL. */
  url: string;
  keyEnv: "ZAI_API_KEY" | "GEMINI_API_KEY" | "GROQ_API_KEY";
  text: string;
  /** A model that reads images, or null. */
  vision: string | null;
  /** Free tier: what they say they do with what's sent (shown next to the AI buttons). */
  privacy: string;
};

export const PROVIDERS: readonly Provider[] = [
  {
    id: "glm",
    name: "GLM (Z.ai)",
    url: "https://api.z.ai/api/paas/v4/chat/completions",
    keyEnv: "ZAI_API_KEY",
    text: "glm-4.7-flash",
    vision: "glm-4.6v-flash",
    privacy: "Z.ai (Singapore) says API content isn't stored on its servers.",
  },
  {
    id: "gemini",
    name: "Gemini (Google)",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    text: "gemini-3.5-flash-lite",
    vision: "gemini-3.8-flash",
    privacy: "Google's free tier says content is used to improve its products.",
  },
  {
    id: "groq",
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    text: "openai/gpt-oss-120b",
    vision: null,
    privacy: "Groq's free plan.",
  },
];

export const PROVIDER_NAME: Record<ProviderId, string> = { glm: "GLM (Z.ai)", gemini: "Gemini (Google)", groq: "Groq" };
