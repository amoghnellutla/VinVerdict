"""Probe the free NHTSA APIs for one VIN (no key, no quota).

Checks the three NHTSA sources VinVerdict relies on:
  1. vPIC VIN decode      -> year / make / model / trim / transmission / body
  2. Recalls by vehicle   -> count + components
  3. Safety ratings       -> overall crash stars
  4. Complaints by vehicle-> count + top components

Usage:
  python tools/probe_nhtsa.py                 # uses the sample VIN below
  python tools/probe_nhtsa.py --vin <17-char VIN>

Raw responses are saved to .tmp/ for inspection.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _probe_common import get_json, save_raw  # noqa: E402

VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json"
RECALLS = "https://api.nhtsa.gov/recalls/recallsByVehicle"
COMPLAINTS = "https://api.nhtsa.gov/complaints/complaintsByVehicle"
RATINGS_LOOKUP = "https://api.nhtsa.gov/SafetyRatings/modelyear/{year}/make/{make}/model/{model}"
RATINGS_DETAIL = "https://api.nhtsa.gov/SafetyRatings/VehicleId/{vid}"

# A synthetic 2017 Honda Accord EX-L-pattern VIN (WMI 1HG, model-year code H)
# with a valid check digit. It is not a real car; it only exercises the APIs.
SAMPLE_VIN_BASE = "1HGCR2F8_HA000123"

_TRANSLIT = {
    **{c: i for i, c in enumerate("ABCDEFGH", start=1)},
    **{c: i for i, c in enumerate("JKLMN", start=1)},
    "P": 7, "R": 9,
    **{c: i for i, c in enumerate("STUVWXYZ", start=2)},
}
_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]


def vin_check_digit(vin: str) -> str:
    """North American VIN check digit (position 9). Raises on bad characters."""
    total = 0
    for i, ch in enumerate(vin.upper()):
        if i == 8:
            continue
        value = int(ch) if ch.isdigit() else _TRANSLIT[ch]
        total += value * _WEIGHTS[i]
    rem = total % 11
    return "X" if rem == 10 else str(rem)


def sample_vin() -> str:
    base = SAMPLE_VIN_BASE
    return base[:8] + vin_check_digit(base) + base[9:]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vin", default=sample_vin())
    args = parser.parse_args()
    vin = args.vin.strip().upper()

    if len(vin) != 17 or any(c in "IOQ" for c in vin):
        print(f"Invalid VIN format: {vin!r} (17 chars, no I/O/Q)")
        return 2
    expected = vin_check_digit(vin)
    print(f"VIN {vin}  check digit {'OK' if vin[8] == expected else f'MISMATCH (expected {expected})'}")

    raw: dict = {"vin": vin}

    status, body = get_json(VPIC.format(vin=vin))
    raw["vpic"] = body
    if status != 200 or not body.get("Results"):
        print(f"vPIC decode failed: HTTP {status}")
        save_raw("nhtsa", raw)
        return 1
    d = body["Results"][0]
    year, make, model = d.get("ModelYear"), d.get("Make"), d.get("Model")
    print("\n[1] vPIC decode")
    for label, key in [("Year", "ModelYear"), ("Make", "Make"), ("Model", "Model"), ("Trim", "Trim"),
                       ("Body", "BodyClass"), ("Drive", "DriveType"), ("Transmission", "TransmissionStyle"),
                       ("Fuel", "FuelTypePrimary"), ("Plant state", "PlantState"), ("Error", "ErrorText")]:
        print(f"  {label:<13} {d.get(key) or '-'}")

    if not (year and make and model):
        print("Decode did not return year/make/model; stopping.")
        save_raw("nhtsa", raw)
        return 1

    params = {"make": make, "model": model, "modelYear": year}

    status, body = get_json(RECALLS, params=params)
    raw["recalls"] = body
    recalls = body.get("results", []) if isinstance(body, dict) else []
    print(f"\n[2] Recalls for {year} {make} {model}: {len(recalls)} (HTTP {status})")
    for r in recalls[:5]:
        print(f"  - {r.get('NHTSACampaignNumber')}: {r.get('Component')}")

    status, body = get_json(RATINGS_LOOKUP.format(year=year, make=make, model=model))
    raw["ratings_lookup"] = body
    variants = body.get("Results", []) if isinstance(body, dict) else []
    print(f"\n[3] Safety rating variants: {len(variants)} (HTTP {status})")
    for v in variants[:3]:
        s2, detail = get_json(RATINGS_DETAIL.format(vid=v.get("VehicleId")))
        raw.setdefault("ratings_detail", []).append(detail)
        res = (detail.get("Results") or [{}])[0] if isinstance(detail, dict) else {}
        print(f"  - {v.get('VehicleDescription')}: overall {res.get('OverallRating', '-')} stars")

    status, body = get_json(COMPLAINTS, params=params)
    raw["complaints"] = body
    complaints = body.get("results", []) if isinstance(body, dict) else []
    print(f"\n[4] Complaints: {len(complaints)} (HTTP {status})")
    top = Counter(c for item in complaints for c in str(item.get("components", "")).split(",") if c)
    for comp, n in top.most_common(5):
        print(f"  - {comp.strip()}: {n}")

    path = save_raw("nhtsa", raw)
    print(f"\nRaw JSON saved to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
