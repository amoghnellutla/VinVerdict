"""Shared helpers for the Phase 1 probe scripts in tools/.

Keeps the probes small: loading keys, saving raw JSON to .tmp/, redacting
keys from anything printed, and summarizing which listing fields exist.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / ".tmp"
USER_AGENT = "VinVerdict-probe/0.1"
TIMEOUT_S = 20

# Fields PLAN.md §13 asks about. Matched case-insensitively against key names.
INTERESTING = re.compile(
    r"accident|title|owner|color|colour|seller|dealer|private|fsbo|vin|"
    r"mile|odometer|price|dist|radius|trim|transmission|drivetrain|fuel|"
    r"carfax|autocheck|history|url|vdp|photo|media|zip|city|state",
    re.IGNORECASE,
)


def load_key(name: str) -> str:
    """Read an API key from .env at the repo root. Exits if it is missing."""
    load_dotenv(ROOT / ".env")
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is not set in .env (see docs/SETUP.md).")
    return value


def redact(text: str, secret: str) -> str:
    return text.replace(secret, "***") if secret else text


def get_json(url: str, *, params: dict | None = None, headers: dict | None = None) -> tuple[int, Any]:
    h = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    h.update(headers or {})
    resp = requests.get(url, params=params, headers=h, timeout=TIMEOUT_S)
    try:
        body = resp.json()
    except ValueError:
        body = {"_non_json_body": resp.text[:2000]}
    return resp.status_code, body


def save_raw(name: str, payload: Any) -> Path:
    TMP.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = TMP / f"{name}_{stamp}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def find_listing_array(body: Any) -> list[dict]:
    """Return the first list of dicts in the response (the listings, usually)."""
    if isinstance(body, list) and body and isinstance(body[0], dict):
        return body
    if isinstance(body, dict):
        for value in body.values():
            found = find_listing_array(value)
            if found:
                return found
    return []


def flatten_keys(obj: Any, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{prefix}.{k}" if prefix else k
            keys.add(path)
            keys |= flatten_keys(v, path)
    elif isinstance(obj, list) and obj and isinstance(obj[0], dict):
        keys |= flatten_keys(obj[0], prefix + "[]")
    return keys


def report_fields(body: Any) -> None:
    """Print a summary that answers the PLAN.md §13 field questions."""
    top = sorted(body.keys()) if isinstance(body, dict) else type(body).__name__
    print(f"Top-level keys: {top}")
    listings = find_listing_array(body)
    print(f"Listings in this response: {len(listings)}")
    if not listings:
        return
    keys = set()
    for item in listings[:25]:
        keys |= flatten_keys(item)
    hits = sorted(k for k in keys if INTERESTING.search(k))
    print(f"Distinct field paths (first 25 listings): {len(keys)}")
    print("Fields relevant to PLAN.md §13:")
    for k in hits:
        print(f"  - {k}")
