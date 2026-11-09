# VinVerdict — Architecture

How the app is put together, in plain language. **Built** means it exists now; **planned** means a later phase adds it (phase numbers from [PLAN.md](PLAN.md) §12).

Last updated: 2026-11-08 (Phase 0 + Phase 2a + early Phase 3 logic).

## The big picture

```
 Your browser                     VinVerdict server (Vercel)                 Outside data
 ─────────────                    ──────────────────────────                 ────────────
 Pages (React)  ──request──▶  Next.js server code  ──API call (key)──▶  NHTSA, FuelEconomy.gov (free)
                ◀──HTML/JSON──   - checks login           ◀──JSON──      MarketCheck, Auto.dev (quota)
                                 - validates input
                                 - scores + scam rules
                                       │
                                       ▼
                                 Supabase (login + database)
```

API keys exist only on the server. The browser never talks to MarketCheck or Auto.dev directly, so nobody can read a key from the page.

## Folders

| Folder / file | What it is | Status |
| --- | --- | --- |
| `src/app/` | One folder per page (Next.js "App Router"). `page.tsx` is the page, `layout.tsx` wraps every page with the nav and footer | Built (placeholders) |
| `src/components/` | Shared building blocks: `Nav`, `NavLinks`, `PageHeader`, `EmptyState`, `ExternalLink` | Built |
| `src/lib/` | Logic that isn't UI (see "The analyzer's brain" below). Later: scoring, listing-API adapters (one file per provider so a provider can be swapped) | Built (Phase 3 logic) |
| `src/**/*.test.ts` | Unit tests (Vitest), next to the code they test. `npm test` runs them | Built |
| `next.config.ts` | App settings, including the security headers | Built |
| `tools/` | Python scripts for one-off checks outside the app (Phase 1 API probes). They are not deployed | Built |
| `workflows/` | Step-by-step SOPs for running those scripts | Built |
| `docs/` | PLAN (scope), ARCHITECTURE (this file), SETUP (accounts and keys) | Built |
| `.env.local` / `.env` | Your secret keys, on your computer only (gitignored). `.env.example` lists the names | Template built |
| `.tmp/` | Disposable output (raw API responses) | Built |

## Pages

| URL | Page | Filled in by |
| --- | --- | --- |
| `/` | Check a listing: **works now** (verdict, car facts, recalls, crash stars, complaints, seller checklist, out-the-door cost for any US ZIP). Deal score still to come | Phase 3–4 |
| `/shortlist` | Reliable models/years | Phase 6 |
| `/search` | In-app search + links to 11 outside sites (built) | Phase 7 |
| `/car/[id]` | Car detail. `[id]` is a placeholder in the URL, e.g. `/car/abc123` | Phase 5 |
| `/checked` | Checked cars / watchlist | Phase 8 |
| `/compare` | 2–3 cars side by side | Phase 8 |
| `/settings` | Score weights and defaults | Phase 8 |
| `/login` | Email + password (UI only for now) | Phase 2b |

**How pages are served:** the app uses Next.js 16 with *Cache Components*. Pages that don't depend on the request are pre-built once and served instantly (shown as `○` in `npm run build`). `/car/[id]` is *partially* pre-built (`◐`): the frame is ready in advance, and the part that needs the car's id streams in. That's why the id is read inside a `<Suspense>` block, and why the nav's "current page" highlight is wrapped in one too.

## The analyzer's brain (`src/lib/`)

These pieces turn a pasted listing into a verdict. Most are *pure functions*: the same input always gives the same output, with no network, so they're easy to test. Data flows top to bottom:

