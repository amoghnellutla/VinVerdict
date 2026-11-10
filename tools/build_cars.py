"""Build the Car guide catalog from free government data (no key, no quota).

Stages (run in order; each reads the previous stage's files):
  download   fetch the public data files into .tmp/cars/raw/<source>/ (records SHA-256 and date)
  epa        every make, model and year since 2000 from EPA's fuel economy data:
             body type, size class, drive, engines, fuel type and EPA's yearly fuel cost
  merge      write src/data/catalog/index.json and makes/<make>.json

Usage (from the repo root):
  .venv\\Scripts\\python -I tools/build_cars.py download epa merge
  .venv\\Scripts\\python -I tools/build_cars.py epa merge        # reuse downloaded files

See workflows/build_cars.md. Later stages (NHTSA complaints, recalls, crash ratings) are added
one release at a time (PLAN.md).
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import statistics
import sys
import time
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / ".tmp" / "cars" / "raw"
WORK = ROOT / ".tmp" / "cars" / "work"
OUT = ROOT / "src" / "data" / "catalog"
HEADERS = {"User-Agent": "VinVerdict-tools/0.1 (free used-car checker; data build)"}

FIRST_YEAR, LAST_YEAR = 2000, 2026

SOURCES = {
    "epa": {
        "url": "https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip",
        "about": "https://www.fueleconomy.gov/feg/ws/index.shtml",
        "name": "EPA / DOE fueleconomy.gov vehicle data",
    },
}

# EPA make names that read better shortened; the rest are used as EPA writes them.
MAKE_NAMES = {"McLaren Automotive": "McLaren", "smart": "Smart"}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def body_of(vclass: str) -> str:
    """EPA size class -> a plain body type."""
    v = vclass.lower()
    if "pickup" in v:
        return "pickup"
    if "sport utility" in v or "special purpose" in v:
        return "suv"
    if "minivan" in v:
        return "minivan"
    if v.startswith("vans"):
        return "van"
    if "station wagon" in v:
        return "wagon"
    return "car"


def size_of(vclass: str) -> str | None:
    """The size word EPA gives cars ("Two Seaters" -> two-seater, "Midsize Cars" -> midsize)."""
    v = vclass.lower()
    for key, word in [("two seaters", "two-seater"), ("minicompact", "minicompact"), ("subcompact", "subcompact"),
                      ("compact", "compact"), ("midsize", "midsize"), ("large", "large"), ("small sport", "small"),
                      ("standard sport", "standard"), ("small pickup", "small"), ("standard pickup", "standard"),
                      ("small station", "small"), ("midsize station", "midsize")]:
        if key in v:
            return word
    return None


def drive_of(d: str) -> str | None:
    d = d.lower()
    if "4-wheel" in d or "4wd" in d or "part-time" in d:
        return "4WD"
    if "all-wheel" in d or "awd" in d:
        return "AWD"
    if "front" in d:
        return "FWD"
    if "rear" in d:
        return "RWD"
    return None


def power_of(row: dict) -> str:
    a = (row.get("atvType") or "").lower()
    if a == "ev":
        return "electric"
    if "plug-in" in a:
        return "plug-in hybrid"
    if a == "hybrid":
        return "hybrid"
    if a == "diesel":
        return "diesel"
    return "gas"


def load_splits() -> dict[tuple[str, str], list[tuple[re.Pattern, str]]]:
    """EPA base models that group separate vehicles (Range Rover / Sport / Velar / Evoque)."""
    path = ROOT / "tools" / "cars" / "epa_splits.csv"
    out: dict[tuple[str, str], list[tuple[re.Pattern, str]]] = defaultdict(list)
    with path.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            out[(r["make"], r["epa_basemodel"].lower())].append((re.compile(r["model_regex"], re.I), r["name"]))
    return out


def model_name(row: dict, splits, aliases) -> str:
    key = (row["make"], row["baseModel"].lower())  # EPA's capitals vary between years
    for pattern, name in splits.get(key, []):
        if pattern.search(row["model"]):
            return name
    return aliases.get(key, row["baseModel"]).strip()


def load_aliases() -> dict[tuple[str, str], str]:
    path = ROOT / "tools" / "cars" / "epa_aliases.csv"
    with path.open(encoding="utf-8", newline="") as f:
        return {(r["make"], r["epa_basemodel"].lower()): r["name"] for r in csv.DictReader(f)}


# ---------------- stages ----------------

def download() -> None:
    meta = {}
    for key, src in SOURCES.items():
        folder = RAW / key
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / src["url"].rsplit("/", 1)[1]
        r = requests.get(src["url"], headers=HEADERS, timeout=120)
        r.raise_for_status()
        target.write_bytes(r.content)
        meta[key] = {
            "url": src["url"],
            "downloaded": datetime.now(timezone.utc).date().isoformat(),
            "lastModified": r.headers.get("Last-Modified"),
            "sha256": hashlib.sha256(r.content).hexdigest(),
            "bytes": len(r.content),
        }
        print(f"downloaded {key}: {len(r.content):,} bytes")
    (RAW / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def epa() -> None:
    aliases = load_aliases()
    splits = load_splits()
    z = zipfile.ZipFile(RAW / "epa" / "vehicles.csv.zip")
    with z.open("vehicles.csv") as f:
        rows = [r for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"))
                if FIRST_YEAR <= int(r["year"]) <= LAST_YEAR]

    # EPA spells some makes two ways over the years ("MINI" and "Mini"): use the most common.
    spellings = Counter(r["make"] for r in rows)
    canonical = {m: max((s for s in spellings if s.lower() == m.lower()), key=spellings.__getitem__) for m in spellings}

    groups: dict[tuple[str, str, int], list[dict]] = defaultdict(list)
    for r in rows:
        make = MAKE_NAMES.get(canonical[r["make"]], canonical[r["make"]])
        name = model_name(r, splits, aliases)
        if not name:
            continue
        groups[(make, name, int(r["year"]))].append(r)

    out: dict[str, dict] = {}
    for (make, name, year), vs in sorted(groups.items()):
        bodies = Counter(body_of(v["VClass"]) for v in vs)
        sizes = Counter(s for v in vs if (s := size_of(v["VClass"])))
        costs = sorted(int(v["fuelCost08"]) for v in vs if v["fuelCost08"] and int(v["fuelCost08"]) > 0)
        mpg = sorted(int(v["comb08"]) for v in vs if v["comb08"] and int(v["comb08"]) > 0)
        cyl = sorted({int(float(v["cylinders"])) for v in vs if v["cylinders"] not in ("", "0")})
        displ = sorted({float(v["displ"]) for v in vs if v["displ"] not in ("", "0", "0.0")})
        y = {
            "variants": len(vs),
            "body": bodies.most_common(1)[0][0],
            "size": sizes.most_common(1)[0][0] if sizes else None,
            "classes": sorted({v["VClass"] for v in vs}),
            "drive": sorted({d for v in vs if (d := drive_of(v["drive"]))}),
            "power": sorted({power_of(v) for v in vs}),
            "cylinders": cyl,
            "displacementL": [displ[0], displ[-1]] if displ else None,
            "turbo": any(v["tCharger"] == "T" for v in vs),
            "supercharged": any(v["sCharger"] == "S" for v in vs),
            "manual": any(v["trany"].lower().startswith("manual") for v in vs),
            "premiumFuel": any("premium" in v["fuelType1"].lower() for v in vs),
            "fuelCostYear": {"min": costs[0], "median": int(statistics.median(costs)), "max": costs[-1]} if costs else None,
            "mpg": [mpg[0], mpg[-1]] if mpg else None,
            "epaIds": sorted(int(v["id"]) for v in vs)[:3],
        }
        m = out.setdefault(make, {}).setdefault(name, {"years": {}})
        m["years"][str(year)] = y

    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "epa.json").write_text(json.dumps(out), encoding="utf-8")
    print(f"epa: {len(rows):,} variants -> {sum(len(ms) for ms in out.values())} models in {len(out)} makes")


WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/"
# A label is kept only when the article's own opening says so.
LABEL_WORDS = {
    "luxury": re.compile(r"luxury|premium", re.I),
    "sporty": re.compile(r"sports? car|muscle car|pony car|roadster|supercar|hypercar|grand tourer|hot hatch|sports sedan|sport compact|sports coup|high-performance", re.I),
}
LABEL_WORDS["sporty-make"] = LABEL_WORDS["sporty"]


def wiki_summary(title: str) -> dict:
    """Wikipedia's page summary, cached under .tmp so reruns don't ask again; polite pacing and backoff."""
    cache = RAW / "wikipedia" / (slug(title) + ".json")
    if cache.exists():
        return json.loads(cache.read_bytes().decode("utf-8"))
    for attempt in range(5):
        resp = requests.get(WIKI + requests.utils.quote(title.replace(" ", "_"), safe=""), headers=HEADERS, timeout=30)
        if resp.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        resp.raise_for_status()
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(resp.content)  # Wikipedia sends UTF-8; resp.text may guess another charset
        time.sleep(1)
        return json.loads(resp.content.decode("utf-8"))
    raise RuntimeError(f"Wikipedia kept answering 429 for {title}")


def labels() -> None:
    """Fetch the opening of each label's Wikipedia article and keep the label only if it says so."""
    path = ROOT / "tools" / "cars" / "labels.csv"
    out, rejected = [], []
    with path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        d = wiki_summary(r["wikipedia"])
        extract = d.get("extract", "")
        # The sentence that carries the word, so the reason shown is the article's own words.
        sentence = next((x for x in re.split(r"(?<=[.])\s+", extract) if LABEL_WORDS[r["kind"]].search(x)), None)
        if not sentence or d.get("type") == "disambiguation":
            rejected.append(f"{r['kind']} {r['make']} {r['model']}: {extract[:120]!r}")
            continue
        out.append({"kind": r["kind"], "make": r["make"], "model": r["model"] or None,
                    "reason": sentence.strip(), "source": d["content_urls"]["desktop"]["page"], "title": d.get("title", r["wikipedia"])})
    (WORK / "labels.json").write_text(json.dumps({"checked": date.today().isoformat(), "labels": out}, indent=1), encoding="utf-8")
    print(f"labels: kept {len(out)}, rejected {len(rejected)}")
    for x in rejected:
        print("  rejected:", x)


