# VinVerdict — Architecture

How the app is put together, in plain language. **Built** means it exists now; **planned** means a later phase adds it (phase numbers from [PLAN.md](PLAN.md) §12).

Last updated: 2026-11-08 (Phase 0 + Phase 2a).

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
| `src/lib/` | Logic that isn't UI. Now: `routes.ts` (nav list). Later: listing parser, VIN check, scam rules, scoring, API adapters (one file per provider so a provider can be swapped) | Started |
| `next.config.ts` | App settings, including the security headers | Built |
| `tools/` | Python scripts for one-off checks outside the app (Phase 1 API probes). They are not deployed | Built |
| `workflows/` | Step-by-step SOPs for running those scripts | Built |
| `docs/` | PLAN (scope), ARCHITECTURE (this file), SETUP (accounts and keys) | Built |
| `.env.local` / `.env` | Your secret keys, on your computer only (gitignored). `.env.example` lists the names | Template built |
| `.tmp/` | Disposable output (raw API responses) | Built |

## Pages

| URL | Page | Filled in by |
| --- | --- | --- |
| `/` | Check a listing: paste box (UI only for now) | Phase 3–4 |
| `/shortlist` | Reliable models/years | Phase 6 |
| `/search` | In-app search + links to 11 outside sites (built) | Phase 7 |
| `/car/[id]` | Car detail. `[id]` is a placeholder in the URL, e.g. `/car/abc123` | Phase 5 |
| `/checked` | Checked cars / watchlist | Phase 8 |
| `/compare` | 2–3 cars side by side | Phase 8 |
| `/settings` | Score weights and defaults | Phase 8 |
| `/login` | Email + password (UI only for now) | Phase 2b |

**How pages are served:** the app uses Next.js 16 with *Cache Components*. Pages that don't depend on the request are pre-built once and served instantly (shown as `○` in `npm run build`). `/car/[id]` is *partially* pre-built (`◐`): the frame is ready in advance, and the part that needs the car's id streams in. That's why the id is read inside a `<Suspense>` block, and why the nav's "current page" highlight is wrapped in one too.

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
1. You paste text, a link or a VIN. Planned: a server route checks login and input size.
2. Server pulls out year, make, model, trim, miles, price, VIN, location and seller type from the text.
3. NHTSA vPIC decodes the VIN and checks it against the listing. A non-zero `ErrorCode` (e.g. a bad check digit) is a flag.
4. Market value from cached comps, 1 API call, or a value you type in.
5. Scam rules, deal label, score, recalls, crash stars, fuel and out-the-door cost.
6. Saved to Checked cars with its source link.

**Search (Phase 7)**: filters → server route → 24 h cache → quota check → MarketCheck (≤ 100 mi) or Auto.dev (wider) → merge by VIN → hard filters + scam rules → score → cache and return. Full detail in PLAN.md §8.

## Findings so far (from `tools/probe_nhtsa.py`)
- NHTSA reports CVTs as "Continuously Variable Transmission (CVT)", so the automatic-only rule must count CVT as automatic.
- vPIC still decodes a VIN with a wrong check digit but sets `ErrorCode` to 1, so the app must check `ErrorCode`.
