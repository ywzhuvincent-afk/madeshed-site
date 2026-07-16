import { getUserFromRequest, hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';

// past_due=扣款失败宽限期：Stripe 智能重试期间不立刻断权（前端 isMembershipActive 同口径），
// 界面另行提示"更新支付方式"；重试全部失败后订阅转 canceled 自然降级。
const ACTIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

export function cleanText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

export async function loadSavedProfile(userId) {
  if (!hasSupabaseService() || !userId) return null;
  const rows = await supabaseSelect('profiles', `user_id=eq.${encodeURIComponent(userId)}&select=profile,birth,birth_time,gender,pillars,updated_at&limit=1`);
  const row = rows[0];
  if (!row) return null;
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : null;
  if (profile && Object.keys(profile).length) return profile;
  return null;
}

// 会员层级与每月赠点额度。至尊VIP(highest)走"每月大量点数"而非无限，成本可控。
// 发点有两条路径且必须共用此表：stripe-webhook.js（付款时发）与 master-question.js（当月首次
// 使用时兜底补发，年费会员的 11 个月全靠它）。改额度务必同时检查这两处，否则两条路径会给出不同额度。
export const MEMBERSHIP_MONTHLY_CREDITS = { ultimate: 30, highest: 200 };
export const MEMBERSHIP_TIERS = Object.keys(MEMBERSHIP_MONTHLY_CREDITS);
// 尊享报告：只有至尊VIP(highest)免费；基础会员(ultimate)必须单次购买，不得白拿。
export const VIP_ONLY_FORTUNE_REPORTS = ['timing'];

// 有效会员（基础 ultimate 或至尊 highest）。返回整行，供按 tier 判定尊享权益。
export async function activeMembership(userId) {
  if (!hasSupabaseService() || !userId) return null;
  const rows = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(userId)}&select=tier,status,current_period_end&limit=1`);
  const membership = rows[0] || null;
  if (membership && MEMBERSHIP_TIERS.indexOf(membership.tier) >= 0 && ACTIVE_MEMBERSHIP_STATUSES.has(membership.status)) return membership;
  return null;
}

// 单次购买的报告权益有效期（天）。会员生成的报告不受此限（会员在期内一直可生成）。
export const REPORT_VALIDITY_DAYS = 30;
// 无 expires_at 的历史记录视为长期有效（向后兼容，不追溯旧订单）
function purchaseStillValid(expiresAt) {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) ? t > Date.now() : true;
}

export async function hasTradeReportEntitlement(userId, reportType) {
  if (await activeMembership(userId)) return { ok: true, accessLevel: 'membership' };
  const rows = await supabaseSelect(
    'report_entitlements',
    `user_id=eq.${encodeURIComponent(userId)}&report_type=eq.${encodeURIComponent(reportType)}&status=eq.active&select=source,payload&limit=1`
  );
  const row = rows[0];
  if (!row) return { ok: false, accessLevel: 'preview' };
  if (row.source === 'membership' || row.source === 'admin') return { ok: true, accessLevel: 'paid' };
  const expiresAt = row.payload && row.payload.expires_at;
  return purchaseStillValid(expiresAt)
    ? { ok: true, accessLevel: 'paid', expiresAt: expiresAt || null }
    : { ok: false, accessLevel: 'expired', expiresAt: expiresAt || null };
}

export async function hasFortuneReportEntitlement(userId, reportType) {
  const membership = await activeMembership(userId);
  // 尊享报告（择时全案）只有至尊VIP免费；基础会员在此不放行，落到下面的单次购买校验。
  if (membership && (VIP_ONLY_FORTUNE_REPORTS.indexOf(reportType) < 0 || membership.tier === 'highest')) {
    return { ok: true, accessLevel: 'membership' };
  }
  // 只认权威的“<type>-entitlement”权益行（唯一带 expires_at），且必须 access_level='paid'。
  // 不再匹配任何 membership 内容行——会员访问已由上面的 activeMembership 独立判定，
  // 否则会员到期后残留的 access_level='membership' 内容行会永久免费泄漏（曾为 paywall leak）。
  const rows = await supabaseSelect(
    'fortune_reports',
    `user_id=eq.${encodeURIComponent(userId)}&report_key=eq.${encodeURIComponent(reportType + '-entitlement')}&access_level=eq.paid&select=context&limit=1`
  );
  const row = rows[0];
  if (!row) return { ok: false, accessLevel: 'preview' };
  const expiresAt = row.context && row.context.expires_at;
  return purchaseStillValid(expiresAt)
    ? { ok: true, accessLevel: 'paid', expiresAt: expiresAt || null }
    : { ok: false, accessLevel: 'expired', expiresAt: expiresAt || null };
}

async function requireCloudUser(req) {
  if (!hasSupabaseService()) {
    return { ok: false, status: 503, body: { error: 'supabase_service_not_configured', message: '云端账号系统暂未配置。' } };
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    return { ok: false, status: 401, body: { error: auth.error || 'unauthorized', message: '请先登录。' } };
  }
  return { ok: true, user: auth.user };
}

export async function authorizeTradeReportAccess(req, reportType, mode = 'full') {
  if (mode === 'preview') return { ok: true, accessLevel: 'preview', preview: true };
  const userResult = await requireCloudUser(req);
  if (!userResult.ok) return userResult;
  const entitlement = await hasTradeReportEntitlement(userResult.user.id, reportType);
  if (!entitlement.ok) {
    return {
      ok: false,
      status: 402,
      body: {
        error: 'report_access_required',
        message: '这份完整报告需要单次购买，或开通最高级会员后生成。',
        reportType,
        accessLevel: entitlement.accessLevel
      }
    };
  }
  return { ok: true, user: userResult.user, accessLevel: entitlement.accessLevel };
}

export async function authorizeFortuneReportAccess(req, reportType, mode = 'full') {
  if (mode === 'preview') return { ok: true, accessLevel: 'preview', preview: true, profile: null };
  const userResult = await requireCloudUser(req);
  if (!userResult.ok) return userResult;
  const profile = await loadSavedProfile(userResult.user.id);
  if (!profile) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'saved_profile_required',
        message: '请先登录并保存八字命盘；完整报告必须使用账号里的统一命盘生成。'
      }
    };
  }
  const entitlement = await hasFortuneReportEntitlement(userResult.user.id, reportType);
  if (!entitlement.ok) {
    return {
      ok: false,
      status: 402,
      body: {
        error: 'fortune_report_access_required',
        message: '这份完整命理报告需要单次购买，或开通最高级会员后生成。',
        reportType,
        accessLevel: entitlement.accessLevel
      }
    };
  }
  return { ok: true, user: userResult.user, profile, accessLevel: entitlement.accessLevel };
}

export async function loadCloudCheckins(userId) {
  if (!hasSupabaseService() || !userId) return [];
  return supabaseSelect(
    'checkins',
    `user_id=eq.${encodeURIComponent(userId)}&select=checkin_date,outcome,magnitude,label,score,day_ganzhi,payload,created_at,updated_at&order=checkin_date.asc`
  );
}

export async function saveGeneratedTradeReport(userId, report) {
  if (!hasSupabaseService() || !userId || !report) return null;
  return supabaseInsert('generated_reports', {
    user_id: userId,
    report_key: report.reportKey,
    report_type: report.reportType,
    period_start: report.periodStart,
    period_end: report.periodEnd,
    title: report.title,
    summary: report.summary || {},
    report_html: report.reportHtml || '',
    auto_generated: true,
    access_level: report.accessLevel || 'paid'
  }, { upsert: true, onConflict: 'user_id,report_key' });
}