| File | Job | Network? |
| --- | --- | --- |
| `listing/parse.ts` | Reads pasted text and pulls out year, make, model, price, miles, VIN, title status, accidents, color, owners, seller type, ZIP | No |
| `listing/text.ts` | Helpers: tidy the text; "is this word negated?" (so "no accidents" isn't read as an accident) | No |
| `vin.ts` | VIN format and check-digit test (catches typos and made-up VINs for free) | No |
| `nhtsa/parse.ts` | Turns raw NHTSA replies into small typed objects; decides automatic vs. manual | No |
| `nhtsa/client.ts` | Calls NHTSA: VIN decode, recalls, crash stars, complaints. **Server-only** (`import "server-only"` makes the build fail if browser code imports it). Results are cached with `"use cache"`: VIN decodes and crash stars for weeks, recalls and complaints for days | Yes (free) |
| `geo/zip.ts` | ZIP code → state with a built-in table of 3-digit ZIP prefixes (no API). Territories and military ZIPs return nothing | No |
| `costs/stateTax.ts` | Car tax for each of the 50 states + DC: the state rate plus special rules (private-sale exemptions, caps, flat amounts, tiers). Each state has an official source link and a DMV link. City/county tax uses the rate the buyer types in | No |
| `costs/nj.ts` | NJ title and registration fees. Official rates and source links live in one `NJ_RATES` object, so a yearly fee check is a one-file change | No |
| `costs/outTheDoor.ts` | Adds it all up: price + doc fee + state tax + local tax + fees (itemised for NJ, typed in elsewhere) + inspection | No |
| `scam/rules.ts` | Runs the PLAN §6 rules and returns each hit as **hide** (walk away), **flag** (ask about it) or **info** (missing facts), with a plain-English reason, plus an overall verdict (`hide` / `verify` / `caution` / `clear`) and a 0–100 risk number | No |

How a check runs: the **Analyze** button calls a *Server Action* (`src/app/actions/analyze.ts`). That's a function that runs on the server, which Next.js exposes as a POST request. It validates the text (1–20,000 characters), applies a rate limit (`lib/rate-limit.ts`: 10 per minute per IP, in memory) and calls `lib/analyze.ts`, which parses the text, checks and decodes the VIN, and fetches NHTSA data in parallel. The page (`components/analyzer/`) then runs the scam rules in the browser through `lib/verdict.ts`, so answering a seller-checklist question updates the verdict instantly.

**Not yet protected by login** (Phase 2b adds it). Don't deploy publicly until then.

Two rules wait for saved data (Phase 8): "same phone on several listings" and "same VIN at different prices". The "30%+ below market" rule is ready but needs the value % from comps (Phase 4).

**Tests:** `npm test` runs 48 offline tests. They include realistic Facebook, Craigslist and dealer listings and the classic "deployed overseas, Zelle deposit, car at a shipping company" scam. `NHTSA_LIVE=1 npx vitest run client.live` also checks the real NHTSA APIs (free).

## Security in place now (PLAN.md §9)

- **Security headers** on every response (`next.config.ts`):
  - *Content-Security-Policy*: the page may only load scripts, styles, fonts and connections from VinVerdict itself. This blocks most injected-script attacks.
  - *X-Frame-Options: DENY* + `frame-ancestors 'none'`: other sites can't embed VinVerdict in a hidden frame (clickjacking).
  - *X-Content-Type-Options: nosniff*, *Referrer-Policy*, *Permissions-Policy* (camera, mic, location and payment off), *Strict-Transport-Security* (HTTPS only, in production).
  - `X-Powered-By` removed, so the server doesn't advertise its framework.
- **Outside links** go through `ExternalLink`: new tab, `rel="noopener noreferrer"`, and only `http(s)` URLs, so a pasted `javascript:` link can't run.
- **Secrets**: `.gitignore` blocks `.env*` (except `.env.example`), `.tmp/` and OAuth files. `.vercelignore` keeps `tools/`, `workflows/` and `docs/` off the server.
- **Quota safety**: the paid-API probe scripts are dry runs unless `--confirm` is passed.

## Planned request flows

**Paste a listing (Phase 3–4, the core flow)**
1. You paste text or a VIN. The Server Action checks input size and the rate limit (built). A pasted link is **never fetched** by the server, because fetching user-supplied URLs would let someone make the server request internal addresses (SSRF), so you're asked to paste the text. Login check: Phase 2b.
2. Server pulls out year, make, model, trim, miles, price, VIN, location and seller type from the text.
3. NHTSA vPIC decodes the VIN and checks it against the listing. A non-zero `ErrorCode` (e.g. a bad check digit) is a flag.
4. Market value from cached comps, 1 API call, or a value you type in.
5. Scam rules, deal label, score, recalls, crash stars, fuel and out-the-door cost.
6. Saved to Checked cars with its source link.

**Search (Phase 7)**: filters → server route → 24 h cache → quota check → MarketCheck (≤ 100 mi) or Auto.dev (wider) → merge by VIN → hard filters + scam rules → score → cache and return. Full detail in PLAN.md §8.

## Findings so far (NHTSA)
- NHTSA reports CVTs as "Continuously Variable Transmission (CVT)", so `classifyTransmission` counts CVT, dual-clutch and automated-manual as automatic.
- vPIC still decodes a VIN with a wrong check digit but sets `ErrorCode` to 1, so the app checks the digit itself (`vin.ts`) and flags any non-zero code.
- The free recalls API lists recalls by year/make/model, not open status per VIN, so open status will link to NHTSA's VIN lookup.
