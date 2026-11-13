# VinVerdict — Project Plan

*VinVerdict* is the project name for the Used Car Deal Finder.

Nov 8, 2026 · @the owner

**Plan C v2:** build the full app as a learning and portfolio project that is also genuinely useful for buying a first car — one consistent checker for every listing, private sellers included, on free tools only.

## 1. Goal, positioning and principles

**Goal:** find reliable, fairly priced used cars (Toyota, Honda and similar) in the US, ranked by price-to-miles value, and catch scams before any money moves.

**Positioning — what the big sites already do vs. what this app adds**

| Job | Already done well by | This app's role |
| --- | --- | --- |
| Search many sites at once | AutoTempest | Don't copy it: link out to it |
| Deal labels on dealer cars | CarGurus, AutoTrader (KBB) | Same idea, but one scorer for every source |
| Rate private-seller listings (Facebook, Craigslist) | Almost nobody (Spottable extension claims to; test it) | Core feature: paste analyzer |
| Rank by price per remaining mile, reliable years only | Nobody | Core feature |
| Scam, title, lien, recall and safety checks in one place | Spread across many sites | Core feature |

**What the app will not do:** find deals that are never listed (family, friends, coworkers — where the benchmark deal came from), replace a pre-purchase inspection, or guarantee a car's condition.

**Benchmark deal:** 2017 Honda EX-L, 100k miles, $7k vs about $14k market. That is rare. Real "great deals" are usually 10%+ below market; 30%+ below on a public listing needs a clear reason.

**Principles**

- Free tiers only.
- Analyzer first: the part that helps buy a car ships first; in-app search comes later.
- Every result and check links to its source.
- Small changes, a check-in after every phase, beginner-friendly explanations, `docs/ARCHITECTURE.md` kept current.
- Personal use first; public later.

## 2. Requirements (decided)

| Area | Decision |
| --- | --- |
| Cost | Free tiers only. APIs are called only when Search is clicked. |
| Brands, models, years | Pick one or more of each; years as a range (e.g. 2017–2026). |
| Location | US only. ZIP code + 50 / 100 / 200 / 500 miles / anywhere in US. |
| Price | Min–max range. |
| Mileage | Min–max range. No hard cap; lower is better. |
| Body type | Sedan / SUV. |
| Transmission | Automatic only. |
| History | No salvage or rebuilt titles. No reported accidents. |
| Color | Black exterior preferred (boost), with a black-only option. |
| Ranking | Bang for buck: price relative to miles. |
| Features | A–P, all in scope (section 7). Paste analyzer ships first. |
| Website | Next.js on Vercel, polished look. |
| Login | Email + password. Just the owner at first. |
| Insurance | Out of scope. Compared manually after a shortlist. |
| Links | Everything clickable, opening the source. |

## 3. Data sources

Listings come in through three free layers, with the paste analyzer as the core. The app never scrapes sites whose terms forbid it.

