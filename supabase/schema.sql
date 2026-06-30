-- Madeshed production sync schema
-- Run this in Supabase SQL Editor before enabling cloud sync for users.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth date,
  birth_time text,
  time_known boolean default true,
  gender text check (gender in ('M', 'F')),
  pillars jsonb not null default '{}'::jsonb,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date text not null,
  outcome text not null check (outcome in ('win', 'loss', 'flat', 'notrade')),
  magnitude text,
  label text,
  score integer,
  day_ganzhi text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro', 'ultimate')),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'trialing', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('7', '30', '365', 'all')),
  source text not null default 'purchase' check (source in ('purchase', 'membership', 'admin')),
  status text not null default 'active' check (status in ('active', 'refunded', 'expired')),
  stripe_session_id text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists checkins_set_updated_at on public.checkins;
create trigger checkins_set_updated_at
before update on public.checkins
for each row execute function public.set_updated_at();

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

drop trigger if exists report_entitlements_set_updated_at on public.report_entitlements;
create trigger report_entitlements_set_updated_at
before update on public.report_entitlements
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.report_entitlements enable row level security;
alter table public.memberships enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
on public.profiles for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists checkins_select_own on public.checkins;
create policy checkins_select_own
on public.checkins for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists checkins_insert_own on public.checkins;
create policy checkins_insert_own
on public.checkins for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists checkins_update_own on public.checkins;
create policy checkins_update_own
on public.checkins for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists checkins_delete_own on public.checkins;
create policy checkins_delete_own
on public.checkins for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own
on public.memberships for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists report_entitlements_select_own on public.report_entitlements;
create policy report_entitlements_select_own
on public.report_entitlements for select
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.checkins to authenticated;
grant select on public.memberships to authenticated;
grant select on public.report_entitlements to authenticated;
