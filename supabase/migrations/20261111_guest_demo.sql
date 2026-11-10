-- VinVerdict: public demo limits (run after 20261110_security_hardening.sql).
-- Supabase: Dashboard → SQL Editor → New query → paste → Run. Safe to run again.
--
-- Demo visitors have no account. The only thing their requests can do in the
-- database is call take_guest_allowance(), which adds 1 to a counter and
-- answers whether the visit is still within the limits. The limits are
-- written into the function, so a caller can't raise them, and the tables
-- can't be read or written directly by anyone but the function.
--
-- Privacy: a visitor is a salted one-way hash of their IP (made on the
-- server; the raw IP is never sent here). Per-visitor rows are deleted after
-- 2 days; only monthly totals (no visitor) are kept.

create table if not exists public.guest_usage (
  day      date not null,
  visitor  text not null check (visitor ~ '^[0-9a-f]{64}$'),
  kind     text not null check (kind in ('check', 'price')),
  count    integer not null default 0 check (count >= 0),
  primary key (day, visitor, kind)
);

create table if not exists public.guest_usage_month (
  month  text not null check (month ~ '^\d{4}-\d{2}$'),
  kind   text not null check (kind in ('check', 'price')),
  count  integer not null default 0 check (count >= 0),
  primary key (month, kind)
);

-- RLS on with no policies: nobody can select/insert/update/delete directly.
alter table public.guest_usage enable row level security;
alter table public.guest_usage_month enable row level security;
revoke all on public.guest_usage, public.guest_usage_month from anon, authenticated;

-- Returns 'ok', or why not: 'visitor' (this visitor's daily limit), 'global'
-- (everyone's daily limit), 'month' (monthly guest cap or the owner's quota
-- reserve), 'invalid'.
create or replace function public.take_guest_allowance(p_visitor text, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  today       date := (now() at time zone 'utc')::date;
  this_month  text := to_char(now() at time zone 'utc', 'YYYY-MM');
  per_visitor integer;
  per_day     integer;
  per_month   integer;
  used        integer;
begin
  if p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;

  -- The limits. Change them here (and in docs/PLAN.md), nowhere else.
  if p_kind = 'check' then        -- free checks (NHTSA only): generous
    per_visitor := 30;  per_day := 3000; per_month := null;
  elsif p_kind = 'price' then     -- live price checks: ~2 MarketCheck + 2 Auto.dev each
    per_visitor := 2;   per_day := 6;    per_month := 95;
  else
    return 'invalid';
  end if;

  -- One caller at a time per kind, so two requests can't both slip under a limit.
  perform pg_advisory_xact_lock(hashtext('vinverdict.guest.' || p_kind));

  -- Forget visitors after 2 days.
  delete from public.guest_usage where day < today - 1;

  select coalesce(sum(count), 0) into used from public.guest_usage where day = today and kind = p_kind;
  if used >= per_day then return 'global'; end if;

  if per_month is not null then
    select coalesce(max(count), 0) into used from public.guest_usage_month where month = this_month and kind = p_kind;
    if used >= per_month then return 'month'; end if;
    -- Owner's reserve: stop guest lookups once all MarketCheck use this month passes 300 of 500.
    select coalesce(sum(calls), 0) + coalesce(used, 0) * 2 into used
      from public.api_usage where month = this_month and provider = 'marketcheck';
    if used >= 300 then return 'month'; end if;
  end if;

  select coalesce(max(count), 0) into used from public.guest_usage where day = today and visitor = p_visitor and kind = p_kind;
  if used >= per_visitor then return 'visitor'; end if;

  insert into public.guest_usage (day, visitor, kind, count) values (today, p_visitor, p_kind, 1)
    on conflict (day, visitor, kind) do update set count = public.guest_usage.count + 1;
  insert into public.guest_usage_month (month, kind, count) values (this_month, p_kind, 1)
    on conflict (month, kind) do update set count = public.guest_usage_month.count + 1;
  return 'ok';
end;
$$;

revoke all on function public.take_guest_allowance(text, text) from public;
grant execute on function public.take_guest_allowance(text, text) to anon, authenticated;

-- This month's live guest price checks (a number only), so the owner's own
-- quota stop can count them.
create or replace function public.guest_month_usage()
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(max(count), 0)::integer from public.guest_usage_month
  where month = to_char(now() at time zone 'utc', 'YYYY-MM') and kind = 'price';
$$;

-- Supabase grants new functions to anon by default, so revoke it by name too.
revoke all on function public.guest_month_usage() from public, anon;
grant execute on function public.guest_month_usage() to authenticated;
