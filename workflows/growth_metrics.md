# Growth numbers: is anyone using VinVerdict?

**Objective:** once a week, write down how many people used VinVerdict and how often a free limit turned them away. These numbers decide when to revisit making money (docs/PLAN.md, change log 2026-11-13, "Grow first"). This takes about 5 minutes and costs nothing.

**Needs:** the migration `supabase/migrations/20261113_guest_stats.sql` has been run once (step 0). Counting starts from that day.

## 0. One-time setup: turn the counter on
1. Open https://supabase.com/dashboard and click the VinVerdict project.
2. In the left menu, click **SQL Editor**, then **New query**.
3. In VS Code, open `supabase/migrations/20261113_guest_stats.sql`. Select everything (Ctrl+A), then copy (Ctrl+C).
4. Paste it into the Supabase editor and click **Run**. You should see "Success. No rows returned".
5. On https://vinverdict.vercel.app, while logged out (a private window works), paste any VIN and click the check button. The example cars don't count, because they're recorded and never reach the server. Then run the query in step 1: the `check` row should show `uses` of 1 or more.

## 1. Weekly: VinVerdict's own numbers
1. Supabase → **SQL Editor** → **New query**.
2. Paste this query and click **Run** (it only reads; it changes nothing):

```sql
select kind,
       sum(uses)             as uses,
       sum(visitors)         as people_per_day_added_up,
       sum(refused_visitor)  as hit_their_daily_limit,
       sum(refused_everyone) as hit_everyones_daily_limit,
       sum(refused_month)    as hit_monthly_limit
from public.guest_stats_day
where day > (now() at time zone 'utc')::date - 7
group by kind
order by kind;
```

What each row means:

| `kind` | What it counts |
| --- | --- |
| `check` | Free checks by visitors (paste, VIN or screenshot; no paid data) |
| `price` | Live price and history checks by visitors (these use MarketCheck and Auto.dev quota) |
| `ai` | AI-mode actions by visitors |
| `ai_owner` | Your own AI-mode actions (ignore these for growth) |

- **people_per_day_added_up:** each person is counted once per day they used it. One person on 3 days counts as 3.
- **hit_their_daily_limit:** times someone wanted another check after using all of theirs today. **For `price`, this is the number that matters most:** people asking for more than the free tier gives.
- **hit_everyones_daily_limit / hit_monthly_limit:** times the shared free quota ran out for everyone.

Logged-in use (the owner) isn't in `check` or `price`.

## 2. Weekly: Google numbers
1. Open https://search.google.com/search-console and pick the vinverdict.vercel.app property.
2. Click **Performance** (left menu), then **Search results**.
3. At the top, set the date to **Last 7 days**.
4. Write down **Total clicks** and **Total impressions**. Impressions are how often VinVerdict appeared in Google results; clicks are how often someone opened it.
5. Click the **Queries** tab below the chart to see which searches find VinVerdict. Note any that surprise you: they show what people want.

## 3. Write it down
Add one row a week to this table (in this file, or a sheet you keep):

| Week ending | check uses | price uses | price: hit their limit | Google clicks | Google impressions |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## 4. When to revisit making money
Revisit the money rule (and docs/PLAN.md's paid-plan research) when **either** of these holds:
- `price` → **hit_their_daily_limit is 20 or more a week, for 4 weeks in a row.** People want more than the free tier can give.
- Google shows **1,000 or more clicks a month.**

Until then, the job is getting found, not charging.

## 5. Getting found (by hand)
1. **Google:** in Search Console, use **URL inspection** → **Request indexing** for `/`, `/scam-signs` and `/accuracy`. Google allows only a few requests a day; if it says "Quota exceeded", try again the next day.
2. **Where buyers ask for help:** places like r/UsedCars, r/whatcarshouldIbuy and local Facebook buy-and-sell groups, where people post a listing and ask "is this a scam?"
   - Read each community's rules first. Many limit self-promotion.
   - Answer the person's question in your own words first.
   - Share a VinVerdict link only when its result actually helps with that listing.
   - Never post the same message in many places.

## Notes
- Counting started when step 0 ran, so earlier weeks show nothing.
- The table holds daily totals only: no IPs and no visitor hashes. Supabase's browser key can't read it.
