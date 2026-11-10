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
- `mustHit` / `mustNotHit`: rule ids from `../../scam/rules.ts` and `../../verdict.ts` (for example `accident-reported`, `no-price`, `vin-only`, `lien`, `shipping-only`, `high-miles`, `fleet`, `curbstoning`).

## Privacy

Listings are public, but remove phone numbers, emails and personal names before saving a case. Cases 02 and 18 are the owner's exact inputs. Case 01 is rebuilt from the real AutoTrader listing in Amogh's screenshots, with some typical page text added (seller notes, stock number). The others are realistic reconstructions of each site's format, with made-up VINs that pass the check digit. Real pasted pages are better than reconstructions, so replace or add to them as you check real cars.
