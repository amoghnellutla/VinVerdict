"""Attacks the server functions the way a script would, without the website.

Checks: owner-only functions refuse logged-out calls; the paid price lookup refuses a
missing or fake "I'm human" token; forged cross-site requests, oversized and malformed
bodies are rejected; script and SQL-shaped input is treated as data; the login and the
visitor limits hold, including under simultaneous requests.

Usage: python security-tests/server_actions.py [--base http://localhost:3100]
"""

from __future__ import annotations

import concurrent.futures as cf
import collections
import json
import urllib.error
import urllib.request

from common import action_ids, form_body, outcome, parse_args

args = parse_args(__doc__ or "")
BASE = args.base
IDS = action_ids()
results: list[tuple[str, bool, str]] = []


def call(name: str, form: dict[str, str] | None = None, args_: list | None = None, origin: str | None = None, ip: str = "203.0.113.9", raw: bytes | None = None) -> tuple[int, str]:
    headers = {"Next-Action": IDS[name], "Origin": origin or BASE, "Accept": "text/x-component", "X-Forwarded-For": ip}
    if raw is not None:
        body, headers["Content-Type"] = raw, "text/plain;charset=UTF-8"
    elif form is not None:
        body, headers["Content-Type"] = form_body(form)
    else:
        body, headers["Content-Type"] = json.dumps(args_ or []).encode(), "text/plain;charset=UTF-8"
    try:
        r = urllib.request.urlopen(urllib.request.Request(BASE + "/", data=body, headers=headers), timeout=60)
        return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""


def check(label: str, ok: bool, detail: str = "") -> None:
    results.append((label, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{f'  ({detail})' if detail else ''}")


print("Owner-only functions, called while logged out")
for name, kw in [
    ("deleteCarAction", {"form": {"id": "1"}}),
    ("recheckPriceAction", {"form": {"id": "1"}}),
    ("saveProofAction", {"args_": [1, "[]"]}),
    ("searchAction", {"form": {"make": "Toyota", "model": "Camry", "zip": "08540"}}),
    ("startEnrollAction", {"args_": []}),
]:
    if name in IDS:
        status, text = call(name, **kw)
        refused = status >= 400 or '"ok":false' in text or ('"status":"error"' in text and "log in" in text.lower())
        check(f"{name} refuses", refused, f"HTTP {status}")

print("Paid lookup without a real 'I'm human' pass")
status, text = call("priceCheckAction", form={"vin": "2T2BZMCA2GC041915", "zip": "08540"})
check("no token refused", '"done"' not in text, f"HTTP {status}")
status, text = call("priceCheckAction", form={"vin": "2T2BZMCA2GC041915", "zip": "08540", "cf-turnstile-response": "fake.token"})
check("fake token refused", '"done"' not in text, f"HTTP {status}")

print("Forged and malformed requests")
status, _ = call("analyzeAction", form={"listing": "2T2BZMCA2GC041915"}, origin="https://evil.example", ip="203.0.113.20")
check("cross-site (CSRF) request rejected", status >= 400, f"HTTP {status}")
status, _ = call("analyzeAction", form={"listing": "B" * 3_000_000}, ip="203.0.113.21")
check("3 MB body rejected", status >= 400, f"HTTP {status}")
status, _ = call("analyzeAction", raw=b"{{{not json", ip="203.0.113.22")
check("malformed body rejected", status >= 400, f"HTTP {status}")
status, text = call("analyzeAction", form={"listing": "A" * 25_000}, ip="203.0.113.23")
check("over-long listing refused", "too long" in text.lower(), f"HTTP {status}")
status, text = call("decodeVinAction", args_=[{"$$typeof": "evil"}], ip="203.0.113.24")
check("wrong-type input refused", '"ok":true' not in text, f"HTTP {status}")
xss = '2017 Honda Accord <script>alert(1)</script> <img src=x onerror=alert(2)> $9,000 VIN 1HGCR2F8XHA000123 \'; DROP TABLE checked_cars; --'
status, text = call("analyzeAction", form={"listing": xss}, ip="203.0.113.25")
check("script and SQL text treated as data", status == 200 and '"done"' in text, f"HTTP {status}")

print("Limits under simultaneous requests (one visitor)")


def burst(n: int, fn) -> collections.Counter:
    with cf.ThreadPoolExecutor(n) as ex:
        return collections.Counter(ex.map(lambda i: fn(i), range(n)))


c = burst(30, lambda i: outcome(call("analyzeAction", form={"listing": "2T2BZMCA2GC041915"}, ip="203.0.113.30")[1]))
check("checks: 30 at once, at most 5 go through", c["done"] <= 5 and c["limited"] >= 25, dict(c).__repr__())
c = burst(20, lambda i: outcome(call("signInAction", form={"email": "attacker@example.com", "password": f"guess{i}Password!"}, ip="203.0.113.31")[1]))
check("logins: 20 at once, at most 5 tries", c["limited"] >= 15, dict(c).__repr__())
if "decodeVinAction" in IDS:
    c = burst(40, lambda i: outcome(call("decodeVinAction", args_=["2T2BZMCA2GC041915"], ip="203.0.113.32")[1]))
    check("VIN decodes: 40 at once, at most 20", c["done"] <= 20, dict(c).__repr__())

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)} of {len(results)} passed")
raise SystemExit(1 if failed else 0)
