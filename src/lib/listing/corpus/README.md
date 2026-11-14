# Listing corpus (accuracy suite)

Real listings and the answers VinVerdict must give for them. `npm test` runs every case offline (no NHTSA, no API quota) and prints a scorecard like:

```
Listing corpus scorecard (26 cases)
  accident     13/13
  miles        17/17
  price        20/20
  ...
```

## Add a case (do this whenever the analyzer gets a listing wrong)

1. Copy the listing exactly as you would paste it (the whole page with Ctrl+A is fine) into `cases/NN-short-name.txt`.
2. Create `cases/NN-short-name.json` with only the fields you want to check:

```json
{
  "note": "Where it came from and what's tricky about it.",
  "expect": { "price": 9900, "miles": 183086, "accident": "reported", "sellerType": "dealer" },
  "verdict": "hide",
  "mustHit": ["accident-reported"],
  "mustNotHit": ["shipping-only"]
}
```

3. Run `npm test`. A failing case says exactly which field was wrong. Fix the parser or rules, re-run, and keep the case: it stops the bug coming back.

## Field names

- `expect`: any field of `ParsedListing` in `../parse.ts`: `kind` (`text`/`url`/`vin`), `vin`, `year`, `make`, `model`, `price`, `docFee`, `miles`, `transmission`, `titleStatus`, `accident` (`none`/`reported`/`unknown`), `exteriorColor`, `ownerCount`, `sellerType`, `usage` (`personal`/`fleet`/`rental`/`unknown`), `zip`, `distanceMiles`, `sourceHost`.
- `verdict`: `hide`, `verify`, `caution` or `clear`.
- `unsure`: fields the ad gives two answers for, such as `["price"]` when it shows two prices and nothing says which one. The reader must say "not sure" for these (the field null), and must not say "not sure" for any other field.
- `mustHit` / `mustNotHit`: rule ids from `../../scam/rules.ts` and `../../verdict.ts` (for example `accident-reported`, `no-price`, `vin-only`, `lien`, `shipping-only`, `high-miles`, `fleet`, `curbstoning`).

## Privacy

Listings are public, but remove phone numbers, emails and personal names before saving a case. Cases 02 and 18 are the owner's exact inputs. Case 01 is rebuilt from the real AutoTrader listing in Amogh's screenshots, with some typical page text added (seller notes, stock number). The others are realistic reconstructions of each site's format, with made-up VINs that pass the check digit. Real pasted pages are better than reconstructions, so replace or add to them as you check real cars.

## Scam labels

Every listing case also says `"scam": true | false` (does the ad show a known scam pattern a buyer should stop at?) and `"origin": "real" | "synthetic"`. These feed the scam scorecard (`src/lib/scam/eval/`, shown on /accuracy). Leave `scam` out for VIN-only and link-only cases. After adding or relabelling a case, refresh the published scorecard: `UPDATE_SCORECARD=1 npx vitest run src/lib/scam/eval`.

## Stress set and re-pastes

Cases 35 and up are a stress set: layouts written from other sites' formats (TrueCar, Edmunds, KBB, eBay Motors, OfferUp, Vroom, dealer sites), labelled `origin: "synthetic"`. They carry the traps that break readers: other cars' prices, crossed-out prices, fee stacks, payments shown first, interior colors, km and service-history miles.

`mutations.test.ts` re-pastes every case six other ways: lines joined, Windows line ends, blank lines, similar cars after, car cards after, and recently viewed before. A fact may become "not sure", never a different value. The scorecard counts right, not sure and wrong separately, and wrong must stay 0.
