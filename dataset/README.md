# VinVerdict labelled dataset

`vinverdict-labelled.jsonl` holds every used-car ad, pasted listing page and seller reply that VinVerdict is measured on, one JSON object per line. Each one is labelled by hand: does it show a known used-car scam pattern a buyer should stop at, and, for full pages, what are the exact facts (price, miles, title, accidents, seller type, VIN)?

It's the same data the [accuracy page](https://vinverdict.vercel.app/accuracy) is computed from. The file is generated from the sources below, and a test fails if it's out of date, so the published numbers and the dataset can't drift apart.

## What's in it

| `set` | What | Used for |
| --- | --- | --- |
| `tuning` | Ads (`kind: "ad"`) and full pasted pages (`kind: "page"`) | Improving the rules, and training the model |
| `held-out` | Ads written after the rules were tuned | Scoring only. Never used to tune or train anything |
| `reply` | Seller replies to one honest-looking ad (`context`) | Scoring the seller-messages check |
| `fields-only` | A bare VIN or link, no scam label | Testing the listing reader |

Fields on every row: `id`, `set`, `origin` (`real` or `synthetic`), `label` (`scam`, `honest` or `null`), `kind`, `text`. Some rows also have `basis` (the guidance the scam label rests on: `ic3` for the FBI, `ftc`, `nicb`, `craigslist`), `fields` (the exact answers for a page) and `context` (the ad a reply answers).

```python
import pandas as pd
df = pd.read_json("dataset/vinverdict-labelled.jsonl", lines=True)
df.groupby(["set", "label"]).size()
```

## How it was made

- **Scam labels** follow published patterns: FBI IC3 vehicle-scam warnings, FTC guidance on payment apps, gift cards and wires, NICB, and Craigslist's own scam list. Honest examples deliberately reuse the same words innocently ("no deposits", "I don't take Zelle", "stationed at the base, come see it"). They're there to measure false alarms.
- **Field answers** for full pages are read from the page by hand, never copied from what VinVerdict reads (otherwise the test would only check itself).
- **Privacy:** phone numbers, email addresses, street addresses and people's names are removed. `npm run add-case` removes phone numbers and emails automatically; the rest is checked by hand.

## Limits (read before using it)

- **Most rows are synthetic**: written from published patterns, not collected from real scams. Real rows are marked `"origin": "real"` and are being added. Expect real-world results to be lower than results on this file.
- **One author wrote the synthetic rows.** A model trained on them can learn the author's phrasing instead of scam patterns. VinVerdict's own trained model shows this: its top "scam words" include "will", "to you" and "the car".
- **US used-car listings only**, mostly Toyota and Honda, in English.
- **Small:** about 140 rows. Fine for measuring, small for training.

## Keep it growing (the improvement loop)

1. **Add a listing:** `npm run add-case -- --name autotrader-civic --label honest --file listing.txt` (or pipe the text in). It removes phone numbers and emails and writes `src/lib/listing/corpus/cases/NN-name.txt` and `.json`.
2. **Label it by hand:** fill in the `.json` from the page, then delete its `todo` line (`npm test` fails until you do).
3. **Measure before fixing:** `npm test` prints what VinVerdict got wrong on the new listing. Record that first result.
4. **Fix and lock:** fix the parser or rules, and keep the case so the mistake can't come back. Check the held-out score didn't drop. If a held-out ad caused a fix, move it to the tuning set and write a new held-out ad.
5. **Retrain and republish:** `npm run retrain` retrains the model, refreshes the scorecard and this file, and runs every test.

## License

MIT, like the rest of the repository. The synthetic rows were written for this project. The real rows are public listings with personal details removed.
