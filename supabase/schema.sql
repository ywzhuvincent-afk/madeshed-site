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

create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  locale text not null default 'zh-CN',
  timezone text not null default 'America/Vancouver',
  marketing_opt_in boolean not null default false,
  onboarding_status text not null default 'started',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('terms', 'privacy', 'risk_waiver', 'ai_disclaimer', 'billing_terms')),
  document_version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document_type)
);

create table if not exists public.account_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('signup', 'login', 'email_confirmed', 'password_reset_requested', 'password_updated', 'email_change_requested', 'legal_acceptance', 'signout', 'delete_requested')),
  ip_hash text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.account_delete_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'canceled')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro', 'ultimate', 'highest')),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'trialing', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.membership_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  stripe_event_id text unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
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
  updated_at timestamptz not null default now(),
  unique (user_id, report_type)
);

create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_key text not null,
  report_type text not null check (report_type in ('7', '30', '365', 'all')),
  period_start text not null,
  period_end text not null,
  title text not null,
  summary jsonb not null default '{}'::jsonb,
  report_html text not null,
  auto_generated boolean not null default true,
  access_level text not null default 'preview' check (access_level in ('preview', 'paid', 'membership')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_key)
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('purchase', 'membership_grant', 'spend', 'refund', 'admin')),
  amount integer not null,
  balance_after integer,
  reference_type text,
  reference_id text,
  stripe_session_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fortune_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_key text not null,
  report_type text not null check (report_type in ('full', 'dayun', 'month')),
  target_period text,
  title text not null,
  context jsonb not null default '{}'::jsonb,
  report_html text not null,
  access_level text not null default 'preview' check (access_level in ('preview', 'paid', 'membership')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_key)
);

create table if not exists public.master_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('marriage', 'career', 'wealth', 'family', 'health', 'timing', 'life', 'custom')),
  horizon text not null check (horizon in ('short', 'month', 'year', 'dayun', 'lifetime')),
  depth text not null default 'normal' check (depth in ('normal', 'deep')),
  target_date text,
  target_month text,
  question text not null,
  credits_spent integer not null default 0,
  context jsonb not null default '{}'::jsonb,
  answer_html text not null,
  status text not null default 'answered' check (status in ('answered', 'failed', 'refunded')),
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

drop trigger if exists account_profiles_set_updated_at on public.account_profiles;
create trigger account_profiles_set_updated_at
before update on public.account_profiles
for each row execute function public.set_updated_at();

drop trigger if exists legal_acceptances_set_updated_at on public.legal_acceptances;
create trigger legal_acceptances_set_updated_at
before update on public.legal_acceptances
for each row execute function public.set_updated_at();

drop trigger if exists account_delete_requests_set_updated_at on public.account_delete_requests;
create trigger account_delete_requests_set_updated_at
before update on public.account_delete_requests
for each row execute function public.set_updated_at();

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

drop trigger if exists report_entitlements_set_updated_at on public.report_entitlements;
create trigger report_entitlements_set_updated_at
before update on public.report_entitlements
for each row execute function public.set_updated_at();

drop trigger if exists generated_reports_set_updated_at on public.generated_reports;
create trigger generated_reports_set_updated_at
before update on public.generated_reports
for each row execute function public.set_updated_at();

drop trigger if exists credit_ledger_set_updated_at on public.credit_ledger;
create trigger credit_ledger_set_updated_at
before update on public.credit_ledger
for each row execute function public.set_updated_at();

drop trigger if exists fortune_reports_set_updated_at on public.fortune_reports;
create trigger fortune_reports_set_updated_at
before update on public.fortune_reports
for each row execute function public.set_updated_at();

drop trigger if exists master_questions_set_updated_at on public.master_questions;
create trigger master_questions_set_updated_at
before update on public.master_questions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.account_profiles enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.account_events enable row level security;
alter table public.account_delete_requests enable row level security;
alter table public.report_entitlements enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_events enable row level security;
alter table public.generated_reports enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.fortune_reports enable row level security;
alter table public.master_questions enable row level security;

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

