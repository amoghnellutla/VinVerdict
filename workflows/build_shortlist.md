# Build the Shortlist data

**Objective:** refresh `src/lib/shortlist/data.json`, the owner-complaint and recall counts per model year that the Shortlist page uses.

**When:** every few months, or after adding a model.

**Tool:** `.venv\Scripts\python -I tools/build_shortlist.py` (free NHTSA API, no key, no quota; about 400 requests (complaints + recalls), ~3–4 minutes). `--dry-run` prints the plan only.

**Steps**
1. Edit `MODELS` / `YEARS` in the script if needed. Use NHTSA's model names: Lexus is model + engine with **no space** ("ES350", "RX350"). "ES" and "ES 350" return nothing.
2. Run the tool and check every model printed a total. A model with 0 complaints or 0 recalls means a wrong model name.
3. Run `npm test` (the shortlist tests read the file) and look at /shortlist.

**Learned (2026-11-09)**
- **Correction (2026-11-09, later):** the first build used "ES 350"/"RX 350", which NHTSA answers with nothing for most years (ES: 76 complaints in total). "ES350"/"RX350" give 258 and 501, plus 13 and 16 recalls. Check `api.nhtsa.gov/products/vehicle/models?modelYear=…&make=…&issueType=r` for the exact spelling.
- The recalls API (`/recalls/recallsByVehicle`) uses the same names; `parkIt` / `parkOutSide` mark "don't drive / park outside until fixed" recalls, which the page lists under "careful" years.
- NHTSA answers "no complaints" with HTTP 400 and `count: 0`; the tool treats that as zero. Other errors are retried 3 times.
- Years with 0 complaints usually mean the model wasn't sold (HR-V before 2016) and are dropped. Very low counts (under 15% of the model's typical year, e.g. Camry 2014 with 14) are marked "not enough data", never "best".
- Raw counts favour newer cars, so the page compares complaints per year on the road, within one model only. Counts also grow with sales, so models aren't compared with each other.
