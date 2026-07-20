-- 放开 memberships.tier 约束以支持至尊VIP（highest）——在 Supabase SQL Editor 里整段 Run 一次即可，幂等可重复执行。
--
-- 【这是会真实丢钱的 bug】
-- VIP 档位（highest）在代码侧早已上线：结账能下单、_access 判权益、webhook 按 metadata.tier 写库、
-- 每月赠 200 点。但数据库的 CHECK 约束一直是 ('free','pro','ultimate')，不含 highest。
-- 后果：用户花 ¥299 订阅 VIP → Stripe 扣款成功 → webhook 写 tier='highest' 被数据库拒绝 →
-- 会员开不出来，付了钱没权益，且每次续费重试都同样失败。
-- 之所以一直没暴露：还没有真实用户买过 VIP（后台显示 VIP 购买 0 次）。
-- 发现于 2026-07-20 给测试号开 VIP 验收"帮家人朋友算命"功能时。
--
-- 同一批漏同步的还有（均已在代码里修）：
--   api/admin.js  MEMBERSHIP_TIERS 白名单（后台发不了 VIP）
--   admin.html    档位下拉选项（界面选不到 VIP）
-- 教训：新增付费档位必须走完「结账 → webhook → 数据库约束 → 权益判定 → 后台发放/修改」整条链路。

-- ① 放开 tier 约束（本迁移的核心）
alter table public.memberships drop constraint if exists memberships_tier_check;
alter table public.memberships
  add constraint memberships_tier_check
  check (tier in ('free', 'pro', 'ultimate', 'highest'));

-- ② 自动生成报告的函数此前只认 tier='ultimate'，VIP 会员拿不到自动报告。
--    这里用 CREATE OR REPLACE 重建函数体里那一行的判断条件是不安全的（函数很长，
--    直接重贴容易与库里的实际版本产生偏差），改为在 schema.sql 里同步修正定义，
--    并在此提供一次性检查：若你的库里该函数仍只认 ultimate，请从 schema.sql 重新执行
--    upsert_auto_generated_reports 的完整定义（其中已改为 tier in ('ultimate','highest')）。
select
  case when pg_get_functiondef(p.oid) like '%tier = ''ultimate''%'
       then 'ACTION NEEDED: upsert_auto_generated_reports 仍只认 ultimate，请从 schema.sql 重新执行该函数定义'
       else 'OK: 该函数已覆盖 VIP'
  end as auto_report_fn_status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'upsert_auto_generated_reports';

-- 验证（应返回含 highest 的约束定义）：
select pg_get_constraintdef(oid) as tier_check
from pg_constraint
where conrelid = 'public.memberships'::regclass and conname = 'memberships_tier_check';