drop policy if exists account_profiles_select_own on public.account_profiles;
create policy account_profiles_select_own
on public.account_profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists account_profiles_insert_own on public.account_profiles;
create policy account_profiles_insert_own
on public.account_profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists account_profiles_update_own on public.account_profiles;
create policy account_profiles_update_own
on public.account_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own
on public.legal_acceptances for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists legal_acceptances_insert_own on public.legal_acceptances;
create policy legal_acceptances_insert_own
on public.legal_acceptances for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists legal_acceptances_update_own on public.legal_acceptances;
create policy legal_acceptances_update_own
on public.legal_acceptances for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists account_events_select_own on public.account_events;
create policy account_events_select_own
on public.account_events for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists account_delete_requests_select_own on public.account_delete_requests;
create policy account_delete_requests_select_own
on public.account_delete_requests for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists account_delete_requests_insert_own on public.account_delete_requests;
create policy account_delete_requests_insert_own
on public.account_delete_requests for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists account_delete_requests_update_own on public.account_delete_requests;
create policy account_delete_requests_update_own
on public.account_delete_requests for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own
on public.memberships for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists membership_events_select_own on public.membership_events;
create policy membership_events_select_own
on public.membership_events for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists report_entitlements_select_own on public.report_entitlements;
create policy report_entitlements_select_own
on public.report_entitlements for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists generated_reports_select_own on public.generated_reports;
create policy generated_reports_select_own
on public.generated_reports for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists generated_reports_insert_own on public.generated_reports;
create policy generated_reports_insert_own
on public.generated_reports for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists generated_reports_update_own on public.generated_reports;
create policy generated_reports_update_own
on public.generated_reports for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists generated_reports_delete_own on public.generated_reports;
create policy generated_reports_delete_own
on public.generated_reports for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own
on public.credit_ledger for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists fortune_reports_select_own on public.fortune_reports;
create policy fortune_reports_select_own
on public.fortune_reports for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists fortune_reports_insert_own on public.fortune_reports;
create policy fortune_reports_insert_own
on public.fortune_reports for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists fortune_reports_update_own on public.fortune_reports;
create policy fortune_reports_update_own
on public.fortune_reports for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists master_questions_select_own on public.master_questions;
create policy master_questions_select_own
on public.master_questions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists master_questions_insert_own on public.master_questions;
create policy master_questions_insert_own
on public.master_questions for insert
to authenticated
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.checkins to authenticated;
grant select, insert, update on public.account_profiles to authenticated;
grant select, insert, update on public.legal_acceptances to authenticated;
grant select on public.account_events to authenticated;
grant select, insert, update on public.account_delete_requests to authenticated;
grant select on public.memberships to authenticated;
grant select on public.membership_events to authenticated;
grant select on public.report_entitlements to authenticated;
grant select, insert, update, delete on public.generated_reports to authenticated;
grant select on public.credit_ledger to authenticated;
grant select, insert, update on public.fortune_reports to authenticated;
grant select, insert on public.master_questions to authenticated;

