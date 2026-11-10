"""Build the Shortlist data: NHTSA owner complaints and recalls per model year (free, no key, no quota).

For each model in MODELS and each year in YEARS it asks NHTSA's complaints API
how many owner complaints were filed, how many involved a crash, and the most
common problem area, plus how many recalls it has and how many of those say
"don't drive it" or "park it outside" until fixed. Writes src/lib/shortlist/data.json, which the Shortlist
page reads (no API calls at page load).

Usage (from the repo root):
  .venv\\Scripts\\python -I tools/build_shortlist.py            # all models
  .venv\\Scripts\\python -I tools/build_shortlist.py --dry-run  # print the plan only

About 400 small requests; it waits 0.2 s between them to be polite.
See workflows/build_shortlist.md.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "lib" / "shortlist" / "data.json"
API = "https://api.nhtsa.gov/complaints/complaintsByVehicle"
RECALLS_API = "https://api.nhtsa.gov/recalls/recallsByVehicle"
HEADERS = {"User-Agent": "VinVerdict-tools/0.1", "Accept": "application/json"}

# (make, model as NHTSA names it, body). Toyota/Honda first (PLAN.md §1), then similar.
MODELS = [
    ("Toyota", "Camry", "Sedan"), ("Toyota", "Corolla", "Sedan"), ("Toyota", "Prius", "Hatchback"),
    ("Toyota", "RAV4", "SUV"), ("Toyota", "Highlander", "SUV"),
    ("Honda", "Accord", "Sedan"), ("Honda", "Civic", "Sedan"), ("Honda", "CR-V", "SUV"),
    ("Honda", "HR-V", "SUV"), ("Honda", "Pilot", "SUV"),
    ("Mazda", "Mazda3", "Sedan"), ("Mazda", "CX-5", "SUV"),
    # NHTSA's complaints and recalls APIs name Lexus models with the engine and no space
    # ("ES350"); "ES" and "ES 350" return nothing (checked 2026-11-09).
    ("Lexus", "ES350", "Sedan"), ("Lexus", "RX350", "SUV"),
    ("Subaru", "Outback", "SUV"),
]
YEARS = list(range(2012, 2025))


def fetch(make: str, model: str, year: int, url: str = API) -> list:
    """NHTSA answers "none" with HTTP 400 + count 0; other errors are retried 3 times."""
    for attempt in range(3):
        try:
            r = requests.get(url, params={"make": make, "model": model, "modelYear": year}, headers=HEADERS, timeout=30)
            if r.status_code == 400 and r.headers.get("content-type", "").startswith("application/json") and (r.json().get("count") or r.json().get("Count") or 0) == 0:
                return []
            r.raise_for_status()
            return r.json().get("results") or []
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    return []


def complaints(make: str, model: str, year: int) -> dict:
    results = fetch(make, model, year)
    comps = Counter()
    crashes = 0
    for c in results:
        if c.get("crash") in (True, "Yes", "Y"):
            crashes += 1
        for part in str(c.get("components") or "").split(","):
            part = part.strip()
            if part:
                comps[part] += 1
    top = [{"component": k.title(), "count": v} for k, v in comps.most_common(3)]
    recalls = fetch(make, model, year, RECALLS_API)
    # NHTSA's two separate warnings: "don't drive it" and "park it outside" (fire risk) until fixed.
    park_it = sum(1 for x in recalls if x.get("parkIt"))
    park_outside = sum(1 for x in recalls if x.get("parkOutSide") and not x.get("parkIt"))
    return {"year": year, "complaints": len(results), "crashes": crashes, "top": top, "recalls": len(recalls), "parkIt": park_it, "parkOutside": park_outside}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(f"{len(MODELS)} models x {len(YEARS)} years = {len(MODELS) * len(YEARS)} requests -> {OUT}")
    if args.dry_run:
        return 0
    out = {"generated": date.today().isoformat(), "source": "https://www.nhtsa.gov/recalls (NHTSA complaints and recalls APIs)", "models": []}
    for make, model, body in MODELS:
        years = []
        for y in YEARS:
            try:
                years.append(complaints(make, model, y))
            except requests.RequestException as e:
                print(f"  {make} {model} {y}: failed ({e.__class__.__name__}); skipped", file=sys.stderr)
            time.sleep(0.2)
        total = sum(x["complaints"] for x in years)
        rec = sum(x["recalls"] for x in years)
        print(f"{make} {model}: {total} complaints, {rec} recalls over {len(years)} years")
        out["models"].append({"make": make, "model": model, "body": body, "years": years})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
