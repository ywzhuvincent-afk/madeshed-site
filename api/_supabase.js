import { createHash } from 'node:crypto';

// 清洗环境变量：去掉粘贴时常带的 BOM(U+FEFF)/零宽字符/首尾引号/空白。
// Stripe 密钥曾因 BOM 导致 header 构造报错、接口全 500；服务角色密钥/URL 同样必须清洗，
// 否则一个不可见字符会让所有 Supabase 服务端查询 401→抛错→购买接口非 JSON 500（"暂不可用"）。
function cleanEnv(value) {
  return String(value || '')
    .replace(/[﻿​-‍⁠]/gu, '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL) || 'https://tkltasrbhjqwurybcyxo.supabase.co';
const SERVICE_ROLE_KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export const LEGAL_DOCUMENT_VERSIONS = {
  terms: '2026-06-30',
  privacy: '2026-06-30',
  risk_waiver: '2026-06-30',
  ai_disclaimer: '2026-06-30',
  billing_terms: '2026-06-30'
};

export const LEGALLY_REQUIRED_ACCEPTANCES = Object.keys(LEGAL_DOCUMENT_VERSIONS);

export function hasSupabaseService() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

function serviceHeaders(extra = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...extra
  };
}

export function bearerToken(req) {
  const raw = req.headers.authorization || req.headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

export async function getUserFromRequest(req) {
  if (!hasSupabaseService()) return { user: null, error: 'supabase_service_not_configured' };
  const token = bearerToken(req);
  if (!token) return { user: null, error: 'missing_bearer' };
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return { user: null, error: 'invalid_session' };
  return { user: await response.json(), error: null };
}

export function hasVerifiedEmail(user) {
  return Boolean(user && (user.email_confirmed_at || user.confirmed_at));
}

export function requestIpHash(req) {
  const raw = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim();
  if (!raw) return null;
  return createHash('sha256').update(raw).digest('hex');
}

export function requestUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 500);
}

export async function supabaseSelect(table, query = '') {
  if (!hasSupabaseService()) throw new Error('supabase_service_not_configured');
  const path = query ? `${table}?${query}` : table;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: serviceHeaders()
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data && data.message ? data.message : `select ${table} failed`);
  return Array.isArray(data) ? data : [];
}

export async function supabaseInsert(table, rows, options = {}) {
  if (!hasSupabaseService()) throw new Error('supabase_service_not_configured');
  const suffix = options.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : '';
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${suffix}`, {
    method: 'POST',
    headers: serviceHeaders({
      Prefer: options.upsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
    }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows])
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data && data.message ? data.message : `insert ${table} failed`);
  return Array.isArray(data) ? data : [];
}

export async function supabaseUpdate(table, query, row) {
  if (!hasSupabaseService()) throw new Error('supabase_service_not_configured');
  if (!query) throw new Error('missing_update_query');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row || {})
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data && data.message ? data.message : `update ${table} failed`);
  return Array.isArray(data) ? data : [];
}

export async function logAccountEvent(req, userId, eventType, payload = {}) {
  if (!userId) return null;
  return supabaseInsert('account_events', {
    user_id: userId,
    event_type: eventType,
    ip_hash: requestIpHash(req),
    user_agent: requestUserAgent(req),
    payload
  }).catch(() => null);
}

export async function accountStatusForUser(user) {
  const userId = user && user.id;
  if (!userId) throw new Error('missing_user');

  // allSettled：单个表查询失败不再让整个账号状态崩掉（进而把购买接口打成非 JSON 500）
  const settled = await Promise.allSettled([
    supabaseSelect('account_profiles', `user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`),
    supabaseSelect('legal_acceptances', `user_id=eq.${encodeURIComponent(userId)}&select=document_type,document_version,accepted_at`),
    supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(userId)}&select=tier,status,current_period_end,payload&limit=1`),
    supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&select=amount`),
    supabaseSelect('account_delete_requests', `user_id=eq.${encodeURIComponent(userId)}&select=status,created_at&order=created_at.desc&limit=1`)
  ]);
  const at = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : []);
  const profiles = at(0), acceptances = at(1), memberships = at(2), credits = at(3), deleteRequests = at(4);

  const accepted = new Map((acceptances || []).map((row) => [row.document_type, row]));
  const missingLegal = LEGALLY_REQUIRED_ACCEPTANCES.filter((type) => {
    const row = accepted.get(type);
    return !row || row.document_version !== LEGAL_DOCUMENT_VERSIONS[type];
  });
  const membership = memberships[0] || null;
  const creditBalance = (credits || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return {
    profile: profiles[0] || null,
    email: user.email || '',
    emailConfirmed: hasVerifiedEmail(user),
    legalComplete: missingLegal.length === 0,
    missingLegal,
    legalVersions: LEGAL_DOCUMENT_VERSIONS,
    membership,
    creditBalance: Math.max(0, creditBalance),
    deleteRequest: deleteRequests[0] || null
  };
}

export async function requireAccountReadyForPaidAction(req, user) {
  const status = await accountStatusForUser(user);
  // 邮箱确认不再作为购买前置：Stripe Checkout 会自行收集并验证付款邮箱、发送收据，
  // 站内再卡一道邮件确认属冗余摩擦（且 SMTP 不稳时会完全挡死收款）。仅保留法律条款接受。
  if (!status.legalComplete) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'legal_acceptance_required',
        message: '请先阅读并接受服务条款、隐私政策、风险免责声明和会员扣费条款。',
        missingLegal: status.missingLegal,
        account: status
      }
    };
  }
  return { ok: true, account: status };
}
