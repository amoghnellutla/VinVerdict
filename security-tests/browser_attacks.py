"""Attacks through the real website in a browser (Playwright, headless Chromium).

1. Malicious "images" through every upload box: an SVG with script, a real PNG with HTML
   and a zip appended (polyglot), a JPEG with script in its comment, a program renamed
   .png, a 400-megapixel decompression bomb, and a screenshot whose text is attack code.
2. Script-injection text pasted into the listing box, the proof box and the seller-replies
   box, imported as a My list file, and put in page URLs.

Passes only if no script runs (no dialog), no injected element appears in the page, no
page error is thrown and the tab never crashes.

Usage: python security-tests/browser_attacks.py [--base http://localhost:3100]
Needs: pip install -r security-tests/requirements.txt && python -m playwright install chromium
"""

from __future__ import annotations

import json
import os
import struct
import tempfile
import zlib

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

from common import parse_args

args = parse_args(__doc__ or "")
BASE = args.base
INJECTED = """() => [...document.querySelectorAll('img[src="x"], [onerror], [onload], svg[onload], script:not([src]):not([nonce]), a[href^="javascript:"]:not([title^="Drag me"])')].map(e => e.outerHTML.slice(0, 80))"""
PAYLOAD = '2017 Honda Accord EX-L $9,000 98,000 miles <script>alert(1)</script> <img src=x onerror=alert(2)> "><svg/onload=alert(3)> javascript:alert(4) VIN 1HGCR2F8XHA000123'


def make_files(out: str) -> list[str]:
    img = Image.new("RGB", (1200, 300), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 34)
    except OSError:
        font = ImageFont.load_default()
    for i, line in enumerate(["2017 Honda Accord EX-L $9,000 98,000 miles", "<script>alert('ocr')</script> <img src=x onerror=alert(5)>"]):
        d.text((30, 50 + i * 100), line, fill="black", font=font)
    img.save(f"{out}/ocr_xss.png")
    png = open(f"{out}/ocr_xss.png", "rb").read()
    open(f"{out}/polyglot.png", "wb").write(png + b"<html><script>alert('polyglot')</script></html>PK\x03\x04" + os.urandom(64))
    img.save(f"{out}/exif_xss.jpg", "JPEG", comment=b"<img src=x onerror=alert('exif')>")
    open(f"{out}/script.svg", "w").write('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><text y="20">VIN</text></svg>')
    open(f"{out}/fake.png", "wb").write(b"MZ\x90\x00" + os.urandom(4096))
    w = h = 20000  # 400 megapixels from a ~50 KB file

    def chunk(t: bytes, b: bytes) -> bytes:
        return struct.pack(">I", len(b)) + t + b + struct.pack(">I", zlib.crc32(t + b) & 0xFFFFFFFF)

    z = zlib.compressobj(9)
    data = b"".join(z.compress(b"\x00" * (w // 8 + 1)) for _ in range(h)) + z.flush()
    open(f"{out}/bomb.png", "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 1, 0, 0, 0, 0)) + chunk(b"IDAT", data) + chunk(b"IEND", b""))
    return [f"{out}/{n}" for n in ["script.svg", "polyglot.png", "exif_xss.jpg", "fake.png", "ocr_xss.png", "bomb.png"]]


failures: list[str] = []


def watch(page, label: str):
    events: list[str] = []
    page.on("dialog", lambda d: (events.append(f"DIALOG {d.message}"), d.dismiss()))
    page.on("pageerror", lambda e: events.append(f"pageerror {str(e)[:80]}"))
    page.on("crash", lambda: events.append("CRASH"))

    def done(extra: str = "") -> None:
        bad = events + [f"injected {x}" for x in page.evaluate(INJECTED)]
        print(f"  {'PASS' if not bad else 'FAIL'}  {label}{f' ({extra})' if extra else ''}{'  ' + '; '.join(bad) if bad else ''}")
        if bad:
            failures.append(label)

    return done


def result_page(browser, ip: str):
    page = browser.new_page(extra_http_headers={"X-Forwarded-For": ip})
    page.goto(BASE + "/")
    page.wait_for_load_state("networkidle")
    page.fill("form#check-form textarea", "2017 Honda Accord EX-L 98,000 miles $9,000 private seller VIN 1HGCR2F8XHA000123")
    page.locator("form#check-form button[type=submit]").first.click()
    page.wait_for_selector("#verdict-title", timeout=30_000)
    return page


with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
    files = make_files(tmp)
    browser = p.chromium.launch(headless=True)

    print("Malicious files through 'Read screenshots', the proof box and the seller-replies box")
    for n, path in enumerate(files):
        name = os.path.basename(path)
        page = browser.new_page(extra_http_headers={"X-Forwarded-For": f"198.51.100.{n + 1}"})
        done = watch(page, f"{name} via Read screenshots")
        page.goto(BASE + "/")
        page.wait_for_load_state("networkidle")
        page.locator("form#check-form input[type=file]").set_input_files(path)
        page.wait_for_timeout(5000)
        done()
        page.close()
        page = result_page(browser, f"198.51.100.{n + 101}")
        done = watch(page, f"{name} via the proof box and the replies box")
        page.locator("#check-yourself input[type=file]").first.set_input_files(path)
        page.locator("label:has-text('Add chat screenshots') input").set_input_files(path)
        page.wait_for_timeout(6000)
        done()
        page.close()

    print("Injection text in every box, an imported list and URLs")
    page = result_page(browser, "198.51.100.200")
    done = watch(page, "listing, proof and replies boxes")
    page.locator("#check-yourself textarea").first.evaluate(
        "(el, t) => { const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }", PAYLOAD)
    page.get_by_label("The seller's messages").fill(PAYLOAD)
    page.wait_for_timeout(800)
    done()
    evil = os.path.join(tmp, "list.json")
    car = {"id": "ad-evil", "savedAt": "2026-11-10T00:00:00Z", "title": "<img src=x onerror=alert(1)>", "text": "javascript:alert(2)", "vin": "<script>",
           "price": 5000, "miles": 1, "level": "stop", "verdict": "<b>x</b>", "areas": [], "unknown": 1, "warnings": ["<svg onload=alert(3)>"], "note": "<script>alert(4)</script>"}
    open(evil, "w").write(json.dumps({"version": 1, "cars": [car]}))
    page.goto(BASE + "/mine")
    page.wait_for_load_state("networkidle")
    page.locator("label:has-text('Import a list') input").set_input_files(evil)
    page.wait_for_timeout(800)
    watch(page, "tampered My list import")()
    for url in ["/login?next=javascript:alert(1)", '/login?next="><script>alert(1)</script>', "/shortlist?make=<script>alert(1)</script>", "/mine#listing=<img src=x onerror=alert(1)>"]:
        page.goto(BASE + url)
        page.wait_for_load_state("networkidle")
        watch(page, f"URL {url[:45]}")()
    browser.close()

print(f"\n{'All passed' if not failures else f'{len(failures)} failed: ' + ', '.join(failures)}")
raise SystemExit(1 if failures else 0)
