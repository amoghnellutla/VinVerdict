"""Probe the MarketCheck Free API with ONE call (uses quota: 500/month).

Without --confirm it only prints the request it would send (key redacted)
and spends nothing. Follow workflows/phase1_api_test.md before running.

Usage:
  python tools/probe_marketcheck.py                       # dry run
  python tools/probe_marketcheck.py --confirm             # dealer search, 1 call
  python tools/probe_marketcheck.py --mode private --confirm   # private-party test, 1 call
  python tools/probe_marketcheck.py --param radius=200 --confirm  # extra/override params
  python tools/probe_marketcheck.py --mode history --vin 4T1C11AK3MU436772 --confirm  # VIN listing history, 1 call

Endpoints are best-known defaults: confirm them in MarketCheck's docs first
and pass --url if they differ.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _probe_common import get_json, load_key, redact, report_fields, save_raw  # noqa: E402

BASE = "https://api.marketcheck.com/v2/search/car"  # per docs.marketcheck.com, checked 2026-11-09
URLS = {"dealer": f"{BASE}/active", "private": f"{BASE}/fsbo/active", "history": "https://api.marketcheck.com/v2/history/car/{vin}"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=sorted(URLS), default="dealer")
    parser.add_argument("--url", help="Override the endpoint URL")
    parser.add_argument("--make", default="honda")
    parser.add_argument("--model", default="accord")
    parser.add_argument("--year", default="2017")
    parser.add_argument("--zip", default="08540", help="US ZIP (default: Princeton, NJ)")
    parser.add_argument("--radius", default="100")
    parser.add_argument("--rows", default="50", help="Results requested per call")
    parser.add_argument("--vin", help="17-character VIN (history mode)")
    parser.add_argument("--param", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--confirm", action="store_true", help="Actually send the request (spends 1 call)")
    args = parser.parse_args()

    url = args.url or URLS[args.mode]
    params = {
        "make": args.make, "model": args.model, "year": args.year,
        "zip": args.zip, "radius": args.radius, "rows": args.rows,
    }
    if args.mode == "history":
        # History takes the VIN in the path and no search filters.
        if not args.vin or len(args.vin) != 17 or not args.vin.isalnum():
            parser.error("--mode history needs --vin with 17 letters/digits")
        url = url.format(vin=args.vin.upper())
        params = {}
    if args.mode == "dealer":
        params["car_type"] = "used"  # active search includes new cars otherwise
    for kv in args.param:
        key, _, value = kv.partition("=")
        params[key] = value

    print(f"GET {url}")
    print(f"params: {params} (+ api_key)")
    if not args.confirm:
        print("\nDry run: no call made. Add --confirm to spend 1 MarketCheck call.")
        return 0

    key = load_key("MARKETCHECK_API_KEY")
    status, body = get_json(url, params={**params, "api_key": key})
    print(f"HTTP {status}")
    if isinstance(body, dict):
        for k in ("num_found", "message", "error", "code"):
            if k in body:
                print(f"{k}: {redact(str(body[k]), key)}")
    report_fields(body)
    path = save_raw(f"marketcheck_{args.mode}", {"url": url, "params": params, "status": status, "body": body})
    print(f"\nRaw JSON saved to {path}")
    return 0 if status == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
