"""Accessibility audit (WCAG 2.2 A/AA rules of axe-core) of every public page and the busy
result states, on a computer and a phone, against a local production build.

Usage: python security-tests/accessibility.py [--base http://localhost:3100]
Passes when axe reports no violations anywhere.
"""

from __future__ import annotations

import urllib.request

from playwright.sync_api import sync_playwright

from common import parse_args

args = parse_args(__doc__ or "")
AXE_URL = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"
AXE = urllib.request.urlopen(AXE_URL, timeout=30).read().decode("utf-8")
RUN = "async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } })).violations.map(v => `${v.impact} ${v.id} x${v.nodes.length}: ${v.help}`)"
failures = 0


def audit(page, label: str) -> None:
    global failures
    # Measure from the top: mid-scroll, the sticky section nav overlaps whatever is under it,
    # which axe's target-size rule would count against those controls.
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    page.add_script_tag(content=AXE)
    found = page.evaluate(RUN)
    failures += len(found)
    print(f"  {'PASS' if not found else 'FAIL'}  {label}" + "".join(f"\n        {v}" for v in found))


def open_example(page, title: str) -> None:
    page.goto(args.base + "/")
    page.wait_for_load_state("networkidle")
    page.get_by_text(title).first.click()
    page.wait_for_selector("#verdict-title")
    page.wait_for_timeout(700)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for name, opts in [("computer", {"viewport": {"width": 1280, "height": 900}}), ("phone", {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True})]:
        print(f"On a {name}")
        page = browser.new_context(bypass_csp=True, **opts).new_page()
        for path in ["/", "/mine", "/accuracy", "/scam-signs", "/shortlist", "/why", "/security", "/login", "/cars", "/cars?q=range+rover", "/cars/toyota", "/cars/land-rover/range-rover", "/cars/mazda/mx-5-miata"]:
            page.goto(args.base + path)
            page.wait_for_load_state("networkidle")
            audit(page, path)
        for example in ["2016 Lexus RX 350, VIN only", "2019 Honda Civic for $4,500", "2021 Toyota Camry, 183k miles"]:
            open_example(page, example)
            page.get_by_role("button", name="Save to My list").click()
            for s in page.locator("summary").all()[:6]:
                try:
                    s.click(timeout=1000)
                except Exception:  # noqa: BLE001 - a hidden summary is fine to skip
                    pass
            audit(page, f"result: {example} (details opened)")
        page.goto(args.base + "/mine")
        page.wait_for_load_state("networkidle")
        for box in page.get_by_role("checkbox").all()[:3]:
            box.check()
        audit(page, "/mine comparing saved cars")
    browser.close()

print(f"\n{'No accessibility violations' if not failures else f'{failures} violation types'}")
raise SystemExit(1 if failures else 0)
