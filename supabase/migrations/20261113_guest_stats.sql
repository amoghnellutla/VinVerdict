-- Daily usage numbers (docs/PLAN.md, "Grow first"): how many people use the
-- public checker, and how often a limit turns someone away. That second number
-- is the evidence for (or against) ever offering more checks.
--
-- Run once in the Supabase SQL editor, after 20261112_ai_allowance.sql.
-- Re-running is safe. The weekly read is in workflows/growth_metrics.md.
--
-- Privacy: totals per day and kind only, with no visitor hash or IP, so these
-- rows can be kept. RLS on with no policies, like the other guest tables: only
-- the SQL editor (the database owner) can read them.

create table if not exists public.guest_stats_day (
  day                  date not null,
  kind                 text not null check (kind in ('check', 'price', 'ai', 'ai_owner')),
  uses                 integer not null default 0 check (uses >= 0),
  visitors             integer not null default 0 check (visitors >= 0),
  refused_visitor      integer not null default 0 check (refused_visitor >= 0),
  refused_everyone     integer not null default 0 check (refused_everyone >= 0),
  refused_month        integer not null default 0 check (refused_month >= 0),
  primary key (day, kind)
);

alter table public.guest_stats_day enable row level security;
revoke all on public.guest_stats_day from anon, authenticated;

-- Adds one to today's row. p_result is take_guest_allowance's answer;
-- p_first is true when this is the visitor's first use of the kind today.
create or replace function public.note_guest_stat(p_day date, p_kind text, p_result text, p_first boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.guest_stats_day (day, kind, uses, visitors, refused_visitor, refused_everyone, refused_month)
  values (p_day, p_kind,
          (p_result = 'ok')::int,
          (p_result = 'ok' and p_first)::int,
          (p_result = 'visitor')::int,
          (p_result = 'global')::int,
          (p_result = 'month')::int)
  on conflict (day, kind) do update set
    uses             = public.guest_stats_day.uses             + excluded.uses,
    visitors         = public.guest_stats_day.visitors         + excluded.visitors,
    refused_visitor  = public.guest_stats_day.refused_visitor  + excluded.refused_visitor,
    refused_everyone = public.guest_stats_day.refused_everyone + excluded.refused_everyone,
    refused_month    = public.guest_stats_day.refused_month    + excluded.refused_month;
$$;

-- Only take_guest_allowance (running as the owner) may call it.
revoke all on function public.note_guest_stat(date, text, text, boolean) from public, anon, authenticated;

-- Same limits and order as 20261112_ai_allowance.sql; each answer is now also counted.
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
  elsif p_kind = 'ai' then        -- AI mode, visitors: free AI tiers, shared by everyone
    per_visitor := 5;   per_day := 400;  per_month := null;
  elsif p_kind = 'ai_owner' then  -- AI mode, the owner (logged in)
    per_visitor := 50;  per_day := 50;   per_month := null;
  else
    return 'invalid';
  end if;

  -- One caller at a time per kind, so two requests can't both slip under a limit.
  perform pg_advisory_xact_lock(hashtext('vinverdict.guest.' || p_kind));

  -- Forget visitors after 2 days.
  delete from public.guest_usage where day < today - 1;

  select coalesce(sum(count), 0) into used from public.guest_usage where day = today and kind = p_kind;
  if used >= per_day then
    perform public.note_guest_stat(today, p_kind, 'global', false);
    return 'global';
  end if;

  if per_month is not null then
    select coalesce(max(count), 0) into used from public.guest_usage_month where month = this_month and kind = p_kind;
    if used >= per_month then
      perform public.note_guest_stat(today, p_kind, 'month', false);
      return 'month';
    end if;
    -- Owner's reserve: stop guest lookups once all MarketCheck use this month passes 300 of 500.
    select coalesce(sum(calls), 0) + coalesce(used, 0) * 2 into used
      from public.api_usage where month = this_month and provider = 'marketcheck';
    if used >= 300 then
      perform public.note_guest_stat(today, p_kind, 'month', false);
      return 'month';
    end if;
  end if;

  select coalesce(max(count), 0) into used from public.guest_usage where day = today and visitor = p_visitor and kind = p_kind;
  if used >= per_visitor then
    perform public.note_guest_stat(today, p_kind, 'visitor', false);
    return 'visitor';
  end if;

  insert into public.guest_usage (day, visitor, kind, count) values (today, p_visitor, p_kind, 1)
    on conflict (day, visitor, kind) do update set count = public.guest_usage.count + 1;
  insert into public.guest_usage_month (month, kind, count) values (this_month, p_kind, 1)
    on conflict (month, kind) do update set count = public.guest_usage_month.count + 1;
  perform public.note_guest_stat(today, p_kind, 'ok', used = 0);
  return 'ok';
end;
$$;

revoke all on function public.take_guest_allowance(text, text) from public;
grant execute on function public.take_guest_allowance(text, text) to anon, authenticated;
