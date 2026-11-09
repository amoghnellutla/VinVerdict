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

## 1. GitHub: private repo

1. Sign in at https://github.com and click **New repository**.
2. Name it `vinverdict`, choose **Private**, and leave "Add a README" **unchecked** (the project already has one).
3. Click **Create repository**.

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
   - **anon / publishable** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe for the browser; row-level security protects the data)
   - **service_role / secret** key → `SUPABASE_SERVICE_ROLE_KEY` (**server-only**; it bypasses all security rules, so treat it like a password)
4. Open **Authentication → Sign In / Providers** and confirm **Email** is enabled.
5. Note: free projects pause after about a week without use. Resume with one click in the dashboard.

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



## Done? Checklist

- [ ] GitHub private repo `vinverdict` created
- [ ] Vercel account linked to GitHub
- [ ] Supabase project created; 3 values in `.env.local`
- [ ] MarketCheck key in `.env` + `.env.local`
- [ ] Auto.dev key in `.env` + `.env.local`
- [ ] Spottable tried; findings noted

