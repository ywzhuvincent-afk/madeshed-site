-- 购买流程硬化（2026-07-10 审计修复）——在 Supabase SQL Editor 里整段 Run 一次即可，幂等可重复执行。
--
-- ① 封付费绕过通道（曾为 blocker）：fortune_reports 此前允许 authenticated 直接 insert/update 自己的行，
--    而服务端付费闸门信任该表的 access_level 字段——任何登录用户可在浏览器控制台把自己升级成 paid，
--    也能把退款降权改回去。权益行只应由服务端(service_role)写入；用户端只读。
--    （已核实：前端代码没有任何对这三张表的直接写入，撤销不影响正常功能。）
drop policy if exists fortune_reports_insert_own on public.fortune_reports;
drop policy if exists fortune_reports_update_own on public.fortune_reports;
revoke insert, update, delete on public.fortune_reports from authenticated;
revoke insert, update, delete on public.report_entitlements from authenticated;

-- ② 点数账本并发唯一约束（曾为 major）：webhook 多事件秒级并发时"先查重后插入"存在竞态窗口，
--    可能重复发月度赠点/重复入账。用部分唯一索引兜底（reference_id 为空的行不受影响）。
create unique index if not exists credit_ledger_unique_ref
  on public.credit_ledger (user_id, entry_type, reference_id)
  where reference_id is not null and reference_id <> '';

-- ③ 点数账本用户端只读（防自己给自己加点）：
revoke insert, update, delete on public.credit_ledger from authenticated;

-- 验证（应各返回一行/无报错）：
select indexname from pg_indexes where tablename = 'credit_ledger' and indexname = 'credit_ledger_unique_ref';
