"""Build the Shortlist data from NHTSA's complete public files (free, no key, no quota).

NHTSA publishes every owner complaint since 1995 and every recall as bulk files. This reads them (downloaded once into
.tmp/datasets, which git ignores) and writes src/lib/shortlist/data.json: for every car model with enough complaints,
per model year from 2010, how many owner complaints were filed, how many involved a crash, the most common problem
areas, how many recalls it has, and how many of those say "don't drive it" or "park it outside" until fixed; the
defect investigations NHTSA opened into it (open or closed, and whether one led to a recall); and NHTSA's overall
crash-test stars (5-Star Safety Ratings), as a range when its versions were rated differently.

Why the bulk files and not NHTSA's per-model API (used before 2026-11-19): compared model-year by model-year on the
guide's 15 models, the two agree almost everywhere, but the API returned 0 or far too few complaints for some years
(2014 Camry 14 vs 456, 2023-24 Accord and Civic 0 vs 93-263, 2024 Outback 2 vs 107), which made those years look
better than they were. The bulk files have them all.

Model names: NHTSA's are kept, except where the same car is filed under two spellings ("C 300" and "C300", "ES" and
"ES350", "F-250" and "F-250 SD", "XV Crosstrek" and "Crosstrek"), which are merged. Different cars stay apart
("Prius v", "Corolla Cross", "Santa Fe Sport", "Camry Hybrid"). Plain "Silverado" / "Sierra" (any of the 1500, 2500,
3500) are left out so they never pass for one of them. Display spelling comes from the EPA's fuel-economy file
("CR-V", "Fit", "MDX") where it lists the model.

"Don't drive" / "park outside": the recall files don't carry NHTSA's flags, so they're read from the recall's own
words ("should not drive", "park outside"). On the guide's 15 models this matched NHTSA's API flags on all 195
model years; --check-api N re-checks N model years with flags against the API.

Usage (from the repo root):
  .venv\\Scripts\\python -I tools/build_shortlist.py                 # download if missing, then build
  .venv\\Scripts\\python -I tools/build_shortlist.py --check-api 40  # also compare 40 model years with NHTSA's API

See workflows/build_shortlist.md.
"""

from __future__ import annotations

import argparse
import io
import json
import random
import re
import sys
import time
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / ".tmp" / "datasets"
OUT = ROOT / "src" / "lib" / "shortlist" / "data.json"
FILES = {
    "FLAT_CMPL.zip": "https://static.nhtsa.gov/odi/ffdd/cmpl/FLAT_CMPL.zip",
    "FLAT_RCL_PRE_2010.zip": "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_PRE_2010.zip",
    "FLAT_RCL_POST_2010.zip": "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip",
    "FLAT_INV.zip": "https://static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip",
    "Safercar_data.csv": "https://static.nhtsa.gov/nhtsa/downloads/Safercar/Safercar_data.csv",
    "vehicles.csv.zip": "https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip",
}
HEADERS = {"User-Agent": "VinVerdict-tools/0.2"}
SOURCE = "https://www.nhtsa.gov/nhtsa-datasets-and-apis (NHTSA complaints and recalls files)"

YEARS = range(2010, 2026)
# Enough owner reports to compare a model's years: 200 complaints over these years, in at least 3 years with 5+.
MIN_TOTAL, MIN_YEARS = 200, 3

