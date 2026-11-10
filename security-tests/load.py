"""Page load test: many page requests at once against a local production build.

Usage: python security-tests/load.py [--base http://localhost:3100]
Never point this at a site you don't run locally.
"""

from __future__ import annotations

import collections
import concurrent.futures as cf
import statistics
import time
import urllib.error
import urllib.request

from common import parse_args

args = parse_args(__doc__ or "")
PATHS = ["/", "/mine", "/shortlist", "/why", "/security", "/accuracy", "/login", "/checked"]
N, CONCURRENCY = 700, 50


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # owner pages answer 307 → /login; count it, don't follow
        return None


opener = urllib.request.build_opener(NoRedirect)


def hit(i: int) -> tuple[str, int | str, float]:
    path = PATHS[i % len(PATHS)]
    t = time.time()
    try:
        code: int | str = opener.open(urllib.request.Request(args.base + path, headers={"User-Agent": "vinverdict-load-test"}), timeout=30).status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception as e:  # noqa: BLE001 - report any failure kind
        code = type(e).__name__
    return path, code, time.time() - t


t0 = time.time()
with cf.ThreadPoolExecutor(CONCURRENCY) as ex:
    rows = list(ex.map(hit, range(N)))
elapsed = time.time() - t0
lat = sorted(r[2] for r in rows)
codes = collections.Counter((p, c) for p, c, _ in rows)
print(f"{N} requests, {CONCURRENCY} at a time: {elapsed:.1f}s ({N / elapsed:.0f}/s), median {statistics.median(lat) * 1000:.0f} ms, p95 {lat[int(len(lat) * 0.95)] * 1000:.0f} ms")
for (path, code), n in sorted(codes.items(), key=str):
    print(f"  {path:12} {code}  x{n}")
errors = [c for (_, c) in codes if not (isinstance(c, int) and c in (200, 307))]
raise SystemExit(1 if errors else 0)
