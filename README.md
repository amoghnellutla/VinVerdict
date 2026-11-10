# VinVerdict

**A free second opinion before you buy a used car.** Paste a Facebook Marketplace, Craigslist or dealer listing (or just a VIN). VinVerdict tells you whether the ad shows scam warning signs, what the car is likely worth near you, what's known to go wrong with that model year, and exactly what to check next. Every fact links to the record it came from, and it never claims to know more than its evidence shows.

[![CI](https://github.com/amoghnellutla/VinVerdict/actions/workflows/ci.yml/badge.svg)](https://github.com/amoghnellutla/VinVerdict/actions/workflows/ci.yml)
[![CodeQL](https://github.com/amoghnellutla/VinVerdict/actions/workflows/codeql.yml/badge.svg)](https://github.com/amoghnellutla/VinVerdict/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Try it free, no sign-up: https://vinverdict.vercel.app**

![VinVerdict: paste a listing to check it](docs/images/home.png)

---

## Contents

- [Why it exists](#why-it-exists)
- [What it does](#what-it-does)
- [How to use it](#how-to-use-it)
- [What it won't do](#what-it-wont-do)
- [Accuracy](#accuracy)
- [How it works](#how-it-works)
- [Security and privacy](#security-and-privacy)
- [Run it yourself](#run-it-yourself)
- [Help improve it](#help-improve-it)

---

## Why it exists

Used-car marketplaces are full of listings that look perfect: a clean car, a great price, a friendly story. Some are real bargains. Many are scams: the "deployed soldier" whose car is "with a shipping company", the deposit by Zelle "to hold it", the cloned dealer website. A low price alone can't tell you which is which, and no single search can either.

VinVerdict brings the separate checks a careful buyer would do into one place:
- read the ad;
- check the VIN against federal records;
- compare the price with similar cars;
- look up recalls and known problems;
- read the seller's replies for scam patterns;
- spell out what's still unknown.

It's built around one rule: **every warning answers three questions. What is the evidence? Does it apply to this car? What should you do next?**

## What it does

### 1. A clear next step, with the evidence behind it

![A scam listing: Stop, with the four checks behind it](docs/images/verdict-scam.png)

Every check ends in one of four answers. It never says "safe":

| Answer | When |
| --- | --- |
| **Stop: serious warning** | A known scam pattern (gift cards, a deposit before viewing, a shipping-only story, a seller who's away) or a serious problem with the car (a branded title, an odometer rollback, miles the seller admits aren't real) |
| **Verify before going further** | Something to check with the seller or in person: a reported accident, a title not in the seller's name, a price far below similar cars |
| **Worth investigating** | Nothing wrong found in what was checked, with a list of what's still unknown |
| **Not enough information** | No VIN and no price to go on |

Behind it are four checks: **Listing trust, Car condition, Price, Ready to pay.** Each has a status (Warning, Check, OK so far, Not checked) and a "still unknown" list. Every finding says where its evidence comes from: *in the ad*, *official record*, *listing data*, *estimate*, *the seller's messages*, or *proof you attached*.

<img src="docs/images/verdict-unknowns.png" alt="What's still unknown for a listing that looks fine" width="640">

### 2. Checks the ad, the car and the seller

- **Scam patterns:** 50+ checks on the ad's words, each tied to FBI, FTC or NICB guidance, and context-aware. "Send $200 by Zelle to hold it" is a warning; "I don't take Zelle, cash in person" isn't. [Measured](#accuracy).
- **The VIN:** the federal check digit, then NHTSA's decoder, compared with the year, make, model and gearbox in the ad.
- **Where the car has been listed:** past listings of the VIN that MarketCheck recorded since 2015, with prices, miles and sellers. Flags odometer drops, quick resales and price cuts.
- **Recalls and known problems:**
  - NHTSA recalls, with "don't drive" and "park outside" warnings shown separately;
  - crash-test stars and owner complaints;
  - known issues, each backed by the maker's own service bulletin.
- **What the seller says:** paste the seller's replies or chat screenshots. They're read on your device and checked for deposit requests, shipping stories, refused inspections, and stories that change from the ad (miles, title, accidents). Each catch quotes the line and suggests a safe reply.

![Checking the seller's replies](docs/images/seller-replies.png)

- **Proof you collect:** attach a Carfax, AutoCheck or NICB result (a screenshot or pasted text). VinVerdict reads it, files it under the right check, and updates the verdict. Bad news always wins.
- **Photos:** reverse-search the listing's photos (Google Lens, Bing) to see whether they appear in an older or faraway ad.
- **Fake dealer sites:** a short check based on the FTC's September 2026 alert on cloned dealer websites.
- **No listing yet?** [Used-car scam signs](https://vinverdict.vercel.app/scam-signs) explains the nine patterns it checks for, with an example, what to do and the official source for each.

### 3. Helps you decide and negotiate

- **Price:** an estimated range from the advertised prices of similar cars near your ZIP, listed now or recently ended. It's adjusted for miles, seller type and reported damage, and comes with an opening offer and a walk-away price. It's always labelled an estimate: what buyers finally paid isn't public. When the free lookups run out, **compare it yourself**: type a few similar asking prices and get an honest comparison.
- **What it'll cost:** out-the-door price with your state's tax and fees, plus fuel (EPA) and upkeep per year.
- **Before you buy:**
  - a ready-to-send message for the seller, with the model year's known issue by its bulletin number, and a photo check with a random phrase only someone holding the car can provide;
  - an inspection list for your mechanic;
  - buying-day steps.
- **My list:** save cars on your own device (no account) and compare them side by side, with notes. Export and import the list. It warns when two saved ads may be the same car.

![Comparing saved cars side by side](docs/images/compare.png)

### 4. Car guide: every car since 2000

[vinverdict.vercel.app/cars](https://vinverdict.vercel.app/cars) covers 86 makes and 988 models sold in the US from 2000 to 2026. Search by name or browse by make, then see each model year side by side:
- body type and size, engines, gas, hybrid or electric;
- the EPA's MPG and yearly fuel cost, also shown per month.

Every year links to the EPA's own page for that car. "Luxury brand" and "Sports car" labels appear only when the brand's or model's Wikipedia article says so in its opening, and the page quotes that sentence with the link. Owner complaints, recalls, crash ratings and plain-word summaries ("strong on fuel cost, watch electrical complaints") are coming next, each from a cited source.

## How to use it

**On a computer**
1. Open the listing (Facebook Marketplace, Craigslist, Autotrader, Cars.com, a dealer's site).
2. Press **Ctrl+A** then **Ctrl+C** (Mac: **Cmd+A**, **Cmd+C**) to copy the whole page.
3. Go to https://vinverdict.vercel.app, click the box, press **Ctrl+V**, then **Paste & check**.
4. Read the verdict, then work through the tabs: Price, Check it yourself, Photos, Safety, Costs, Before you buy.

Tip: drag the **bookmark button** on the home page to your bookmarks bar, then click it on any listing to send the page in one step.

**On a phone** (apps like Facebook have no "select all")
1. Screenshot the listing: the title and price, the details, and the seller's description.
2. On VinVerdict, tap **Read screenshots** and pick them. They're read on your phone, never uploaded.
3. On Android, you can also install VinVerdict (browser menu → Install, or Add to Home screen). It then appears in the **Share** menu for listings.

**Only have a VIN?** Paste the 17 characters. VinVerdict decodes it, finds where it's listed now and before, and prices it.

**Selling instead?** After a VIN lookup, choose **It's mine: what's it worth?**

<p>
  <img src="docs/images/phone.png" alt="VinVerdict on a phone" width="260">
  &nbsp;
  <img src="docs/images/phone-verdict.png" alt="A verdict on a phone" width="260">
</p>

## What it won't do

These limits are deliberate. A tool that sounds sure when it isn't does more harm than one that says "not checked".

- **It never says a car is safe.** The best answer is "worth investigating", with what's still unknown.
- **It never clears a car's history from listing data.** Feeds often miss accidents that Carfax or AutoCheck show, so a feed's "0 accidents" never counts as a clean history. Only a report you attach can.
- **Prices are estimates from advertised prices,** never presented as sale prices.
- **Recalls are for the model year.** Whether this car is affected or repaired is only in NHTSA's and the maker's VIN lookups, which are linked.
- **It doesn't replace a mechanic** or seeing the title in person.
- **It doesn't scrape Facebook or Craigslist,** and never fetches a link you paste. You choose what to share.

## Accuracy

**Measured, not claimed.** The full write-up, including what isn't tested yet, is at [How accurate is it?](https://vinverdict.vercel.app/accuracy)

![The accuracy page](docs/images/accuracy.png)

**Scam warnings.** Every ad in [`src/lib/scam/eval/`](src/lib/scam/eval/) is labelled by hand. Some show a known scam pattern. The rest are honest ads that use the same words innocently: "no deposits", "I don't take Zelle", "I'm stationed at the base, come see it". A warning counts when VinVerdict says **Stop** because of the listing or the payment.

| Checked by | Scams caught | False alarms on honest ads | Warnings that were right |
| --- | --- | --- | --- |
| VinVerdict, **held-out ads** (never used to tune the rules) | 12 of 12 | 0 of 13 | 100% |
| VinVerdict, tuning ads | 38 of 38 | 0 of 56 | 100% |
| A keyword filter (payment app, shipping, deposit, away) | 33 of 38 | **26 of 56** | 56% |
| VinVerdict, **seller replies** (written before the first measurement) | 12 of 12 | 0 of 13 | 100% |
| The keyword filter, same replies | 10 of 12 | **7 of 13** | 59% |
| A **trained model** (naive Bayes), held-out ads | 12 of 12 | 0 of 13 | 100% |
| The trained model, tuning ads (leave-one-out) | 28 of 38 | 4 of 56 | 88% |

- **How it got there:** before context-aware rules, VinVerdict also caught every scam but told **9 of 46 honest ads (20%)** to stop. The first held-out run caught 11 of 12; the miss, a "refundable viewing fee" by Cash App, was fixed and moved into the tuning set, so the held-out number stays honest.
- **Rules or a trained model?** A naive Bayes model is retrained on the labelled ads on every change and scored next to the rules ([`learned.ts`](src/lib/scam/eval/learned.ts)). It changes no answer. On held-out ads both are perfect; scored leave-one-out on the tuning ads it misses 10 scams and flags 4 honest ads, and the real pages added so far each cost it catches. The words it leans on most ("to you", "it to", "the car") show it's learning the writing style of the test ads, not scam patterns. It would only join the app by beating the rules on real held-out listings, and then only to add warnings.
- **The caveat:** most ads so far are written from published scam patterns. Real listings are being added and reported separately, and real-world numbers will be lower.

**Listing parser.** Real page layouts (Facebook, Craigslist, Autotrader, Cars.com, CarGurus, CarMax, Carvana, dealer sites) are tested field by field in [`src/lib/listing/corpus/`](src/lib/listing/corpus/). Every listing it once got wrong is a case:

```
Listing corpus scorecard (31 cases)
  accident     22/22    make         26/26    price         31/31
  miles        28/28    model        26/26    titleStatus   18/18
  sellerType   22/22    transmission 16/16    verdict       25/25
  rules fired  34/34    false alarms avoided 119/119
  ownerCount   15/15    exteriorColor 12/12   usage          5/5
  kind          9/9     docFee        7/7     vin           13/13   distanceMiles 6/6
```

**The dataset.** Every labelled ad, pasted page and seller reply is in one file, [`dataset/vinverdict-labelled.jsonl`](dataset/) (about 140 rows, one JSON object per line, loadable with pandas), with a [description](dataset/README.md) of how it was labelled and its limits. A test fails if the file and the measurements drift apart. To grow it: `npm run add-case` adds a pasted listing (phone numbers and emails removed automatically), you fill in the right answers by hand, and `npm run retrain` retrains the model and refreshes the scorecard and the dataset.

**Sources.** Every known model-year problem cites the maker's bulletin it was checked against, and a test fails if a bulletin number or year range changes. The test was added after an outside review found the 2015–16 Accord/CR-V CVT warning citing the wrong bulletin.

All of this runs offline on every push ([CI](.github/workflows/ci.yml)). The published scorecard can't go stale: the build fails if it doesn't match the code.

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
  C & D & E --> F[Decision<br/>severity, evidence, 4 areas, next step]
  F --> G[Result<br/>verdict, still unknown, what to do]
```

**Design decisions**

- **Rules make the calls, not a language model.** Every warning is a deterministic rule with a named source. The same listing always gets the same answer, it can be measured against labelled ads, and it costs nothing per check.
- **Evidence has a type.** A finding is labelled by where it came from: the ad, an official record, listing data, an estimate, the seller's messages, or the buyer's own proof. "No title issue in the records checked" is never shown as "title verified clean".
- **Listing feeds can only add bad news.** An accident, a price cut or an odometer drop from a feed adds a warning; a feed's "0 accidents" never removes one.
- **Private by default.** Screenshots, chat messages and My list stay on the visitor's device. The verdict is computed in the browser, so answering a question updates it instantly with no server call.
- **$0 to run.**
  - Free government data (NHTSA, FuelEconomy.gov), free-plan listing APIs and free hosting.
  - Paid lookups sit behind a button, are cached for a day and are counted.
  - Visitors get a daily ration, enforced in the database, and the owner keeps a monthly reserve.
  - When the free lookups run out, everything else still works, including the manual price comparison.

**Stack:** Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS 4) on Vercel, Supabase (Postgres with row-level security, Auth with TOTP), Cloudflare Turnstile, tesseract.js, Vitest. More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Scope and change log: [docs/PLAN.md](docs/PLAN.md).

## Security and privacy

- **Nothing kept from visitors.**
  - Checks aren't stored.
  - Screenshots and chat messages never leave the device.
  - Visitor IPs are kept only as a salted one-way hash for rate limits, for two days.
- **Hardened like a production app:**
  - a strict nonce-based Content-Security-Policy;
  - server-only API keys;
  - validation on every server action;
  - two-step login and row-level security for the owner's saved cars;
  - Cloudflare Turnstile and database-enforced limits on paid lookups.
- **Tested as an attacker would:**
  - script injection through listings, proof text, imported lists and URLs;
  - malicious image files (SVG with script, polyglot PNG, a decompression bomb);
  - CSRF;
  - login brute force;
  - simultaneous request bursts against the limits;
  - inputs built to freeze the parser.
- **Automated:** CodeQL scanning (0 open alerts), Dependabot and secret scanning with push protection.
- **Accessible:** axe-core's WCAG 2.2 AA rules report no violations on any public page or result state, on a computer and a phone (`security-tests/accessibility.py`).

The attacks are a rerunnable kit in [`security-tests/`](security-tests/). Threat model and OWASP ASVS 5.0 self-assessment, including known gaps: [SECURITY.md](SECURITY.md). Plain-English tour: [How it's secured](https://vinverdict.vercel.app/security). Found a problem? Please [report it privately](https://github.com/amoghnellutla/VinVerdict/security/advisories/new).

## Run it yourself

**You need:** Node.js 20.9 or newer (22 recommended) and a free Supabase project. Listing-API keys are only needed for the price and history lookups.

```bash
git clone https://github.com/amoghnellutla/VinVerdict.git
cd VinVerdict
npm install
cp .env.example .env.local     # then fill in what you have (see below)
npm run dev                    # http://localhost:3000
```

| Setting in `.env.local` | Needed for | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Starting the app (owner login, saved cars, visitor limits) | [Supabase](https://supabase.com) free project → Project Settings → API |
| `MARKETCHECK_API_KEY` | Price check and listing history | [MarketCheck](https://www.marketcheck.com/apis) free plan |
| `AUTODEV_API_KEY` | Live listing lookup and photos | [Auto.dev](https://www.auto.dev/) free plan |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | The "I'm human" check on public price lookups | [Cloudflare Turnstile](https://dash.cloudflare.com/sign-up) (free) |
| `GUEST_HASH_SALT` | Hashing visitor IPs for rate limits | Any 64 random hex characters |

Without the listing-API keys, everything except the price and history lookups still works. Step-by-step setup, including the database tables (`supabase/migrations/`, run once in the Supabase SQL editor), is in [docs/SETUP.md](docs/SETUP.md).

| Command | What it does |
| --- | --- |
| `npm run dev` | Local site with hot reload |
| `npm test` | All tests, offline, with the parser and scam scorecards (no API calls) |
| `npm run add-case -- --name <name> --label scam\|honest --file listing.txt` | Add a pasted listing to the labelled dataset (removes phone numbers and emails) |
| `.venv\Scripts\python -I tools/build_cars.py download epa labels merge` | Rebuild the Car guide data from EPA and Wikipedia (free; see `workflows/build_cars.md`) |
| `npm run retrain` | Retrain the model, refresh the published scorecard and the dataset file, run every test |
| `npm run lint` / `npx tsc --noEmit` | Lint / type-check |
| `npm run build` then `npm start` | Production build, run locally |

**Project layout**

```
src/app/            pages (home, My list, scam signs, accuracy, shortlist, security, owner pages) and server actions
src/components/     the result page and shared UI
src/lib/decision.ts the buyer's decision: severity, evidence, four areas, next step
src/lib/scam/       warning-sign rules, and eval/ (labelled ads, scorecard, trained model)
dataset/            the labelled dataset as one JSONL file, with its description
src/data/catalog/   the Car guide data (built by tools/build_cars.py)
src/lib/listing/    listing parser and its accuracy corpus
src/lib/value/      price estimate and the manual comparison
src/lib/nhtsa/      NHTSA client and parsing
src/lib/evidence/   reading attached Carfax / AutoCheck / NICB proof
src/lib/workspace/  My list (device storage, validated import/export)
supabase/           database tables and limits (SQL, row-level security on every table)
tools/              Python scripts for data refreshes (e.g. the Shortlist from NHTSA)
security-tests/     attack kit for a local build (server functions, malicious files, injection, load)
```

## Help improve it

**Suggestions are very welcome.** The most useful thing you can send is a listing VinVerdict got wrong.

- **[It got a listing wrong](https://github.com/amoghnellutla/VinVerdict/issues/new?template=wrong-answer.yml)**: a wrong price, miles or year, a missed scam sign, or a false alarm. Paste the listing with phone numbers and names removed. It becomes a test case, so the mistake can't come back.
- **[Suggest an improvement](https://github.com/amoghnellutla/VinVerdict/issues/new?template=idea.yml)**: a check it should do, something confusing, or a free official data source it should use.
- **Pull requests:**
  - Open an issue first for anything big.
  - Keep `npm test` and `npm run lint` green.
  - Add a corpus or scam case for a rule or parser fix.
  - Link a source for any new fact: every fact on a result must link to where it came from.

## License

[MIT](LICENSE): free to use, copy and change, as long as the copyright notice stays. Data from NHTSA, FuelEconomy.gov, MarketCheck and Auto.dev stays under its providers' own terms.

---

VinVerdict is an independent project, not affiliated with NHTSA, the FBI, the FTC, NICB, Carfax, AutoCheck, MarketCheck, Auto.dev or any carmaker. It gives information, not legal or financial advice. Always see the car, the title and the seller in person, and have an independent mechanic inspect it before you pay.
