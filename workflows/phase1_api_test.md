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

## Call log
| Date | Provider | Command | HTTP | Notes |
| --- | --- | --- | --- | --- |
