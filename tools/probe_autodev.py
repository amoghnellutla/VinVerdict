"""Probe the Auto.dev Free listings API with ONE call (uses quota: 1,000/month).

Without --confirm it only prints the request it would send (key redacted)
and spends nothing. Follow workflows/phase1_api_test.md before running.

Usage:
  python tools/probe_autodev.py                         # dry run
  python tools/probe_autodev.py --confirm               # 1 call
  python tools/probe_autodev.py --param page=2 --confirm

The endpoint, parameter names and auth style are best-known defaults:
confirm them in Auto.dev's docs first and override with --url / --param /
--auth query if they differ.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _probe_common import get_json, load_key, redact, report_fields, save_raw  # noqa: E402

DEFAULT_URL = "https://api.auto.dev/listings"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--auth", choices=["bearer", "query"], default="bearer",
                        help="Send key as 'Authorization: Bearer' header or as ?apikey=")
    parser.add_argument("--make", default="Honda")
    parser.add_argument("--model", default="Accord")
    parser.add_argument("--year", default="2017")
    parser.add_argument("--zip", default="08540")
    parser.add_argument("--param", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--confirm", action="store_true", help="Actually send the request (spends 1 call)")
    args = parser.parse_args()

    params = {
        "vehicle.make": args.make, "vehicle.model": args.model,
        "vehicle.year": args.year, "zip": args.zip,
    }
    for kv in args.param:
        key, _, value = kv.partition("=")
        params[key] = value

    print(f"GET {args.url}")
    print(f"params: {params}  auth: {args.auth}")
    if not args.confirm:
        print("\nDry run: no call made. Add --confirm to spend 1 Auto.dev call.")
        return 0

    key = load_key("AUTODEV_API_KEY")
    headers, send = {}, dict(params)
    if args.auth == "bearer":
        headers["Authorization"] = f"Bearer {key}"
    else:
        send["apikey"] = key
    status, body = get_json(args.url, params=send, headers=headers)
    print(f"HTTP {status}")
    if isinstance(body, dict):
        for k in ("total", "totalCount", "message", "error"):
            if k in body:
                print(f"{k}: {redact(str(body[k]), key)}")
    report_fields(body)
    path = save_raw("autodev", {"url": args.url, "params": params, "status": status, "body": body})
    print(f"\nRaw JSON saved to {path}")
    return 0 if status == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
