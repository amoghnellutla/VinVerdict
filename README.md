<div align="center">

# VinVerdict

**Free used car checker: scam warnings, a fair price and the public record, before you pay.**

Paste a used-car listing from Facebook Marketplace, Craigslist, Autotrader, Cars.com or a dealer's site, a few screenshots, or just the VIN.<br>
VinVerdict tells you whether the ad shows scam warning signs, what the car is worth near you, what federal records say about it, and exactly what to check next.<br>
Every fact links to the record it came from.

### [Check a car free at vinverdict.vercel.app](https://vinverdict.vercel.app)

No sign-up. Nothing you paste is saved. US listings.

[![CI](https://github.com/amoghnellutla/VinVerdict/actions/workflows/ci.yml/badge.svg)](https://github.com/amoghnellutla/VinVerdict/actions/workflows/ci.yml)
[![CodeQL](https://github.com/amoghnellutla/VinVerdict/actions/workflows/codeql.yml/badge.svg)](https://github.com/amoghnellutla/VinVerdict/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

![A real 2021 Toyota Camry checked by VinVerdict: the VIN decoded part by part, and the verdict "Verify before going further" with the reported accident, two dealers listing it at once, and the price within the estimated range](docs/images/verdict-real.png)

<sub>A real car (the "2021 Toyota Camry" example on the home page): VIN decoded by NHTSA, an accident reported, two dealers listing it at once, price inside the estimated range.</sub>

---

## Contents

- [What it checks](#what-it-checks)
- [How to use it](#how-to-use-it)
- [What you get](#what-you-get)
- [What it won't do](#what-it-wont-do)
- [Accuracy: measured, not claimed](#accuracy-measured-not-claimed)
- [Free, private and secure](#free-private-and-secure)
- [How it works](#how-it-works)
- [Run it yourself](#run-it-yourself)
- [Help improve it](#help-improve-it)

## What it checks

Each row is what you see on a result, where the data comes from, and the code or test that backs it.

| Question | What VinVerdict shows | Source | Proof |
| --- | --- | --- | --- |
| **Is this ad a scam?** | Warnings for deposits before viewing, gift cards and wire transfers, "the car is with a shipping company", a seller who's away, title washing, curbstoning, prices too good to be true. More than 50 checks, and context-aware: "send $200 by Zelle to hold it" is a warning, "I don't take Zelle, cash in person" isn't. | FBI, FTC and NICB scam guidance ([each sign with its source](https://vinverdict.vercel.app/scam-signs)) | [`scam/rules.ts`](src/lib/scam/rules.ts), [`rules.test.ts`](src/lib/scam/rules.test.ts), [scorecard](#accuracy-measured-not-claimed) |
| **Is the VIN real, and is it this car?** | The check digit, then the decoded year, make, model and engine compared with the ad. A typo like the letter O for zero is caught and corrected. | NHTSA vPIC decoder | [`vin.ts`](src/lib/vin.ts), [`vin.test.ts`](src/lib/vin.test.ts) |
| **What is it worth?** | A fair-price range for your ZIP, adjusted for miles, seller type and reported damage, with an opening offer and a walk-away price. Always labelled an estimate. | Advertised prices of similar cars, listed now or recently ended (MarketCheck) | [`value/`](src/lib/value/) |
| **Where has this car been before?** | Every listing of this VIN since 2015: each dealer, its dates, prices and miles. Flags odometer drops, price cuts, quick resales and two sellers at once. | MarketCheck, Auto.dev | [`history/`](src/lib/history/), [`history-report.ts`](src/lib/history-report.ts) |
| **Recalls and safety** | Recalls for the model year ("don't drive" and "park outside" warnings marked), crash-test stars and owner complaints, plus a link to check this VIN's open recalls. | NHTSA | [`nhtsa/`](src/lib/nhtsa/) |
| **Known problems for that year** | A short, hand-checked list of model-year problems for popular Honda and Toyota years, each citing the maker's own service bulletin. | Honda and Toyota bulletins on nhtsa.gov | [`inspection.ts`](src/lib/inspection.ts); a test fails if a bulletin number or year range changes |
| **What will it really cost?** | Out-the-door price with your state's sales tax and fees, and fuel and upkeep per year. | State tax tables, EPA FuelEconomy.gov | [`costs/`](src/lib/costs/), [`fuel/`](src/lib/fuel/) |
| **Is the seller's story changing?** | Paste their replies or chat screenshots: deposit requests, shipping stories, refused inspections and changed miles, title or accident claims are caught, with a safe reply to copy. | The seller's own words, read on your device | [`seller-replies.ts`](src/lib/seller-replies.ts), [`seller-replies.test.ts`](src/lib/seller-replies.test.ts) |
| **Are the photos really this car?** | One-tap reverse image search of the listing's photos, to find them in an older or faraway ad. | Google Lens, Bing | [`PhotoCheck.tsx`](src/components/analyzer/PhotoCheck.tsx) |
| **Stolen or a total loss?** | A direct link to the free NICB VINCheck. Paste or screenshot its result and it counts as proof. | NICB | [`evidence/`](src/lib/evidence/) |

## How to use it

![The VinVerdict home page: paste a listing, read screenshots or scan a VIN](docs/images/home.png)

**On a computer**
1. Open the listing and press **Ctrl+A**, then **Ctrl+C** (Mac: **Cmd+A**, **Cmd+C**).
2. On [vinverdict.vercel.app](https://vinverdict.vercel.app), press **Paste & check**.

**On a phone:** screenshot the listing (title and price, details, description), then tap **Read screenshots**. The text is read on your phone with [tesseract.js](https://github.com/naptha/tesseract.js); the images are never uploaded.

**Only have a VIN?** Paste the 17 characters, or tap **Scan a VIN** and point the camera at the door-sticker barcode.

**No listing yet?** Open one of the five examples on the home page: two real cars and three typical ads, checked with recorded NHTSA and price data.

## What you get

### One clear answer, never "safe"

Every check ends in one of four answers, from fixed rules (not an AI), so the same listing always gets the same answer:

| Answer | When |
| --- | --- |
| **Stop: serious warning** | A known scam pattern, or a serious problem with the car (a branded title, an odometer rollback, a VIN that doesn't match) |
| **Verify before going further** | Something to check with the seller or in person: a reported accident, a problem the seller admits, a title not in the seller's name, a price far below similar cars |
| **Worth investigating** | Nothing wrong found in what was checked, with a list of what's still unknown |
| **Not enough information** | No VIN and no price to go on |

Behind the answer are four checks (**Listing trust, Car condition, Price, Ready to pay**), each with what's still unknown. Every finding says where its evidence came from: *in the ad*, *official record*, *listing data*, *estimate*, *the seller's messages* or *proof you attached*. The rules are in [`decision.ts`](src/lib/decision.ts) and tested in [`decision.test.ts`](src/lib/decision.test.ts).

![A scam ad: "Stop: serious warning" for a gift-card payment, with the price far below the estimate](docs/images/verdict-scam.png)

### What's known, and what's still missing

A checklist under the verdict shows how much is known about the car, with a button for each missing piece: the history report, the free NICB check, the seller's answers, your mechanic's inspection.

![What VinVerdict knows: 5 of 11 known, with links to fill in the rest](docs/images/knows.png)

### A fair price and what to offer

![Fair price $8,700 to $12,000 for the Camry, with an opening offer of $9,300 and the reasons to give the seller](docs/images/price.png)

### Where the car has been listed

The same VIN's past listings show who sold it, when, at what price and with how many miles.

![Listing history of the Camry: two dealers listing it now after a price cut, and three earlier listings since 2021](docs/images/listing-history.png)

### Tell it what you learn, and the whole result updates

One box under the verdict takes whatever you find out next. It works out what you gave it and updates every section at once, with Undo:

- **The seller's messages** ("he'd take 9,400 cash", "send a deposit to hold it"). A new price updates the offer and out-the-door cost; a deposit request turns the verdict to Stop.
- **A Carfax, AutoCheck or NICB result**, pasted or as screenshots. It's filed as proof. Bad news always counts; a clean result needs your confirmation.
- **Questions** like "is the price fair?", "what should I offer?" or "was it ever stolen?" are answered from the page itself, with no AI.
- **Open questions only** go to a free AI (GLM, Gemini or Groq). Its answer may use only the report: any number or link that isn't in the report is thrown away ([`ai/guard.ts`](src/lib/ai/guard.ts)).
- **Selling your own car?** Switch to "It's mine": what it's worth, a draft ad from the page's facts (anything unknown is left as a blank), and checks on buyers' messages for the scams that target sellers (overpayment, a "shipper" pickup, "text me the code").

![The assistant: "He said he'd take 9,400 cash" updates the asking price and the out-the-door cost](docs/images/assistant.png)

Routing is tested against 170+ labelled messages and every real listing page in the test set ([`assistant/eval.test.ts`](src/lib/assistant/eval.test.ts)).

### At the car

On a phone, the **At the car** tab checks that the windshield plate, the door sticker and the title all show the same VIN as the ad. A mismatch, the classic sign of a cloned car or a swapped title, is a serious warning.

<p>
  <img src="docs/images/phone.png" alt="VinVerdict home page on a phone" width="260">
  &nbsp;
  <img src="docs/images/phone-verdict.png" alt="A Stop verdict on a phone" width="260">
</p>

### Take it with you

- **Report for you or your own AI:** download everything on the page as one Markdown file, or print it as a PDF. The ad's text is quoted as untrusted, so a scam ad can't hide instructions for an AI ([`report/`](src/lib/report/)).
- **A message for the seller** with the questions that matter for this car, an **inspection list** for your mechanic and **buying-day steps**.
- **My list:** save cars on your device (no account) and compare them side by side.

## What it won't do

These limits are deliberate. A tool that sounds sure when it isn't does more harm than one that says "not checked".

- **It never says a car is safe.** The best answer is "worth investigating", with what's still unknown.
- **It never clears a car's history from listing data.** Listing feeds often miss accidents that Carfax or AutoCheck show, so a feed's "0 accidents" never counts as a clean history ([`history-report.ts`](src/lib/history-report.ts)). Only a report you attach can.
- **Prices are estimates from advertised prices,** never presented as what buyers paid.
- **Recalls are for the model year.** Whether this car was repaired is only in NHTSA's and the maker's VIN lookups, which are linked.
- **It doesn't replace a mechanic** or seeing the title in person.
- **It doesn't scrape Facebook or Craigslist** and never opens a link you paste. You choose what to share.

## Accuracy: measured, not claimed

Full write-up, including what isn't tested yet: [How accurate is it?](https://vinverdict.vercel.app/accuracy)

![The accuracy page: held-out ads, tuning ads and a keyword filter compared](docs/images/accuracy.png)

**Scam warnings.** Every ad is labelled by hand as a scam or an honest ad that uses the same words innocently ("no deposits", "I don't take Zelle", "I'm stationed at the base, come see it"). A warning counts when VinVerdict says **Stop** because of the listing or the payment. Numbers from [`scorecard.json`](src/lib/scam/eval/scorecard.json), regenerated by the tests on every push:

| Checked by | Scams caught | False alarms on honest ads | Warnings that were right |
| --- | --- | --- | --- |
| VinVerdict, **held-out ads** (never used to tune the rules) | 12 of 12 | 0 of 13 | 100% |
| VinVerdict, tuning ads | 38 of 38 | 0 of 58 | 100% |
| A keyword filter (payment app, shipping, deposit, away) | 33 of 38 | **28 of 58** | 54% |
| VinVerdict, **seller replies** | 12 of 12 | 0 of 13 | 100% |
| The keyword filter, same replies | 10 of 12 | **7 of 13** | 59% |

- **The point of the comparison:** a keyword filter catches most scams but warns on half of the honest ads. VinVerdict's rules read the context ("I *don't* take Zelle"), which is where the false alarms go.
- **The caveat:** most ads so far are written from published scam patterns. The real listings collected so far are all honest, and none got a false alarm. Real-world numbers will be lower, and they're reported separately as real listings are added.
- **A trained model** (naive Bayes) is scored next to the rules on every change ([`learned.ts`](src/lib/scam/eval/learned.ts)). It changes no answer, and on the tuning ads it misses 12 scams the rules catch.

**Listing parser.** 33 real listing pages (Facebook, Craigslist, Autotrader, Cars.com, CarGurus, CarMax, Carvana, dealer sites) are tested field by field in [`listing/corpus/`](src/lib/listing/corpus/). Every listing it once got wrong became a case. From the `npm test` output (main fields):

```
Listing corpus scorecard (33 cases)
  price        33/33    miles        30/30    year         29/29
  make         28/28    model        28/28    vin          15/15
  accident     24/24    titleStatus  20/20    sellerType   24/24
  transmission 18/18    ownerCount   17/17    verdict      27/27
  rules fired  38/38    false alarms avoided  165/165
```

**The dataset.** Every labelled ad, listing page and seller reply (149 rows) is in [`dataset/vinverdict-labelled.jsonl`](dataset/), with a [description](dataset/README.md) of how it was labelled and its limits. A test fails if the file and the published numbers drift apart.

## Free, private and secure

**It never costs anyone money.** Every outside service runs on its free tier, and the code fails closed:
- a paid data lookup is refused unless the meter confirms it's inside the free quota ([`usage.ts`](src/lib/usage.ts));
- the AI calls only models on a free list, and a test fails if a provider is set to anything else ([`ai/providers.ts`](src/lib/ai/providers.ts));
- visitors get a daily allowance enforced in the database ([migration](supabase/migrations/20261111_guest_demo.sql)), behind Cloudflare's "I'm human" check.

**Private by default.**
- Visitors' checks aren't stored.
- Screenshots, chat messages and My list stay on the device.
- Visitor IPs are kept only as a salted one-way hash, for rate limits.

**Secured and tested like a production app:**
- a strict nonce-based Content-Security-Policy ([`csp.ts`](src/lib/csp.ts), [`csp.test.ts`](src/lib/csp.test.ts));
- API keys only on the server;
- input validation on every server action;
- two-step login and row-level security on every table.

The attacks it's tested against are a rerunnable kit in [`security-tests/`](security-tests/): script injection through listings and proof, malicious image files, CSRF, login brute force, request bursts against the limits, and inputs built to freeze the parser. CodeQL, Dependabot and secret scanning run on the repo. The threat model and an OWASP ASVS 5.0 self-assessment, known gaps included, are in [SECURITY.md](SECURITY.md); there's also a [plain-English tour](https://vinverdict.vercel.app/security).

## How it works

```mermaid
flowchart LR
  A[Listing text, screenshots or VIN] --> B[Parse<br/>price, miles, VIN, seller, claims]
  S[Screenshots] -->|read on the device<br/>tesseract.js| A
  B --> C[Rules<br/>50+ checks, each with a source]
  B --> D[NHTSA<br/>decode, recalls, complaints, crash tests]
  B --> E[Listing APIs, on request<br/>similar cars, VIN history]
  R[Seller's replies<br/>checked on the device] --> F
  P[Proof you attach<br/>Carfax, AutoCheck, NICB] --> F
  C & D & E --> F[Decision<br/>severity, evidence, 4 checks, next step]
  F --> G[Result<br/>verdict, still unknown, what to do]
```

**Why rules and not a chatbot?** A language model asked "is this a scam?" gives a different answer each time, can't show its evidence and can't be measured. Every VinVerdict warning is a deterministic rule with a named source, so the same listing always gets the same answer, it's scored against labelled ads, and it costs nothing per check. AI is used only where it helps: open questions and reading a pasted history report, and its output is checked against the page.

**Evidence has a type.** "No title problem in the records checked" is never shown as "title verified clean". Listing feeds can only add bad news; they never remove a warning.

**Stack:** Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS 4) on Vercel, Supabase (Postgres with row-level security, Auth with TOTP), Cloudflare Turnstile, tesseract.js and Vitest. More detail is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and scope and the change log are in [docs/PLAN.md](docs/PLAN.md).

## Run it yourself

**You need:** Node.js 20.9 or newer (22 recommended) and a free Supabase project. The listing-API keys are only needed for the price and history lookups.

```bash
git clone https://github.com/amoghnellutla/VinVerdict.git
cd VinVerdict
npm install
cp .env.example .env.local     # then fill in what you have (see below)
npm run dev                    # http://localhost:3000
```

| Setting in `.env.local` | Needed for | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Starting the app (saved cars, visitor limits) | [Supabase](https://supabase.com) free project |
| `MARKETCHECK_API_KEY` | Price check and listing history | [MarketCheck](https://www.marketcheck.com/apis) free plan |
| `AUTODEV_API_KEY` | Live listing lookup and photos | [Auto.dev](https://www.auto.dev/) free plan |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | The "I'm human" check | [Cloudflare Turnstile](https://dash.cloudflare.com/sign-up) (free) |
| `GUEST_HASH_SALT` | Hashing visitor IPs for rate limits | Any 64 random hex characters |

Without the listing-API keys, everything except the price and history lookups still works. Step-by-step setup, including the database tables, is in [docs/SETUP.md](docs/SETUP.md).

| Command | What it does |
| --- | --- |
| `npm run dev` | Local site with hot reload |
| `npm test` | All tests, offline, with the parser and scam scorecards (no API calls) |
| `npm run lint` / `npx tsc --noEmit` | Lint / type-check |
| `npm run build` then `npm start` | Production build, run locally |
| `npm run add-case -- --name <name> --label scam\|honest --file listing.txt` | Add a listing to the labelled dataset (phone numbers and emails removed) |
| `npm run retrain` | Retrain the model, refresh the scorecard and the dataset, run every test |

## Help improve it

The most useful thing you can send is a listing VinVerdict got wrong.

- **[It got a listing wrong](https://github.com/amoghnellutla/VinVerdict/issues/new?template=wrong-answer.yml)**: a wrong price, miles or year, a missed scam sign or a false alarm. Paste the listing with phone numbers and names removed. It becomes a test case, so the mistake can't come back.
- **[Suggest an improvement](https://github.com/amoghnellutla/VinVerdict/issues/new?template=idea.yml)**: a check it should do, something confusing, or a free official data source it should use.
- **Pull requests:** open an issue first for anything big, keep `npm test` and `npm run lint` green, add a test case for a rule or parser fix, and link a source for any new fact.

Found a security problem? Please [report it privately](https://github.com/amoghnellutla/VinVerdict/security/advisories/new).

## License

[MIT](LICENSE). Data from NHTSA, FuelEconomy.gov, MarketCheck and Auto.dev stays under its providers' own terms.

---

<sub>VinVerdict is an independent project, not affiliated with NHTSA, the FBI, the FTC, NICB, Carfax, AutoCheck, MarketCheck, Auto.dev or any carmaker. It gives information, not legal or financial advice. Always see the car, the title and the seller in person, and have an independent mechanic inspect it before you pay.</sub>
