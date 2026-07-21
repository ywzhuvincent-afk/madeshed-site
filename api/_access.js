import { getUserFromRequest, hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';
import { resolveUserLocale, t } from './_locale.js';

// past_due=扣款失败宽限期：Stripe 智能重试期间不立刻断权（前端 isMembershipActive 同口径），
// 界面另行提示"更新支付方式"；重试全部失败后订阅转 canceled 自然降级。
const ACTIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing', 'past_due']);
// 到期宽限：只靠 status 判会员，会在"取消/删除订阅的 webhook 漏送"时让已过期用户无限使用。
// 加到期校验兜底；但续费 webhook 若延迟到账，current_period_end 还是旧值，硬判会误锁付费用户，
// 故留 3 天宽限。current_period_end 为空（后台手发会员/早期遗留订阅）时不按到期判，只认 status。
const MEMBERSHIP_GRACE_MS = 3 * 86400000;
function membershipNotExpired(m) {
  const raw = m && m.current_period_end;
  if (!raw) return true;
  const end = new Date(raw).getTime();
  if (!Number.isFinite(end)) return true;
  return end + MEMBERSHIP_GRACE_MS > Date.now();
}

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
  if (membership && MEMBERSHIP_TIERS.indexOf(membership.tier) >= 0 && ACTIVE_MEMBERSHIP_STATUSES.has(membership.status) && membershipNotExpired(membership)) return membership;
  return null;
}

// 单次购买的报告权益有效期（天）。会员生成的报告不受此限（会员在期内一直可生成）。
// 2026-07 由 30 天改为一年：单次买一份深度报告只给 30 天，用户会以为内容丢了，且比订会员还亏。
export const REPORT_VALIDITY_DAYS = 365;
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
    return { ok: true, accessLevel: 'membership', tier: membership.tier || null };
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

// 未登录时拿不到账号语言，只能退回请求里带的 locale（resolveUserLocale 已处理该情况）。
async function requireCloudUser(req) {
  if (!hasSupabaseService()) {
    const locale = await resolveUserLocale(req, null);
    return { ok: false, status: 503, body: { error: 'supabase_service_not_configured', message: t(locale, 'supabase_not_configured'), locale } };
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    const locale = await resolveUserLocale(req, null);
    return { ok: false, status: 401, body: { error: auth.error || 'unauthorized', message: t(locale, 'login_required'), locale } };
  }
  return { ok: true, user: auth.user };
}

export async function authorizeTradeReportAccess(req, reportType, mode = 'full') {
  if (mode === 'preview') return { ok: true, accessLevel: 'preview', preview: true };
  const userResult = await requireCloudUser(req);
  if (!userResult.ok) return userResult;
  // 已登录 → 用账号上存的注册语言（resolveUserLocale 优先读 account_profiles.locale）
  const locale = await resolveUserLocale(req, userResult.user.id);
  const entitlement = await hasTradeReportEntitlement(userResult.user.id, reportType);
  if (!entitlement.ok) {
    return {
      ok: false,
      status: 402,
      body: {
        error: 'report_access_required',
        message: t(locale, 'trade_report_paywall'),
        locale,
        reportType,
        accessLevel: entitlement.accessLevel
      }
    };
  }
  return { ok: true, user: userResult.user, accessLevel: entitlement.accessLevel, locale };
}

export async function authorizeFortuneReportAccess(req, reportType, mode = 'full') {
  if (mode === 'preview') return { ok: true, accessLevel: 'preview', preview: true, profile: null };
  const userResult = await requireCloudUser(req);
  if (!userResult.ok) return userResult;
  const locale = await resolveUserLocale(req, userResult.user.id);
  const profile = await loadSavedProfile(userResult.user.id);
  if (!profile) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'saved_profile_required',
        message: t(locale, 'saved_profile_required'),
        locale
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
        message: t(locale, 'fortune_report_paywall'),
        locale,
        reportType,
        accessLevel: entitlement.accessLevel
      }
    };
  }
  // locale 一路带给报告生成器：AI 提示词、报告标题/免责声明、缓存键都必须按它走。
  // expiresAt 透传给前端：卡片徽章要能诚实显示到期日，不能只靠本地猜。
  return { ok: true, user: userResult.user, profile, accessLevel: entitlement.accessLevel, tier: entitlement.tier || null, expiresAt: entitlement.expiresAt || null, locale };
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
