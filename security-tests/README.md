# Security tests

Attacks VinVerdict the way a malicious visitor or script would, against a **local production build**. Each script exits non-zero on any failure. They refuse any host but localhost unless you pass `--i-own-this-site`, and the burst and load tests must never be pointed at the live site.

```bash
npm run build && npx next start -p 3100          # in one terminal
pip install -r security-tests/requirements.txt    # once
python -m playwright install chromium             # once
python security-tests/server_actions.py          # server functions, limits, CSRF, input
python security-tests/browser_attacks.py         # malicious files and injection, in a real browser
python security-tests/load.py                    # 700 page requests, 50 at a time
python security-tests/accessibility.py           # WCAG 2.2 A/AA (axe-core) on every page and result state
```

| Script | What it tries | Passes when |
| --- | --- | --- |
| `server_actions.py` | Owner-only functions while logged out; the paid price lookup with no or a fake "I'm human" token; a request from another site (CSRF); a 3 MB body; a malformed body; a 25,000-character listing; wrong-type input; script and SQL text; 30 checks, 20 logins and 40 VIN decodes fired at the same instant | Every owner function refuses; the lookup refuses; forged, huge and malformed requests are rejected; injection is treated as text; at most 5 checks, 5 logins and 20 decodes get through |
| `browser_attacks.py` | An SVG with script, a polyglot PNG (HTML and a zip after the image), a JPEG with script in its comment, a program renamed `.png`, a 400-megapixel decompression bomb (50 KB file), a screenshot whose text is attack code, through "Read screenshots", the proof box and the seller-replies box; injection text in the listing, proof and replies boxes; a tampered My list import; attack URLs | No script runs (no dialog), no injected element appears, no page error, the tab never crashes |
| `load.py` | 700 page requests, 50 at a time | Every request answers 200 (or 307 to the login for owner pages) |
| `accessibility.py` | axe-core's WCAG 2.2 A/AA rules on every public page, three results with their details opened, and My list comparing cars, on a computer and a phone | No violations |

Server Action IDs change with every build; the scripts read them from `.next/server/server-reference-manifest.json`. Each test visitor uses its own `X-Forwarded-For` address so the per-visitor limits don't interfere. That only works locally: on Vercel the address comes from Vercel's own header, which a visitor can't set (tested against the live site, November 2026).

## Results (November 2026)

All passed: 16 of 16 server checks, 18 of 18 browser attacks, and 700 requests in 5.8 s (median 405 ms, p95 546 ms) with no errors. Two fixes came out of the first run, before this kit existed:
- SVGs are no longer accepted as screenshots.
- Images over 50 megapixels are refused from their header before decoding. The bomb didn't crash a desktop tab, but decoding it takes about 1.6 GB, which can crash a phone.
