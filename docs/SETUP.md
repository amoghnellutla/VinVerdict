# VinVerdict — Setup guide (Phase 0)

This guide covers the free accounts VinVerdict needs and where each key goes. It takes about 30–45 minutes. Do the steps in order. Sign-up pages change over time, so if a button has a different name, look for the closest match.

**Golden rule for keys:** a key goes only into `.env.local` / `.env` on your computer, or into Vercel's Environment Variables screen. Never paste one into code, a doc, a chat, a screenshot or a GitHub issue. If a key leaks, regenerate it in that service's dashboard.

## 0. Create your local key files

In the `VinVerdict` folder:

```powershell
Copy-Item .env.example .env.local   # used by the website (npm run dev)
Copy-Item .env.example .env         # used by the Python scripts in tools/
```

Both files are gitignored. Fill them in as you go through the steps below.

## 1. GitHub repo

1. Sign in at https://github.com and click **New repository**.
2. Name it `vinverdict`, choose **Public** (or Private), and leave "Add a README" **unchecked** (the project already has one).
3. Click **Create repository**.
4. Connect your local copy and push:

```powershell
git remote add origin https://github.com/<your-username>/vinverdict.git
git push -u origin main
```

The repo becomes public at Phase 9, after the security review.

## 2. Vercel Hobby: hosting

1. Go to https://vercel.com/signup, choose **Hobby** and **Continue with GitHub**.
2. After the first push: **Add New… → Project**, import `vinverdict`, keep the defaults (Next.js is detected), and click **Deploy**.
3. Later (Phase 2b), add the same keys from `.env.local` under **Project → Settings → Environment Variables**.

## 3. Supabase Free: login and database

1. Go to https://supabase.com and sign in with GitHub.
2. Click **New project**. Name: `vinverdict`. Region: **East US** (closest to NJ). Create a strong database password and save it in a password manager.
3. When the project is ready, open **Project Settings → API** (or **API Keys**) and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **publishable** key (`sb_publishable_…`, called "anon" on older projects) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public by design; VinVerdict still only uses it on the server)
   - **secret / service_role** key → `SUPABASE_SERVICE_ROLE_KEY`: **not needed yet**. It bypasses all security rules, so leave it out until a phase needs it, and then put it in `.env.local` yourself.
4. Open **Authentication → Sign In / Providers**: confirm **Email** is enabled, then turn **off** "Allow new users to sign up". VinVerdict has no sign-up page, and this stops anyone else making an account through Supabase directly.
5. Open **Authentication → Users → Add user → Create new user**: your email and a strong password, with **Auto Confirm User** ticked. This is the account you log in with. Forgot the password? Reset it on the same screen.
6. Note: free projects pause after about a week without use. Resume with one click in the dashboard.

## 4. MarketCheck Free: listing API (main)

1. Go to https://www.marketcheck.com/apis/pricing and sign up for the **Free** plan (500 calls/month, 100-mile radius).
2. Find your API key in the developer dashboard and put it in `.env` and `.env.local` as `MARKETCHECK_API_KEY`.
3. Don't test calls in their console yet: the Phase 1 probe script uses a fixed, small budget.

## 5. Auto.dev Free: listing API (backup)

1. Go to https://auto.dev and sign up (free plan: 1,000 calls/month, no card).
2. Copy your API key into `.env` and `.env.local` as `AUTODEV_API_KEY`.

## 6. Spottable: what already exists

