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

## Threat model

| What's at risk | Who'd attack it | How | What stops it |
| --- | --- | --- | --- |
| **Visitors' browsers** | Anyone who can get text in front of the page: a scam listing, a crafted link, a tampered My list file | Script injection through pasted listings, proof text, seller messages, chat screenshots, imported files, URLs | Everything is rendered as text by React (no `dangerouslySetInnerHTML`); a strict per-request nonce CSP; imports validated field by field; links into the checker only fill the box, nothing runs on its own |
| **Visitors' devices** | Someone sharing a booby-trapped image | SVG with script, polyglots, decompression bombs | Raster images only; size read from the header and anything over 50 MP refused before decoding; images only ever shown as `<img src="blob:">` |
| **Visitors' privacy** | The site itself, or anyone who breaches it | Collecting what people paste | Nothing pasted is stored; screenshots, chat messages and My list stay on the device; IPs only as a salted one-way hash, kept 2 days |
| **The owner's saved cars** | Someone guessing or stealing the owner's password; someone calling the database directly | Credential stuffing, brute force, forged requests, skipping the website | No sign-up; password plus TOTP; login rate limit; every server action re-checks the session; row-level security that requires the second step; Origin checks on every action |
| **The free API quota** | Bots and scripts | Draining MarketCheck and Auto.dev lookups | Cloudflare Turnstile (checked server-side) on paid lookups; per-visitor, daily and monthly limits enforced in the database; a monthly reserve the public can't touch; results cached a day |
| **The server** | Scripts | Server-side request forgery, oversized bodies, parser freezes, floods | Pasted links are never fetched; body size limit; inputs capped at 20,000 characters; parser tested with hostile 20,000-character inputs (worst 125 ms); Vercel's firewall |
| **Keys and secrets** | Anyone reading the code or the page | Finding keys in the browser bundle, the repo or its history | Keys only in server environment variables; none in the bundle (searched); repo history scanned before going public; GitHub secret scanning with push protection |

## OWASP ASVS 5.0, chapter by chapter

A self-assessment against the [Application Security Verification Standard 5.0](https://github.com/OWASP/ASVS/tree/master/5.0/en), not a certification.

| Chapter | How VinVerdict handles it |
| --- | --- |
| V1 Encoding and Sanitization | Output is encoded by React; no raw HTML anywhere; untrusted text never reaches a URL scheme, script or style context |
| V2 Validation and Business Logic | Every server action validates type, length and format; limits and quota rules live in one database function with hard-coded caps |
| V3 Web Frontend Security | Nonce-based CSP with `strict-dynamic`, `frame-ancestors`/`X-Frame-Options: DENY`, `nosniff`, HSTS with preload, `same-origin` COOP/CORP, a locked-down Permissions-Policy; outbound links use `rel="noopener noreferrer"` |
| V4 API and Web Service | Server Actions reject foreign origins and oversized or malformed bodies; owner actions re-check the two-step session on every call |
| V5 File Handling | Files never reach the server; on the device: type allow-list (raster images), 25 MB size cap, pixel cap read from the header, at most 6 per batch; imported lists capped at 1 MB and validated |
| V6 Authentication | One owner account, no sign-up; password plus TOTP; uniform error messages; login rate limit; open-redirect-proof `next` parameter |
| V7 Session Management | Supabase sessions in `httpOnly`, `secure`, `SameSite=Lax` cookies; the second step is required by both the app and the database |
| V8 Authorization | Row-level security on every table, each row tied to its owner, and the second step required by the database itself |
| V9 Self-contained Tokens, V10 OAuth and OIDC | Handled by Supabase Auth (no custom tokens, no OAuth providers) |
| V11 Cryptography | No custom cryptography; visitor IPs hashed with HMAC-SHA-256 and a server-only salt |
| V12 Secure Communication | HTTPS only (HSTS preload); outbound API calls over HTTPS |
| V13 Configuration | Secrets only in environment variables; `npm audit` on every CI run (shipped dependencies: 0 known vulnerabilities); Dependabot; CodeQL |
| V14 Data Protection | Collects almost nothing (see the threat model); visitor rows deleted after 2 days |
| V15 Secure Coding and Architecture | Typed throughout; deterministic rules; the security tests in `security-tests/` and 300+ unit tests on every change |
| V16 Security Logging and Error Handling | Errors shown to users without internals. **Gap:** no central security-event log or alerting yet, deliberately minimal for privacy and cost |
| V17 WebRTC | Not used |

**Known gaps, stated plainly:**
- **Per-minute rate limits** are kept in memory per server instance, so a determined attacker can get a few more per minute when Vercel runs several instances. The daily limits that protect the API quota are in the database and hold globally.
- **The CSP allows inline styles** (`style-src 'unsafe-inline'`), which Next.js and the app's dynamic styles need. Scripts are strictly nonce-only.
- **Security logging and alerting:** none yet (V16).

## Tested

The site was tested as an attacker would (November 2026). The scripts are in [`security-tests/`](security-tests/) and can be rerun against a local build:
- script injection through listings, proof text and URLs;
- malicious images: SVG with script, polyglot PNG, script in JPEG comments, a program renamed .png, and a decompression bomb;
- cross-site request forgery;
- oversized and malformed requests;
- login brute force;
- simultaneous request bursts against the rate limits;
- hostile inputs built to freeze the text parser (ReDoS);
- page load (700 requests, 50 at a time).

Results and fixes are in [docs/PLAN.md](docs/PLAN.md) (change log, 2026-11-10).
