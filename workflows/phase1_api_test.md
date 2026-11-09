# Workflow: Phase 1 API test

**Objective:** answer the PLAN.md §13 "To verify in Phase 1" questions with as few API calls as possible, then update PLAN.md §3, §10 and §13 with the findings.

## Inputs
- `.env` with `MARKETCHECK_API_KEY` and `AUTODEV_API_KEY` (docs/SETUP.md).
- Python venv: `python -m venv .venv` then `.venv\Scripts\python -m pip install -r tools/requirements.txt`.
- the owner's go-ahead. MarketCheck and Auto.dev calls cost monthly quota.

## Call budget
At most **10 calls per provider** for all of Phase 1. Every probe is a dry run unless `--confirm` is passed. Log each confirmed call in the table at the bottom.

## Steps
1. **NHTSA (free, no key).** `.venv\Scripts\python -I tools/probe_nhtsa.py` (optionally `--vin <VIN>`). It should print decode, recalls, crash stars and complaints.
2. **Check endpoints before spending.** Open the MarketCheck and Auto.dev docs and confirm the endpoint URL, auth style and parameter names the scripts use (the dry-run output shows them). Fix the script defaults if they're wrong, so the next run is right.
3. **MarketCheck dealer search (1 call).** `tools/probe_marketcheck.py --confirm`. Record `num_found`, listings per call, and whether accident, title, owner-count, color and seller-type fields exist (the script lists matching fields).
4. **MarketCheck private-party (1 call).** `--mode private --confirm`. A 401/403 or a plan error means it's not on the free tier.
5. **MarketCheck radius (1 call).** `--param radius=200 --confirm`: does Free reject or cap it at 100?
6. **Auto.dev search (1 call).** `tools/probe_autodev.py --confirm`. If you get a 401, retry once with `--auth query`.
7. **Auto.dev nationwide (1 call).** Drop the ZIP or widen the distance (see their docs for the parameter) and check that results come from far-away states.
8. **Rows per call.** From steps 3 and 6, note the max page size. It sets calls per search in PLAN §10.
9. Inspect the raw JSON in `.tmp/` for anything the summary missed (e.g. `carfax_1_owner`, `is_certified`, `seller_type`).
10. **Update the plan.** Tick the §13 boxes, fix §3 free-tier facts, set the page cap in §10, and add a change-log row.

## Known facts and quirks
- 2026-11-08: NHTSA vPIC returns `TransmissionStyle` values like "Continuously Variable Transmission (CVT)". The automatic-only filter must count CVT (and dual-clutch automatics) as automatic, and reject only "Manual".
- 2026-11-08: NHTSA complaints for a popular model/year can run to hundreds (540 for a 2017 Accord). Summarize by component; don't list them all.
- 2026-11-08 (tested): vPIC still returns year/make/model when the check digit is wrong, but sets `ErrorCode` to "1" ("Check Digit (9th position) does not calculate properly"). The app must treat any `ErrorCode` other than "0" as a scam-rule flag, and can also check the digit itself (`vin_check_digit` in `tools/probe_nhtsa.py`).

