# Security

## Reporting a problem

Please report security problems privately: **[Report a vulnerability](https://github.com/amoghnellutla/VinVerdict/security/advisories/new)** (GitHub's private advisory form). Please don't open a public issue for it.

In scope: the live site at https://vinverdict.vercel.app and this code. Please don't run load tests against the live site, try to drain the demo's API quota, or access other people's data. Testing against your own local copy is always fine.

## How the site is protected

A plain-English tour is on the site: **[How it's secured](https://vinverdict.vercel.app/security)**. In short:

- **Keys stay on the server.** Listing-API and database keys live only in server environment variables; the browser bundle has none (verified by searching the built output).
- **Strict Content-Security-Policy** with a fresh nonce per request, `X-Frame-Options: DENY`, HSTS, `nosniff` and a locked-down Permissions-Policy.
- **Every server action checks input and, for owner features, the two-step login** (Supabase Auth with TOTP; database rows protected by row-level security that requires the second step).
- **Pasted text is only ever data.** It's never rendered as HTML, and pasted links are never fetched by the server (no SSRF).
- **Screenshots are read on the visitor's device** (tesseract.js, self-hosted), never uploaded. Only raster images are accepted, and anything over 50 megapixels is refused before decoding.
- **Abuse limits**: Cloudflare Turnstile on the paid lookups, per-visitor and global daily limits enforced in the database, per-minute limits on every action, and a monthly reserve so visitors can't use up the owner's API quota.

## Tested

The site was tested as an attacker would (November 2026):
- script injection through listings, proof text and URLs;
- malicious images: SVG with script, polyglot PNG, script in JPEG comments, a program renamed .png, and a decompression bomb;
- cross-site request forgery;
- oversized and malformed requests;
- login brute force;
- simultaneous request bursts against the rate limits;
- hostile inputs built to freeze the text parser (ReDoS);
- page load (700 requests, 50 at a time).

Results and fixes are in [docs/PLAN.md](docs/PLAN.md) (change log, 2026-11-10).
