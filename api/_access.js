import { getUserFromRequest, hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';

const ACTIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);

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

export async function activeUltimateMembership(userId) {
  if (!hasSupabaseService() || !userId) return null;
  const rows = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(userId)}&select=tier,status,current_period_end&limit=1`);
  const membership = rows[0] || null;
  if (membership && membership.tier === 'ultimate' && ACTIVE_MEMBERSHIP_STATUSES.has(membership.status)) return membership;
  return null;
}

export async function hasTradeReportEntitlement(userId, reportType) {
  if (await activeUltimateMembership(userId)) return { ok: true, accessLevel: 'membership' };
  const rows = await supabaseSelect(
    'report_entitlements',
    `user_id=eq.${encodeURIComponent(userId)}&report_type=eq.${encodeURIComponent(reportType)}&status=eq.active&select=id&limit=1`
  );
  return rows.length ? { ok: true, accessLevel: 'paid' } : { ok: false, accessLevel: 'preview' };
}

export async function hasFortuneReportEntitlement(userId, reportType) {
  if (await activeUltimateMembership(userId)) return { ok: true, accessLevel: 'membership' };
  const rows = await supabaseSelect(
    'fortune_reports',
    `user_id=eq.${encodeURIComponent(userId)}&report_type=eq.${encodeURIComponent(reportType)}&access_level=in.(paid,membership)&select=id&limit=1`
  );
  return rows.length ? { ok: true, accessLevel: 'paid' } : { ok: false, accessLevel: 'preview' };
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