def merge() -> None:
    epa_data = json.loads((WORK / "epa.json").read_text(encoding="utf-8"))
    meta = json.loads((RAW / "meta.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "makes").mkdir(exist_ok=True)

    lab = json.loads((WORK / "labels.json").read_text(encoding="utf-8"))
    by_make = {(x["kind"], x["make"]): x for x in lab["labels"] if x["model"] is None}
    by_model = {(x["make"], x["model"]): x for x in lab["labels"] if x["model"]}
    pick = lambda x: {"reason": x["reason"], "source": x["source"]}  # noqa: E731
    index = {"generated": date.today().isoformat(), "labelsChecked": lab["checked"],
             "sources": {"epa": {**SOURCES["epa"], **meta["epa"]}}, "makes": []}
    slugs: set[str] = set()
    for make in sorted(epa_data, key=str.lower):
        ms = slug(make)
        assert ms not in slugs, f"make slug clash: {ms}"
        slugs.add(ms)
        models = []
        detail = {"make": make, "slug": ms, "models": {}}
        seen: set[str] = set()
        for name in sorted(epa_data[make], key=str.lower):
            years = epa_data[make][name]["years"]
            s = slug(name)
            if s in seen:  # "TrailBlazer" and "Trailblazer": one page, years kept apart
                existing = detail["models"][s]
                existing["years"].update(years)
                for m in models:
                    if m["slug"] == s:
                        m["years"] = sorted({*m["years"], *map(int, years)})
                continue
            seen.add(s)
            body = Counter(y["body"] for y in years.values()).most_common(1)[0][0]
            entry = {"name": name, "slug": s, "body": body, "years": sorted(map(int, years))}
            # A sports-car maker's label goes on its cars, not its SUVs (Lamborghini Urus, Ferrari Purosangue).
            sporty = by_model.get((make, name)) or (by_make.get(("sporty-make", make)) if body == "car" else None)
            if sporty:
                entry["sporty"] = pick(sporty)
            models.append(entry)
            detail["models"][s] = {"name": name, "years": years}
        mk = {"name": make, "slug": ms, "models": models}
        if ("luxury", make) in by_make:
            mk["luxury"] = pick(by_make[("luxury", make)])
        index["makes"].append(mk)
        (OUT / "makes" / f"{ms}.json").write_text(json.dumps(detail, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")) + "\n", encoding="utf-8")
    size = sum(p.stat().st_size for p in (OUT / "makes").glob("*.json"))
    print(f"merge: {len(index['makes'])} makes, {sum(len(m['models']) for m in index['makes'])} models; "
          f"index {(OUT / 'index.json').stat().st_size // 1024} KB, makes {size // 1024} KB")


STAGES = {"download": download, "epa": epa, "labels": labels, "merge": merge}

if __name__ == "__main__":
    args = sys.argv[1:] or ["download", "epa", "merge"]
    for a in args:
        if a not in STAGES:
            sys.exit(f"unknown stage {a!r}; choose from {', '.join(STAGES)}")
    for a in args:
        STAGES[a]()