| Layer | How it works | Sites | Cost |
| --- | --- | --- | --- |
| 1. Paste analyzer (core) | Paste a listing's text, link or VIN; it is scored, scam-checked and compared | Any site — mainly Facebook Marketplace and Craigslist private sellers | 0–1 API calls |
| 2. One-click searches | Your filters become pre-filled search links that open each site | [AutoTempest](https://www.autotempest.com), [CarGurus](https://www.cargurus.com), [AutoTrader](https://www.autotrader.com), [Cars.com](https://www.cars.com), [Facebook Marketplace](https://www.facebook.com/marketplace), [Craigslist](https://www.craigslist.org), [CarMax](https://www.carmax.com), [Carvana](https://www.carvana.com), [Enterprise Car Sales](https://www.enterprisecarsales.com), [Hertz Car Sales](https://www.hertzcarsales.com), [iSeeCars](https://www.iseecars.com) | 0 calls |
| 3. In-app search | Licensed APIs return listings with source links | [MarketCheck](https://www.marketcheck.com/apis/pricing) (main), [Auto.dev](https://auto.dev/listings) (backup) — mostly dealer and CPO inventory | API calls (section 10) |

**Trusted sources, by buyer protection (verified 2026-11-09; feature O shows these in the analyzer)**

| Source | Best for | Buyer protection |
| --- | --- | --- |
| CarMax | Low-risk buy, fixed price | 10-day money-back return; 30-day limited warranty since 2026-01-12 (90 days / 4,000 mi in NJ, NY, MA) |
| Carvana | Buying online | 7-day / 400-mile return, 100-day / 4,189-mile warranty |
| Enterprise Car Sales | Ex-rental cars, fixed price; available in NJ | 7-day / 1,000-mile buyback, 12-month / 12,000-mile powertrain warranty |
| Hertz Car Sales | Ex-rental cars | 7-day / 250-mile buy-back, 3-year / 100,000-mile powertrain warranty on eligible cars |
| Any dealer | — | FTC Buyers Guide on the window ("As Is" or warranty). NJ dealers must add a 30–90 day warranty on cars ≤ 7 model years, ≤ 100k miles, $3,000+ (N.J.S.A. 56:8-69) |
| CarGurus | Price check on dealer cars | Deal labels + dealer reviews |
| AutoTrader / Cars.com | Large inventory | KBB price labels (AutoTrader); check dealer reviews |
| AutoTempest | Searching many sites at once | None — it links out; skip salvage-auction results |
| Facebook Marketplace / Craigslist | Private-seller deals | None — highest scam risk; every check required |

**Free-tier facts**

- MarketCheck Free: 500 calls/month, 5 calls/sec, results limited to a 100-mile radius. Tested 2026-11-09: dealer search and **private-party search both work**; up to 50 listings per call. Has days-on-market and price-change fields; no accident field (only Carfax clean-title / one-owner flags, usually unconfirmed).
- MarketCheck History by VIN (`/v2/history/car/{vin}`) works on Free (tested 2026-11-09, 1 call): every past online listing of the car since 2015 with seller, city/state, price, miles and first/last seen dates. No accident or title data.
- Auto.dev Free: 1,000 calls/month, 5 requests/sec, no card. Tested 2026-11-09: dealer listings only (no private sellers), 20 per call, accident count and owner count on about half. Nationwide search still to test.
- Free government data: [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) (VIN decode), [NHTSA recalls, complaints and ratings](https://www.nhtsa.gov/recalls), [FuelEconomy.gov](https://www.fueleconomy.gov), [NICB VINCheck](https://www.nicb.org/vincheck) (manual link).

**Never used:** Copart, IAA or any salvage auction, and any listing that fails the scam rules (section 6).

## 4. Search filters

Hard filters remove cars; soft preferences only raise their rank.

| Filter | Type | Options |
| --- | --- | --- |
| Brand | Hard | Multi-select |
| Model | Hard | Multi-select, limited to chosen brands |
| Year | Hard | From–to |
| Price | Hard | Min–max |
| Mileage | Hard | Min–max |
| Body type | Hard | Sedan, SUV |
| ZIP + distance | Hard | 50 / 100 / 200 / 500 mi / anywhere in US |
| Transmission | Hard (always on) | Automatic only |
| Title | Hard (always on) | Clean only — no salvage, rebuilt, flood, lemon |
| Accidents | Hard (always on) | None reported; "unknown" shown with a label |
| Drivetrain | Optional hard | Any, FWD, AWD |
| Fuel | Optional hard | Any, gas, hybrid |
| Seller type | Optional hard | Private, dealer, CPO |
| Black exterior | Soft (or black-only toggle) | Score boost |
| Single owner | Soft | Score boost |
| Lower miles | Soft | Built into the value score |

## 5. Deal scoring (bang for buck)

Each car gets a 0–100 score led by how far its price sits below what similar cars with its mileage cost, plus a plain deal label.

**Step 1 — Market value**

- Comps: same make, model, year and trim, within ±15k miles. Fewer than 8 comps → widen to ±1 year, then any trim. Show comp count and a confidence label (high / medium / low).
- Comps come from the 24h cache, or 1 API call. If no calls remain, you can type in a market value from CarGurus or KBB.
- Dealer CPO cars are compared with other CPO cars.

**Step 2 — Expected price at this mileage:** a straight line of price vs. miles across the comps gives the expected price for this car's mileage.

**Step 3 — Value numbers**

- **Value %** = (expected price − asking price) ÷ expected price. Example: expected $13,500, asking $9,000 → 33% below.
- **Price per remaining mile** = price ÷ (expected life − current miles). Expected life defaults to 200k miles, editable. Example: $9,000 at 100k miles → $0.09 per remaining mile.

**Step 4 — Deal label**

| Value % | Label |
| --- | --- |
| 30% or more below | Verify — too good unless the reason is clear |
| 10–30% below | Great deal |
| 5–10% below | Good deal |
| Within ±5% | Fair |
| More than 5% above | High |

**Step 5 — Final score (default weights, editable in Settings)**

| Factor | Weight |
| --- | --- |
| Value % | 35 |
| Price per remaining mile | 20 |
| Reliability (model/year record, NHTSA complaints) | 15 |
| Safety (NHTSA crash stars) | 10 |
| Preferences (black, single owner) | 10 |
| Buyer protection (return window or warranty) | 5 |
| Listing freshness | 5 |
| Scam risk | penalty, up to −100 |

Results sort by final score by default; other sorts: value %, price, miles, distance, newest.

## 6. Scam and safety rules

A price far below market is a warning, not a win, until other checks pass. Rules run on listing data, pasted text, and your answers to the seller checklist; every flag shows its reason.

| Rule | Action |
| --- | --- |
| Salvage, rebuilt, flood, junk or lemon title (incl. "salvaged", "lemon law buyback"; not "lemon yellow paint") | Hide |
| Accident reported | Hide |
| Accident history unknown | Show with label + Carfax (if dealer provides) and [NICB VINCheck](https://www.nicb.org/vincheck) links |
| Manual transmission | Hide |
| No VIN or no price | Hide |
| VIN decode (NHTSA) doesn't match listed year/make/model | Hide |
| Deposit before viewing, gift card, wire/Zelle upfront, shipping only, seller out of state or overseas | Hide |
| "Auction pricing" or salvage-auction source | Hide |
| Seller refuses a pre-purchase inspection | Hide — walk away |
| Price 30%+ below market + any other red flag | Hide |
| Price 30%+ below market, nothing else wrong | Flag "Verify in person" |
| Title not in seller's name / "selling for a relative" (curbstoning) | Flag |
| Title recently moved from another state, or history doesn't match condition (title washing) | Flag |
| Lien on the title | Flag — pay the lender directly at a bank or through escrow, never cash |
| Same phone number on several listings | Flag |
| Wants to meet only in a random lot, rushed sale | Flag |
| Impossible mileage (e.g. < 500 mi/year on an older car) | Flag |
| The seller's own description names a different model of the same make ("Selling a 2015 Jeep Cherokee" on a Renegade listing) | Flag: ask which car it is |
| Seller says the miles aren't real ("TMU", "not actual miles", "exceeds mechanical limits", broken odometer; not "mileage exempt") | Hide |
| Same VIN listed at different prices | Flag (live-listing lookup) |
| Private seller offering a dealer-listed VIN 15%+ cheaper (cloned listing) | Hide |
| Private seller, same VIN also listed by a dealer | Flag |
| Fewer miles than another listing of the same VIN | Flag |
| Very high miles for its age (20k+/year, 40k+ total) | Flag |
| Former rental, fleet or commercial car | Flag |
| Miles went down between past listings (listing history) | Hide if 2+ readings agree, else Flag |
| Listing's miles under an earlier reading of the same VIN | Hide if 2+ readings agree, else Flag |
| Private seller, but a dealer listed the car in the last 6 months | Flag |
| For sale 3+ separate times in 3 years | Flag |
| Price already cut; listed by 2+ sellers at once | Info (price cut feeds the offer) |
| Car 300+ miles away | Info: inspect locally before paying |
| Dealer shipping, refundable deposits, trade-in payoff wording | Not a flag (normal for dealers); the eBay-Motors / "car is at a shipping company" story is always Hide |

## 7. Features A–P

All 16 features are in scope; each uses free data only.

| ID | Feature | What you see | Data |
| --- | --- | --- | --- |
| A | Out-the-door cost | Price + car tax for the buyer's state (from their ZIP) + local rate they enter + title/registration + pre-purchase inspection ($100–250) | Any US ZIP → state (offline table, state can be changed). State car-tax rules for all 50 + DC from the Florida DOR 50-state chart (as of 2026-02-11) plus each state's own site for special rules (private-sale exemptions AZ/NV/HI/old cars in MS, IL RUT-50 table, TN $1,600 local cap, FL surtax on first $5,000, SC $500 cap, GA TAVT, WA +0.5%, OK excise, etc.). City/county rate is typed in, not looked up. NJ keeps full fees (verified 2026-11-08): 6.625% tax, title $60 / $85 with a lien, registration $46.50–$84 by weight and model age. Other states: editable title/registration line + official DMV link |
| B | Suggested offer | Opening offer based on comps, e.g. "market $11.2k → offer $9.8k" | Comps (section 5) |
| C | Yearly running cost | Fuel at 12k mi/year (EPA combined MPG × this week's US average price, both editable) + maintenance/repairs/tires (AAA 2025: 11.04¢/mile, editable). Variant matched from the VIN's engine size, cylinders, drive, transmission and hybrid/EV; buyer picks if several match | [FuelEconomy.gov](https://www.fueleconomy.gov), [AAA Your Driving Costs 2025](https://newsroom.aaa.com/wp-content/uploads/2025/09/UPDATE-AAA-Fact-Sheet-Your-Driving-Cost-9.2025-1.pdf) |
| D | Crash-test stars | NHTSA overall and per-test ratings | [NHTSA](https://www.nhtsa.gov/ratings) |
| E | Recalls and complaints | Recalls for the model/year, top complaint areas; link to NHTSA's VIN lookup for open status (the free API has no per-VIN open status) | [NHTSA](https://www.nhtsa.gov/recalls) |
| F | Known issues to check | Inspection checklist for your mechanic, copyable as text: known issues (5 hand-checked manufacturer programs/bulletins: Toyota 2AZ oil use ZE7, Tacoma frame ZH6, Honda 1.5T oil dilution, 2008–09 Accord VTC rattle, 2015–16 Accord/CR-V CVT P1890), checks from the car's top NHTSA complaint areas, and checks for every used car (+ CVT) | NHTSA complaints + curated list (each item links to its official document) |
| G | Seller question checklist | Title in your name? Lien? Accidents? Records? Why selling? Answers feed the scam rules | Built-in |
| H | VIN checks + buying day | NICB VINCheck and NHTSA recall links, inspection and test-drive steps; for private sellers, title/lien/payment checks and the NJ MVC private-sale paperwork (bill of sale, plates stay with the seller, transfer in person within 10 working days or $25 penalty) | [NICB](https://www.nicb.org/vincheck), [NJ MVC](https://www.nj.gov/mvc/vehicles/transowner.htm) (checked 2026-11-09) |
| I | Scam score | Risk level with plain-English reasons | Section 6 rules |
| J | Extra filters | Drivetrain, fuel, seller type, single owner, black-only | Listing data |
| K | Checked cars / watchlist | Every analyzed or saved car, with price-drop history | Supabase |
| L | Compare | 2–3 cars side by side | Saved data |
| M | 👍/👎 learning | After about 100 ratings, score weights adjust to your taste | Your ratings |
| N | Paste analyzer | Score, label, scam check, comps for any pasted listing, whole copied page, dealer link with a VIN, or VIN. "Read screenshots" reads listing screenshots on the phone (OCR in the browser, nothing uploaded). Optional bookmark on a computer. "Check price & history": VIN → live listing (Auto.dev, then MarketCheck) + listing history (MarketCheck History: past sellers, prices, miles) | 0 calls; up to 5 on the price button |
| O | Buyer protection badge | Return window and included warranty for the seller (CarMax, Carvana, Enterprise, Hertz detected from the text/link); dealer = FTC Buyers Guide + NJ dealer-warranty tier for the car's age/miles/price; private = none | Section 3 table (verified 2026-11-09) |
| P | Reliability shortlist | Recommended models/years for your budget, each with a one-click search | Consumer Reports and iSeeCars picks + NHTSA complaints |

## 8. Tech stack and architecture

One Next.js app on Vercel talks to the APIs from the server side and stores everything in Supabase; all on free plans.

| Part | Tool | Job |
| --- | --- | --- |
| Website + server code | [Next.js](https://nextjs.org) (TypeScript) on [Vercel](https://vercel.com) Hobby | Pages, plus hidden server routes that hold API keys |
| Login + database | [Supabase](https://supabase.com) Free | Email/password login; tables for searches, cache, watchlist, ratings, API usage |
| Listing data | MarketCheck, Auto.dev | Search results |
| Car facts | NHTSA vPIC, recalls, ratings, complaints; FuelEconomy.gov | Enrichment |
| Code + docs | GitHub | Repo, `docs/ARCHITECTURE.md` |

**What happens when you click Search**

1. Browser sends your filters to the app's server route (never straight to an API).
2. Server checks login, input validity and the 24-hour cache. Cache hit → return saved results, 0 calls.
3. Cache miss → check the monthly call budget, then call MarketCheck (≤ 100 mi) and/or Auto.dev (wider).
4. Clean results: merge duplicates by VIN, decode VINs, apply hard filters and scam rules.
5. Compute comps, value %, price per remaining mile and final score.
6. Add NHTSA and fuel data (cached per model/year).
7. Save to cache, update the usage meter, return ranked results with source links.

**What happens when you paste a listing (the core flow)**

1. You paste the listing text, a link or a VIN. Facebook needs pasted text, because its pages require login.
2. Server pulls out year, make, model, trim, miles, price, VIN, location and seller type from the text.
3. VIN decode (NHTSA) fills gaps and checks the listing's claims.
4. Market value from cached comps, 1 API call, or a value you type in (section 5).
5. Scam rules, deal label, score, recalls, safety, fuel and out-the-door cost.
6. You answer the seller checklist; flags update.
7. The car is saved to Checked cars with its source link.

## 9. Security

API keys never reach the browser, and only logged-in users can trigger a search.

- API keys live in Vercel environment variables; never in code or GitHub.
- Supabase handles passwords (hashed, never stored in plain text).
- Row-level security: each user sees only their own watchlist, ratings and searches.
- Every server route checks login and validates input (ZIP format, number ranges, allowed values).
- Rate limit: max 5 searches per minute per user; login max 5 tries per minute per IP and per email.
- HTTPS only; secure session cookies (httpOnly, SameSite=Lax). No public sign-up: the one account is made in the Supabase dashboard.
- Outbound links open with `rel="noopener noreferrer"`.
- Pasted listings are treated as plain text, never run or rendered as HTML.
- Dependencies kept minimal and checked with `npm audit` each phase.

## 10. API budget rules

The free quotas (MarketCheck 500/month, Auto.dev 1,000/month) allow roughly 150–300 searches a month at 2–6 calls each.

- Calls happen only on a Search click, a paste-analyzer check, or a manual watchlist refresh. No background jobs.
- Same search within 24 hours → cached results, 0 calls.
- NHTSA and fuel data cached per model/year (free, but kept fast).
- Usage meter on every page, e.g. "MarketCheck 412/500 left".
- Warning before any search that would exceed the remaining quota; hard stop at 0.
- Within 100 miles → MarketCheck first; beyond 100 miles or "anywhere" → Auto.dev.
- Fetch only as many result pages as needed for ranking and comps (cap set in Phase 3).

Paste analyzer cost: 0 calls when comps are cached or you type a market value; 1 call for fresh comps.

## 11. Pages

| Page | What it holds |
| --- | --- |
| Check a listing (home) | Paste box → score, deal label, scam check, comps, out-the-door cost |
| Shortlist | Reliable models/years for your budget, each with one-click searches |
| Search | Filter panel, usage meter, ranked results, one-click links to outside sites |
| Car detail | Photos, score breakdown, comps, A–I and O info, seller checklist, source link |
| Checked cars | Every analyzed or saved car, price-drop history |
| Compare | 2–3 cars side by side |
| Settings | Score weights, expected life miles, default ZIP, black-only toggle |
| Login | Email + password |

## 12. Build phases

The analyzer is usable for real car shopping after Phase 4; each phase ends with a check-in and approval. Tick each when approved.

- [ ] **Phase 0 — Setup:** accounts (GitHub, Vercel, Supabase, MarketCheck, Auto.dev) with a step-by-step guide; try the free Spottable extension to see what already exists.
- [ ] **Phase 1 — API test:** confirm free-tier endpoints, radius, private-party access, accident/title fields, results per call. Adjust this plan from findings.
- [ ] **Phase 2 — Skeleton:** 2a: Next.js + empty pages (built alongside Phase 0). 2b: Supabase + login (after accounts exist). *2b built 2026-11-09; tables move to the phase that first saves data (usage meter Phase 4, checked cars Phase 8), each with row-level security.*
- [ ] **Phase 3 — Analyzer v1:** paste → parse, VIN decode, recalls, crash stars, scam rules, seller checklist, out-the-door cost. *Logic built early (tested, no UI): VIN check, NHTSA client, listing parser, scam rules.*
- [x] **Phase 4 — Value:** *(built 2026-11-09: 3-source fair range, deal label, offer, confidence; backtest 6.6% median error)* comps, value %, price per remaining mile, deal label, suggested offer, manual market value fallback.
- [x] **Phase 5 — Car detail:** *(built: known issues, VIN links, buyer protection, fuel cost, saved-car page)* known issues, VIN check links, inspection step, buyer protection badge, fuel cost.
- [x] **Phase 6 — Shortlist:** *(built from NHTSA complaints per year on the road + known issues; AutoTempest/Facebook searches)* reliable models/years page with one-click searches.
- [x] **Phase 7 — Search:** *(built: MarketCheck dealer + private, ranked by value, 24h cache, usage meter; outside links)* in-app search, all filters, 24h cache, usage meter, outside search links.
- [x] **Phase 8 — Your tools:** *(built: My cars, compare, price drops, settings. 👍/👎 learning not built yet)* Checked cars, compare, 👍/👎 learning, Settings.
- [ ] **Phase 9 — Final review:** security and code review, deploy, you test. *Security review + hardening done 2026-11-10 (see change log); deploy needs the owner's Vercel login and the SQL files run.*
- [ ] **Phase 10 (later) — Public:** open to other users; solve the shared API quota first.

## 13. Open questions, risks and working rules

**To verify in Phase 1**

- [x] Does MarketCheck Free include private-party search? **Yes** (2026-11-09): 5 private 2017 Accords within 100 mi of 08540, from KBB, Cars.com and Craigslist.
- [ ] Does Auto.dev Free allow nationwide search, and with which filters? (radius param is `distance`; 1 test call left to do)
- [ ] Does MarketCheck Free reject or cap a radius over 100 mi? (1 test call left to do)
- [x] Do listings include accident, title, owner-count and color fields? Color: both. Accident and owner count: Auto.dev only, on about half. Title: MarketCheck's Carfax clean-title flag, usually unconfirmed. So accident status stays "unknown" unless the listing says so.
- [x] How many results does one call return? MarketCheck up to 50, Auto.dev Free 20. A 2017 Accord near Princeton had 186 dealer listings, so ranking reads 1–2 pages, not all.
- [x] Exact pre-filled search URL formats for each outside site. AutoTempest checked 2026-11-09 (`make, model, zip, radius, minyear, maxyear, maxprice`); it links on to AutoTrader (`makeCodeList, modelCodeList, startYear, endYear, maxPrice, zip, searchRadius`), Craigslist and Facebook. Facebook takes `query` + `maxPrice` only.
- [x] Which listing links can be read by the server vs. need pasted text? **None are fetched** (2026-11-09): sites block bots and forbid scraping, and fetching pasted URLs is an SSRF risk. Instead: the bookmark (reads the page in the browser), copy-the-whole-page, VINs inside dealer links, and the VIN → live-listing lookup.
- [ ] Does Spottable already cover enough to skip any feature?
- [x] Current NJ sales tax and MVC fee amounts from official NJ sites (2026-11-08: [Taxation](https://www.nj.gov/treasury/taxation/moveqa.shtml), [MVC fees](https://www.nj.gov/mvc/vehicles/regfees.htm), [doc-fee notice](https://nj.gov/njbonds/treasury/taxation/pdf/Noticemotorvehicledealerships.pdf)). Weight class comes from NHTSA curb weight when available.
- [ ] Hertz Car Sales return policy.

**Found so far (2026-11-08, NHTSA, keyless)**

- [x] NHTSA lists CVTs as "Continuously Variable Transmission (CVT)": the automatic-only rule counts CVT, dual-clutch and automated-manual as automatic.
- [x] vPIC still decodes a VIN with a bad check digit but returns `ErrorCode` 1: the app checks the digit itself and treats any non-zero code as a warning.
- [x] The free recalls API is by year/make/model only; open-recall status per VIN needs NHTSA's website lookup (feature E adjusted).

**Risks**

| Risk | Fallback |
| --- | --- |
| Free tiers change or shrink | Swap provider behind one adapter file; paste analyzer still works |
| Few private-seller listings in-app | One-click Facebook/Craigslist searches + paste analyzer |
| Accident data often missing | "Unknown" label + VIN check links + inspection reminder |
| Free Supabase project pauses when idle | One-click resume in Supabase dashboard |
| Too few comps for rare trims | Widen comps; show confidence label |

**Accuracy: where it stands (2026-11-09) and what would improve it most**

| Area | Measured now | Next step (most useful first) |
| --- | --- | --- |
| Listing parser | 26 real-format cases (AutoTrader, Cars.com, CarGurus, CarMax, Carvana, Enterprise, Facebook private + dealer, Craigslist owner + dealer, dealer sites, short texts): 100% of checked fields | Add every real listing the owner checks to `src/lib/listing/corpus/` (one paste + expected answers). Real pages beat reconstructions; 50+ cases would show weak spots by site |
| Fair value (comps only) | Leave-one-out on real data: Camry sold listings median error 6.6% (63% within 10%); Accord asking prices 4.6% (82% within 10%) | Save each price check's comps to `.tmp/` and keep backtesting; tried a trim adjustment (worse: 7.7%), so trim only weights comps for now. A bigger sample per trim could change that |
| Fair value (combined) | 3 sources, ±5–15% range, confidence label. Camry case: $9,600–$10,900, asking $9,900 = Fair price | Check against real outcomes: when a saved car's listing ends, note the last price (it likely sold near it) and compare with the range |
| Accident history | From listing text, dealer history boxes, Auto.dev history (about half of listings) and the seller checklist. Listing history (MarketCheck) adds odometer readings, past sellers and prices: catches rollbacks, flipped dealer/auction cars and repeated resales, but not accidents | Free sources are limited; NICB VINCheck (theft/total loss) stays a manual link. A paid history report is the only full answer |
| Scam signals | Rules + live cross-checks (cloned listing, price/miles mismatch) + same phone across saved cars + "unusually cheap" in search | Phone matching gets stronger as more cars are saved; consider matching seller names/emails too |
| Shortlist | NHTSA complaints per year on the road, within a model; sparse years marked; recall counts and "park it" recalls per year | Add Consumer Reports' published "best used cars" list as a second signal (with links) |

**Public demo (2026-11-11)**

| Visitor can | Cost | Limit |
| --- | --- | --- |
| Free checker: parse, scam rules, NHTSA, OCR, costs, inspection, buying day | 0 paid calls | 30/visitor/day, 3,000/day (Supabase) + 5/min per IP |
| 5 example cars (recorded real checks) | 0 | none |
| Live price check (lean: Auto.dev live + for-sale comps, MarketCheck sold comps + history) | ≤ 2 MarketCheck + 2 Auto.dev | Turnstile, then 2/visitor/day, 6/day total, 95/month, none past 300 MarketCheck/month |
| My cars, Compare, Search, Settings | n/a | owner only |

**Later ideas (not in scope yet)**

- Email alerts for saved searches (would use quota automatically).
- Insurance cost field.
- Public multi-user version.

**Working rules**

- Plan first; no major change without the owner's approval.
- After every step, a short high-level summary of what changed.
- Smallest possible change each time.
- Read code before making claims about it.
- Keep `docs/ARCHITECTURE.md` current.
- Verify work for correctness, efficiency and security at each phase.
- This doc is the source of truth: update it when decisions change.

**Change log**

| Date | Change |
| --- | --- |
| 2026-11-12 | **Sweep: 94 public pages (desktop) and 25 (phone), 132 internal links, the 5 examples on both widths (every tab, junk text, report download, checklist buttons, quick starts and follow-ups), keyboard, offline, Back button.** Clean: no page errors, dead links, broken images, sideways scroll, unsafe new-tab links, empty tabs or leaked "undefined/NaN"; every tab stop has a visible focus ring. Fixed:
- **Back button left the site** after a result (and lost it). A result now adds one "#result" history entry: Back returns to the top of the home page, Forward brings the result back, and a reload drops the leftover hash.
- **Opening an example offline did nothing** (a silent chunk error). It now says "Couldn't open the example: check your connection and try again."
- **The open scanner squeezed the home buttons** on desktop ("Paste & check" on three lines); it now takes its own row. On phones, "Scan a VIN" is full width like the other buttons.
- **The security page** didn't mention the camera, the VIN going to NHTSA, or the dashboard photo going to the AI; it does now. |
| 2026-11-12 | **At the car, made solid (Amogh: a random object scanned gave a random VIN; "every wrong input must say invalid or try again").**
- **The random VIN:** the finder slid a 17-character window through any text, and about 1 random string in 11 passes the check digit. Now only VIN-shaped text counts (one 17-character word, "VIN" + 17, or a few groups that add up to 17), it must also have a valid model-year code and a numeric serial and not start with 0 (`plausibleVin`), and NHTSA must decode it with a model or cleanly (`confirm-vin.ts`: a made-up VIN on a real maker's code came back as "a bus maker, no model"). 20,000 random garbled reads: 0 VINs. Too many lookups: "wait a minute"; NHTSA down: the VIN is shown and the person decides.
- **Tilted photos:** a windshield plate tilted 4° or more wasn't read. The reader retries at ±4/8/12°; the retries failed at first because white corners around a rotated grey photo made the reader skip the text (found by looking at the image), so the corners take the photo's background. Stress set of 15 photos (tilts 2–15° both ways, blur, glare, small text, low contrast, silver on black, a title line): 15/15.
- **Every wrong input says so:** random object or no VIN: "No VIN found… try again"; a barcode that isn't a VIN; a made-up VIN: "isn't a real VIN"; a typed VIN of the wrong length or with a bad check digit (with why); an empty box; a photo that isn't a dashboard; a dashboard photo with nothing readable (never "no warning lights seen"); text or a screenshot that isn't a car at all ("That doesn't look like a car listing or a VIN", before a visitor's check is spent; all 33 real pages still pass); gibberish in the assistant ("Didn't understand that").
- **Phones:** one camera at a time; the camera is freed before "Use a photo" and when the page goes to the background; clear camera errors (no permission, in use, none); "Read it" before the camera is ready says so; the reader's first download is shown; VIN-match and dashboard results are kept on the device per car (a phone can unload the page while the camera is open), checked again on load; a VIN read for an ad with none offers "Check with VIN …"; several VINs in one photo: you pick.
- **Dashboard light names:** in a live test one model read a check-engine symbol as the battery light, so findings say "a warning light is on (looks like …)" with "check which symbol it is". Live test: lit (odometer and a light), clean (no lights), not a dashboard (not readable): 3/3.
- Server action `readDashAction` tested with mocks: bad images refused before any check, no or fake "I'm human" token refused, used-up allowance refused, owner path, busy AI.
- Browser matrix: 24/24 (photo, live camera, Android barcode reader stand-in, random object, made-up VIN, two VINs, typed cases, match/mismatch/clear, two scanners, reload, dashboard rollback and lights). 711 tests. Note: local testing used up this network's 30 visitor checks for today. |
| 2026-11-12 | **At the car (Amogh chose: scan the VIN, VIN match, dashboard photo).** VinVerdict couldn't help at the moment that matters most, next to the car.
- **Scan a VIN** (home): the rear camera; the browser's barcode reader where it exists (Chrome on Android), otherwise the frame or a photo read by the on-device OCR. O/0, I/1, Q/0 and spaces fixed; only check-digit-valid VINs accepted. Cars scanned go in a ranked lot list on the device (verdict, then recalls, then price). The Permissions-Policy now allows the camera for this site only (it was off for everything; nothing else changed).
- **VIN match** ("At the car" tab): windshield plate, door sticker and title, scanned, photographed or typed, against each other and the ad. Mismatch: Stop, naming each VIN; all the same: noted as evidence. Read on the device. A checklist row opens the tab.
- **Dashboard photo**: one AI action (same gate as the other AI actions). The odometer must be a whole number and the lights come from a fixed list of 12; each light is "check this", a reading below an earlier one (listing history, auction record, report) is Stop, and the reading joins "miles agree".
- Verified: photo scan, live camera (Chromium fake camera), VIN match and mismatch in a browser; the vision AI read a test dashboard as 126,410 mi with the check-engine light and a clean one as 98,320 mi with no lights (kept as a live test with both images). 689 tests; axe clean on the scanner and the tab at both widths. Not testable here: a real phone camera and a real dashboard photo (Amogh to try). |
| 2026-11-12 | **Recall answer with substance.** "Any recalls?" used to give a count. It now says what they're about in plain words ("air bags (2 recalls); service brakes", with "don't drive it until fixed" when NHTSA says so; `plainRecallAreas`), whether a VIN recall check is already added, and that open recalls are fixed free at any dealer of the brand, even on a used car. |
| 2026-11-12 | **Your mechanic's inspection, the last step, now counts.** It was the one checklist item that could never be ticked. Say "my mechanic said it's fine" or "mechanic found worn front brakes and an oil leak, about $900 to fix": the row ticks ("Found: …", the finding said once), and the offer leads with the finding in the buyer's own words (no repair cost invented), asks for it off the price or fixed first, and the message becomes a follow-up ("Having had it inspected: …") without asking to inspect again. "No issues" and "nothing wrong" aren't read as findings; questions and "the inspection list" aren't read at all. Browser-checked. |
| 2026-11-12 | **The free NICB check, surfaced.** Accident history needs a paid report, but theft and insurance total losses are free on NICB VINCheck: "What VinVerdict knows" now has a "Theft or total loss (free check)" row with the NICB link, ticked when a result is pasted or screenshotted ("NICB: no theft or total-loss record"), and the history answer offers it while the Carfax is missing. Pasted checks are named in the reply ("an NICB theft and total-loss check", "an NHTSA recall check"…) instead of "proof". Browser-checked. |
| 2026-11-12 | **Screenshots that can't be placed.** A screenshot's text used to go through the typed-message router, so a blurry or unclear one got the help text, or worse, was sent to the AI as a "question" (spending a visitor's AI action on OCR text). Now (`screenshotFit`): barely readable → "couldn't read much" with how to take a better one; readable but unclear → the start of what was read and "What is it?" with three buttons (the seller's messages, a history report, the listing), each applied the right way. Browser-checked: an unclear chat screenshot chosen as the seller's messages turned the verdict to Stop. |
| 2026-11-12 | **Doc fee on a private sale** is kept but explained (a dealer's charge, so not in out the door), and saying "it's a dealer car" afterwards now adds it: the out-the-door section restarts when the seller type changes too (browser-checked: $15,127 → $15,659 with the $499 fee). |
| 2026-11-12 | **Home page tells visitors the check is a conversation:** one line under the paste box says that after the check they can paste the seller's messages or the Carfax (or screenshots), or say what they learn ("he'd take 13,500", "KBB says 13,200"), and the whole result updates. Axe clean. |
| 2026-11-12 | **Fallbacks and precision.** When the free AI is busy or the day's free use is gone, the reply now also gives the page's own answer and a one-tap "Copy the report for your own AI" instead of an error alone. "Is 100k miles a lot?" on a 31,000-mile car answers for 100k at this car's age and says what the car has (it used to answer only about the car's own miles). Regression sweep: all 5 examples × 14 questions answered from the page, none fell to the help text or the AI, no page errors. |
| 2026-11-12 | **Seller mismatch, glossary, AI fallback.** (1) A seller statement the person typed ("he says 140k miles") was applied to the car before the reply check compared it with the ad, so "their miles don't match the ad" never fired (also title and accident); it's now compared with the ad plus the buyer's own facts. (2) Fixed definitions for 15 car-buying words (MMR, CR grade, doc fee, out the door, clean/salvage/rebuilt/branded title, lien, CPO, as-is, PPI, curbstoning, rollback, VIN): no AI, same answer every time; anything else still goes to the AI. (3) Live AI check of the open questions that still reach the AI: 5/6 first; Groq, the last fallback, answered HTTP 400 because its reasoning ate the token budget and cut the JSON short. Now `reasoning_effort: low`; 6/6, kept as a live test. |
| 2026-11-12 | **Carfax screenshot, end to end.** A rendered phone screenshot of the case-34 Carfax attached to the assistant in a browser: read on the device (OCR), recognised as Carfax, no accidents, 2 owners and 38 service records filled in, history answers updated, the close read waiting for "I'm human". Gap fixed: with no miles in the ad, the knows panel and the mileage answer now use the report's last odometer reading, labelled "Carfax's last reading". |
| 2026-11-12 | **Several questions in one message** ("is the price fair and is it a scam?", "What should I offer? Any recalls?"): each is answered from the page, in order (up to 3), with the follow-ups under the last. Before, only the first was answered. |
| 2026-11-12 | **Phone layout.** On a phone, "What VinVerdict knows" was 720px (a screen) and pushed the assistant two screens below the verdict. Now it shows the progress, one "Known:" line and the next three gaps with their buttons, with "Show all" for the rest (wider screens still show the full two-column list): 349px. The assistant's intro is shorter and names the seller's messages; the placeholder shows the common uses. Axe clean on every page. |
| 2026-11-12 | **No-VIN ads and mileage questions.** An ad with no VIN (Facebook, Craigslist) used to answer a VIN typed later with "That's a different car". Now it re-checks the same ad with the VIN (the exact model, recalls, title checks and price check by VIN unlock), keeping what was told and the conversation; a mistyped VIN is caught by its check digit with where to find the real one. "Is 126k miles a lot?" is answered from the page (miles a year against FHWA's 13,500, the same basis as the high-miles rule) instead of the AI. Browser-checked. |
| 2026-11-12 | **Limits made into strengths (Amogh: "all limitations made into pros").**
- **The price check's quota (2 a day for visitors) and no-VIN listings:** a price guide value the person quotes ("KBB private party 12,500") now prices the car with no lookup. The estimate, offer, walk-away, report and costs all follow. Accuracy: always "you quoted it" and low confidence, at least ±10%, KBB's high bias noted, a private-party value put on the dealer basis for a dealer car, a trade-in value refused with the reason. The price answer, the offer, the knows panel and the price section point to it (Edmunds and KBB links).
- **Seller conversations:** a pasted or screenshotted chat (Marketplace, texts, labelled "Me:/Seller:") was read as a visit question, a fact, an AI question or a listing. Now it's recognised, only the seller's side is kept, and it's checked like a reply (4 typical chats: the deployment scam, an honest seller with no flags, a labelled chat, a Messenger screenshot). All 33 real listing pages still route as listings (a page with "Message" and "Is this still available?" buttons needs real conversation marks).
- "Accident history unknown" is no longer listed as leverage.
- 657 tests; browser check of both flows. |
| 2026-11-12 | **Assistant flow.** Follow-up questions under each page answer (`followUps`: two that come next, never one already asked, never the offer when the listing has a serious warning, and the quick starts swap the offer for "Is this a scam?" there; each tested to reach its answer). A visitor's question that needs the free AI, or a Carfax close read, now runs as soon as "I'm human" is ticked instead of asking them to send it again. The message to the seller is copyable in the conversation (it said "Open it to copy"), and on a listing with serious warnings it starts with "don't send money". 648 tests; browser click-through at computer and phone width, no sideways scroll. |
| 2026-11-12 | **Assistant sweep: every demo example asked every kind of question in a browser; everything wrong or weak fixed.**
- **Scam ad (2019 Civic, $4,500):** "What should I offer?" said "Start at $4,500… Would you take $4,500?" and "What's next?" said get the Carfax. Now, with a listing-trust Stop, the offer is "Don't make an offer", next steps put not paying first, and the price answer calls the low price bait.
- **Below-market cars:** "Start at $9,500 and stay below $9,500" is replaced by "find out why it's cheap", with the title and lien checks and a message asking why. When the walk-away is above the asking price, the asking price is the ceiling.
- **Offer message:** the same accident isn't said twice, "accident history unknown" isn't sent to a seller, and leverage is ordered strongest first (title, accident, price cut).
- **New answers from the page:** "is this a scam?", "who is the seller?" (feed names that don't match their link aren't shown; sellers deduplicated), "common problems / reliable / how long will it last" (NHTSA complaints with context, known issues, no lifespan promise), "going to see it / test drive / what to bring", "thanks", "I bought it!". The price answer now answers first ("Overpriced: $21,734 is $534 above similar cars"). The history answer says what the ad and listing data already show. "1 recall" grammar.
- **What the seller said** (probed with 44 real-world phrasings): checked like a pasted reply, so "he wants a deposit to hold it" turns the verdict to Stop at once with a safe reply to copy. New rule wording catches "won't let my mechanic inspect it", "need to decide today" and "title is in his brother's name"; the corpus scorecard stays at 0 false alarms.
- **New facts:** the seller's lower price (the last one said; never a deposit, an amount off, or under $1,000), the doc fee, rental or fleet use, "title is clean", "1 accident", "accident-free".
- **Bug:** the out-the-door section kept the price it started with, so a told price changed the assistant's total but not the section. It now restarts when the price or doc fee changes.
- **Knows panel:** no "Run the price check" again after a lean check, "Needs the VIN" without one, and what's already known about the history. Seller's answers count what the seller said.
- **The conversation is kept** on the device per car (7 days, 40 messages).
- Checked: 645 tests (28 new messages in the routing test set), typecheck, lint, axe on every page (computer and phone), browser sweeps of all 5 examples. |
| 2026-11-12 | **The assistant, finished (Amogh: "next time I test it should impress me").**
- **What VinVerdict knows:** a checklist under the verdict with "X of 9 known" and a button for each missing piece (tell the price, add the report, run the price check, check recalls by VIN, see what to ask). The owner count comes from the report before the ad.
- **"What should I offer?"** (`assistant/deal.ts`): the auction gap, the estimate's open and walk-away prices, a cheaper listing of the same VIN, leverage, and a message to copy. Page numbers only; with no estimate it asks for their best price instead of naming one. The auction isn't repeated as "leverage".
- **Changed sections light up**, and the reply now says when out-the-door changed.
- **Miles agree across sources** (`assistant/odometer.ts`, evidence "Readings compared"): the listing (counted once with its live feed), an auction record and each report. Carfax's header line ("126,357 mi \| VIN") is now read as the odometer.
- **A told ZIP is the buyer's**: it was wrongly written into the car's location. It now becomes the saved ZIP for out-the-door, cost per year and the price check. Auction-record findings are labelled "What you told VinVerdict".
- **Quick starts fit the page** (offer once a price is known, the recall count).
- Checked: 603 tests, typecheck, lint, axe on every page (computer and phone), and the session replay at desktop and phone width (no sideways scroll). |
| 2026-11-12 | **Assistant test set (Amogh: "keep improving until you are 100% confident").** `src/lib/assistant/eval.test.ts`: 120 labelled messages in every category, all 33 real corpus pages, report pages, and auction records (Manheim, ADESA, ACV); it must pass 100%. The first run found 11 misses, all fixed:
- **4 real listing pages became "proof"** because dealer pages mention Carfax, AutoCheck or NHTSA. A page now counts as a report only with at least 2 report-only markers ("previous owners", "service history records", "AutoCheck score", "VINCheck … records"…).
- **A pasted link** now explains "paste the page instead", or flags a different car from the VIN in the link.
- **A bare VIN** is "this car" or a different car.
- **"Odometer reads 126,360"** is read as miles.
- **"last night"** no longer counts as a car word.

Live AI check: 10 open questions, 10 of 10 answered and passed the guards. Answers had been unhelpful ("the report doesn't say"), so the instructions now allow clearly marked general guidance ("In general, …") for general questions, while this car's facts still come only from the report, invented numbers are still rejected, and every answer says how to find out |
| 2026-11-12 | **Assistant audit ("make sure I don't get dissatisfied again").**
- **Checked:** the free AI with the new answer format (GLM: a grounded answer, sections, unknowns, next step, action buttons).
- **Checked:** 40 everyday phrasings run through the router. **Fixed:**
  - "what's next" (with an apostrophe) got the small-talk reply, the quick-start button among them;
  - real questions ("is it reliable", "what's the mpg", "insurance cost?") were treated as small talk;
  - **a question was read as a fact** ("has it been in an accident?" recorded an accident). Facts now come only from statements, including the part before ", is that good?";
  - off-topic questions ("what's the weather?") never spend an AI action.
- **New answers from the page, no AI:** out the door (costs section default, inspection shown apart) and MPG and fuel cost.
- **Added:**
  - quick-start buttons;
  - a "Read it closely with free AI" button in the conversation for pasted or attached reports (screenshots go to the vision model too);
  - what you told VinVerdict is kept on the device per car for 7 days (refresh-safe), plus "Clear all";
  - "priced for $X" counts as the asking price;
  - AI action buttons never suggest a step that's done;
  - "thinking of buying" includes the estimate and auction sale.
- **Accessibility:** the assistant's file picker had no label (axe critical), now fixed: 0 violations.
- **Verified:** phone width (no sideways scroll), a fact survives a reload, and the session replay passes |
| 2026-11-12 | **Assistant v2 ("Tell VinVerdict or ask"), approved plan, from Amogh's real session on VIN 4T1B11HK8JU145889.** His session: VIN only → "thinking of buying" → "auction sale … priced for 9,100" → the pasted Manheim-style record → the Carfax, which couldn't be attached. Nothing on the page changed, answers were generic, and every message used AI.
- **Now: one box** for text, pasted pages and screenshots (OCR on the device).
- **A no-AI router** (`lib/assistant/route.ts`) sorts each message: auction record, report or check page (proof card plus an AI close read), another listing (or a different car), facts in a sentence, a question answered from the page with action buttons, small talk.
- **AI** is used only for open questions; its answer may return fixed actions and quoted facts.
- **What you tell it is merged into the shown car before anything is computed** (`applyTold`), so the verdict, price (with "last sold at a dealer auction: $9,100, a wholesale price"), costs, seller message and report update at once, each change listed and undoable.
- **Accuracy:** wholesale dealer auctions (Manheim, ADESA, ACV, MMR, CR grade, consignor) are now a "Check this" (`dealer-auction`), not the salvage-auction Stop, which stays for Copart/IAA/salvage.
- **Money rule (Amogh: "I should never be charged"):**
  - `quotaBlock` fails closed (no meter, no paid lookup);
  - the AI client calls only `FREE_MODELS`, with tests;
  - CLAUDE.md gains the hard rule;
  - `workflows/no_charges.md` holds the account checklist.
- **Verified:** a browser replay of his session on a local build, step by step; 439 tests pass |
| 2026-11-12 | **AI mode switched on (keys set, migration run) and probed live.** `tools/probe_ai.py`:
- **GLM:** glm-4.7-flash overloaded or slower than 40 s (it reasons first), so it's now **glm-4.5-flash with thinking off** (about 1 s). Free GLM allows only a few requests a minute (code 1302) and its vision model is often "overloaded" (1305); the chain moves on.
- **Gemini:** gemini-3.8-flash vision timed out or answered 503, so **gemini-3.5-flash-lite** is used for images too (read the test image right in about 1 s).
- **Groq:** 1,000 requests a day, but only 8,000 tokens a minute.
- **Provider settings:** `providers.ts` gains a per-provider request `body`; the probe reports timeouts instead of crashing.

Live (`AI_LIVE=1 npx vitest run src/lib/ai/ai.live`), on the case 32 data:
- **Ask:** a grounded answer.
- **History read:** all 4 events with quotes found in the text.
- **Dealer check:** Fast Track Motors read as listed, $17,985, 82,654 miles, $999 doc fee, the same as the outside AI; DCH's site didn't open for a bot, shown as "open it yourself".

**Real page 33 (Autotrader, Salvage Reseller: a 2010 Mazda CX-7 "Buy It Now" at $500 from an auction broker).** Fixes:
- the broker's name read as a salvage title; it's now ignored, so the ad's "Clean Title" stands;
- the broker's homepage link taken as the listing, so a site's home page no longer counts;
- CX-7 added (plus CX-70, Mazda5, Tribute);
- **models matched longest first**, so a CX-50, CX-90 or CX-30 was being read as a CX-5, CX-9 or CX-3;
- "inventory comes directly from auto auctions" now fires the auction rule;
- new `auction-broker` (Check this): Buy It Now or bid price, fees and delivery on top, as-is, ask for the total and an inspection.

Scorecard unchanged: 38/38 scams caught, 0/58 false alarms |
| 2026-11-11 | **AI mode on free tiers (approved plan; Amogh: GLM first, then Gemini, then Groq; all features; visitors and owner from day one; 5 a visitor a day).** Built: `src/lib/ai/`: a provider chain over OpenAI-style APIs with fallback, guards (invented numbers and links reject an answer; quotes must be in the source), **Ask about this car** (from the short report), **Read it closely with free AI** for Carfax/AutoCheck (proof record; only quoted events count; good news needs Confirm; another VIN never counts), **Check the dealers now** (`net/safe-fetch.ts`: https, public DNS on every hop, manual redirects, 8 s, 1.5 MB, robots.txt; JSON-LD first, AI only for gaps, numbers must be on the page); a "Found by AI" report section; the migration `20261112_ai_allowance.sql` (kinds `ai` 5 per visitor and 400 a day, `ai_owner` 50); `tools/probe_ai.py`; SOP `workflows/ai_mode.md`; `/security` section. Hidden until `NEXT_PUBLIC_AI_MODE=1` and the keys are set. **Seller-reply AI not built:** the rules already catch 12/12 labelled scam replies with 0 false alarms, so by the plan's bar there's nothing for AI to add until harder, real replies are collected. Live evals (Carfax reading on real reports, dealer pages, 20 questions) run once the keys exist |
| 2026-11-11 | **Outside AI review of a real report** (Amogh pasted VinVerdict's report for case 32 into another AI with web access; it found more, which costs trust). Checked line by line; real VinVerdict bugs fixed: (1) "Price already cut from $32,274 to $17,985" mixed two dealers (DCH's own odd $32,274, a rise from $21,990, against Fast Track Motors' price): a cut is now one seller lowering its own price, and a first price over 1.5× today's is ignored as a list-price figure; (2) "listed 332 days" counted four dealers as one: days now run from when the dealers selling it now started (135), and earlier sellers in that run are listed ("it changed hands"); (3) the key fact was buried as "Listed by 2 sellers at once": now "Another dealer lists this same car for $2,357 less" with each dealer's dates, place and price, what to do (call each on a number you look up; buy from the one with the title) and that a "certified" label doesn't come with the car; new `history-moved` (Check this) when the pasted ad's dealer (`dealerName`, matched with `sameSeller`) stopped listing it and another lists it now; the message to the seller asks whether they still have it; (4) Auto.dev returned Fast Track as the seller with DCH's link and price, so "Is this dealer real?" checked the wrong dealer: `liveSeller` distrusts a feed name with none of its words in a dealer site's address, and the pasted dealer's name comes first; (5) "worth about $7,535 when you sell" (a 2020 Camry losing 55% in 3 years): a comps-fit yearly loss over 1.5× (or under half) the typical decline is treated as noise and the typical 12% is used, saying so; (6) "Overpriced, high confidence" for a certified car against mostly non-certified comps: a maker-certified ad lowers confidence one step and says why (no invented premium). Report: "Do this first" row; "confirm who has the car" leads the open items when another dealer lists it; out the door says how much is your own inspection (not paid to the dealer) and that dealer fees aren't all known; the AI note says which links to verify if it can browse and to keep outside findings separate, and to use a history report the buyer pastes. Already fixed in the deploy an hour after that report: model, paint colour, 34 vs 31 MPG, the dealer loan question, certified warranty. Not fixable by design: VinVerdict can't open Carfax (terms); the other AI's claim that Toyota's warranty runs from the certified purchase date contradicts Toyota's own warranty page (powertrain from original first use) |
| 2026-11-11 | **Real page 32 (toyota.com Certified Used Vehicles, a dealer's Gold Certified 2020 Camry XLE).** Answers written by hand first; four parser errors and six result-page gaps fixed. Parser: the make only in the dealer's name ("DCH Wappingers Falls Toyota / Open Today") left the model empty, so a model right after a year ("2020 Camry") is now used, this make's first, then any make's; Toyota's "8ECTI" (and the misspelt "Transmimssion" label) is an automatic; "Ext. Color: WIND CHILL PEARL / Int. Color: BLACK" read as black (the interior), so "Ext."/"Int." are read as labels and maker paint names (Wind Chill Pearl, Obsidian Blue, Crystal Black...) map to their colour; the dealer's name is read only in the strict "name above opening hours" layout (`dealerName`), so "Is this dealer real?" searches for the real dealer. Result page: buyer protection now has a maker-certified profile that quotes the warranty terms the ad lists and, since Toyota counts the Gold powertrain warranty from the original first-use date (toyota.com warranty page) while dealers say otherwise, asks which start applies and shows the most cover that could be left (17,367 of 100,000 miles here); the EPA fuel match dropped "Camry XLE/XSE" (5 names, only the 4 shortest kept), so names with the VIN's trim are kept first; a dealer isn't asked about a loan on the car (it pays any off itself; "0 of 1 seller question"); "Free Carfax Report" in the ad becomes "ask the dealer for it" on the page and in the report; fuel labels lose their " · ". Local build blocked by a locked file in `.next` (another program), so the build was checked by CI and Vercel; the case was also run end to end with live NHTSA/EPA lookups through the report pipeline |
| 2026-11-10 | **Private-ad phrasing probe** (37 phrasings typical of Facebook and Craigslist sellers). **Serious bug fixed:** question-and-answer style ("Salvage? No. Flood? No. Accidents? None.") read as a salvage title with an accident, a Stop verdict on a clean car; `hasUnnegated` now also treats a term answered no right after it ("?", ":" or a dash, then no/none/never/0) as negated, except "no problem" and "no injuries"; "Accidents: none" counts as the seller saying none (still only the seller's claim). New finding `seller-problem` (Check this, car area): problems the seller admits (check engine light on, transmission, engine, head gasket, overheating, oil leak or burning, misfire, won't start, catalytic converter, needs work), ignoring denials, repairs already done, "sold as is" and dealer-site review summaries ("some report transmission issues", found on the real Jeep page); the seller message asks for a diagnosis and repair quote. Checked against all 31 real pages and the labelled ads: no stray hits; scorecard unchanged |
| 2026-11-10 | **Ready for Facebook and Craigslist pages** (probed with their page layouts before real ones arrive). Bug: Craigslist's pasted attribute box runs its fields together ("title status: rebuilt transmission: automatic"), and the "rebuilt transmission isn't a title" exception hid the rebuilt title, so it read as unknown; the exception now ignores a word followed by a colon (the next field). Craigslist "title status: parts only" is a branded title. New note `new-account`: Facebook's "Joined Facebook in YEAR" this year or last. A note, not a warning (no official FTC/BBB/Meta source found, and consumer guides agree a new account alone proves nothing), so it never changes the verdict. Scorecard unchanged (0 false alarms) |
| 2026-11-10 | **Car guide out of the menu** (Amogh: "doesn't even make sense to show that there"). VinVerdict judges one listing; the guide, as built so far (release 2: body, engines, EPA fuel cost, Wikipedia luxury/sports labels), doesn't help with that and repeats fueleconomy.gov, yet sat second in the menu. Removed from both menus; linked from the footer as "Every model's fuel cost by year"; pages, sitemap and public access unchanged. It returns to the menu only with buyer-relevant data (which years had more recalls, complaints, lower crash ratings) |
| 2026-11-10 | **Report, the cons made pros** ("make it the best"). Short version (Full/Short choice; `-short.md`; keeps sections 1, 2, 4, 5, 6 summary, 7, 9 summary, 10, 14 with the same numbers, the ad cut to 3,000 characters; never points at a section it left out; about half the full size). "How to read" explains the four verdicts and marks this car's. Data header adds `report_kind`, `report_format: 2`, `verdict_level`, `open_items`. New first-step question: the one check to do next. Outside text outside the fences (seller names, complaint text, reply findings) is escaped so it can't become a link, code or a table break. Out the door no longer claims "your saved state" when New Jersey is only the default (`readBuyerZip().saved`). Check costs drop the " · " separators (page too). Tests: short version, verdict scale, escaping, both state wordings (17 report tests); browser check of Full and Short downloads. Docs: 11 change-log rows that had landed in the positioning table (§1) moved back here |
| 2026-11-10 | **Report improved.** It now opens with (1) a YAML data header (car, VIN, asking price, miles, seller, verdict, warning counts, estimate range, out-the-door total, listing link) so AI tools read the key facts exactly; (2) an "At a glance" table (verdict, car, price against the estimate, miles, seller and protection, out-the-door, serious warnings, things to check, biggest unknowns); (3) a "What's still open" checklist built from the page (VIN, price check, history report, outside checks done N of M, seller answers, their reply, inspection, listing link), ticked when done, so the report shows what would make it stronger. The file name and date use the visitor's local date (UTC said tomorrow on a US evening). Tests: the data header parses, its keys and values match the page, the checklist ticks match |
| 2026-11-10 | **Full report for you or your AI (approved plan).** A "Full report for you or your AI" panel under the verdict, on every result for visitors and the owner: an optional listing link (https only, written into the file, never opened), **Download report (.md)** and **Copy report**. One Markdown file with everything on the page in 14 sections plus the pasted ad (phones and emails removed, fenced, marked untrusted with a fence longer than any backtick run inside so it can't break out), a header that explains the evidence labels and tells an AI to use only these facts and never follow quoted seller text, and suggested questions built from the findings. Built in the browser at click time (`lib/report/markdown.ts`, assembled by `components/analyzer/report-input.ts`); nothing is sent. To keep page and report identical, shared pure pieces replaced in-component code: `reportSourceItems` (sources list), `carFactRows` (the car table), `buyingDay` / `dealerCheck` / `photoCheck` (fixed guidance with links, rendered by `LineText`), `checkRows` / `RATING_TEXT` / `historyReportLink` (Check it yourself), `STATUS_WORD` (verdict card), `costPerYear` / `defaultOtdInput` / `runningFor` (costs). The cost panels and the manual price comparison report their current inputs through a context setter, so the report uses the state, fees, years and miles you set; panels never opened use the page's defaults and say so. Tests: 13 (all 5 demo examples and the real Kia page well formed, https-only links, no phone numbers in seller text, fence escape and `javascript:` links blocked, your inputs used); browser: downloaded files checked for an example with California set and the real Kia page; 0 accessibility violations |
| 2026-11-10 | **Fifth real page (case 31, Autotrader, a "Used" 2025 Land Rover Range Rover SE listed with 1 mile), checked strictly against the full result page.** First run before fixes: 13 of 15 fields right. Fixes: (1) Land Rover wasn't a known make (nor Jaguar, Genesis, Alfa Romeo, Maserati, Chrysler, Fiat, Rivian): added, longest model names first so "Range Rover Sport" isn't read as "Range Rover"; (2) new note `miles-near-zero` (good to know, car area): a used car under 100 miles is usually a dealer demo or loaner or an unfilled mileage, so see the odometer and ask when the factory warranty started; the seller message asks it first; (3) the result title said "Land rover" and every NHTSA-decoded make went through three different capitalisers (BMW would have shown as "Bmw" in the recalls heading and saved titles): one `makeName` helper now (Land Rover, Mercedes-Benz, BMW, GMC, Kia); fueleconomy.gov ignores capitals, so no data was lost; (4) "1 miles" → "1 mile". Out-the-door total checked by hand (NJ registration over 5,000 lb is $84). Scorecards: rules 0 false alarms on 56 honest ads (6 real); keyword filter 26; trained model leave-one-out 28/38 |
| 2026-11-10 | **Fourth real page (case 30, Autotrader Private Seller Exchange, 2015 Jeep Renegade Trailhawk), checked strictly against the full result page.** First run before fixes: 14 of 15 fields right; none of Autotrader's checkout text ("pay the seller electronically (wire, ACH…)", "delivery to your doorstep", "We do not allow salvage titles", "lien-free title") raised a scam warning. Fixes: (1) colour read as black from "Green Exterior / Black Leather Seats" (seat and upholstery words now skipped like the interior line); (2) new rule `model-conflict` (verify, listing): the seller's own words ("Selling a … 2015 Jeep Cherokee Trailhawk", "Make/Model: Jeep Cherokee") name a different model of the same make than the listing and the VIN decode (Renegade); only seller statements count, not a dealer's similar-cars carousel, and "Grand Cherokee" is not "Cherokee"; the seller message asks which car it is; (3) the "not checked" lines now say what the ad claims ("Accident details: not checked (the ad reports an accident…)", "Title records: not checked (the ad says clean; NMVTIS confirms it)"); (4) buyer protection said "Private seller: no protection" on a PSX listing: new PSX profile from Autotrader's help centre (seller paid only after you confirm you have the car, IDs and registration checked, endorsed lien-free title; still as-is), with a warning that it only applies when paying through Autotrader's checkout; (5) model names were lower-cased inside the seller message. Out-the-door total checked by hand. Scorecards: rules 0 false alarms on 55 honest ads (5 real); keyword filter 25; trained model leave-one-out 29/38 |
| 2026-11-10 | **Third real page from Amogh (case 29, Autotrader, 2019 Kia Forte, a dealer disclosing a rebuilt salvage title after theft), checked strictly against the full result page.** First run before fixes: 11 of 15 fields right and 1 warning missing. Parser fixes: (1) dealer fee read as $439 (Autotrader's "Dealer fees" total includes the $18 title and $23 temp-tag state fees, which the out-the-door cost already adds): now the price box's line items are summed without state fees (BMW $799, Porsche $1,494, Kia $398; the mixed total alone is no longer used); (2) "Rebuilt Salvage Title" read as salvage: now rebuilt; (3) colour read as black from "Black Grille" / the next line's "Black Interior": parts and the interior line are skipped; (4) "Auction photos documenting the condition prior to repairs" didn't fire the auction warning; (5) the seller's YouTube walk-around link was taken as the listing's address (saved and shown as "youtube.com"): video, social, photo, map, Carfax/AutoCheck and NHTSA links are skipped. Result-page fixes from reading the whole page: "Title brands: not checked" sat under "Rebuilt title" (now "Title records: not checked (the ad says rebuilt title; NMVTIS confirms it)"); the seller message never asked about the rebuilt title or the offered auction photos (now it asks what was repaired, for invoices and before-repair photos, and for the auction listing); dealers were asked private-seller questions, and answering "No" to "meet in person, locally" for a 314-mile-away dealer would have raised the fake-seller Stop: dealers now get 2 questions (lien, inspection) and dealer "also ask" lines. Raw HTML in the ad stays plain text (checked). Out-the-door totals for all three real pages checked by hand. Scorecards: rules 0 false alarms on 54 honest ads (4 real); keyword filter flags 24; trained model leave-one-out down to 30/38 |
| 2026-11-10 | **Car guide, release 2 (EPA catalog) + speed pass.** `tools/build_cars.py` (download, epa, labels, merge; SOP `workflows/build_cars.md`) turns EPA's file (31,916 tested versions, 2000–2026) into 86 makes and 988 models with per-year body, size, drive, engines, fuel type, MPG and EPA yearly fuel cost. EPA groups some separate vehicles under one base model and lists 911 trims as models: `tools/cars/epa_splits.csv` (Range Rover / Sport / Velar / Evoque, BMW M2–M8, Porsche Cayman / Boxster, Legacy / Outback, Santa Fe Sport, Yukon XL…) and `epa_aliases.csv` fix them. Labels: luxury per brand, sports car per model, kept only when the Wikipedia article's opening says so (80 kept, 12 rejected, e.g. Alfa Romeo, Polestar, Dodge Challenger); a sports-car maker's SUVs aren't labelled. Pages `/cars`, `/cars/[make]`, `/cars/[make]/[model]` (static, about 1,075, in the sitemap; one table per model with a link per year instead of 8,000 year pages). RepairPal's terms forbid republishing, so it's linked only; per-model reliability will be NHTSA complaints per car sold (Wikipedia sales). Custom web address dropped (no free option without .vercel.app). **Speed (Amogh: "feels slow", "lag in the car cursor"):** measured on a throttled phone. Server pages answer in 0.1–0.3 s (cached); the delays were (1) a listing check took ~6 s server-side even when repeated, because `"use cache"` lived in each serverless instance's memory: NHTSA and FuelEconomy lookups now use `"use cache: remote"` (shared); (2) the car cursor eased toward the mouse by design and redrew full-screen canvases with blur shadows every frame: it now sits exactly at the pointer (a small canvas moved by CSS transform), marks are batched into 6 strokes per frame at 1x density, 60 fps measured while moving; (3) the home page preloaded a deck photo 2,100 px below the fold (now lazy) and every page preloaded the VIN font used only in results (now not preloaded). Guest nav back to five items ("How it's secured" stays in the footer) |
| 2026-11-10 | **Second real page from Amogh (case 28, Autotrader, 2026 Porsche 911 Turbo S CPO, added with `npm run add-case`).** First run before fixes: 11 of 15 fields right. The serious miss: price read as **$630** (an option) because prices over $250,000 were thrown out; a $630 Porsche would have looked like a scam-level bargain. Fixed: every price limit is now $1,000,000 (parser, price check, out-the-door, comps, which also dropped comps over $300,000); Autotrader's "Dealer fees ($1,494) included" total is the fee on top of the price (a $995 dealer fee + a $499 e-filing fee; case 27 reads $799 the same way); Porsche added as a make. No scam rule fired on it; the keyword filter flagged it. Retraining on it moved the trained model's leave-one-out score from 34 to 32 of 38 scams caught: one long honest page shifts its word statistics, more evidence it isn't ready to make decisions |
| 2026-11-10 | **Labelled dataset + trained model, measured (Amogh: "make an algorithm to keep training the model, store this as a dataset").** `dataset/vinverdict-labelled.jsonl` (143 rows: tuning, held-out, replies, corpus pages with field answers) with a dataset card; a test fails if it drifts from the data. `learned.ts`: Bernoulli naive Bayes retrained every run; scored leave-one-out on tuning (34/38 caught, 4/52 false alarms), held-out (12/12, 0/13) and replies (11/12, 0/13). It changes no answer: the rules stay the decision-maker (sources, same answer every time) until the model beats them on real held-out listings, and even then it may only add warnings. Two earlier versions flagged most honest ads (short scam ads vs long honest dealer pages taught it "short = scam"); the shipped version was chosen after seeing that, which /accuracy discloses. Its top features ("will", "to you", "the car") show it learns the one author's style. Loop: `npm run add-case` (auto-removes phones/emails, `todo` fails tests until labelled by hand) → measure → fix → `npm run retrain` |
| 2026-11-10 | **First real pasted page from Amogh (case 27, Autotrader, 2024 BMW X5 CPO).** Answers read from the page by hand, then VinVerdict run before any change: 12 of 15 fields right. Misses fixed: the footer menu's "For Sale By Owner" link made a dealer page read as a private seller; "Stock#:" wasn't a dealer sign (word-boundary bug); BMW wasn't a known make. Added common non-Japanese makes (BMW, Mercedes-Benz, Audi, VW, Jeep, Tesla, GMC, Dodge, Volvo, Buick, Cadillac, Infiniti, Mitsubishi), whose model names only count after the make; not Ram, Mini or Lincoln (plain words). Scam scorecard: 2 real ads, both honest, 0 false alarms; the keyword filter flags this one ("deposit", "delivery") |
| 2026-11-10 | **Dev-tool advisory cleared.** Dependabot flagged minimatch 10.x (glob DoS, GHSA moderate) inside typescript-eslint, a lint-only tool that never ships. The newest typescript-eslint still asks for minimatch 10, so `package.json` overrides `minimatch@^10` to the patched 11.x. Lint, typecheck, tests and build unchanged; `npm audit` (all deps, not only shipped) now 0 |
| 2026-11-10 | **Title, accident and odometer wording probe.** 40 phrasings checked against the listing reader. Fixed: "salvaged title" and "junk title" weren't read as brands; "lemon yellow paint" or a "lemon tree air freshener" was read as a lemon-law title (a false Stop); "was in a wreck" and "hit a deer" weren't read as accidents; "clean blue title" / "clean and clear title" weren't read as clean ("title is clear" still isn't: it means no lien). New rule `odometer-unknown` (car area, Stop): the ad or the seller's messages say TMU, not actual miles, exceeds mechanical limits or a broken odometer; "mileage exempt" (older cars, legal) doesn't fire. Seller questions no longer say "an earlier listing showed different miles" when the only reason is low miles for the age. Scam scorecards unchanged (car-area rules don't count there) |
| 2026-11-10 | **Rewording probe.** 13 new paraphrases of the scam patterns found 9 gaps ("can't meet in person", "drop it off after you pay", "shipped once payment clears", "w/ Zelle 1st", "shipping co", "buyer protection through eBay", "Google Play cards", a "holding fee" to schedule a viewing, "half via Chime, rest on delivery"). Fixed with chat-shorthand expansion, brand-name gift cards, more payment apps (Chime, Apple Pay/Cash, USDT), pay-then-deliver stories (unless the seller offers a viewing) and a "can't meet" rule that ignores "can't meet until Saturday". The held-out set caught a regression from the new payment apps (h13, a holding payment through Apple Pay Cash); fixed, moved to tuning, replaced by h14 (caught on first run). The 14 probe ads (9 scams, 5 honest look-alikes) joined the tuning set: now 89 ads, all correct; the keyword filter misses 5 of the reworded scams and flags 21 of 51 honest ads |
| 2026-11-10 | **Used-car scam signs page** (`/scam-signs`, public, in the sitemap and footer): the nine patterns VinVerdict checks (money before seeing the car, an away seller and a car that ships, a price far below similar cars, no inspection, title not in the seller's name, a VIN that doesn't add up, miles that don't fit, a branded or recently moved title, a cloned dealer website), each with a typical example, why it matters, what to do, its official source (FBI IC3, FTC, NICB, NHTSA, NMVTIS, a state attorney general) and where VinVerdict checks it. Writing it found a gap: "title isn't in my name" wasn't caught by the curbstoning rule (only "is not"); fixed and tested. Every scorecard unchanged; 0 accessibility violations |
| 2026-11-10 | **What a price estimate rests on** (outside review: show sample size, radius, mileage, trim match, freshness). Under the estimate: "Found 49 ended and 20 current listings within 100 miles: 2015–2017 models, 24k–177k miles, 40 with the same trim, ended listings last seen Aug 6 – Oct 30, 2026 (the estimate leaves out outliers)", plus cautions when there are fewer than 5 similar cars, this car's miles are outside their range, or no trim matches (`lib/value/basis.ts`, tested). Older saved checks without the comparable cars show the counts only (re-recording them would spend paid API calls). Both sources were confirmed to search 100 miles |
| 2026-11-10 | **Findable.** The site still told every search engine to stay out (`robots.txt` Disallow: / and a global `X-Robots-Tag: noindex`), left over from when it was private. Public pages (home, My list, accuracy, shortlist, why, security) are now indexable and listed in a new `sitemap.xml`; the owner's pages, login, MFA and the share handoff keep `noindex` and are disallowed in `robots.txt`. The login gate skips `/sitemap.xml` like `/robots.txt` |
| 2026-11-10 | **Negation.** A self-review of the replies check found "I don't take Zelle or Venmo, cash only" marked "Payment app mentioned" (the same for ads). The payment-app rule now ignores negated mentions, and the shared negation helper (`lib/listing/text.ts`) understands don't / doesn't / won't / can't. Regression tests include scams that start with a negation word ("Don't miss out, send Zelle deposit to hold it" is still caught by the deposit rule). All corpus cases and scorecards unchanged |
| 2026-11-10 | **First-screen copy.** The home promise now leads with what people come for: "See the scam warning signs, an estimated price and what to check next, with the public record behind each" (was "a verdict, a fair price"). The public tool no longer calls itself a "demo" ("Free, no sign-up"; "Live lookups: two per visitor per day"); the privacy line says *visitors'* checks aren't stored (the owner's are saved to My cars). The home page links How accurate it is next to How it's secured |
| 2026-11-10 | **Seller replies, measured.** `src/lib/scam/eval/messages.json`: 25 replies to one honest-looking ad (12 scam patterns: deposit to hold, away-and-shipping, gift cards, refused inspection, wire, viewing fee, eBay Motors storage, Western Union, a salvage title after "clean", PayPal friends and family, bitcoin; 13 honest replies using the same words). Written before measuring; first run 12 of 12 caught, 0 of 13 false alarms, vs the keyword filter's 10 of 12 and 7 of 13. Added to the published scorecard (`messages`, `messagesBaseline`) and a new "Seller replies, measured" section on /accuracy. Also measured the live home page: Largest Contentful Paint 1.5 s on a phone throttled to 4× slower CPU and fast 4G (0.3 s on desktop), no layout shift, about 240 KB of compressed JavaScript |
| 2026-11-10 | **Sharing.** Links to VinVerdict now show a preview: `app/opengraph-image.tsx` (built once at build time, the black design with a sample four-part verdict) plus OpenGraph/Twitter metadata and a clearer page title; the login gate's matcher skips `/opengraph-image` so crawlers can fetch it. Results get **Copy summary**: a plain-text summary for a friend or mechanic (`lib/share-summary.ts`): the car, the next step, the four checks, the main warnings and what's still unknown, never the pasted ad or seller details, with a link that reopens the check only when there's a VIN |
| 2026-11-10 | **After the plan: CodeQL, accessibility, consistency.** CodeQL's first scan of the public repo raised 6 warnings: fixed the real ones (an unanchored facebook/craigslist host check, a slightly biased random phrase now from rejection sampling, and image sources now limited to the approved photo host or local `blob:` previews via `isSafeImageSrc`, tested) and dismissed 4 false positives with reasons (0 open). Accessibility audit with axe-core (WCAG 2.2 A/AA) on every public page and the busy result states: fixed in-text links that were told apart by color only (always underlined now), small photo-search links (24 px targets) and sideways-scrolling tables that keyboards couldn't reach; now 0 violations on computer and phone (`security-tests/accessibility.py`). Owner pages' verdict labels now match the public wording and never say "No red flags"; the home page says 50+ measured checks |
| 2026-11-10 | **Release 9: prove it.** `security-tests/` turns the November pen test into a rerunnable kit against a local production build (refuses other hosts unless `--i-own-this-site`): `server_actions.py` (16 checks: owner-only functions logged out, Turnstile bypass, CSRF, oversized/malformed bodies, injection, simultaneous bursts against the check, login and decode limits), `browser_attacks.py` (18 checks: six malicious files through every upload box including the new seller-replies box, injection text in every box, a tampered My list import, attack URLs) and `load.py` (700 requests, 50 at a time). All passed. `SECURITY.md` gains a threat model (assets, attackers, methods, defences) and a chapter-by-chapter OWASP ASVS 5.0 self-assessment with known gaps stated (per-instance minute limits, inline styles allowed in the CSP, no central security logging). `docs/USABILITY-TEST.md`: a five-person test script with tasks, a notes grid and success criteria, for the owner to run |
| 2026-11-10 | **Releases 7–8: photo checks, same-car warnings, phone install.** New "Are the photos really this car?" section (nav: Photos): each listing photo with a public address gets Google Lens and Bing reverse-image-search links (both verified to run a visual search; TinEye left out because it blocks automated checks so it couldn't be verified), and pasted ads get the steps to search their photos in the app. It explains how to read results (a dealer's photos on many sites is normal; a different price, city, date, seller or a dealer watermark on a private ad isn't). In-browser photo fingerprints aren't possible: the photo host only allows `ui.auto.dev` to read its images (CORS), and fetching photos on the server isn't worth the cost and risk. My list warns when two saved ads may be the same car (same VIN, or same model with miles within 2%). Release 8 was already mostly built (installable PWA with an Android share target via `/share` → `#listing=`); its manifest now matches the black design and the new description |
| 2026-11-10 | **Release 6: My list (no account) and "compare it yourself".** "Save to My list" on a result keeps the car on the visitor's device (localStorage, text only, 20 cars max): what was pasted, the next step, the four area statuses, still-unknown count, top warnings and the visitor's notes. The new public page `/mine` ("My list" in the visitor nav) lists them, compares 2–5 side by side, keeps notes, reopens a car with "Check it again" (fills the box via `#listing=`, never runs on its own), removes, and exports/imports a JSON file. Imports are validated field by field (`lib/workspace/local.ts`: bad ids, levels, VINs, numbers and oversized text dropped or capped; 1 MB max); a tampered file with HTML and `javascript:` text renders as plain text and runs nothing (browser-tested). The price section always offers "Compare it yourself (no lookup needed)": type 2–5 similar asking prices and get the median, the difference and an honest confidence (`lib/value/manual.ts`), so pricing still works when the free lookups run out |
| 2026-11-10 | **Release 5: seller verification.** "What did the seller say?" under Before you buy: paste the seller's replies or add chat screenshots (read on the device, nothing sent or saved); `lib/seller-replies.ts` runs the message-relevant rules on them (payment before viewing, shipping/away stories, refused inspection, pressure, title and lien) and finds stories that change from the ad (miles off by more than 10%, a branded title after "clean", an accident after "no accidents"). Each finding quotes the line, suggests a safe reply to copy, and feeds the four-part verdict with its own evidence label ("The seller's messages"; ids `msg-*`). The message to the seller now asks about the model year's known issue by its bulletin (e.g. 16-053) and always keeps the photo check, now with a random three-word phrase instead of the date. Dealer listings get "Is this dealer real?", from the FTC's Sept 2026 alert on cloned dealer websites (find the dealer yourself, call the number you found, see the car or send a mobile inspection, never wire-only). Also fixed: two regexes that lost their `` through shell quoting (one in a test that passed without checking; see Release 4) |
| 2026-11-10 | **Release 4: measured scam warnings.** New labelled set `src/lib/scam/eval/` (`cases.json`: 26 scam ads written from FBI/FTC/NICB patterns and 25 honest ads that use the same words innocently; the corpus cases now carry `scam` and `origin` labels) and a separate `holdout.json` never used for tuning. `npm test` prints precision, recall and false alarms for VinVerdict and a keyword filter, and fails if the published `scorecard.json` (shown on the new public `/accuracy` page) is stale. **Before:** 100% caught, **20% false alarms** (9 of 46 honest ads told to stop) vs 41% for keywords. Context-aware rules fixed all nine: gift cards only as payment (not "the unused car wash gift card" or "scammers asking about gift cards"), wire transfers from dealers at signing allowed, "I can ship it after you've inspected it" allowed, "no test drives without a license" allowed, "stationed at the base, see it any evening" and "my husband is deployed, come by" allowed (only a seller away *now* counts), storage and eBay Motors only in the shipping-company story. **After:** tuning 100% caught, 0% false alarms; **held-out first run 92% caught (11/12), 0% false alarms**; the miss (a refundable viewing fee by Cash App) was fixed, moved to the tuning set and replaced. Also found and fixed: the bulletin-citation test from Release 1 had a broken regex (written through a shell heredoc) and passed without checking; it now provably fails on a wrong bulletin |
| 2026-11-10 | **Release 3: four-part verdict** (outside review: no single score, say what's unknown). The 0–100 dial (25 points per warning, never measured) is gone. `lib/decision.ts` turns the rule engine's findings into one next step (**Stop: serious warning**, **Verify before going further**, **Worth investigating**, **Not enough information**; never "safe") and four rows: Listing trust, Car condition, Price, Ready to pay, each with a status (Warning / Check / OK so far / Not checked), one line of evidence and a folded "Still unknown" list (accident history, title brands, model-year recalls vs this car, inspection, seller questions, the estimate's basis). Every finding now shows where its evidence comes from (In the ad, Official record, Listing data, Estimate, Your history report, Proof you attached, Not checked). Public severity no longer follows the owner's personal filters: a manual gearbox is "good to know", a repaired accident or a missing VIN is "check this", severe damage and scam patterns stop; finding texts that said "VinVerdict only shows…" now give advice instead. The rule engine, its owner-side verdicts and the corpus are unchanged. The home deck uses the same decision |
| 2026-11-10 | **Release 2: public repo.** History rewritten (git filter-repo) to drop local tool files and their mentions, verified clean (no traces, no secrets: only the empty `.env.example`), pushed to the new public repo `amoghnellutla/VinVerdict`; the old private repo is kept as `vinverdict-archive`; Vercel reconnected to the new repo. Added free CI on every push (lint, `next typegen` + type-check, tests and scorecard, production build with placeholder public settings, `npm audit --omit=dev`), CodeQL (JS/TS and Python, security-extended), Dependabot, issue forms ("It got a listing wrong", "Suggest an improvement"), `SECURITY.md` with private reporting, a full README for buyers and developers with screenshots, and a footer link to send feedback. Fixed the price bar caption ("tall line", not "black line", on the dark design) |
| 2026-11-10 | **Release 1 of the review plan: fix what's wrong** (outside review, checked against the code). Known-issue citation for the 2015–16 Accord/CR-V CVT fixed: Honda bulletin 16-053 (the main campaign), not 16-057 (a 2015 CR-V follow-up); all five known-issue documents re-read and pinned by a test (`inspection.test.ts`). Shortlist: "Reported owner-problem trends (not a reliability rating)", recalls free at the brand's authorized dealers (not "any dealer"), "Don't drive" and "Park outside" shown separately (data rebuilt). Recalls panel: "N on record for the year; not every car is affected". Prices: MarketCheck "sold" comps are listings that ended, shown with their last advertised price, never as sale prices. Why page: no "no way to check" for search engines; "past listings MarketCheck recorded", not "every past listing" |
| 2026-11-10 | **Security review ("act like a malicious user")**. Tested locally and live: owner-only actions refuse logged-out calls; price check refuses missing/fake Turnstile tokens; foreign-origin (CSRF), 3 MB and malformed requests rejected; script code pasted into the listing box, proof box and URLs stays text (no popups, no injected elements); `?next=` can't redirect off-site; login, check and decode limits hold under 20–40 simultaneous requests; 20,000-character hostile inputs parse in ≤125 ms (no ReDoS); 700 page requests 50 at a time with no errors. Malicious images (SVG with script, polyglot PNG with HTML after the image, JPEG with script in its comment, a program renamed .png, a screenshot whose text is script code) ran nothing. Fixes: SVGs are no longer accepted as screenshots, and images over 50 MP are refused from their header before decoding (a 48 KB "decompression bomb" claimed 400 MP, enough to crash a phone tab); rate limits key on Vercel's own IP headers first. `npm audit --omit=dev`: 0 (8 moderate in the eslint toolchain only) |
| 2026-11-10 | **Little car cursor + phone tracks over the text** (picked cursor option 1). On a computer a small top-down car follows the mouse, turns to face where it's going, lays the tire tracks from its rear wheels and flashes brake lights when it stops; the system cursor hides except over links, buttons, tabs and text fields, where the normal pointer or text cursor returns (and the car hides) so clicking stays exact. On phones the finger tracks are drawn over the page (slightly fainter) and never block taps. Reduced motion keeps the normal cursor and still asphalt |
| 2026-11-10 | **Tire-tracks background** (picked option E from six live templates). Black asphalt grain (one 160 px tile made in the browser) and fading tread marks wherever the mouse goes, or a finger touches and scrolls on a phone; marks live in page coordinates so they scroll with the page; the canvas draws only while marks fade; reduced motion gets the still asphalt. Replaces the dot grid and headlight. Cursor options shown separately for him to pick |
| 2026-11-10 | **Lookup speed and feedback** ("looking it up is taking forever"). The price search now starts alongside the live lookup and history when the car is known (VIN decode or listing) instead of after them; the owner's price model runs separately only when miles were found during the lookup. The whole lookup answers within 25 s (clear message otherwise; page `maxDuration` 30). On screen: a progress panel (what's being checked, seconds elapsed, usual wait, a "still waiting" note after 15 s), prompts when Cloudflare needs a click, failed or expired (with "Try the check again"), "Try again" after errors, and dropped connections or server cut-offs shown as messages instead of breaking the page. The first check shows its own elapsed-time status. Turnstile renders dark |
| 2026-11-10 | **Critique fixes + night look** (design critique, 30/40; paste box first; then solid black, cursor with a shadow, hover highlight, a special background). Home: paste box right under the headline (now in the first screen on desktop and phone), playground below as "No listing handy? Try one of these", every design ends with "Now check your own listing" (focuses the box). Result: costs and the before-you-buy panels are now two tabbed sections (panels stay mounted, all print); section bar says "Check it yourself"; result 15→13 screens desktop, 23→20 phone. Scam game phrases flow inline (line breaks no longer give the answers away). Look: dark only on solid black, a faint stamped-dot grid with a road-sign-blue "headlight" following the mouse (`components/BackgroundFx.tsx`, one write per frame on its own layer; still on touch and reduced motion), an SVG arrow cursor with a soft glow, and glow on hover for headings, links, buttons and cards (not body text, for readability). Print switches back to paper colors |
| 2026-11-10 | **Playful home page + photos for pasted listings** (fun, moving, interactive, show different designs; pull photos from any pasted listing). Home has three switchable designs (`src/components/play/`, choice remembered on the device): **Decode a VIN** (type or paste any VIN; the plate fills in, checks its digit and NHTSA decodes it via `decodeVinAction`, free, rate-limited; click a part to flip it), **Spot the scam** (a labelled practice ad whose flagged phrases are caught by the real rules, `scam-ad.test.ts`; finds show the rule and source, then a Walk away stamp), **Flip through a car** (the real Lexus photos as a draggable, throwable deck, one real finding per photo from `lib/demo/play.ts`, ending on the verdict). Photos: VinVerdict still never opens pasted links (SSRF, Facebook login); a VIN finds the listing's photos, and for an ad without a VIN `findSameCar` looks for one close match among the dealer cars for sale nearby (already fetched, no extra calls) and offers its photos and VIN to confirm. Nearby cars show thumbnails |
| 2026-11-10 | **Redesign** (modern, distinctive, built from the car world). Identity from the car world: Overpass (open Highway Gothic) for all text and Overpass Mono for VINs; cool "title paper" background, asphalt ink, road-sign blue accent, red/amber/green only for verdicts. Signature: the decoded VIN plate (`VinDecode`) in the home hero (types in once) and result header; risk as a dashboard dial. Removed AI tells: cream+serif, all-caps eyebrows, "→" links, 01/02/03, scroll-in on every section, auto-rotating photos, floating card. Pre-ship checklist fixes: skip link, theme-color, color-scheme, scroll padding under the sticky bar, press feedback, explicit image size. Local skill folders excluded from lint and Tailwind |
| 2026-11-10 | **Proof in "Check it yourself"** (attach screenshots per check, paste Carfax/AutoCheck, auto-sort and rate; also for the owner). Every check row takes a screenshot or pasted text, and one box takes anything and sorts it by what it shows (Carfax, AutoCheck, NICB, NHTSA/maker recall pages, NMVTIS, salvage auctions). Read on the device (tesseract.js), never uploaded; only clear phrases count (`src/lib/evidence/`). Findings fill the history-report answers (worse report wins; disagreements shown), add warnings (stolen, total loss, salvage auction, open recalls, odometer, miles lower than the report), and rate each check (Proof checked: n of 6). Proof for another VIN is shown but not counted. Owner: findings (labels only) are saved with the car and shown on its page. **Look and flow:** wider hero with a floating sample check built from the real Camry example, numbered points, featured Lexus card with its photo; once a result shows, the intro and examples step aside and the box becomes "Check another car"; results open with the listing's photos (Auto.dev photo host only, added to CSP img-src) or your own screenshots, a verdict with a risk gauge, a sticky section bar, and sections that rise in as you scroll (all motion off with reduced-motion) |
| 2026-11-10 | **Accuracy rule** (the Lexus example said "No red flags" while its free Carfax showed minor damage; "false info is worse than less info"). Listing feeds only add bad news: their "0 accidents", owner count, "personal use" and clean-title flags never clear a car (Auto.dev said 0 accidents/1 owner; Carfax showed minor damage/3 owners). "No red flags found" now needs the accident history confirmed (history report, or a dealer listing's history box); otherwise "No red flags so far" + why. New "What does the history report say?" panel (damage none/minor/moderate/severe, title, commercial use) with the dealer's free Carfax link; VinVerdict can't open Carfax/AutoCheck itself (no free API, terms forbid automated access). Damage is priced as the CarGurus 3–12% range (2012 study, no split by severity) instead of a flat −15%; severe damage isn't priced (needs an appraisal). **VIN only:** looked up online automatically (owner: at once; visitors: once Turnstile passes), clear "no online listing found" message with what was searched, "Confirm the details" (trim, miles) that re-price instantly from the returned comps (no new calls), and "It's mine: what's it worth?" (private-sale range, list price, dealer retail, competition, instant-offer links, before-you-list steps). ZIP optional with a VIN (priced where it's listed). Guest lookups 2/visitor/day, 6/day total (monthly caps unchanged). **Bug fixed:** "meet at a police station" marked cars as former police/fleet. Example cards now say which are real cars and which are illustrative ads |
| 2026-11-09 | "Better than Google or AI" pass (more useful demo, show sources so anyone can cross-check). Every warning names its official source (FBI IC3, FTC, NICB, NMVTIS, NHTSA, FHWA, 49 CFR 565; `src/lib/sources.ts`). Recalls open to what's wrong / the risk / the free fix with the NHTSA record. Owner complaints show the latest reports in the owners' words with NHTSA numbers, how many came from cars built like this one (VIN prefix) and the years either side. New "Check it yourself" panel (NHTSA + maker recall lookups, NICB VINCheck, Google the VIN for auction photos, NMVTIS, raw decode), numbered "Sources for this report", ready-to-send seller message, "Print or save as PDF", and a public `/why` page comparing VinVerdict with a search engine and a chatbot. **Bug fixed:** running cost could use the wrong engine (2021 Camry LE got the 3.5 L V6, 26 mpg, instead of the 2.5 L, 32 mpg); Lexus hybrids no longer match gas models. All free data: no paid API calls; demo analyses refreshed with `RECORD_DEMO=analysis` (NHTSA only) |
| 2026-11-11 | Public no-login demo (approved plan): `/`, `/shortlist`, `/security`, `/share` open to visitors; owner pages keep two-step login. Visitors: free checker (no saving), 5 recorded example cars (real data, 0 calls; recorder `src/lib/demo/record.test.ts`, ~11 MarketCheck + 7 Auto.dev once), live price check behind Cloudflare Turnstile + Supabase limits (1/visitor/day, 3/day total, 95/month, stop at 300 MarketCheck/month for the owner's reserve), lean guest check (no MarketCheck price model or backup lookup). Visitor = salted HMAC of IP, deleted after 2 days. No service-role key. New "How it's secured" page, data credits + privacy in footer |
| 2026-11-10 | Security hardening for going online ("deploy … nobody should be able to breach it"): mandatory two-step login (TOTP via Supabase MFA, `/mfa`), enforced in the proxy, in every Server Action and in the database (restrictive RLS `aal2` policies); strict nonce CSP without `'unsafe-inline'` scripts (root renders per request); separate strict CSP for the OCR worker; links into the app no longer auto-run checks; persistent monthly quota stop in Supabase; atomic usage counter; price_history tied to own cars; anon grants revoked; COOP/CORP/noindex headers + robots.txt; rate-limiter memory cap. Service-role key stays off Vercel. Production deps: 0 known vulnerabilities |
| 2026-11-09 | Improvement pass 2: unknown miles (bare VIN) filled from the listing history (last 6 months) for the price check; history summary + red flags saved with each car and shown in My cars and Compare ("On sale for", "Listing history"); paste a screenshot (Win+Shift+S) or drop image files to read them; "fresh photos of odometer + VIN sticker" step against stolen-photo scams. **Bug fixed:** Lexus VINs decode as "ES" + trim "350", but NHTSA's recall, crash-rating and complaint APIs need "ES350", so Lexus cars showed no recalls or crash stars; same naming fixed in the Shortlist data (ES 76 → 258 complaints). Shortlist now shows recall counts and "park it" recalls per year |
| 2026-11-09 | Improvement pass ("think and implement"): 1) VIN listing history (MarketCheck History, works on Free, 1 call, cached a day) inside "Check price & history": timeline of past sellers/prices/miles, new rules (rollback, miles under an earlier reading, private car recently at a dealer, frequent resales), price cut and days on sale feed the offer. 2) Phone input: "Read screenshots" (tesseract.js OCR in the browser, self-hosted under /ocr, CSP adds `'wasm-unsafe-eval'` + `worker-src 'self'`; images never uploaded); phone-specific instructions; bookmark hidden on phones. 3) "Before you pay" → buying-day steps by seller type with NJ MVC private-sale paperwork. 4) Usage meter now counts calls when a check stops early. Price check: up to 3 MarketCheck + 2 Auto.dev calls |
| 2026-11-09 | Accuracy pass: 6 more corpus cases (Carvana, Enterprise, Facebook dealer, Craigslist dealer, short text, Prius) and parser fixes (two-digit years, bare "4500 cash" prices, "165k" miles, Enterprise/CarMax-type dealers, "selling because"); "same phone on other cars" rule (PLAN §6) using saved cars; days-to-sell from sold comps feeds the offer; price action seller/usage fallback fix. Backtests: Camry sold 6.6%, Accord asking 4.6% median error |
| 2026-11-09 | Built overnight (approved: "complete all phases"): price check (Phase 4) with local comps fit, MarketCheck Price, sold + for-sale comps, accident/seller adjustments, deal label, offer, confidence; top-3 summary; true cost per year; My cars/compare/price drops in Supabase with RLS (`supabase/migrations/`, run once); usage meter; Android share target + installable app; Shortlist from NHTSA complaints; in-app Search ranked by value with "unusually cheap" flag; Settings. Live-tested with 4 calls (price check) + 1 (search) |
| 2026-11-09 | Approved next steps: A) market value from 3 sources (MarketCheck Price sold-price model, local comps worked out at this car's miles, recently sold listings) + accident/seller adjustments → fair range, deal label, suggested offer; B) top-3 summary + true cost per year; C) saved cars/compare/price drops; D) deploy + phone share. Tested on Free (2 calls): MarketCheck Price and `recents?sold=true` both work. Design refresh: Source Serif 4 / Source Sans 3, warm paper palette with one green accent, plain sections instead of stacked cards, 17px text, plain-language copy, no build-phase notes on screen. Paste & check (clipboard) is the main input; bookmark optional |
| 2026-11-09 | Analyzer accuracy pass (approved): real-case suite (`src/lib/listing/corpus/`, 20 cases, per-field scorecard). Fixed labelled VIN ("VIN: …") being read as a listing with no price; mileage from distance/service history; safety features ("Pre-Collision") read as accidents; dealer history boxes; "no dealers" read as a dealer; dealer shipping/deposits flagged as scams; "1-owner: No". New rules: high miles/year, fleet/rental, far away. Added the "Check with VinVerdict" bookmark (2a) and VIN → live listing lookup (2b: Auto.dev then MarketCheck, button only, cached, 3/min + 40/day caps) with cloned-listing, price and mileage cross-checks |
| 2026-11-09 | Phase 2b login built (approved): Supabase email/password via Server Actions, `src/proxy.ts` gate on every page, `getClaims()` check inside every Server Action, httpOnly cookies, safe `next` redirect, login rate limit, no sign-up page. Browser never talks to Supabase (CSP unchanged). Env name now `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase's current name). Tables deferred to the phases that use them |
| 2026-11-09 | Phase 1 API test, 3 calls (approved): MarketCheck dealer + private-party both work on Free (50/call); Auto.dev Free dealer-only, 20/call, partial accident/owner history. Probe fixed to `api.marketcheck.com` + `car_type=used`. Auto.dev replies carry account details, so adapters copy listing fields only |
| 2026-11-09 | Features F and O built (approved): inspection checklist with 5 sourced known issues + complaint-area checks; buyer-protection panel. §3 table updated: CarMax warranty cut to 30 days (2026-01-12), Hertz 3-yr/100k powertrain, Enterprise/Carvana details, dealer rules (FTC Buyers Guide, NJ N.J.S.A. 56:8-69) |
| 2026-11-09 | Feature C built: yearly running cost from FuelEconomy.gov (free, keyless, cached) + AAA 2025 maintenance rate. VIN decode now keeps engine size, cylinders and electrification |
| 2026-11-08 | Feature A extended to any US ZIP (approved): ZIP → state, car-tax rules for 50 states + DC, local-rate box, seller type (dealer/private), editable fees + DMV link outside NJ. No API or quota; ZIP remembered on the device only |
| 2026-11-08 | Feature A built: NJ out-the-door cost with verified official rates, editable price/doc fee/inspection/weight/loan; dealer doc fee parsed from listings; curb weight from VIN decode |
| 2026-11-08 | Analyzer wired to the home page: Server Action (input validation, rate limit), verdict, car facts, recalls/crash stars/complaints, seller checklist that updates the verdict live, "before you pay" links. Links are never fetched by the server (SSRF). Login (2b) and out-the-door cost still to do |
| 2026-11-08 | Phase 3 logic started early while accounts are pending (approved): VIN check digit, NHTSA client with caching, listing-text parser, scam-rule engine, 48 unit tests. Feature E: per-VIN open-recall status via NHTSA link |
| 2026-11-08 | Named the project VinVerdict. Phase 2 split: 2a skeleton (no login) built alongside Phase 0; 2b login after accounts exist. GitHub repo private until Phase 9 |
| 2026-11-08 | Plan C v2: analyzer-first build order; positioning vs. AutoTempest/CarGurus; trusted-source table with buyer protection; deal labels; new scam rules (curbstoning, title washing, liens, inspection refusal); features O and P; Shortlist and Check-a-listing pages |
| 2026-11-08 | Plan created |

## Sources

- [MarketCheck API pricing](https://www.marketcheck.com/apis/pricing) — free plan limits
- [Auto.dev Vehicle Listings](https://auto.dev/listings) — free plan limits
- [CarWhere: Carvana vs CarMax 2026](https://www.carwhere.com/guides/carvana-vs-carmax) — return policies
- [ConsumerAffairs: Enterprise Car Sales](https://www.consumeraffairs.com/automotive/enterprise-car-sales.html) — buyback, availability
- [CarGurus: how it works](https://www.cargurus.com/about/how-cargurus-works) — deal ratings
- [AutoTempest: how it works](https://autotempest.com/how-autotempest-works)
- [KEYT: used-car scams](https://keyt.com/stacker-crime-safety/2026/07/31/why-used-car-scams-are-harder-to-spot-today/) — curbstoning, title checks
- [Flipify: Facebook Marketplace cars](https://www.flipifyapp.com/facebook-marketplace-cars) — scam red flags
- [Spottable](https://spottable-lp.pages.dev/marketplace-for/used-cars) — existing Facebook listing analyzer
- [ConsumerAffairs: pre-purchase inspection](https://www.consumeraffairs.com/automotive/what-is-a-pre-purchase-inspection.html) — cost
- [NHTSA vPIC API](https://vpic.nhtsa.dot.gov/api/), [NHTSA recalls](https://www.nhtsa.gov/recalls), [FuelEconomy.gov](https://www.fueleconomy.gov), [NICB VINCheck](https://www.nicb.org/vincheck)