1. Install the free Spottable extension (https://spottable-lp.pages.dev/marketplace-for/used-cars).
2. Try it on 2–3 Facebook Marketplace car listings.
3. Note what it shows (price rating? scam flags? VIN checks?) and what it misses. Add a line under **PLAN.md §13 → To verify in Phase 1**, so the plan can skip anything it already does well.

## 7. Database tables and security rules (one time, 2 minutes)

Saved cars, Compare, price-drop history and the usage meter need three SQL files, run **in this order**:

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste all of `supabase/migrations/20261109_checked_cars.sql` → **Run** ("Success. No rows returned").
3. New query: `supabase/migrations/20261109_api_usage.sql` → **Run**.
4. New query: `supabase/migrations/20261110_security_hardening.sql` → **Run**. This makes the database itself refuse any session that hasn't passed two-step login, ties price history to your own cars, removes logged-out access and adds the atomic usage counter.

Every table uses row-level security: each row belongs to your login, and the app reads them with your session only (never the service-role key). Running a file again is safe.

## 8. Lock down Supabase login settings (one time)

In Supabase → **Authentication**:

1. **Sign In / Providers → Email**: **Allow new users to sign up = off** (VinVerdict has one account, yours). Keep "Confirm email" on.
2. **Multi-Factor**: make sure **TOTP (App Authenticator)** is enabled (it is by default).
3. **Policies / Passwords** (if shown): minimum length 12 or more. Use a long, unique password for your account (a password manager's generated one).
4. **Rate Limits**: leave the defaults (they limit sign-in and code attempts on Supabase's side too).

## 9. Two-step login (first login, 1 minute)

The first time you log in (locally or online), VinVerdict asks you to set up an authenticator app:

1. Install Google Authenticator, Microsoft Authenticator, 1Password or similar on your phone.
2. Press **Show my QR code**, scan it, and type the 6-digit code.

From then on every login needs your password **and** the current code from the app. Without the code, a stolen password opens nothing: not the pages, not the actions, not the database.

**Lost your phone?** Supabase dashboard → **Authentication → Users** → your user → remove its MFA factor. Next login sets up a new one. (The dashboard has its own login: give it a strong password and turn on its 2FA too, under your Supabase account settings.)

## 10. Put it online (Vercel) and use it on your phone

1. The code is on GitHub (private repo `vinverdict`). In Vercel: **Add New… → Project**, import `vinverdict`, keep the defaults (the build copies the screenshot reader into `public/ocr` by itself).
2. Before the first deploy, open **Settings → Environment Variables** and add, for **Production** (and Preview if you use it): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `MARKETCHECK_API_KEY`, `AUTODEV_API_KEY`. Mark the two API keys **Sensitive**. Do **not** add `SUPABASE_SERVICE_ROLE_KEY`: the website doesn't use it, so it shouldn't exist where it could leak.
3. Deploy. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your Vercel address (e.g. `https://vinverdict.vercel.app`).
4. Vercel → **Settings → Deployment Protection**: keep **Vercel Authentication** on for preview deployments, so only you can open preview builds.
5. Vercel → **Firewall**: keep the default protections on. If you ever see a flood of requests, turn on **Attack Challenge Mode** there.
6. On an Android phone, open the site in Chrome → menu → **Add to Home screen** (or **Install app**). VinVerdict then appears in the **Share** menu. On an iPhone, Add to Home Screen works too; use **Read screenshots**.

## 11. Public demo: limits and the "I'm human" check (one time, 5 minutes)

Visitors can use VinVerdict without an account (nothing they paste is saved). Two things make their live price checks safe:

1. **Database limits.** Supabase → SQL Editor → New query → paste all of `supabase/migrations/20261111_guest_demo.sql` → **Run** ("Success. No rows returned"). Until this runs, visitors can't run live price checks at all (they still get the free checker and the examples).
2. **Cloudflare Turnstile** (free):
   1. Sign up at https://dash.cloudflare.com/sign-up (free plan; no domain needed).
   2. In the left menu open **Turnstile** → **Add widget**.
   3. Widget name: `VinVerdict`. **Hostnames:** add `vinverdict.vercel.app` and `localhost`. **Widget mode: Managed**. Leave pre-clearance off. **Create**.
   4. Copy the **Site key** and the **Secret key** into `.env.local` as `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` and `TURNSTILE_SECRET_KEY=`. Add both to Vercel (Settings → Environment Variables; mark the secret **Sensitive**) and redeploy.

The limits live in that SQL file and nowhere else: 2 live lookups per visitor per day, 6 for all visitors together per day, 95 a month, and none once MarketCheck use this month passes 300 of 500 (your reserve). Free checks: 30 per visitor per day.

## Done? Checklist

- [ ] GitHub repo `vinverdict` created
- [ ] Vercel account linked to GitHub
- [ ] Supabase project created; URL + publishable key in `.env.local`; sign-ups off; your user added
- [ ] MarketCheck key in `.env` + `.env.local`
- [ ] Auto.dev key in `.env` + `.env.local`
- [ ] Spottable tried; findings noted
- [ ] Three SQL files run (step 7), sign-ups off and TOTP on (step 8)
- [ ] Two-step login set up (step 9)
- [ ] Deployed, env vars set without the service-role key, Site URL updated (step 10)
- [ ] Demo limits SQL run and Turnstile keys added (step 11)