# The guide: the models listed on the Shortlist page, by NHTSA name, with their display name and body.
GUIDE = {
    ("TOYOTA", "CAMRY"): ("Camry", "Sedan"), ("TOYOTA", "COROLLA"): ("Corolla", "Sedan"), ("TOYOTA", "PRIUS"): ("Prius", "Hatchback"),
    ("TOYOTA", "RAV4"): ("RAV4", "SUV"), ("TOYOTA", "HIGHLANDER"): ("Highlander", "SUV"),
    ("HONDA", "ACCORD"): ("Accord", "Sedan"), ("HONDA", "CIVIC"): ("Civic", "Sedan"), ("HONDA", "CR-V"): ("CR-V", "SUV"),
    ("HONDA", "HR-V"): ("HR-V", "SUV"), ("HONDA", "PILOT"): ("Pilot", "SUV"),
    ("MAZDA", "MAZDA3"): ("Mazda3", "Sedan"), ("MAZDA", "CX-5"): ("CX-5", "SUV"),
    ("LEXUS", "ES"): ("ES", "Sedan"), ("LEXUS", "RX"): ("RX", "SUV"),
    ("SUBARU", "OUTBACK"): ("Outback", "SUV"),
}
# Same car, another name.
RENAMED = {("SUBARU", "XV CROSSTREK"): "CROSSTREK"}
# Names that cover several different vehicles.
AMBIGUOUS = {("CHEVROLET", "SILVERADO"), ("GMC", "SIERRA"), ("CHEVROLET", "SILVERADO HD"), ("GMC", "SIERRA HD")}
# Not cars or light trucks (the EPA file lists these makes for other vehicles).
NOT_CARS = re.compile(r"CASCADIA|COLUMBIA|CORONADO|M2 |MT45|MT55|SPYDER|MOMENTUM|SOLITUDE|REFLECTION")


def canonical(make: str, model: str) -> tuple[str, str]:
    make = " ".join(make.upper().split())
    m = " ".join(model.upper().split())
    m = re.sub(r"^([A-Z]{1,3}) (\d{3}[A-Z]?)$", r"\1\2", m)  # "C 300" -> "C300", "ES 350" -> "ES350"
    if make == "LEXUS":
        x = re.match(r"^([A-Z]{2})(\d{3})([A-Z]?)$", m)
        if x:
            m = f"{x[1]} HYBRID" if x[3] == "H" else x[1]  # "ES350" -> "ES", "RX450H" -> "RX HYBRID"
    m = re.sub(r" (SD|BEV)$", "", m)  # "F-250 SD" -> "F-250", "F-150 LIGHTNING BEV" -> "F-150 LIGHTNING"
    return make, RENAMED.get((make, m), m)


