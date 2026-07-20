-- 人物档案（帮家人/朋友算命，至尊VIP 专属）——在 Supabase SQL Editor 里整段 Run 一次即可，幂等可重复执行。
--
-- 背景：profiles 表每个账号只有一行（本人）。要给家人朋友出命理报告，需要能存多个人的命盘。
-- 报告本身已按 personId 进 fortune_reports 的缓存键（v4），这张表只负责"人物名单+命盘"。
--
-- 设计取舍：
-- - 用户端可读写自己的行（RLS 限定 auth.uid() = user_id）。这与 fortune_reports/report_entitlements
--   不同——那两张表是付费权益，必须只由 service_role 写；而人物档案只是"我要给谁算"的输入，
--   用户本来就能在界面上随便填，放开读写不构成付费绕过。
-- - VIP 校验在服务端做（fortune-report.js 判 gate.tier==='highest'），不依赖这张表的行数。
--   即使用户绕过界面往这里插 100 行，没有 VIP 也生成不了任何他人报告。
-- - 不存出生城市/经纬度：真太阳时校正在客户端算完直接落进 profile jsonb，避免额外收集地理位置。

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 客户端生成的稳定标识，同时作为 fortune_reports 缓存键里的 personId
  person_key text not null,
  display_name text not null,
  relation text,
  birth date,
  birth_time text,
  time_known boolean not null default true,
  gender text check (gender in ('M', 'F')),
  -- 客户端用同一套引擎算好的完整命盘（与 profiles.profile 同结构）
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, person_key)
);

create index if not exists people_user_idx on public.people (user_id, updated_at desc);

alter table public.people enable row level security;

drop policy if exists people_select_own on public.people;
create policy people_select_own
on public.people for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists people_insert_own on public.people;
create policy people_insert_own
on public.people for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists people_update_own on public.people;
create policy people_update_own
on public.people for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists people_delete_own on public.people;
create policy people_delete_own
on public.people for delete
to authenticated
using (auth.uid() = user_id);

-- 验证（应返回 people 一行 + 4 条策略）：
select tablename from pg_tables where schemaname = 'public' and tablename = 'people';
select policyname from pg_policies where schemaname = 'public' and tablename = 'people' order by policyname;
