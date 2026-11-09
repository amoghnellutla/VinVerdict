-- VinVerdict: saved cars and price history (Phase 8, "My cars").
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again (IF NOT EXISTS everywhere).
--
-- Row-level security: every row belongs to one login (user_id) and only
-- that login can read, add, change or delete it. The app uses the
-- logged-in user's session, never the service-role key, for these tables.

create table if not exists public.checked_cars (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vin         text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  title       text not null check (char_length(title) <= 200),
  source_url  text check (source_url is null or (char_length(source_url) <= 2000 and source_url ~ '^https?://')),
  source_host text check (char_length(source_host) <= 200),
  price       integer check (price is null or price between 0 and 1000000),
  miles       integer check (miles is null or miles between 0 and 1000000),
  verdict     text not null check (verdict in ('hide', 'verify', 'caution', 'clear')),
  risk        smallint not null check (risk between 0 and 100),
  fair_low    integer,
  fair_high   integer,
  deal_label  text check (deal_label is null or deal_label in ('great', 'good', 'fair', 'high', 'over')),
  -- Small summary for lists and Compare (year, make, model, seller, accident, title, owners, top findings).
  facts       jsonb not null default '{}'::jsonb check (pg_column_size(facts) <= 20000),
  -- The pasted listing, so the car can be checked again later. Plain text only.
  listing_text text check (listing_text is null or char_length(listing_text) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists checked_cars_user_updated on public.checked_cars (user_id, updated_at desc);
create index if not exists checked_cars_user_vin on public.checked_cars (user_id, vin);

alter table public.checked_cars enable row level security;

drop policy if exists "checked_cars: own rows" on public.checked_cars;
create policy "checked_cars: own rows" on public.checked_cars
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.price_history (
  id       bigint generated always as identity primary key,
  car_id   bigint not null references public.checked_cars (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  price    integer not null check (price between 0 and 1000000),
  source   text not null check (char_length(source) <= 40),
  seen_at  timestamptz not null default now()
);

create index if not exists price_history_car on public.price_history (car_id, seen_at);

alter table public.price_history enable row level security;

drop policy if exists "price_history: own rows" on public.price_history;
create policy "price_history: own rows" on public.price_history
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
