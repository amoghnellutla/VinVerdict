# AI mode: free AI models (GLM, Gemini, Groq)

**Objective:** run VinVerdict's AI features on free AI tiers for visitors and the owner.
- AI explains and checks; the verdict stays rule-based.
- Every AI finding is labelled and grounded in what it was given.

**Tools:**
- `tools/probe_ai.py` (free calls) checks each provider.
- `src/lib/ai/` holds the client, the providers, the guards and the prompts.
- `src/app/actions/ai.ts` holds the server actions.

**Plan:** docs/PLAN.md, "AI mode".

## 1. Get the keys (once, all free)
1. **Z.ai (GLM, tried first):**
   1. Go to https://z.ai and sign up.
   2. Open the API console: profile menu → **API Keys** → **Create API Key**.
   3. Copy the key.
2. **Google Gemini (second):**
   1. Go to https://aistudio.google.com and sign in.
   2. Click **Get API key** → **Create API key**.
   3. Copy it. Its free plan says content is used to improve Google's products.
3. **Groq (third, text only):**
   1. Go to https://console.groq.com and sign up.
   2. Open **API Keys** → **Create API Key**.
   3. Copy it.

## 2. Put them where the app reads them
1. Open `.env.local` in the project folder (it's ignored by git: never commit keys). Add:
   ```
   ZAI_API_KEY=...
   GEMINI_API_KEY=...
   GROQ_API_KEY=...
   NEXT_PUBLIC_AI_MODE=1
   ```
2. Vercel:
   1. Open **Project** → **Settings** → **Environment Variables**.
   2. Add the same four, for **Production** (and Preview if wanted).
   3. Redeploy.
   - `NEXT_PUBLIC_AI_MODE` is only an on/off switch for the AI boxes, not a secret.
   - The three keys are used only on the server.
3. Supabase:
   1. Open the **SQL editor**.
   2. Paste `supabase/migrations/20261112_ai_allowance.sql`.
   3. Click **Run**, once.
   - This adds the AI daily limits: 5 actions per visitor and 400 for all visitors a day, and 50 a day for the owner.

## 3. Check the providers
`.venv\Scripts\python -I tools/probe_ai.py`
- Each provider gets one text request (JSON output) and one image request where it has a vision model.
- Rate-limit headers are printed, and raw replies are saved to `.tmp/`.
- Fix any FAILED line before going live:
  - an unknown model means the provider renamed it: update `src/lib/ai/providers.ts`, the one place model ids live;
  - a 401 means the key is wrong or missing;
  - a 429 means today's free use is gone.

## How it behaves
- **Provider order:** GLM → Gemini → Groq (Groq can't read images).
  - The next one is tried after an error, a 20-second timeout, unreadable JSON, or an answer that fails the guards.
  - When all fail: "Copy the full report into your own AI assistant".
- **Before any AI call:**
  - the owner is recognised by login;
  - a visitor must pass Turnstile (action `ai`) and take one from the daily allowance (`take_guest_allowance`, kinds `ai` / `ai_owner`);
  - there's also a 6-a-minute per-IP limit.
- **Guards (`src/lib/ai/guard.ts`):**
  - a number or link not in the source rejects the answer;
  - quotes must be in the source;
  - output is plain text only.
- **Privacy:**
  - phone numbers and emails are removed from what's sent;
  - nothing sent or answered is stored by VinVerdict;
  - each AI box says which services may keep what's sent.

## Known limits and quirks (update as learned)
- Free-tier limits change without notice. As of 2026-11-11:
  - Z.ai doesn't publish limits for its free Flash models;
  - Gemini shows them only in AI Studio;
  - Groq is about 30 a minute and 1,000 a day.
- Z.ai's own docs page for its OpenAI-compatible API wasn't reachable when this was written. The URL and model ids come from third-party guides and pass `probe_ai.py` (2026-11-12).
- Probed 2026-11-12: glm-4.7-flash overloaded or slower than 40 s, so glm-4.5-flash with `thinking: disabled` (about 1 s) is used. Free GLM allows only a few requests a minute (error 1302) and its vision model is often overloaded (1305). gemini-3.8-flash timed out or answered 503, so gemini-3.5-flash-lite reads images. Groq: 1,000 a day, 8,000 tokens a minute.
- Groq's gpt-oss-120b is a reasoning model: its thinking counts toward `max_tokens`, and a JSON reply cut short is rejected by Groq with HTTP 400 (seen 2026-11-12: 433 of 647 tokens were reasoning). `providers.ts` sends `reasoning_effort: "low"` (53 reasoning tokens, twice as fast). Live check of open questions: `AI_LIVE=1 npx vitest run src/lib/ai/ai.live --silent=false` (6/6 after the fix).
- Live check of the three features on real data: `AI_LIVE=1 npx vitest run src/lib/ai/ai.live --silent=false` (free calls).
