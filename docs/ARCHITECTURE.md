# VinVerdict — Architecture

How the app is put together, in plain language. **Built** means it exists now; **planned** means a later phase adds it (phase numbers from [PLAN.md](PLAN.md) §12).

Last updated: 2026-11-09 (Phase 0, Phase 2a + 2b login, Phase 3 analyzer with features A, C, F, O, bookmark, VIN live-listing lookup, accuracy suite).

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

| URL | Page | Status |
| --- | --- | --- |
| `/` | Check a car: verdict with a top-3 summary (each finding names its official source; "No red flags found" only once the accident history is confirmed), "What does the history report say?" (damage, title, commercial use; the dealer's free Carfax link), automatic online lookup when there's a VIN, price check (fair range, deal label, suggested offer), live listing by VIN, listing history, "Check it yourself" (free outside checks for the VIN), car facts, buyer protection, out-the-door cost, true cost per year, running cost, recalls (each with what's wrong, the risk and the fix), crash stars, owner complaints (latest reports in the owners' words with NHTSA numbers, "same build" count, the years either side), inspection checklist, seller checklist + a ready-to-send message, buying-day steps, and a numbered "Sources for this report" list. A bare VIN also gets "Confirm the details" (trim, miles; instant re-pricing) and "It's mine: what's it worth?" (private-sale range, list price, dealer retail, competition, instant offers). "Print or save as PDF" gives the report alone. Each owner check is saved to My cars | Built |
| `/shortlist` | Toyota/Honda/Mazda/Lexus/Subaru models with the model years owners complained about most (NHTSA, per year on the road) and pre-filled searches for a budget + ZIP | Built |
| `/search` | In-app search (MarketCheck dealer + optional private sellers), ranked by how far under fair value; links to outside sites; monthly usage meter | Built |
| `/checked` | My cars: every checked car with verdict, deal label and price drops; tick 2–3 to compare | Built (needs the SQL setup) |
| `/compare` | 2–4 saved cars side by side, best value per row in green | Built (needs the SQL setup) |
| `/car/[id]` | One saved car: findings, price history, "check for a price drop", "check it again", remove | Built (needs the SQL setup) |
| `/settings` | Home ZIP (this device) and setup status (tables, keys, usage) | Built |
| `/` (before a check) | The headline and the paste box first, then "No listing handy? Try one of these": three switchable playground designs (`components/play/`): decode any VIN (NHTSA, free, `actions/decode.ts`), spot the scam in a practice ad, flip through the real Lexus as a photo deck. Then the paste box, examples and points | Built |
| `/why` | Honest comparison with a search engine and an AI chatbot, question by question, plus what VinVerdict can't do. Public | Built |
| `/share` | Android Share target: hands shared text to the checker | Built |
| `/login` | Email + password login. The only page open without a login (plus the app manifest and icons) | Built |

**How pages are served:** the app uses Next.js 16 with *Cache Components*. Pages that don't depend on the request are pre-built once and served instantly (shown as `○` in `npm run build`). `/car/[id]` is *partially* pre-built (`◐`): the frame is ready in advance, and the part that needs the car's id streams in. That's why the id is read inside a `<Suspense>` block, and why the nav's "current page" highlight is wrapped in one too.

## The analyzer's brain (`src/lib/`)

These pieces turn a pasted listing into a verdict. Most are *pure functions*: the same input always gives the same output, with no network, so they're easy to test. Data flows top to bottom:

| File | Job | Network? |
| --- | --- | --- |
| `listing/parse.ts` | Reads pasted text (a few lines or a whole copied page) and pulls out year, make, model, price, miles, VIN, title status, accidents, color, owners, seller type, prior use (personal/fleet/rental), ZIP and distance. Built to ignore page noise: reference prices (MSRP, "$460 below market", "$150/mo"), service-history miles ("new tires at 90k miles", "969 mi away"), safety-feature names ("Pre-Collision System"), and reads dealer history boxes ("Accidents or damage: None reported") first. A labelled VIN ("VIN: …") or a dealer link with a VIN in it counts as a VIN lookup | No |
| `listing/text.ts` | Helpers: tidy the text; "is this word negated?" (so "no accidents" isn't read as an accident, but "No title issues reported / 1 accident reported" still is) | No |
| `listing/corpus/` | The accuracy suite: real listings (`cases/*.txt`) with the answers they must produce (`*.json`). `npm test` prints a per-field scorecard. Add a case for every listing the analyzer gets wrong (see its README) | No |
| `bookmarklet.ts` | The "Check with VinVerdict" bookmark's code (feature 2a). Runs in your browser on the listing page, collects the page's built-in car data (schema.org JSON-LD) and visible text, and opens VinVerdict with it in the URL fragment (`#listing=…`), which is never sent to a server | No |
| `live/parse.ts` | Turns Auto.dev and MarketCheck "listing by VIN" replies into one small `LiveListing` (price, miles, seller, accident and owner history). Copies listing facts only (Auto.dev replies also describe our account) and keeps only https links | No |
| `live/client.ts` | VIN → live listing (feature 2b): Auto.dev first (1,000/month, has accident history), MarketCheck only if Auto.dev doesn't have it. **Server-only**; each provider cached per VIN for about an hour | Yes (quota) |
| `live/merge.ts` | Fills gaps in the pasted listing from the live one (pasted facts win, except a history-reported accident). Feeds only add bad news (accidents, fleet/rental use): their "0 accidents", owner count, "personal use" and clean-title flags are never filled in, because they can be stale and adds cross-checks: same VIN at a different price, private copy of a dealer's car (cloned listing), fewer miles than another listing, listing ended | No |
| `history/parse.ts`, `history/summary.ts` | VIN listing history (MarketCheck History, every past online listing since 2015). `summary.ts` groups listings by seller, finds what's on sale now and since when, price cuts, the odometer readings, and adds rules: miles went down between listings (rollback), pasted miles under an earlier reading, a "private" car a dealer was selling in the last 6 months, for sale 3+ times in 3 years, price already cut, listed by 2 sellers at once | No |
| `history/client.ts` | Fetches the history (1 MarketCheck call, works on Free). **Server-only**, cached a day per VIN | Yes (quota) |
| `listing/ocr-text.ts` | Fixes OCR misreads that change the facts: "S9,000" → "$9,000", "100.000 miles", a VIN split by a line break | No |
| `ocr.ts` | **Browser-only** screenshot reader (`readEachScreenshot` keeps one text per image, for proof): tesseract.js in a Web Worker, loaded from this site's `/ocr/` (copied from `node_modules` by `scripts/copy-ocr-assets.mjs` before dev/build; gitignored). Scales, greys and un-inverts dark-mode shots; images never leave the device. Accepts raster images only (no SVG) and reads each image's size from its header first, refusing anything over 50 MP before decoding (decompression bombs). About 7 MB on first use, then cached | No (same-site files only) |
| `vin.ts` | VIN format and check-digit test (catches typos and made-up VINs for free) | No |
| `nhtsa/parse.ts` | Turns raw NHTSA replies into small typed objects; decides automatic vs. manual. Complaints keep the 2 latest reports per problem area (shortened, with the NHTSA ODI number) and a count per VIN prefix (NHTSA publishes the first 11 VIN characters of each complaint, so `sameBuildCount` shows how many came from cars with the same first 8: maker, body, engine). `nhtsaModelName` turns the VIN decoder's Lexus "ES" + trim "350" into "ES350", the name NHTSA's recall, crash-rating and complaint APIs use | No |
| `nhtsa/client.ts` | Calls NHTSA: VIN decode, recalls, crash stars, complaints. **Server-only** (`import "server-only"` makes the build fail if browser code imports it). Results are cached with `"use cache"`: VIN decodes and crash stars for weeks, recalls and complaints for days | Yes (free) |
| `geo/zip.ts` | ZIP code → state with a built-in table of 3-digit ZIP prefixes (no API). Territories and military ZIPs return nothing | No |
| `costs/stateTax.ts` | Car tax for each of the 50 states + DC: the state rate plus special rules (private-sale exemptions, caps, flat amounts, tiers). Each state has an official source link and a DMV link. City/county tax uses the rate the buyer types in | No |
| `costs/nj.ts` | NJ title and registration fees. Official rates and source links live in one `NJ_RATES` object, so a yearly fee check is a one-file change | No |
| `costs/outTheDoor.ts` | Adds it all up: price + doc fee + state tax + local tax + fees (itemised for NJ, typed in elsewhere) + inspection | No |
| `fuel/parse.ts` | Reads FuelEconomy.gov replies and picks the right version of the car: NHTSA says "CR-V", FuelEconomy.gov lists "CR-V AWD" and "CR-V FWD" with several engines, so it narrows by hybrid/EV (Lexus "450h" counts as hybrid), drive, cylinders, engine size and transmission (never down to zero), then `rankVariants` drops wrong engines across all model names and puts names with the VIN's trim first ("Camry LE/SE" before a V6-only "Camry") | No |
| `fuel/client.ts` | Calls FuelEconomy.gov (EPA, free, no key): model list, engine options, MPG, national fuel prices. **Server-only**, cached with `"use cache"` (vehicle data for weeks, prices for days). At most 13 calls for a new car, then none | Yes (free) |
| `inspection.ts` | Inspection checklist: a small hand-checked list of known problems (each with its official bulletin link, matched by make, model, year and engine size), checks for the car's most common NHTSA complaint areas, and checks for every used car | No |
| `protection.ts` | Buyer protection: spots CarMax, Carvana, Enterprise or Hertz in the text or link and shows their return window and warranty; otherwise explains dealer rules (FTC Buyers Guide, NJ dealer warranty by miles) or that private sales have none | No |
| `costs/running.ts` | Yearly running cost: miles ÷ MPG × fuel price (kWh for EVs) + maintenance (AAA 2025 average, 11.04¢/mile) | No |
| `value/comps.ts` | Value from comparable cars: a *local* weighted fit of log price on miles and model year (comps with miles near this car count most), read at this car's miles. Falls back to a median with few comps. Backtests (leave-one-out, `value.test.ts` when `.tmp/` has the data): 46 sold Camrys 6.6% median error (63% within 10%); 50 Accord listings 4.6% (82%) | No |
| `value/estimate.ts` | "Is the price fair?": combines MarketCheck's sold-price model, recently sold comps and for-sale comps (minus the asking-to-selling gap), then adjusts for damage (the CarGurus 3–12% range, shown as the whole range; severe damage is left unpriced), branded title (−35%), fleet/rental (−5%) and private seller (−12%). Gives a fair range, a deal label (Great → Overpriced), a confidence level and a suggested offer with reasons | No |
| `value/parse.ts`, `value/client.ts` | Parse comps from MarketCheck/Auto.dev; fetch the three price sources (**server-only**, cached a day, up to 3 calls) | client: Yes (quota) |
| `costs/ownership.ts` | True cost per year: (price + tax/fees − resale) ÷ years + fuel and maintenance. Value lost per year comes from the comps (one model year older + the miles you drive); 12%/year without comps | No |
| `cars/store.ts` | Saved cars (with a short listing-history summary from the last price check), price history and "same phone on other cars" lookups in Supabase with the user's session (row-level security). Reports "not-set-up" instead of failing when the tables don't exist | Yes (Supabase) |
| `usage.ts` | Monthly MarketCheck/Auto.dev request counter per user (Supabase), an upper bound shown on Search and Settings | Yes (Supabase) |
| `search/rank.ts`, `search/client.ts` | In-app search: parse MarketCheck listings, drop manuals and duplicate VINs, value each car against the other results, flag 30%+ under as "unusually cheap", rank by value | client: Yes (quota) |
| `shortlist/shortlist.ts` + `data.json` | Model years rated by NHTSA complaints per year on the road vs the model's typical year; recall counts and "park it" recalls per year; known-issue years from `inspection.ts`. Data built by `tools/build_shortlist.py` | No |
| `search-links.ts` | Pre-filled AutoTempest and Facebook Marketplace searches | No |
| `evidence/parse.ts`, `evidence/combine.ts`, `evidence/validate.ts` | Proof from "Check it yourself": `readProof` sorts a screenshot's OCR text or pasted text to its check (Carfax, AutoCheck, NICB, NHTSA/maker recalls, NMVTIS, auction) and reads only clear phrases (damage level, title brand, owners, use, last odometer, open recalls, theft/total loss). `summarizeProof` ignores other VINs, lets the worse report win, adds warnings and rates each check. `validate.ts` checks the owner's saved findings on the server (labels only) | No |
| `value/samecar.ts` | "This may be the same car": one close match (same year, price within 3%/$300, miles within 1,500) among the for-sale comps that carry a VIN and photos; none when ambiguous | No |
| `demo/play.ts`, `demo/scam-ad.ts` | The home playground's facts, worked out from the recorded examples with the live-check code, and the practice scam ad (each flagged phrase checked against the real rules by a test) | No |
| `history-report.ts` | What the vehicle history report (Carfax/AutoCheck) says, as recorded by the person: damage level, title, commercial use. `accidentHistoryConfirmed` decides whether "No red flags found" is allowed (report answered, or a dealer listing's history box). Feeds never count: see `live/merge.ts` | No |
| `seller-message.ts` | Builds the message to send the seller from the findings and the checklist answers still open (up to 7 questions) | No |
| `sources.ts` | Where every claim comes from: `REF` (official guidance pages: FBI IC3, FTC, NICB, NMVTIS, NHTSA, FHWA, 49 CFR 565; checked 2026-11-09), `RULE_SOURCE` (which page backs each warning; a test makes sure every id is a real rule), `raw` (the exact public NHTSA / FuelEconomy.gov request behind a number, so anyone can compare) and `verifyLinks` (NHTSA and maker recall lookups, NICB VINCheck, a Google search for the VIN, NMVTIS) | No |
| `scam/rules.ts` | Runs the PLAN §6 rules and returns each hit as **hide** (walk away), **flag** (ask about it) or **info** (missing facts), with a plain-English reason, plus an overall verdict (`hide` / `verify` / `caution` / `clear`) and a 0–100 risk number | No |

How a check runs: the **Analyze** button calls a *Server Action* (`src/app/actions/analyze.ts`). That's a function that runs on the server, which Next.js exposes as a POST request. It checks the login first (`lib/auth/session.ts`), then validates the text (1–20,000 characters), applies a rate limit (`lib/rate-limit.ts`: 10 per minute per IP, in memory; the IP comes from `lib/client-ip.ts`, which trusts Vercel's own `x-vercel-forwarded-for`/`x-real-ip` before the client-sendable `x-forwarded-for`) and calls `lib/analyze.ts`, which parses the text, checks and decodes the VIN, and fetches NHTSA data in parallel (including recalls and complaints for the model years either side, for "is this a good year?"; all free and cached). The page (`components/analyzer/`) then runs the scam rules in the browser through `lib/verdict.ts`, so answering a seller-checklist question updates the verdict instantly.

Ways in besides typing:
- **Paste & check** (the main way): the button reads the clipboard (the browser asks permission once) and checks it, so the flow is Ctrl+A, Ctrl+C on the listing, then one click. Pasting into the empty box checks straight away too.
- **Read screenshots** (the main way on a phone, where apps have no "select all"): pick 1–6 screenshots of the listing; `lib/ocr.ts` reads them on the device, `cleanOcrText` fixes misreads, and the text goes into the box and is checked like a paste. On touch screens it's the first button and the instructions change (`pointer: coarse`).
- **The bookmark** (optional, computer only; some sites and browsers block bookmark scripts) (`components/analyzer/Bookmarklet.tsx`, `lib/bookmarklet.ts`): clicked on a listing page, it opens VinVerdict with `#listing=<text>`. `Analyzer.tsx` reads the fragment, clears it from the address bar and submits it like a paste.
- **The live listing and its history** come from the "Check price & history" button (below): no separate button.

## Login (Phase 2b)

| File | Job |
| --- | --- |
| `src/proxy.ts` | Runs before every page (Next.js 16 renamed Middleware to *Proxy*). Refreshes the Supabase login so it doesn't expire mid-visit, sends logged-out visitors to `/login?next=<page>`, and refuses plain POSTs. If Supabase settings are missing it lets nobody in |
| `lib/auth/session.ts` | `currentUser()`: **the** login check. Every Server Action calls it first, because the proxy is only the first gate. Uses Supabase's `getClaims()`, which verifies the token's signature instead of trusting the cookie. Returns only id and email |
| `lib/auth/validate.ts` | Pure checks: login form fields, which pages are public (only `/login`), and `safeNext()`, which only lets the after-login redirect go to a page on VinVerdict |
| `lib/supabase/config.ts`, `server.ts` | The Supabase settings and a per-request server client. Cookies are httpOnly, Secure (in production) and SameSite=Lax |
| `app/actions/auth.ts` | Sign-in and sign-out Server Actions. 5 tries per minute per IP and per email; one "email or password is wrong" message for every bad login, so it doesn't reveal which emails have accounts |
| `app/login/LoginForm.tsx`, `components/SignOutButton.tsx` | The form, and the Sign out button in the nav (hidden on `/login`, as are the nav links) |

How a login works: the form posts to the sign-in Server Action, which checks the fields and the rate limit, then asks Supabase to check the password. Supabase sets the login cookies, and the action sends you to the page you wanted. The browser never talks to Supabase itself, so the Content-Security-Policy stays at `connect-src 'self'`.

There is **no sign-up page**, and sign-ups are turned off in Supabase: the one account is created in the Supabase dashboard (docs/SETUP.md). No database tables yet: each phase that saves data adds its own, with row-level security.

Two rules wait for saved data (Phase 8): "same phone on several listings" and "same VIN at different prices". The "30%+ below market" rule is ready but needs the value % from comps (Phase 4).

**Tests:** `npm test` runs 127 offline tests. They include realistic Facebook, Craigslist and dealer listings and the classic "deployed overseas, Zelle deposit, car at a shipping company" scam. `NHTSA_LIVE=1 npx vitest run client.live` also checks the real NHTSA APIs (free).

**Price check flow:** the "Check price & history" button calls `app/actions/price.ts` (login, ZIP/VIN/year validation, 3/min per IP, 40/day). With a VIN it looks up the live listing (`live/client.ts`) and the listing history (`history/client.ts`) in parallel, then fetches the three price sources (`value/client.ts`), records usage, and stores the fair range on the saved car. The page then runs `valueCar()` in the browser with the car's facts and the seller-checklist answers, and passes the result to `buildVerdict` as `valuePct`, so the "far below market" scam rules use a real market value. The history is summarized in the browser too (`summarizeHistory`): its rules join the verdict, its price cut and days on sale feed the suggested offer, and `ListingHistory.tsx` shows the timeline. "Before you pay" (`BuyingDay.tsx`) shows buying-day steps by seller type, with NJ MVC's private-sale paperwork when the buyer's ZIP is in NJ. Quota: up to 3 MarketCheck + 2 Auto.dev calls per check, each cached a day.

**Saved cars:** `app/actions/analyze.ts` saves every check (same VIN = same row) through `cars/store.ts`. Tables and policies are in `supabase/migrations/` (run once in the Supabase SQL editor, docs/SETUP.md step 8).

## Security in place now (PLAN.md §9)

**Layers, outside in** (an attacker has to beat every one):

| Layer | What stops what |
| --- | --- |
| Vercel edge | HTTPS only (HSTS), default firewall/DDoS protection; previews behind Vercel Authentication |
| `src/proxy.ts` | Logged-out → `/login`; password-only session → `/mfa` and nothing else; non-action POSTs refused; a fresh CSP nonce per request |
| Page CSP (`lib/csp.ts`) | Only scripts carrying this request's nonce run (`'strict-dynamic'`, no `'unsafe-inline'`/`'unsafe-eval'` in production); no plugins, no `<base>` tricks, no framing, forms post only here, connections only to this site, images only from this site, local previews and Auto.dev's photo host (`retail.photos.vin`, listing photos). The root layout renders per request (`instant = false` + `connection()`) because a prebuilt shell can't carry a nonce |
| Server Actions | Each calls `currentUser()` (password **and** authenticator code, verified token) before anything else, validates every field, is rate-limited, and checks the monthly API quota stored in Supabase before any paid call (`quotaBlock`) |
| Two-step login (`app/mfa`, `actions/mfa.ts`) | TOTP authenticator via Supabase MFA, required for everyone. A password-only session can't add a second authenticator once one exists |
| Database (Supabase RLS) | Own rows only, **and** a restrictive policy requiring `aal = 'aal2'` on every table, so calling Supabase directly with a stolen password gets nothing; price history only on your own cars; no anon grants (`20261110_security_hardening.sql`) |
| Public demo (no login) | `/`, `/shortlist`, `/security`, `/share` are open (`isDemoPath`). Visitors' checks are never saved; a live price check needs Cloudflare Turnstile (`lib/guest/turnstile.ts`, token checked server-side for success, action and hostname) and then `take_guest_allowance()` in Supabase (`lib/guest/allowance.ts`; limits hard-coded in SQL, visitor = HMAC of IP with `GUEST_HASH_SALT`), and uses a lean source set (`skipPriceModel`, `autoDevOnly`). Example cars are recorded checks (`lib/demo/`), opened with no server call |
| Links into the app | `#listing=` and `/share` only fill the box; nothing runs or is saved until you press Check (stops other sites from planting cars or fake phone matches) |

- **Security headers** on every response (`next.config.ts`):
  - *Content-Security-Policy*: per-request nonce policy on pages (above). The `/ocr/` worker files get their own policy (`default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'`): they can load only this site's files and compile WebAssembly, never JavaScript `eval`.
  - *X-Frame-Options: DENY* + `frame-ancestors 'none'`: other sites can't embed VinVerdict in a hidden frame (clickjacking).
  - *X-Content-Type-Options: nosniff*, *Referrer-Policy*, *Permissions-Policy* (camera, mic, location, payment, USB, Bluetooth off), *Cross-Origin-Opener-Policy* and *Cross-Origin-Resource-Policy: same-origin*, *X-Robots-Tag: noindex* (+ `robots.txt`), *Strict-Transport-Security* (HTTPS only, in production).
  - `X-Powered-By` removed, so the server doesn't advertise its framework.
- **Login** on every page and inside every Server Action (see "Login" above). Login cookies can't be read by page scripts (httpOnly).
- **Outside links** go through `ExternalLink`: new tab, `rel="noopener noreferrer"`, and only `http(s)` URLs, so a pasted `javascript:` link can't run.
- **Secrets**: `.gitignore` blocks `.env*` (except `.env.example`), `.tmp/` and OAuth files. `.vercelignore` keeps `tools/`, `workflows/` and `docs/` off the server.
- **Quota safety**: the paid-API probe scripts are dry runs unless `--confirm` is passed. The live-listing lookup runs only on a button click, is cached per VIN, and has a per-IP and a daily cap (in memory per server instance until the Phase 7 usage meter).
- **Links are never fetched by the server** (no SSRF). The bookmark reads the page in the user's own browser instead, and hands the text over in the URL fragment, which isn't sent to any server or logged. The text is still plain text: only read by regexes, never rendered as HTML.
- **Database:** Supabase tables have row-level security (each row is one login's, `user_id = auth.uid()`), column checks (VIN format, lengths, ranges) and are read with the user's session only; the service-role key isn't used by the website.
- **Quota:** every paid lookup is behind a button, cached for a day, rate-limited per IP and per day, and counted in the usage meter.
- **API data is untrusted too**: live-listing links are kept only if they're https, and only listing facts are copied from API replies.

## Planned request flows

**Paste a listing (Phase 3–4, the core flow)**
1. You paste text or a VIN, or click the bookmark on the listing page (built). The Server Action checks input size and the rate limit (built). A pasted link is **never fetched** by the server, because fetching user-supplied URLs would let someone make the server request internal addresses (SSRF): a link with a VIN in it becomes a VIN lookup, and any other link shows the bookmark and copy-the-page options. Login check (built). Optional: "Find the live listing" by VIN (built, 1–2 API calls).
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

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: lint, `next typegen` then `tsc --noEmit` (the `PageProps`/`LayoutProps` helpers are generated by Next.js), `npm test` (offline; prints the listing corpus scorecard), `npm run build` with placeholder public Supabase settings (pages create a client while pre-rendering, but nothing connects), and `npm audit --omit=dev --audit-level=high`. No secrets are needed or stored in GitHub. `codeql.yml` scans the TypeScript app and the Python tools weekly and on every push; `dependabot.yml` opens grouped update PRs. `vercel.json` stops Vercel building preview deployments for Dependabot branches: the keys are set for Production only, so those builds can't (and shouldn't) get them; CI on the pull request is the check.

## The buyer's decision (`lib/decision.ts`)

On top of the rule engine (`lib/verdict.ts`, which still drives saved cars and the corpus), `decide()` maps each finding to a public severity (stop / verify / note), an evidence source and one of four areas (listing trust, car condition, price, ready to pay), then works out one next step. Each area lists what's still unknown, so nothing found is never shown as checked clean. It's pure and runs in the browser (`components/analyzer/VerdictCard.tsx`), so answering a seller question or attaching a report updates it instantly. Tests: `lib/decision.test.ts`.

## Measuring the scam warnings (`lib/scam/eval/`)

`cases.json` (tuning) and `holdout.json` (never used to tune) hold labelled ads; corpus cases with a `scam` label join the tuning set. `evaluate.ts` runs each through the real parser, rules and `decide()`; an ad counts as flagged when the answer is "Stop" because of the listing or the payment. It also scores a keyword filter as a baseline. `eval.test.ts` prints the scorecard and fails if `scorecard.json` (rendered by `/accuracy`) doesn't match the code; refresh it with `UPDATE_SCORECARD=1 npx vitest run src/lib/scam/eval`. A held-out ad that leads to a rule change moves to `cases.json` and is replaced, so the held-out number stays honest.

## Seller verification (`lib/seller-replies.ts`, `lib/seller-message.ts`)

`sellerMessage()` writes the first message to the seller from what's unknown (VIN, title, liens, accidents, recalls, the model year's known issue and its bulletin) and always ends, for a private seller, with a photo of the VIN sticker next to a random three-word phrase (`proofPhrase()`, made in the browser). `checkReplies()` runs the message-relevant scam rules on what the seller wrote back and compares their story with the ad; findings are named `msg-<rule>` so `decide()` keeps the rule's severity and area but labels the evidence "The seller's messages". Everything runs in the browser; replies and chat screenshots are never sent or stored. Tests: `seller-replies.test.ts`, `seller-message.test.ts`.

## My list (`lib/workspace/local.ts`, `/mine`)

Visitors keep cars on their own device (localStorage key `vv-workspace-v1`); there's no account and no server copy. Every read, from storage or an imported file, goes through `parseWorkspace()`, which validates and caps each field and drops anything else, and everything is rendered as text. "Check it again" links to `/#listing=…`, which only fills the box. The owner's server-side My cars (Supabase) is separate and unchanged.
