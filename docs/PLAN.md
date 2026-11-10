# VinVerdict — Project Plan

*VinVerdict* is the project name for the Used Car Deal Finder.

Nov 8, 2026 · @Amogh

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
| Login | Email + password. Just Amogh at first. |
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
| Salvage, rebuilt, flood or lemon title | Hide |
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
- [ ] **Phase 9 — Final review:** security and code review, deploy, you test. *Security review + hardening done 2026-11-10 (see change log); deploy needs Amogh's Vercel login and the SQL files run.*
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
| Listing parser | 26 real-format cases (AutoTrader, Cars.com, CarGurus, CarMax, Carvana, Enterprise, Facebook private + dealer, Craigslist owner + dealer, dealer sites, short texts): 100% of checked fields | Add every real listing Amogh checks to `src/lib/listing/corpus/` (one paste + expected answers). Real pages beat reconstructions; 50+ cases would show weak spots by site |
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

- Plan first; no major change without Amogh's approval.
- After every step, a short high-level summary of what changed.
- Smallest possible change each time.
- Read code before making claims about it.
- Keep `docs/ARCHITECTURE.md` current.
- Verify work for correctness, efficiency and security at each phase.
- This doc is the source of truth: update it when decisions change.

**Change log**

| Date | Change |
| --- | --- |
| 2026-11-10 | **Lookup speed and feedback** ("looking it up is taking forever"). The price search now starts alongside the live lookup and history when the car is known (VIN decode or listing) instead of after them; the owner's price model runs separately only when miles were found during the lookup. The whole lookup answers within 25 s (clear message otherwise; page `maxDuration` 30). On screen: a progress panel (what's being checked, seconds elapsed, usual wait, a "still waiting" note after 15 s), prompts when Cloudflare needs a click, failed or expired (with "Try the check again"), "Try again" after errors, and dropped connections or server cut-offs shown as messages instead of breaking the page. The first check shows its own elapsed-time status. Turnstile renders dark |
| 2026-11-10 | **Playful home page + photos for pasted listings** (fun, moving, interactive, show different designs; pull photos from any pasted listing). Home has three switchable designs (`src/components/play/`, choice remembered on the device): **Decode a VIN** (type or paste any VIN; the plate fills in, checks its digit and NHTSA decodes it via `decodeVinAction`, free, rate-limited; click a part to flip it), **Spot the scam** (a labelled practice ad whose flagged phrases are caught by the real rules, `scam-ad.test.ts`; finds show the rule and source, then a Walk away stamp), **Flip through a car** (the real Lexus photos as a draggable, throwable deck, one real finding per photo from `lib/demo/play.ts`, ending on the verdict). Photos: VinVerdict still never opens pasted links (SSRF, Facebook login); a VIN finds the listing's photos, and for an ad without a VIN `findSameCar` looks for one close match among the dealer cars for sale nearby (already fetched, no extra calls) and offers its photos and VIN to confirm. Nearby cars show thumbnails |
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