- 2026-11-09: MarketCheck's host is `api.marketcheck.com` (docs.marketcheck.com), not `mc-api.`. Active search mixes new and used unless `car_type=used`. `rows` max is 50; asking for more silently falls back to 10.
- 2026-11-09: MarketCheck private-party (`/fsbo/active`) works on Free, but its docs say it's "billed at a higher tier". Check the dashboard usage after an FSBO call to see whether it counted as more than 1.
- 2026-11-09: MarketCheck has no accident field. `carfax_clean_title` / `carfax_1_owner` are `false` on most listings (35/50), which reads as "not confirmed", not "bad title". Treat only `true` as a positive.
- 2026-11-09: Auto.dev Free caps `limit` at 20 per page (silently clamped). `history.accidentCount` / `ownerCount` were on 10 of 20 listings. No total count unless `includes=total`. Radius param is `distance` (default 50).
- 2026-11-09: **Auto.dev replies include a `user` block with the account name, email, IP and location.** The app adapter must copy only listing fields and never pass the raw reply to the browser or logs.
- 2026-11-09 (tested): Auto.dev `GET /listings/{vin}` (Bearer key) works on Free and returns `{ data: listing }` with the same fields as search, including `history`. A dealer site's price can differ from AutoTrader's by its fee (AutoTrader $9,900 "dealer fees included" vs dealer site $10,029 = +$129), so the app only flags price gaps of 10%+.
- 2026-11-09 (tested): **MarketCheck Price works on Free**: `GET /v2/predict/car/us/marketcheck_price` with `vin`, `miles`, `dealer_type` (`independent`/`franchise`), `zip` returns `{ marketcheck_price, msrp }`. Trained on sold dealer listings; it does **not** know accident history, so the app must apply the accident discount itself.
- 2026-11-09 (tested): **Sold listings work on Free**: `GET /v2/search/car/recents?sold=true` (+ year list, make, model, zip, radius ≤ 100, rows ≤ 50, `stats=price`) returns `num_found`, 50 listings (price, miles, trim, `dom`, `last_seen_at_date`) and price percentiles. Only one `stats` field per call. Some listings have no price: skip them.
- 2026-11-09 (tested): **MarketCheck History by VIN works on Free**: `GET /v2/history/car/{vin}` (key only, no filters) returns a JSON array (up to 50 per `page`), each with `price`, `miles`, `seller_name`, `seller_type`, `city`, `state`, `zip`, `source`, `vdp_url`, `inventory_type`, `first_seen_at`/`last_seen_at` (Unix s) and `_date` versions. New-car records have no miles. No accident or title fields. Probe: `probe_marketcheck.py --mode history --vin <VIN>`.
- 2026-11-09: Windows console can't print Auto.dev's emoji keys: run inspection scripts with `python -I -X utf8` (`-I` ignores `PYTHONIOENCODING`).

## Call log
| Date | Provider | Command | HTTP | Notes |
| --- | --- | --- | --- | --- |
| 2026-11-09 | MarketCheck | `probe_marketcheck.py --confirm` (2017 Accord, 08540, 100 mi, used) | 200 | 186 found, 50 returned (all dealer, NJ/PA, ≤ 30 mi). Price on 42/50, color 49/50, `dom`, `price_change_percent`, `is_certified` present |
| 2026-11-09 | MarketCheck | `--mode private --confirm` | 200 | 5 private listings (kbb.com, cars.com, craigslist), NY/NJ/CT, up to 88 mi. Price, miles, VIN on all |
| 2026-11-09 | Auto.dev | `probe_autodev.py --confirm` (2017 Accord, 08540) | 200 | Plan "Free". 20 returned (NJ/PA/NY), all dealer retail. Accident/owner history on 10/20 |
| 2026-11-09 | Auto.dev | `GET /listings/4T1C11AK3MU436772` (one-off test through `lib/live/parse.ts`) | 200 | 2021 Camry LE, Gwatney Buick GMC (AR), $10,029, 183,086 mi, accidentCount 1, ownerCount 2, Carfax link. Matches AutoTrader's AutoCheck box. Raw reply (minus `user`) in `.tmp/` |
| 2026-11-09 | MarketCheck | `predict/car/us/marketcheck_price` (Camry 4T1C…772, 183,086 mi, independent, 08540) | 200 | $12,024 (MSRP $26,294) |
| 2026-11-09 | MarketCheck | `search/car/recents?sold=true` (2020–22 Camry, 08540, 100 mi, 50 rows, stats=price) | 200 | 510 sold in 90 days; median $22,475; 46/50 with price; miles on all |
| 2026-11-09 | MarketCheck | `--mode history --vin 4T1C11AK3MU436772 --confirm` | 200 | 11 records: new at an AL Toyota dealer (Feb 2021), IL + AR dealers at 83,318 mi (2023), two AR dealers now at 183,086 mi, cut $10,900 → $9,900. Fixture in `src/lib/history/fixtures/` |