def download(force: bool = False) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        p = DATA / name
        if p.exists() and not force:
            continue
        print(f"Downloading {url} ...")
        with requests.get(url, headers=HEADERS, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(p, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)


def rows(zip_name: str):
    z = zipfile.ZipFile(DATA / zip_name)
    name = next(n for n in z.namelist() if n.lower().endswith(".txt"))
    for line in io.TextIOWrapper(z.open(name), encoding="latin-1"):
        yield line.rstrip("\n").split("\t")


def year_of(s: str) -> int | None:
    try:
        y = int(s)
    except ValueError:
        return None
    return y if y in YEARS else None


def read_complaints():
    """Per (make, model, year): the complaint numbers, the crash ones, and (complaint, problem area) pairs."""
    acc = defaultdict(lambda: (set(), set(), set()))
    for p in rows("FLAT_CMPL.zip"):
        if len(p) < 46 or p[45] != "V":
            continue
        y = year_of(p[5])
        if y is None:
            continue
        odi, crash, comps = acc[(*canonical(p[3], p[4]), y)]
        odi.add(p[1])
        if p[6] == "Y":
            crash.add(p[1])
        area = p[11].split(":")[0].strip()
        if area:
            comps.add((p[1], area.title()))
    return acc


DONT_DRIVE = re.compile(r"should not drive|do not drive|not to drive|stop driving")
PARK_OUTSIDE = re.compile(r"park\w*[^.]{0,80}outside|outside[^.]{0,40}away from (?:structures|homes|buildings)")


def read_recalls():
    """Per (make, model, year): the recall numbers, and which say don't drive / park outside until fixed."""
    acc = defaultdict(lambda: (set(), set(), set()))
    for f in ("FLAT_RCL_PRE_2010.zip", "FLAT_RCL_POST_2010.zip"):
        for p in rows(f):
            if len(p) < 23 or p[10] != "V":
                continue
            y = year_of(p[4])
            if y is None:
                continue
            camps, dont, outside = acc[(*canonical(p[2], p[3]), y)]
            camps.add(p[1])
            text = " ".join(p[19:23]).lower()
            if DONT_DRIVE.search(text):
                dont.add(p[1])
            elif PARK_OUTSIDE.search(text):
                outside.add(p[1])
    return acc


def read_investigations():
    """Per (make, model, year): NHTSA defect investigations, {id: (subject, opened year, closed year or 0, recall)}."""
    acc: dict = defaultdict(dict)
    for p in rows("FLAT_INV.zip"):
        if len(p) < 11:
            continue
        y = year_of(p[3])
        if y is None or not p[0].strip():
            continue
        opened, closed = p[6][:4], p[7][:4]
        acc[(*canonical(p[1], p[2]), y)][p[0].strip()] = (" ".join(p[9].split()), int(opened) if opened.isdigit() else 0, int(closed) if closed.isdigit() else 0, p[8].strip())
    return acc


def read_stars():
    """Per (make, model, year): the lowest and highest overall crash-test stars NHTSA gave its versions."""
    import csv

    acc: dict = defaultdict(set)
    with open(DATA / "Safercar_data.csv", encoding="latin-1", newline="") as f:
        for r in csv.DictReader(f):
            y = year_of(r["MODEL_YR"])
            if y is not None and r["OVERALL_STARS"] in {"1", "2", "3", "4", "5"}:
                acc[(*canonical(r["MAKE"], r["MODEL"]), y)].add(int(r["OVERALL_STARS"]))
    return acc


def epa_names():
    """EPA spellings: whole model names by make ("CR-V", "Fit"), words ("Fe", "4xe", "Ram"), and its makes."""
    import csv

    z = zipfile.ZipFile(DATA / "vehicles.csv.zip")
    makes: dict[str, str] = {}
    names: dict[tuple[str, str], Counter] = defaultdict(Counter)
    words: dict[str, Counter] = defaultdict(Counter)
    for r in csv.DictReader(io.TextIOWrapper(z.open("vehicles.csv"), encoding="utf-8", errors="replace")):
        mk = r["make"].upper()
        makes[mk] = r["make"]
        for n in (r["baseModel"], r["model"]):
            if n:
                names[(mk, n.upper())][n] += 1
                for w in n.split():
                    words[w.upper()][w] += 1
    return makes, {k: c.most_common(1)[0][0] for k, c in names.items()}, {k: c.most_common(1)[0][0] for k, c in words.items()}


def display(make: str, model: str, epa: dict, epa_words: dict) -> str:
    """The EPA's spelling of the whole name, else word by word, else a capitalised word (codes like "MDX" kept)."""
    if (make, model) in epa:
        return epa[(make, model)]
    out = []
    for w in model.split(" "):
        if w in epa_words:
            out.append(epa_words[w])
        elif re.search(r"\d", w) or len(w) <= 3 and not re.search(r"[AEIOU]", w):
            out.append(w)
        else:
            out.append("-".join(x if len(x) <= 2 else x.capitalize() for x in w.split("-")))
    return " ".join(out)


def build() -> dict:
    complaints = read_complaints()
    recalls = read_recalls()
    investigations = read_investigations()
    stars = read_stars()
    epa_makes, epa, epa_words = epa_names()
    totals, busy = Counter(), Counter()
    for (mk, md, y), (odi, _, _) in complaints.items():
        totals[(mk, md)] += len(odi)
        busy[(mk, md)] += len(odi) >= 5
    keep = [k for k in totals if (k in GUIDE) or (totals[k] >= MIN_TOTAL and busy[k] >= MIN_YEARS and k[0] in epa_makes and k not in AMBIGUOUS and not NOT_CARS.search(k[1]))]
    areas: Counter = Counter()
    models = []
    for mk, md in sorted(keep, key=lambda k: (k[0], k[1])):
        years = []
        for y in YEARS:
            odi, crash, comps = complaints.get((mk, md, y), (set(), set(), set()))
            camps, dont, outside = recalls.get((mk, md, y), (set(), set(), set()))
            top = Counter(a for _, a in comps).most_common(3)
            areas.update(a for a, _ in top)
            st = stars.get((mk, md, y))
            years.append({
                "year": y, "complaints": len(odi), "crashes": len(crash), "top": [{"component": a, "count": n} for a, n in top], "recalls": len(camps), "parkIt": len(dont), "parkOutside": len(outside - dont),
                "stars": [min(st), max(st)] if st else None, "inv": investigations.get((mk, md, y), {}),
            })
        guide = GUIDE.get((mk, md))
        models.append({"make": epa_makes.get(mk, mk.title()), "model": guide[0] if guide else display(mk, md, epa, epa_words), "nhtsa": md, "guide": bool(guide), "body": guide[1] if guide else "", "years": years})
    return pack(models)


def pack(models: list[dict]) -> dict:
    """Compact form: one row per year, [complaints, crashes, recalls, parkIt, parkOutside, area, count, area, count...],
    areas as indexes into one list, and 0 for a year with nothing at all."""
    areas = sorted({t["component"] for m in models for y in m["years"] for t in y["top"]})
    idx = {a: i for i, a in enumerate(areas)}
    out = []
    for m in models:
        rows_ = []
        for y in m["years"]:
            r = [y["complaints"], y["crashes"], y["recalls"], y["parkIt"], y["parkOutside"]]
            for t in y["top"]:
                r += [idx[t["component"]], t["count"]]
            rows_.append(r if any(r[:5]) else 0)
        e = {"make": m["make"], "model": m["model"], "nhtsa": m["nhtsa"], "rows": rows_}
        st = [(y["stars"][0] if y["stars"][0] == y["stars"][1] else y["stars"]) if y["stars"] else 0 for y in m["years"]]
        if any(st):
            e["stars"] = st
        inv: dict = {}
        for i, y in enumerate(m["years"]):
            for k, v in y["inv"].items():
                inv.setdefault(k, [k, *v, []])[-1].append(i)
        if inv:
            # [id, subject, opened, closed (0 = open), recall number or "", [year indexes]]; newest first
            e["inv"] = sorted(inv.values(), key=lambda v: (-v[2], v[0]))
        if m["guide"]:
            e["guide"] = True
            e["body"] = m["body"]
        out.append(e)
    return {"generated": date.today().isoformat(), "source": SOURCE, "firstYear": YEARS[0], "areas": areas, "models": out}


def check_api(data: dict, n: int) -> int:
    """Compare n model years (those with a don't-drive / park-outside recall first, then random) with NHTSA's API."""
    rng = random.Random(1)
    flagged, other = [], []
    for m in data["models"]:
        for i, r in enumerate(m["rows"]):
            if r:
                (flagged if r[3] or r[4] else other).append((m, data["firstYear"] + i, r))
    sample = flagged[: n // 2] + rng.sample(other, min(len(other), n - min(len(flagged), n // 2)))
    bad = 0
    for m, y, r in sample:
        api_model = m["nhtsa"]
        res = requests.get("https://api.nhtsa.gov/recalls/recallsByVehicle", params={"make": m["make"], "model": api_model, "modelYear": y}, headers=HEADERS, timeout=30)
        got = res.json().get("results") or [] if res.ok else []
        api = (len(got), sum(1 for x in got if x.get("parkIt")), sum(1 for x in got if x.get("parkOutSide") and not x.get("parkIt")))
        mine = (r[2], r[3], r[4])
        same_flags = api[1:] == mine[1:]
        bad += not same_flags
        print(f"  {'ok ' if same_flags else 'DIFF'} {m['make']} {m['model']} {y}: recalls/dontDrive/parkOutside files {mine} api {api}")
        time.sleep(0.2)
    print(f"Don't-drive / park-outside flags: {len(sample) - bad} of {len(sample)} model years agree with the API")
    return bad


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--download", action="store_true", help="download the files again even if present")
    parser.add_argument("--check-api", type=int, default=0, metavar="N")
    args = parser.parse_args()
    download(args.download)
    data = build()
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    g = [m for m in data["models"] if m.get("guide")]
    print(f"Wrote {OUT}: {len(data['models'])} models ({len(g)} in the guide), {OUT.stat().st_size // 1024} KB")
    if args.check_api:
        return 1 if check_api(data, args.check_api) else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
