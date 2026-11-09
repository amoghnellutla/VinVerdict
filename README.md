# VinVerdict

Paste a used-car listing, get a verdict: deal score, scam check, recalls, crash stars and out-the-door cost, all from free data and with a link to every source.

Status: early build (Phase 0 + 2a). See [docs/PLAN.md](docs/PLAN.md) for scope and phases.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

## Docs

- [docs/PLAN.md](docs/PLAN.md): goals, rules, features, build phases
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the app is put together
- [docs/SETUP.md](docs/SETUP.md): accounts and API keys

Stack: Next.js (TypeScript, Tailwind) on Vercel, Supabase, NHTSA and FuelEconomy.gov data, MarketCheck and Auto.dev listing APIs.
