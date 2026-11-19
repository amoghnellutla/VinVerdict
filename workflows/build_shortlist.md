# Build the Shortlist data

**Objective:** refresh `src/lib/shortlist/data.json`, the owner-complaint and recall counts per model year that the Shortlist page uses.

**When:** every few months, or after adding a model.

**Tool:** `.venv\Scripts\python -I tools/build_shortlist.py` (since 2026-11-19). It downloads NHTSA's bulk files once into `.tmp/datasets` (git-ignored; complaints about 380 MB zipped, recalls, investigations, 5-Star Ratings, and the EPA vehicles file), then builds in about 30 seconds. `--download` fetches them again (do this to refresh); `--check-api 40` compares 40 model years' recall flags with NHTSA's API.

**Steps**
1. Run `.venv\Scripts\python -I tools/build_shortlist.py --download --check-api 40`. It prints the number of models and the file size; every flag line should say `ok`.
2. Edit `GUIDE` (the 15 models on the page), `RENAMED` / `AMBIGUOUS` (name merges) or `YEARS` in the script if needed. If you change `YEARS`, change `src/lib/shortlist/years.ts` too (a test checks they match).
3. Run `npm test` and look at /shortlist.

**Learned (2026-11-19)**
- The per-model API (the old way) left out whole years: 2014 Camry 14 vs 456 in the files, 2023–24 Accord and Civic 0, 2024 Outback 2 vs 107. Use the files.
- NHTSA files one car under several names ("GLE350" and "GLE 350"; "ES" and "ES350"; "F-250" and "F-250 SD"). `canonical()` merges only clear spellings and renames; different cars stay apart ("Prius v", "Santa Fe Sport", "Camry Hybrid").
- The recall files have no don't-drive / park-outside flag; it's read from the recall text and checked with `--check-api`.
- Investigations: only open ones and ones that led to a recall are shown (closed without one means no defect was found, or it moved into a newer investigation).

**Earlier (API version, kept for history)**

**Learned (2026-11-09)**
- **Correction (2026-11-09, later):** the first build used "ES 350"/"RX 350", which NHTSA answers with nothing for most years (ES: 76 complaints in total). "ES350"/"RX350" give 258 and 501, plus 13 and 16 recalls. Check `api.nhtsa.gov/products/vehicle/models?modelYear=…&make=…&issueType=r` for the exact spelling.
- The recalls API (`/recalls/recallsByVehicle`) uses the same names; `parkIt` / `parkOutSide` mark "don't drive / park outside until fixed" recalls, which the page lists under "careful" years.
- **2026-11-10:** `parkIt` (don't drive) and `parkOutSide` (park outside: fire risk) are different warnings, so `data.json` now stores them separately (`parkIt`, `parkOutside`; a recall with both counts as don't drive). The page shows them as two tags and says not every car of the year is affected. An outside review flagged the old combined line.
- NHTSA answers "no complaints" with HTTP 400 and `count: 0`; the tool treats that as zero. Other errors are retried 3 times.
- Years with 0 complaints usually mean the model wasn't sold (HR-V before 2016) and are dropped. Very low counts (under 15% of the model's typical year, e.g. Camry 2014 with 14) are marked "not enough data", never "best".
- Raw counts favour newer cars, so the page compares complaints per year on the road, within one model only. Counts also grow with sales, so models aren't compared with each other.
