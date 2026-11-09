-- VinVerdict: security hardening (run after the two 20261109 files).
-- Supabase: Dashboard → SQL Editor → New query → paste → Run. Safe to run again.
--
-- 1. Two-step login inside the database. The website already refuses a
--    password-only session, but Supabase's API can be called directly with a
--    session token. These RESTRICTIVE policies are ANDed with the existing
--    "own rows" ones, so every read and write also needs a session that has
--    passed the authenticator step (JWT claim aal = 'aal2').
-- 2. price_history rows may only point at the caller's own cars.
-- 3. Logged-out (anon) requests get no table access at all.
-- 4. add_api_usage(): one atomic "add N calls" for the usage meter, so two
--    checks at the same moment can't under-count the free quota.

-- 1. Two-step login required for every row.
drop policy if exists "checked_cars: two-step login" on public.checked_cars;
create policy "checked_cars: two-step login" on public.checked_cars
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "price_history: two-step login" on public.price_history;
create policy "price_history: two-step login" on public.price_history
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "api_usage: two-step login" on public.api_usage;
create policy "api_usage: two-step login" on public.api_usage
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- 2. A price point must belong to one of your own cars.
drop policy if exists "price_history: own cars only" on public.price_history;
create policy "price_history: own cars only" on public.price_history
  as restrictive for all to authenticated
  using (exists (select 1 from public.checked_cars c where c.id = car_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.checked_cars c where c.id = car_id and c.user_id = (select auth.uid())));

-- 3. No access without a login (RLS already returns nothing; this removes the grants too).
revoke all on public.checked_cars, public.price_history, public.api_usage from anon;

-- 4. Atomic usage counter. SECURITY INVOKER: runs as the caller, so the
--    policies above still apply (own row, two-step login).
create or replace function public.add_api_usage(p_provider text, p_calls integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  -- One check spends at most a handful of calls; anything else is ignored.
  insert into public.api_usage (user_id, month, provider, calls)
  select (select auth.uid()), to_char(now() at time zone 'utc', 'YYYY-MM'), p_provider, p_calls
  where p_calls between 1 and 20
  on conflict (user_id, month, provider)
  do update set calls = public.api_usage.calls + excluded.calls;
$$;

revoke all on function public.add_api_usage(text, integer) from public, anon;
grant execute on function public.add_api_usage(text, integer) to authenticated;
