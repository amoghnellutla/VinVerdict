"""Probe the free AI services AI mode uses (GLM by Z.ai, Gemini, Groq).

Free calls only: one tiny text request (JSON output) and, where the provider has
a vision model, one tiny image request per provider. Checks that the endpoint,
the model ids in src/lib/ai/providers.ts and JSON output all work, and prints the
rate-limit headers each one sends back. Keys come from .env.local / .env
(ZAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY); a provider without a key is skipped.

Usage:
  .venv\\Scripts\\python -I tools/probe_ai.py

Raw replies are saved to .tmp/ (keys never printed). See workflows/ai_mode.md.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _probe_common import ROOT, save_raw  # noqa: E402

load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")

PROVIDERS_TS = (ROOT / "src" / "lib" / "ai" / "providers.ts").read_text(encoding="utf-8")

def red_png(size: int = 32) -> str:
    """A small solid-red PNG as a data URL, built here so it's always valid."""
    import base64
    import struct
    import zlib

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    row = b"\x00" + b"\xff\x00\x00" * size
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(row * size)) + chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(png).decode()


def providers() -> list[dict]:
    """Read id, url, keyEnv, text and vision from providers.ts, so the probe tests what the app uses."""
    out = []
    for block in re.findall(r"\{\s*id: \"(\w+)\",(.*?)\n  \}", PROVIDERS_TS, re.S):
        pid, body = block
        get = lambda k: (re.search(rf'{k}: "([^"]+)"', body) or [None, None])[1]  # noqa: E731
        vision = re.search(r'vision: (null|"[^"]+")', body)
        out.append({
            "id": pid, "url": get("url"), "keyEnv": get("keyEnv"), "text": get("text"),
            "vision": None if not vision or vision.group(1) == "null" else vision.group(1).strip('"'),
        })
    return out


def call(p: dict, key: str, model: str, content) -> tuple[int, dict, dict]:
    resp = requests.post(
        p["url"],
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": 200, "response_format": {"type": "json_object"}},
        timeout=40,
    )
    try:
        body = resp.json()
    except ValueError:
        body = {"_non_json_body": resp.text[:1000]}
    limits = {k: v for k, v in resp.headers.items() if "ratelimit" in k.lower() or k.lower() == "retry-after"}
    return resp.status_code, body, limits


def answer(body: dict) -> str:
    try:
        return body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return ""


def main() -> int:
    failures = 0
    tried = 0
    for p in providers():
        key = os.getenv(p["keyEnv"] or "", "").strip()
        if not key:
            print(f"- {p['id']}: skipped ({p['keyEnv']} not set)")
            continue
        tried += 1
        status, body, limits = call(p, key, p["text"], 'Reply with JSON only: {"ok": true, "word": "camry"}')
        save_raw(f"ai_{p['id']}_text", body)
        text = answer(body)
        good = status == 200 and "camry" in text.lower()
        failures += not good
        print(f"- {p['id']} text  {p['text']}: HTTP {status} {'OK' if good else 'FAILED'}  {text[:80]!r}")
        if limits:
            print(f"    limits: {json.dumps(limits)}")
        if p["vision"]:
            status, body, _ = call(p, key, p["vision"], [
                {"type": "text", "text": 'What colour is this image? Reply with JSON only: {"colour": "..."}'},
                {"type": "image_url", "image_url": {"url": red_png()}},
            ])
            save_raw(f"ai_{p['id']}_vision", body)
            text = answer(body)
            good = status == 200 and "red" in text.lower()
            failures += not good
            print(f"- {p['id']} image {p['vision']}: HTTP {status} {'OK' if good else 'FAILED'}  {text[:80]!r}")
    if not tried:
        print("No AI keys set yet: add them to .env.local (workflows/ai_mode.md), then run this again.")
        return 1
    print("All good." if not failures else f"{failures} check(s) failed: see .tmp/ and workflows/ai_mode.md.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
