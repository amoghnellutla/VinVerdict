"""Shared helpers for the security tests.

The tests attack a *local production build* (npm run build && npx next start -p 3100).
They refuse any other host unless you pass --i-own-this-site, so they can't be pointed
at someone else's site by mistake. Never run the burst or load tests against production.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
CRLF = "\r\n"


def parse_args(description: str) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=description)
    p.add_argument("--base", default="http://localhost:3100", help="Site to test (default: local production build on port 3100)")
    p.add_argument("--i-own-this-site", action="store_true", help="Allow a host other than localhost (only your own deployment)")
    args = p.parse_args()
    host = urlparse(args.base).hostname or ""
    if host not in ("localhost", "127.0.0.1") and not args.i_own_this_site:
        sys.exit(f"Refusing to test {host}: these tests are for a local build. Pass --i-own-this-site only for your own deployment.")
    return args


def action_ids() -> dict[str, str]:
    """Server Action IDs of the current local build (they change with every build)."""
    manifest = ROOT / ".next" / "server" / "server-reference-manifest.json"
    if not manifest.exists():
        sys.exit("No local build found: run `npm run build` first.")
    data = json.loads(manifest.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for action_id, entry in data.get("node", {}).items():
        name = entry.get("exportedName")
        if name:
            out[name] = action_id
    return out


def form_body(fields: dict[str, str], boundary: str = "----VinVerdictSecurityTest") -> tuple[bytes, str]:
    """A Server Action form post, encoded exactly as the browser does (fields as _1_<name>, then the state)."""
    parts = [(f"_1_{k}", v) for k, v in fields.items()] + [("0", json.dumps([{"status": "idle"}, "$K1"]))]
    body = "".join(f'--{boundary}{CRLF}Content-Disposition: form-data; name="{k}"{CRLF}{CRLF}{v}{CRLF}' for k, v in parts)
    return (body + f"--{boundary}--{CRLF}").encode("utf-8"), f"multipart/form-data; boundary={boundary}"


def outcome(text: str) -> str:
    """A short label for a Server Action response."""
    low = text.lower()
    if "too many" in low or "slow down" in low:
        return "limited"
    if '"done"' in text or '"ok":true' in text:
        return "done"
    if "wrong" in low or "reach" in low:
        return "refused"
    return text[:60].replace("\n", " ")
