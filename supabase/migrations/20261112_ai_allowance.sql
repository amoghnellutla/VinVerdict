-- AI mode allowance (docs/PLAN.md, "AI mode"): free AI models (GLM, Gemini, Groq)
-- for visitors and the owner. Each AI action (one question, one history-report
-- read, one dealer check, one reply check) takes one from these limits, so the
-- providers' free tiers aren't used up by one person or a bot.
--
-- Run once in the Supabase SQL editor, after 20261111_guest_demo.sql.
-- Re-running is safe.

-- New kinds: 'ai' (a visitor, by hashed IP) and 'ai_owner' (the owner, by hashed user id).
alter table public.guest_usage drop constraint if exists guest_usage_kind_check;
alter table public.guest_usage add constraint guest_usage_kind_check check (kind in ('check', 'price', 'ai', 'ai_owner'));
alter table public.guest_usage_month drop constraint if exists guest_usage_month_kind_check;
alter table public.guest_usage_month add constraint guest_usage_month_kind_check check (kind in ('check', 'price', 'ai', 'ai_owner'));

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
