-- 数据库约束与代码白名单不同步（三处）——在 Supabase SQL Editor 里整段 Run 一次即可，幂等可重复执行。
--
-- 【同一类 bug：代码里会写的值，数据库 CHECK 不认】
-- 发现于 2026-07-20 排查 VIP 会员开不出来时，顺藤摸出另外两处兄弟问题。
-- 共同后果：Stripe 扣款成功 / 点数已扣 → 服务端写库被 CHECK 拒绝 → 用户付了钱拿不到东西。
--
--   ① memberships.tier            缺 highest  → VIP(¥299/月) 付款成功但会员开不出来
--   ② fortune_reports.report_type 缺 wealth、timing
--                                  → 偏财运(¥19)、择时全案(¥688) 报告存不进库
--                                    ※ 择时全案是站内最贵单品
--   ③ master_questions.category   缺 windfall → 问"偏财/机会财"扣了点数但记录存不下
--
-- 教训：新增付费商品/档位/分类，必须同步「代码白名单 → 数据库 CHECK」。
-- 已在 tests/site-static-checks.mjs 加守卫：从代码白名单读值，逐个断言 schema CHECK 里存在。

-- ① 会员档位：加 highest（至尊VIP）
alter table public.memberships drop constraint if exists memberships_tier_check;
alter table public.memberships
  add constraint memberships_tier_check
  check (tier in ('free', 'pro', 'ultimate', 'highest'));

-- ② 命理报告类型：加 wealth（偏财运）、timing（择时全案）
alter table public.fortune_reports drop constraint if exists fortune_reports_report_type_check;
alter table public.fortune_reports
  add constraint fortune_reports_report_type_check
  check (report_type in ('full', 'dayun', 'month', 'wealth', 'timing'));

-- ③ 问大师分类：加 windfall（偏财/机会财）
alter table public.master_questions drop constraint if exists master_questions_category_check;
alter table public.master_questions
  add constraint master_questions_category_check
  check (category in ('marriage', 'career', 'wealth', 'windfall', 'family', 'health', 'timing', 'life', 'custom'));

-- 验证：三条约束都应包含新增值
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conname in (
  'memberships_tier_check',
  'fortune_reports_report_type_check',
  'master_questions_category_check'
)
order by conname;

-- 补充排查：看历史上有没有因为约束被拒而"付了钱没记录"的订单。
-- 有付款记录(credit_ledger/report_entitlements)却没有对应 fortune_reports 行的，需要人工补发。
select e.user_id, e.report_type, e.created_at
from public.report_entitlements e
where e.status = 'active'
  and e.report_type in ('wealth', 'timing')
order by e.created_at desc
limit 50;
