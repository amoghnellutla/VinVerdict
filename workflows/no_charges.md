# Never get charged: account checklist

**Objective:** make sure none of VinVerdict's services can ever charge Amogh's card.
- The code side is enforced and tested:
  - `quotaBlock` fails closed and stops before 95% of the free quotas;
  - the AI client calls only `FREE_MODELS`.
- The steps below cover what the code can't see: each account's billing settings.
- Go through them once, and again after changing any plan.

| Service | Safe setting | How to check |
| --- | --- | --- |
| **Google Gemini** | The key's Google Cloud project has **no billing account**. With billing on, the same calls would be charged. | 1. Open https://aistudio.google.com/apikey. 2. Look at your key's **Plan** column: it must say **Free** (not "Tier 1"/"Paid"). 3. If unsure, open https://console.cloud.google.com/billing/projects and check the project shows **Billing is disabled**. Never click "Set up billing" or "Upgrade". |
| **Z.ai (GLM)** | **No balance and no card.** The free Flash models cost nothing; paid models need a balance. | 1. Open https://z.ai and go to **Billing** / **Balance**. 2. Balance should be **0**, with no saved card. 3. Never top up. |
| **Groq** | **Free plan** (no card). The Free plan can't bill; extra requests just get a "rate limited" answer. | 1. Open https://console.groq.com/settings/billing. 2. It should say **Free** with no payment method. 3. Never upgrade to Developer. |
| **MarketCheck** | Free plan, **no card**. | Account page → plan says free; no payment method saved. |
| **Auto.dev** | Free plan, **no card**. | Dashboard → billing: free plan; no payment method. |
| **Vercel** | **Hobby** plan. It pauses at its limits instead of billing. | https://vercel.com/account/billing: plan **Hobby**, no paid add-ons. |
| **Supabase** | **Free** plan. | Organization → **Billing**: plan **Free**. |
| **Cloudflare Turnstile** | Free. | Nothing to do: Turnstile has no paid usage. |

## If a service asks for a card
Stop. Don't add one. VinVerdict is designed to run entirely on free tiers. When a free limit is reached it shows "used up for today/this month" and waits for the reset; it never upgrades.