create or replace function public.upsert_auto_generated_reports(p_run_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  affected integer := 0;
begin
  insert into public.generated_reports (
    user_id,
    report_key,
    report_type,
    period_start,
    period_end,
    title,
    summary,
    report_html,
    auto_generated,
    access_level
  )
  with periods as (
    select '7'::text as report_type,
      (date_trunc('week', p_run_date)::date - 7)::date as period_start,
      (date_trunc('week', p_run_date)::date - 1)::date as period_end,
      null::text as period_key_end,
      '上一完整 7 天'::text as period_label
    union all
    select '30',
      (date_trunc('month', p_run_date)::date - interval '1 month')::date,
      (date_trunc('month', p_run_date)::date - interval '1 day')::date,
      null::text,
      '上一完整月份'
    union all
    select '365',
      make_date(extract(year from p_run_date)::int - 1, 1, 1),
      make_date(extract(year from p_run_date)::int - 1, 12, 31),
      null::text,
      (extract(year from p_run_date)::int - 1)::text || ' 年年度'
    union all
    select 'all',
      null::date,
      null::date,
      to_char(p_run_date, 'YYYY-MM'),
      '全部历史月度快照'
  ),
  normalized as (
    select
      c.user_id,
      c.checkin_date::date as checkin_day,
      coalesce(nullif(c.payload->>'outcome', ''), c.outcome) as raw_outcome,
      c.outcome,
      c.magnitude,
      c.label,
      c.score,
      c.day_ganzhi
    from public.checkins c
    where c.checkin_date ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  canonical as (
    select
      n.*,
      case
        when n.raw_outcome in ('big_win', 'win', 'flat', 'loss', 'big_loss', 'notrade') then n.raw_outcome
        when n.outcome = 'win' and coalesce(n.magnitude, '') like '大赚%' then 'big_win'
        when n.outcome = 'loss' and coalesce(n.magnitude, '') like '大亏%' then 'big_loss'
        when n.outcome in ('win', 'flat', 'loss', 'notrade') then n.outcome
        else 'notrade'
      end as canonical_outcome
    from normalized n
  ),
  scoped as (
    select
      c.user_id,
      p.report_type,
      p.period_label,
      case when p.report_type = 'all' then min(c.checkin_day) over (partition by c.user_id) else p.period_start end as period_start,
      case when p.report_type = 'all' then max(c.checkin_day) over (partition by c.user_id) else p.period_end end as period_end,
      case when p.report_type = 'all' then 'all' else p.period_start::text end as key_start,
      case when p.report_type = 'all' then p.period_key_end else p.period_end::text end as key_end,
      c.canonical_outcome
    from canonical c
    cross join periods p
    where p.report_type = 'all'
      or (c.checkin_day between p.period_start and p.period_end)
  ),
  grouped as (
    select
      s.user_id,
      s.report_type,
      s.period_label,
      min(s.period_start)::text as period_start,
      max(s.period_end)::text as period_end,
      min(s.key_start) as key_start,
      min(s.key_end) as key_end,
      count(*)::int as total,
      count(*) filter (where s.canonical_outcome in ('big_win', 'win', 'flat', 'loss', 'big_loss'))::int as traded,
      count(*) filter (where s.canonical_outcome in ('big_win', 'win'))::int as wins,
      count(*) filter (where s.canonical_outcome in ('big_loss', 'loss'))::int as losses,
      count(*) filter (where s.canonical_outcome = 'big_win')::int as big_win,
      count(*) filter (where s.canonical_outcome = 'win')::int as win,
      count(*) filter (where s.canonical_outcome = 'flat')::int as flat,
      count(*) filter (where s.canonical_outcome = 'loss')::int as loss,
      count(*) filter (where s.canonical_outcome = 'big_loss')::int as big_loss,
      count(*) filter (where s.canonical_outcome = 'notrade')::int as notrade
    from scoped s
    group by s.user_id, s.report_type, s.period_label
    having count(*) > 0
  ),
  enriched as (
    select
      g.*,
      case g.report_type
        when '7' then '7 天报告'
        when '30' then '月度报告'
        when '365' then '年度报告'
        else '全部历史报告'
      end as product_label,
      case
        when g.traded >= 50 then '高可信'
        when g.traded >= 20 then '中等可信'
        when g.traded >= 5 then '初步参考'
        else '样本不足'
      end as confidence,
      case when g.traded > 0 then round(g.wins::numeric * 100 / g.traded)::text || '%' else '—' end as win_rate,
      case
        when m.user_id is not null then 'membership'
        when e.user_id is not null then 'paid'
        else 'preview'
      end as access_level
    from grouped g
    left join public.memberships m
      on m.user_id = g.user_id
      and m.tier in ('ultimate', 'highest')
      and m.status in ('active', 'trialing')
    left join public.report_entitlements e
      on e.user_id = g.user_id
      and e.report_type = g.report_type
      and e.status = 'active'
  )
  select
    e.user_id,
    e.report_type || '-' || e.key_start || '-' || e.key_end as report_key,
    e.report_type,
    e.period_start,
    e.period_end,
    e.product_label || ' · ' || e.period_label as title,
    jsonb_build_object(
      'total', e.total,
      'traded', e.traded,
      'wins', e.wins,
      'losses', e.losses,
      'rate', e.win_rate,
      'confidence', e.confidence,
      'autoSource', 'database_cron',
      'usingSample', false,
      'generatedPeriod', jsonb_build_object('start', e.period_start, 'end', e.period_end, 'label', e.period_label),
      'counts', jsonb_build_object(
        'big_win', e.big_win,
        'win', e.win,
        'flat', e.flat,
        'loss', e.loss,
        'big_loss', e.big_loss,
        'notrade', e.notrade
      )
    ) as summary,
    '<div class="report-generated"><h2>' || e.product_label || ' · 数据库自动版</h2>' ||
    '<span class="report-badge">' || e.period_start || ' 至 ' || e.period_end || '</span>' ||
    '<span class="report-badge">' || e.confidence || '</span>' ||
    '<span class="report-badge">胜率 ' || e.win_rate || '</span>' ||
    '<p>本报告由系统定时任务根据你的真实交易记录自动生成，不使用示例数据。</p>' ||
    '<h3>一、统计结论</h3><p>本周期共记录 ' || e.total || ' 天，实际交易 ' || e.traded ||
    ' 次；大赚 ' || e.big_win || ' 次，赚 ' || e.win || ' 次，平 ' || e.flat ||
    ' 次，亏 ' || e.loss || ' 次，大亏 ' || e.big_loss || ' 次，未交易 ' || e.notrade || ' 天。</p>' ||
    '<h3>二、纪律建议</h3><p>样本不足时只作为复盘提示；样本稳定后，重点观察高胜率状态与大亏集中状态，并把红/橙风险日默认纳入降仓或不交易规则。</p>' ||
    '<p>报告用于交易纪律和风险管理，不构成投资建议。</p></div>' as report_html,
    true as auto_generated,
    e.access_level
  from enriched e
  on conflict (user_id, report_key) do update
  set
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    title = excluded.title,
    summary = excluded.summary,
    report_html = excluded.report_html,
    auto_generated = excluded.auto_generated,
    access_level = excluded.access_level,
    updated_at = now()
  where public.generated_reports.summary is distinct from excluded.summary
    or public.generated_reports.report_html is distinct from excluded.report_html
    or public.generated_reports.access_level is distinct from excluded.access_level;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.upsert_auto_generated_reports(date) to postgres;

create extension if not exists pg_cron with schema extensions;

select cron.unschedule('madeshed-auto-generated-reports')
where exists (
  select 1
  from cron.job
  where jobname = 'madeshed-auto-generated-reports'
);

select cron.schedule('madeshed-auto-generated-reports', '17 9 * * *', $job$
  select public.upsert_auto_generated_reports(current_date);
$job$);
