-- VinVerdict: monthly API usage meter (Phase 7). Run after the checked_cars file.
-- Counts every request VinVerdict makes to MarketCheck / Auto.dev for your
-- login, including ones its own cache may have answered, so it's an upper bound.

create table if not exists public.api_usage (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month    text not null check (month ~ '^\d{4}-\d{2}$'),
  provider text not null check (provider in ('marketcheck', 'autodev')),
  calls    integer not null default 0 check (calls >= 0),
  primary key (user_id, month, provider)
);

alter table public.api_usage enable row level security;

drop policy if exists "api_usage: own rows" on public.api_usage;
create policy "api_usage: own rows" on public.api_usage
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
