import {
  getUserFromRequest,
  hasSupabaseService,
  hasVerifiedEmail,
  supabaseSelect,
  supabaseInsert
} from './_supabase.js';
import { sendEmail, getUserLocale, normalizeEmailLocale, accountDeletedEmail } from './_email.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tkltasrbhjqwurybcyxo.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Admin allowlist. Set ADMIN_EMAILS in Vercel (comma separated) to control who can
// open the back office. Falls back to the owner email so it works out of the box.
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || 'zhuvincent@hotmail.com,ywzhuvincent@gmail.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function send(res, status, body) {
  res.status(status).json(body);
}

function isAdminEmail(email) {
  return Boolean(email) && ADMIN_EMAILS.indexOf(String(email).toLowerCase()) >= 0;
}

function requestAction(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  return String(req.query?.action || url.searchParams.get('action') || req.body?.action || '').trim().toLowerCase();
}

async function requireAdmin(req, res) {
  if (!hasSupabaseService()) {
    send(res, 503, { error: 'supabase_service_not_configured', message: '后台未连接云端。请在 Vercel 配置 SUPABASE_SERVICE_ROLE_KEY。' });
    return null;
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录。' });
    return null;
  }
  if (!isAdminEmail(auth.user.email)) {
    send(res, 403, { error: 'forbidden', message: '当前账号没有后台权限。' });
    return null;
  }
  return auth.user;
}

async function authAdminFetch(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    method: options.method || 'GET',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...(options.body ? { 'content-type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && (j.msg || j.message)) || 'auth_admin_failed');
  return j;
}

async function listAllAuthUsers(max = 2000) {
  let page = 1;
  const per = 200;
  let all = [];
  for (;;) {
    const j = await authAdminFetch(`users?page=${page}&per_page=${per}`);
    const users = Array.isArray(j) ? j : (j && j.users) || [];
    all = all.concat(users);
    if (users.length < per || all.length >= max) break;
    page += 1;
  }
  return all;
}

function ts(v) {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function shapeAuthUser(u) {
  return {
    id: u.id,
    email: u.email || '',
    displayName: (u.user_metadata && (u.user_metadata.display_name || u.user_metadata.name)) || '',
    createdAt: u.created_at || null,
    verified: Boolean(u.email_confirmed_at || u.confirmed_at),
    lastSignIn: u.last_sign_in_at || null,
    provider: (u.app_metadata && u.app_metadata.provider) || 'email'
  };
}

async function overview(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  try {
    const [users, accounts, memberships, credits, checkins, reports, fortunes, questions, memEvents] = await Promise.all([
      listAllAuthUsers(),
      supabaseSelect('account_profiles', 'select=user_id,display_name,locale,marketing_opt_in'),
      supabaseSelect('memberships', 'select=user_id,tier,status,current_period_end'),
      supabaseSelect('credit_ledger', 'select=user_id,amount,entry_type,payload,created_at'),
      supabaseSelect('checkins', 'select=user_id'),
      supabaseSelect('report_entitlements', 'select=user_id,report_type,source,status,payload,created_at'),
      supabaseSelect('fortune_reports', 'select=user_id,access_level,context,updated_at'),
      supabaseSelect('master_questions', 'select=user_id,credits_spent'),
      supabaseSelect('membership_events', 'select=event_type,created_at&order=created_at.desc&limit=500').catch(() => [])
    ]);
    const now = Date.now();
    const d7 = now - 7 * 86400000;
    const d30 = now - 30 * 86400000;
    const activeMembers = memberships.filter((m) => m.status === 'active' || m.status === 'trialing');
    const ultimateMembers = activeMembers.filter((m) => m.tier === 'ultimate').length;
    const creditsOutstanding = credits.reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const reportPurchases = reports.filter((r) => r.source === 'purchase').length;
    const creditPurchases = credits.filter((c) => c.entry_type === 'purchase').length;
    // 一次性收入（分→元）：点数包 + 交易报告 + 命理报告的 amount_total。会员订阅收入用 MRR 估算另算。
    const amt = (v) => Number(v) || 0;
    const centsCredit = credits.filter((c) => c.entry_type === 'purchase');
    const centsReport = reports.filter((r) => r.source === 'purchase');
    const centsFortune = fortunes.filter((f) => f.access_level === 'paid');
    const revenueFrom = (arr, getCents, getAt, since) => arr.reduce((a, x) => (!since || ts(getAt(x)) >= since ? a + amt(getCents(x)) : a), 0);
    const cAt = (x) => x.created_at, cCents = (x) => x.payload && x.payload.amount_total;
    const fAt = (x) => x.updated_at, fCents = (x) => x.context && x.context.amount_total;
    const oneTimeTotal = revenueFrom(centsCredit, cCents, cAt) + revenueFrom(centsReport, cCents, cAt) + revenueFrom(centsFortune, fCents, fAt);
    const oneTime30d = revenueFrom(centsCredit, cCents, cAt, d30) + revenueFrom(centsReport, cCents, cAt, d30) + revenueFrom(centsFortune, fCents, fAt, d30);
    // MRR ≈ 活跃高级会员数 × 当前会员月价（会员各自锁定价可能不同，此为估算）。取价失败则不报 MRR。
    let mrrCents = null;
    try {
      const uPrice = await resolveCatalogItem(PRODUCT_NAME_MAP.find((x) => x.key === 'ultimate'));
      if (uPrice && uPrice.status === 'ok' && uPrice.interval) mrrCents = Math.round(ultimateMembers * (uPrice.unitAmount || 0));
    } catch (e) { mrrCents = null; }
    const canceled30d = (memEvents || []).filter((e) => /cancel|refund/i.test(e.event_type || '') && ts(e.created_at) >= d30).length;
    return send(res, 200, {
      overview: {
        totalUsers: users.length,
        verifiedUsers: users.filter((u) => u.email_confirmed_at || u.confirmed_at).length,
        signups7d: users.filter((u) => ts(u.created_at) >= d7).length,
        signups30d: users.filter((u) => ts(u.created_at) >= d30).length,
        activeMembers: activeMembers.length,
        ultimateMembers,
        pastDueMembers: memberships.filter((m) => m.status === 'past_due').length,
        withChart: accounts.length,
        creditsOutstanding: Math.max(0, creditsOutstanding),
        checkins: checkins.length,
        reportPurchases,
        creditPurchases,
        masterQuestions: questions.length,
        marketingOptIn: accounts.filter((a) => a.marketing_opt_in).length,
        // 经营指标（金额单位：分）
        mrrCents,
        oneTimeRevenueTotalCents: oneTimeTotal,
        oneTimeRevenue30dCents: oneTime30d,
        canceledOrRefunded30d: canceled30d,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return send(res, 500, { error: 'overview_failed', message: error.message || '读取概览失败。' });
  }
}

function indexBy(rows, key) {
  const m = new Map();
  (rows || []).forEach((r) => { m.set(r[key], r); });
  return m;
}

function countBy(rows, key) {
  const m = new Map();
  (rows || []).forEach((r) => { m.set(r[key], (m.get(r[key]) || 0) + 1); });
  return m;
}

function sumBy(rows, key, valKey) {
  const m = new Map();
  (rows || []).forEach((r) => { m.set(r[key], (m.get(r[key]) || 0) + (Number(r[valKey]) || 0)); });
  return m;
}

async function usersList(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  const url = new URL(req.url || '/', 'http://localhost');
  const q = String(req.query?.q || url.searchParams.get('q') || '').trim().toLowerCase();
  try {
    const [users, accounts, memberships, creditRows, checkinRows, profileRows] = await Promise.all([
      listAllAuthUsers(),
      supabaseSelect('account_profiles', 'select=user_id,display_name,locale,marketing_opt_in'),
      supabaseSelect('memberships', 'select=user_id,tier,status,current_period_end'),
      supabaseSelect('credit_ledger', 'select=user_id,amount'),
      supabaseSelect('checkins', 'select=user_id'),
      supabaseSelect('profiles', 'select=user_id,birth,gender')
    ]);
    const acct = indexBy(accounts, 'user_id');
    const mem = indexBy(memberships, 'user_id');
    const creditSum = sumBy(creditRows, 'user_id', 'amount');
    const checkinCount = countBy(checkinRows, 'user_id');
    const chart = indexBy(profileRows, 'user_id');
    let rows = users.map((u) => {
      const a = acct.get(u.id) || {};
      const m = mem.get(u.id) || {};
      const base = shapeAuthUser(u);
      return {
        ...base,
        displayName: a.display_name || base.displayName || '',
        locale: a.locale || '',
        tier: m.tier || 'free',
        status: m.status || 'inactive',
        periodEnd: m.current_period_end || null,
        credits: Math.max(0, creditSum.get(u.id) || 0),
        checkins: checkinCount.get(u.id) || 0,
        hasChart: Boolean(chart.get(u.id) && chart.get(u.id).birth)
      };
    });
    if (q) rows = rows.filter((r) => (r.email + ' ' + r.displayName + ' ' + r.id).toLowerCase().indexOf(q) >= 0);
    const statusFilter = String(req.query?.status || url.searchParams.get('status') || '').trim().toLowerCase();
    if (statusFilter) rows = rows.filter((r) => String(r.status).toLowerCase() === statusFilter);
    rows.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
    return send(res, 200, { users: rows, total: rows.length });
  } catch (error) {
    return send(res, 500, { error: 'users_failed', message: error.message || '读取用户列表失败。' });
  }
}

async function userDetail(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  const url = new URL(req.url || '/', 'http://localhost');
  const id = String(req.query?.userId || url.searchParams.get('userId') || '').trim();
  if (!id) return send(res, 400, { error: 'missing_user_id', message: '缺少 userId。' });
  const enc = encodeURIComponent(id);
  try {
    const [authUser, profile, account, membership, credits, checkins, legal, questions, reports, events, deletes] = await Promise.all([
      authAdminFetch(`users/${enc}`).catch(() => null),
      supabaseSelect('profiles', `user_id=eq.${enc}&select=*&limit=1`),
      supabaseSelect('account_profiles', `user_id=eq.${enc}&select=*&limit=1`),
      supabaseSelect('memberships', `user_id=eq.${enc}&select=*&limit=1`),
      supabaseSelect('credit_ledger', `user_id=eq.${enc}&select=entry_type,amount,reference_type,created_at&order=created_at.desc&limit=50`),
      supabaseSelect('checkins', `user_id=eq.${enc}&select=checkin_date,outcome,label,score&order=checkin_date.desc&limit=60`),
      supabaseSelect('legal_acceptances', `user_id=eq.${enc}&select=document_type,document_version,accepted_at`),
      supabaseSelect('master_questions', `user_id=eq.${enc}&select=category,depth,credits_spent,created_at&order=created_at.desc&limit=20`),
      supabaseSelect('report_entitlements', `user_id=eq.${enc}&select=report_type,source,status,created_at`),
      supabaseSelect('account_events', `user_id=eq.${enc}&select=event_type,created_at&order=created_at.desc&limit=20`),
      supabaseSelect('account_delete_requests', `user_id=eq.${enc}&select=status,reason,created_at&order=created_at.desc&limit=3`)
    ]);
    const creditBalance = (credits || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
    return send(res, 200, {
      user: authUser ? shapeAuthUser(authUser) : { id },
      authRaw: authUser ? { last_sign_in_at: authUser.last_sign_in_at, created_at: authUser.created_at, email_confirmed_at: authUser.email_confirmed_at || authUser.confirmed_at } : null,
      profile: (profile && profile[0]) || null,
      account: (account && account[0]) || null,
      membership: (membership && membership[0]) || null,
      creditBalance: Math.max(0, creditBalance),
      credits: credits || [],
      checkins: checkins || [],
      checkinCount: (checkins || []).length,
      legal: legal || [],
      masterQuestions: questions || [],
      reports: reports || [],
      events: events || [],
      deleteRequests: deletes || []
    });
  } catch (error) {
    return send(res, 500, { error: 'user_detail_failed', message: error.message || '读取用户详情失败。' });
  }
}

async function grantCredits(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  const body = req.body || {};
  const userId = String(body.userId || '').trim();
  const amount = Math.trunc(Number(body.amount));
  const note = String(body.note || '').slice(0, 300);
  // 幂等键：由前端每次操作生成一个稳定 id 传来。配合唯一索引 credit_ledger_unique_ref
  // (user_id, entry_type, reference_id)，重试/超时重发/并发不会重复扣或发点。
  const referenceId = String(body.referenceId || body.reference_id || '').trim().slice(0, 80);
  if (!userId) return send(res, 400, { error: 'missing_user_id', message: '缺少 userId。' });
  if (!Number.isFinite(amount) || amount === 0) return send(res, 400, { error: 'invalid_amount', message: '请输入非零整数点数（可为负数扣减）。' });
  try {
    if (referenceId) {
      const dup = await supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&entry_type=eq.admin&reference_id=eq.${encodeURIComponent(referenceId)}&select=amount,balance_after&limit=1`);
      if (dup[0]) return send(res, 200, { ok: true, duplicate: true, balanceAfter: dup[0].balance_after, message: '该操作已执行过，未重复调整点数。' });
    }
    const existing = await supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&select=amount`);
    const before = (existing || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const after = before + amount;
    // 拒绝把账本扣成负数（曾为 medium：界面 Math.max(0) 夹住显示 0、账本却是负数，账实不符）
    if (after < 0) return send(res, 400, { error: 'would_go_negative', message: `扣减 ${-amount} 点后余额为负（当前 ${before} 点）。已阻止，避免账本出现负数。` });
    const rows = await supabaseInsert('credit_ledger', {
      user_id: userId,
      entry_type: 'admin',
      amount,
      balance_after: after,
      reference_type: 'admin_grant',
      reference_id: referenceId || null,
      payload: { note: note || null, by: admin.email, at: new Date().toISOString() }
    });
    return send(res, 200, { ok: true, entry: rows[0] || null, balanceBefore: before, balanceAfter: after });
  } catch (error) {
    // 唯一约束冲突（并发/重试撞车）→ 视为已执行，不报错
    if (referenceId && /duplicate key|23505|conflict|already exists/i.test(String(error.message || ''))) {
      return send(res, 200, { ok: true, duplicate: true, message: '该操作已执行过（并发去重），未重复调整。' });
    }
    return send(res, 500, { error: 'grant_failed', message: error.message || '调整点数失败。' });
  }
}

const MEMBERSHIP_TIERS = new Set(['free', 'pro', 'ultimate']);
const MEMBERSHIP_STATUSES = new Set(['inactive', 'active', 'trialing', 'past_due', 'canceled']);

async function setMembership(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  const body = req.body || {};
  const userId = String(body.userId || '').trim();
  const tier = String(body.tier || '').trim();
  const status = String(body.status || '').trim();
  const periodEnd = String(body.periodEnd || '').trim();
  const note = String(body.note || '').slice(0, 300);
  if (!userId) return send(res, 400, { error: 'missing_user_id', message: '缺少 userId。' });
  if (!MEMBERSHIP_TIERS.has(tier)) return send(res, 400, { error: 'invalid_tier', message: 'tier 必须是 free / pro / ultimate。' });
  if (!MEMBERSHIP_STATUSES.has(status)) return send(res, 400, { error: 'invalid_status', message: 'status 无效。' });
  let currentPeriodEnd = null;
  if (periodEnd) {
    const t = Date.parse(periodEnd);
    if (!Number.isFinite(t)) return send(res, 400, { error: 'invalid_period_end', message: '到期时间格式无效。' });
    currentPeriodEnd = new Date(t).toISOString();
  }
  try {
    // Upsert with merge-duplicates only touches provided columns, so Stripe ids
    // written by the webhook are preserved.
    const existing = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(userId)}&select=tier,status,payload&limit=1`);
    const prev = existing[0] || null;
    const overrides = ((prev && prev.payload && Array.isArray(prev.payload.admin_overrides)) ? prev.payload.admin_overrides : []).slice(-9);
    overrides.push({ by: admin.email, at: new Date().toISOString(), tier, status, period_end: currentPeriodEnd, note: note || null, prev_tier: prev ? prev.tier : null, prev_status: prev ? prev.status : null });
    // 到期日留空 = 不改动：省略该列，upsert(merge-duplicates) 只更新提供的列，保留 webhook 写入的续费日期。
    // （曾为 high：只想改 tier/备注，却把 current_period_end 静默抹成 null。）
    const record = {
      user_id: userId,
      tier,
      status,
      payload: { ...((prev && prev.payload) || {}), admin_overrides: overrides }
    };
    if (periodEnd) record.current_period_end = currentPeriodEnd;
    const rows = await supabaseInsert('memberships', record, { upsert: true, onConflict: 'user_id' });
    await supabaseInsert('membership_events', {
      user_id: userId,
      event_type: 'admin_override',
      payload: { by: admin.email, tier, status, period_end: currentPeriodEnd, note: note || null }
    }).catch(() => null);
    return send(res, 200, { ok: true, membership: rows[0] || null });
  } catch (error) {
    return send(res, 500, { error: 'set_membership_failed', message: error.message || '会员调整失败。' });
  }
}

// 真正取消 Stripe 订阅（曾为 high：set-membership 只改库、下期 invoice.paid 会翻回 active 照扣费）。
// atPeriodEnd=true(默认) 期末取消、用户用到期末；false 立即取消。webhook 会把最终状态同步回库。
async function cancelSubscription(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  const { stripeFormRequest } = await import('./_stripe.js');
  const body = req.body || {};
  const userId = String(body.userId || '').trim();
  const atPeriodEnd = body.atPeriodEnd !== false;
  if (!userId) return send(res, 400, { error: 'missing_user_id', message: '缺少 userId。' });
  try {
    const rows = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(userId)}&select=stripe_subscription_id,status&limit=1`);
    const sub = rows[0] && rows[0].stripe_subscription_id;
    if (!sub) return send(res, 400, { error: 'no_subscription', message: '该用户没有绑定 Stripe 订阅（可能是后台手动会员或已取消），改状态即可，无需在 Stripe 操作。' });
    let result;
    if (atPeriodEnd) {
      const p = new URLSearchParams(); p.set('cancel_at_period_end', 'true');
      result = await stripeFormRequest(`subscriptions/${encodeURIComponent(sub)}`, p);
    } else {
      result = await stripeFormRequest(`subscriptions/${encodeURIComponent(sub)}`, new URLSearchParams(), { method: 'DELETE' });
      await supabaseInsert('memberships', { user_id: userId, status: 'canceled' }, { upsert: true, onConflict: 'user_id' });
    }
    await supabaseInsert('membership_events', {
      user_id: userId,
      event_type: 'admin_cancel_subscription',
      payload: { by: admin.email, subscription_id: sub, at_period_end: atPeriodEnd, at: new Date().toISOString() }
    }).catch(() => null);
    return send(res, 200, { ok: true, subscription_id: sub, mode: atPeriodEnd ? 'cancel_at_period_end' : 'canceled_now', status: (result && result.status) || null });
  } catch (error) {
    return send(res, 500, { error: 'cancel_subscription_failed', message: error.message || '取消订阅失败。' });
  }
}

async function verifyEmail(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  const userId = String(req.body?.userId || '').trim();
  if (!userId) return send(res, 400, { error: 'missing_user_id', message: '缺少 userId。' });
  try {
    const updated = await authAdminFetch('users/' + encodeURIComponent(userId), { method: 'PUT', body: { email_confirm: true } });
    await supabaseInsert('account_events', {
      user_id: userId,
      event_type: 'email_confirmed',
      payload: { by_admin: admin.email, manual: true }
    }).catch(() => null);
    return send(res, 200, { ok: true, verified: Boolean(updated && (updated.email_confirmed_at || updated.confirmed_at)) });
  } catch (error) {
    return send(res, 500, { error: 'verify_email_failed', message: error.message || '手动验证邮箱失败。' });
  }
}

async function whoami(req, res) {
  if (!hasSupabaseService()) return send(res, 503, { error: 'supabase_service_not_configured' });
  const auth = await getUserFromRequest(req);
  if (!auth.user) return send(res, 401, { error: 'unauthorized' });
  return send(res, 200, {
    email: auth.user.email || '',
    isAdmin: isAdminEmail(auth.user.email),
    verified: hasVerifiedEmail(auth.user)
  });
}

// 商品目录唯一实现在 api/_catalog.js（后台改名/改价、公开价格接口 /api/prices、结账解析共用）。
// 改价采用 Stripe 标准做法：在同一商品上创建新价格并设为 default_price（价格对象金额不可改）；
// 结账端(api/checkout.js resolveEffectivePrice)与页面价(api/prices.js)自动跟随默认价，改价立即生效。
import { PRODUCT_CATALOG, resolveCatalogItem, toUnitAmount } from './_catalog.js';
const PRODUCT_NAME_MAP = PRODUCT_CATALOG;
async function listPrices(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (!process.env.STRIPE_SECRET_KEY) return send(res, 503, { error: 'stripe_not_configured', message: 'Stripe 未配置。' });
  const items = [];
  for (const item of PRODUCT_NAME_MAP) {
    try { items.push(await resolveCatalogItem(item)); }
    catch (error) { items.push({ key: item.key, name: item.name, status: 'error', error: String(error && error.message).slice(0, 120) }); }
  }
  return send(res, 200, { ok: true, items });
}
async function updatePrice(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { stripeFormRequest, stripeGet } = await import('./_stripe.js');
  const body = req.body || {};
  const item = PRODUCT_NAME_MAP.find((x) => x.key === String(body.key || ''));
  const amountMajor = Number(body.amount);
  const reqCurrency = String(body.currency || '').toLowerCase(); // ''=商品当前币种(人民币,设默认价)；'usd'=美元副价
  if (['', 'cny', 'usd'].indexOf(reqCurrency) < 0) return send(res, 400, { error: 'unsupported_currency', message: '仅支持人民币(默认价)与美元(副价)；其它币种会产生无人消费的孤儿价格。' });
  if (!item) return send(res, 400, { error: 'invalid_key', message: '商品 key 无效。' });
  if (!Number.isFinite(amountMajor) || amountMajor <= 0 || amountMajor > 1000000) {
    return send(res, 400, { error: 'invalid_amount', message: '价格无效：必须是大于 0 的数字。' });
  }
  try {
    const current = await resolveCatalogItem(item);
    if (current.status !== 'ok') return send(res, 400, { error: 'catalog_unresolved', message: '无法定位该商品：' + current.status, item: current });
    const currency = reqCurrency || String(current.currency).toLowerCase();
    const isDefaultCurrency = currency === String(current.currency).toLowerCase();
    const unitAmount = toUnitAmount(amountMajor, currency);
    const params = new URLSearchParams();
    params.set('product', current.productId);
    params.set('currency', currency);
    params.set('unit_amount', String(unitAmount));
    if (current.interval) params.set('recurring[interval]', current.interval);
    params.set('metadata[source]', 'admin_price_update');
    params.set('metadata[updated_by]', admin.email || '');
    const newPrice = await stripeFormRequest('prices', params);
    if (isDefaultCurrency) {
      // 人民币价=商品默认价（驱动结账与页面主价）。
      const dp = new URLSearchParams();
      dp.set('default_price', newPrice.id);
      await stripeFormRequest(`products/${encodeURIComponent(current.productId)}`, dp);
    } else {
      // 美元价只作副价，绝不设为默认（否则人民币结账被带偏）；停用该商品旧的同币种价，保证"最新 active 美元价"唯一。
      try {
        const list = await stripeGet(`prices?product=${encodeURIComponent(current.productId)}&active=true&limit=100`);
        const olds = ((list && list.data) || []).filter((p) => p && p.id !== newPrice.id && String(p.currency).toLowerCase() === currency);
        for (const p of olds) { const d = new URLSearchParams(); d.set('active', 'false'); await stripeFormRequest(`prices/${encodeURIComponent(p.id)}`, d); }
      } catch (e) { /* 停用旧美元价失败不阻断——resolveCurrencyPrice 取最新 active 仍正确 */ }
    }
    return send(res, 200, {
      ok: true,
      key: item.key,
      productId: current.productId,
      oldPriceId: current.effectivePriceId,
      newPriceId: newPrice.id,
      amount: amountMajor,
      currency,
      isDefault: isDefaultCurrency,
      interval: current.interval,
      note: !isDefaultCurrency
        ? '美元副价已保存（英文站结账使用）；人民币默认价不变。'
        : (current.interval ? '订阅新价格只对新订户生效；已有订户仍按旧价续费（Stripe 标准行为）。' : '新价格立即对所有新购买生效。')
    });
  } catch (error) {
    return send(res, 500, { error: 'price_update_failed', message: String(error && error.message).slice(0, 200) });
  }
}

// 特价：写入 Stripe 商品 metadata（sale_cny/sale_usd/sale_start/sale_end/sale_label）。
// 展示层划线、结账层按特价扣款、时间窗判定统一读这些字段（见 _catalog.parseSale/saleActive）。
async function setSale(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { stripeFormRequest } = await import('./_stripe.js');
  const body = req.body || {};
  const item = PRODUCT_NAME_MAP.find((x) => x.key === String(body.key || ''));
  if (!item) return send(res, 400, { error: 'invalid_key', message: '商品 key 无效。' });
  const parseAmt = (v) => (v == null || v === '') ? null : Number(v);
  const cny = parseAmt(body.cny);
  const usd = parseAmt(body.usd);
  if ((cny != null && !(cny > 0)) || (usd != null && !(usd > 0))) {
    return send(res, 400, { error: 'invalid_amount', message: '特价必须是大于 0 的数字。' });
  }
  if (cny == null && usd == null) return send(res, 400, { error: 'no_amount', message: '请至少填人民币或美元特价。' });
  if (body.start && Number.isNaN(Date.parse(body.start))) return send(res, 400, { error: 'invalid_start', message: '开始时间无法识别。' });
  if (body.end && Number.isNaN(Date.parse(body.end))) return send(res, 400, { error: 'invalid_end', message: '结束时间无法识别。' });
  const start = body.start ? new Date(body.start).toISOString() : '';
  const end = body.end ? new Date(body.end).toISOString() : '';
  if (start && end && Date.parse(end) <= Date.parse(start)) {
    return send(res, 400, { error: 'bad_window', message: '结束时间必须晚于开始时间。' });
  }
  try {
    const current = await resolveCatalogItem(item);
    if (current.status !== 'ok') return send(res, 400, { error: 'catalog_unresolved', message: '无法定位该商品：' + current.status, item: current });
    // 特价不得高于原价（防误配成"涨价"）：人民币与美元对称校验。
    if (cny != null && current.amount != null && cny >= current.amount) {
      return send(res, 400, { error: 'sale_not_lower', message: `人民币特价（¥${cny}）必须低于原价 ¥${current.amount}。` });
    }
    const usdRegular = current.usd && current.usd.amount != null ? current.usd.amount : null;
    if (usd != null && usdRegular != null && usd >= usdRegular) {
      return send(res, 400, { error: 'sale_not_lower_usd', message: `美元特价（$${usd}）必须低于原价 $${usdRegular}。` });
    }
    const label = String(body.label || '').slice(0, 60);
    const params = new URLSearchParams();
    params.set('metadata[sale_cny]', cny != null ? String(cny) : '');
    params.set('metadata[sale_usd]', usd != null ? String(usd) : '');
    params.set('metadata[sale_start]', start);
    params.set('metadata[sale_end]', end);
    params.set('metadata[sale_label]', label);
    await stripeFormRequest(`products/${encodeURIComponent(current.productId)}`, params);
    return send(res, 200, { ok: true, key: item.key, productId: current.productId, cny, usd, start, end, label, regular: current.amount });
  } catch (error) {
    return send(res, 500, { error: 'sale_update_failed', message: String(error && error.message).slice(0, 200) });
  }
}

async function clearSale(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { stripeFormRequest } = await import('./_stripe.js');
  const item = PRODUCT_NAME_MAP.find((x) => x.key === String((req.body || {}).key || ''));
  if (!item) return send(res, 400, { error: 'invalid_key', message: '商品 key 无效。' });
  try {
    const current = await resolveCatalogItem(item);
    if (current.status !== 'ok') return send(res, 400, { error: 'catalog_unresolved', message: '无法定位该商品：' + current.status, item: current });
    const params = new URLSearchParams();
    // Stripe 把 metadata 键设为空字符串即删除该键。
    ['sale_cny', 'sale_usd', 'sale_start', 'sale_end', 'sale_label'].forEach((k) => params.set(`metadata[${k}]`, ''));
    await stripeFormRequest(`products/${encodeURIComponent(current.productId)}`, params);
    return send(res, 200, { ok: true, key: item.key, cleared: true });
  } catch (error) {
    return send(res, 500, { error: 'sale_clear_failed', message: String(error && error.message).slice(0, 200) });
  }
}

// 改名：中文名同时写 product.name(Stripe 后台/发票) 与 metadata.name_zh(前端展示)；英文名写 metadata.name_en。
// 传空串=清除该名（前端/结账回退各自硬编码名）。product.name 不能为空，故仅中文非空时才改 product.name。
async function renameProduct(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { stripeFormRequest } = await import('./_stripe.js');
  const body = req.body || {};
  const item = PRODUCT_NAME_MAP.find((x) => x.key === String(body.key || ''));
  if (!item) return send(res, 400, { error: 'invalid_key', message: '商品 key 无效。' });
  const hasZh = Object.prototype.hasOwnProperty.call(body, 'nameZh');
  const hasEn = Object.prototype.hasOwnProperty.call(body, 'nameEn');
  if (!hasZh && !hasEn) return send(res, 400, { error: 'no_name', message: '请至少提供中文或英文名。' });
  const nameZh = String(body.nameZh || '').trim().slice(0, 80);
  const nameEn = String(body.nameEn || '').trim().slice(0, 80);
  try {
    const current = await resolveCatalogItem(item);
    if (current.status !== 'ok') return send(res, 400, { error: 'catalog_unresolved', message: '无法定位该商品：' + current.status, item: current });
    const params = new URLSearchParams();
    if (hasZh) { params.set('metadata[name_zh]', nameZh); if (nameZh) params.set('name', nameZh); }
    if (hasEn) params.set('metadata[name_en]', nameEn);
    await stripeFormRequest(`products/${encodeURIComponent(current.productId)}`, params);
    return send(res, 200, { ok: true, key: item.key, nameZh: hasZh ? (nameZh || null) : undefined, nameEn: hasEn ? (nameEn || null) : undefined });
  } catch (error) {
    return send(res, 500, { error: 'rename_product_failed', message: String(error && error.message).slice(0, 200) });
  }
}

// 软下架：写 metadata.madeshed_hidden。公开价格接口(health)过滤、前端不渲染该卡片。历史订单/老用户权益不受影响（不物理删除）。
async function toggleProduct(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { stripeFormRequest } = await import('./_stripe.js');
  const body = req.body || {};
  const item = PRODUCT_NAME_MAP.find((x) => x.key === String(body.key || ''));
  if (!item) return send(res, 400, { error: 'invalid_key', message: '商品 key 无效。' });
  const hidden = body.hidden === true || String(body.hidden) === '1';
  try {
    const current = await resolveCatalogItem(item);
    if (current.status !== 'ok') return send(res, 400, { error: 'catalog_unresolved', message: '无法定位该商品：' + current.status, item: current });
    const params = new URLSearchParams();
    params.set('metadata[madeshed_hidden]', hidden ? '1' : '');
    await stripeFormRequest(`products/${encodeURIComponent(current.productId)}`, params);
    return send(res, 200, { ok: true, key: item.key, hidden });
  } catch (error) {
    return send(res, 500, { error: 'toggle_product_failed', message: String(error && error.message).slice(0, 200) });
  }
}

// 一键翻译：用现有 LLM 把中文名翻成简洁英文营销名。只回填默认值，前端可改、绝不静默覆盖已填英文名。
async function translateName(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const zh = String((req.body || {}).nameZh || '').trim().slice(0, 80);
  if (!zh) return send(res, 400, { error: 'missing_name', message: '请先填中文名再翻译。' });
  const baseUrl = process.env.LLM_BASE_URL, apiKey = process.env.LLM_API_KEY, model = process.env.LLM_MODEL || 'gpt-4.1-mini';
  if (!baseUrl || !apiKey) return send(res, 503, { error: 'llm_not_configured', message: '未配置 LLM，无法自动翻译。请手动填写英文名。' });
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, temperature: 0.3,
        messages: [
          { role: 'system', content: 'You translate Chinese product names for a BaZi (Chinese astrology) × trading SaaS into a concise, natural English marketing name. Reply with ONLY the English name — no quotes, no explanation, under 60 characters.' },
          { role: 'user', content: zh }
        ]
      })
    });
    if (!response.ok) throw new Error('LLM ' + response.status);
    const data = await response.json();
    const en = String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim().replace(/^["']|["']$/g, '').slice(0, 80);
    return send(res, 200, { ok: true, nameEn: en });
  } catch (error) {
    return send(res, 500, { error: 'translate_failed', message: String(error && error.message).slice(0, 150) });
  }
}

// ===== 批3 经营可见性 =====
// 全站订单/交易台账（可搜索）：聚合点数账本 + 交易报告 + 命理报告 + 会员，按邮箱/商品/session/金额搜索。
async function transactions(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const url = new URL(req.url || '/', 'http://localhost');
  const q = String(req.query?.q || url.searchParams.get('q') || '').trim().toLowerCase();
  const kind = String(req.query?.kind || url.searchParams.get('kind') || '').trim().toLowerCase();
  try {
    const [users, credits, reports, fortunes, memberships] = await Promise.all([
      listAllAuthUsers(),
      supabaseSelect('credit_ledger', 'select=user_id,entry_type,amount,payload,stripe_session_id,reference_id,created_at&order=created_at.desc&limit=400'),
      supabaseSelect('report_entitlements', 'select=user_id,report_type,source,status,payload,stripe_session_id,created_at&order=created_at.desc&limit=300'),
      supabaseSelect('fortune_reports', 'select=user_id,report_type,access_level,context,updated_at&order=updated_at.desc&limit=300'),
      supabaseSelect('memberships', 'select=user_id,tier,status,stripe_customer_id,created_at&order=created_at.desc&limit=300')
    ]);
    const email = new Map(); (users || []).forEach((u) => email.set(u.id, u.email || ''));
    const money = (cents) => (Number(cents) ? '¥' + (Number(cents) / 100).toFixed(2) : '');
    const rows = [];
    (credits || []).forEach((c) => {
      const p = c.payload || {};
      rows.push({ kind: 'credit', at: c.created_at, email: email.get(c.user_id) || '', userId: c.user_id, title: (c.entry_type === 'purchase' ? '购买点数包' : c.entry_type === 'refund' ? '点数退款' : c.entry_type === 'admin' ? '人工调整' : c.entry_type), detail: (Number(c.amount) >= 0 ? '+' : '') + c.amount + ' 点', money: money(p.amount_total), session: c.stripe_session_id || '', ref: c.reference_id || '', status: c.entry_type });
    });
    (reports || []).filter((r) => r.source === 'purchase').forEach((r) => {
      const p = r.payload || {};
      rows.push({ kind: 'report', at: r.created_at, email: email.get(r.user_id) || '', userId: r.user_id, title: '交易报告 ' + r.report_type, detail: r.status, money: money(p.amount_total), session: r.stripe_session_id || '', ref: '', status: r.status });
    });
    (fortunes || []).filter((f) => f.access_level === 'paid').forEach((f) => {
      const c = f.context || {};
      rows.push({ kind: 'fortune', at: f.updated_at, email: email.get(f.user_id) || '', userId: f.user_id, title: '命理报告 ' + f.report_type, detail: 'paid', money: money(c.amount_total), session: c.stripe_session_id || '', ref: '', status: 'paid' });
    });
    (memberships || []).forEach((m) => {
      rows.push({ kind: 'membership', at: m.created_at, email: email.get(m.user_id) || '', userId: m.user_id, title: '会员 ' + (m.tier || ''), detail: m.status, money: '', session: '', ref: m.stripe_customer_id || '', status: m.status });
    });
    let out = rows.filter((r) => r.at);
    if (kind) out = out.filter((r) => r.kind === kind);
    if (q) out = out.filter((r) => (r.email + ' ' + r.title + ' ' + r.session + ' ' + r.ref + ' ' + r.money + ' ' + r.userId).toLowerCase().indexOf(q) >= 0);
    out.sort((a, b) => ts(b.at) - ts(a.at));
    return send(res, 200, { transactions: out.slice(0, 300), total: out.length });
  } catch (error) {
    return send(res, 500, { error: 'transactions_failed', message: error.message || '读取交易台账失败。' });
  }
}

// 后台一键退款：按 payment_intent 或 session 发起 Stripe 退款；权益回收交给现有 webhook 幂等处理。
async function refund(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { stripeFormRequest, stripeGet } = await import('./_stripe.js');
  const body = req.body || {};
  let paymentIntent = String(body.paymentIntent || '').trim();
  const sessionId = String(body.sessionId || '').trim();
  try {
    if (!paymentIntent && sessionId) {
      const s = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`);
      paymentIntent = (s && (typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id))) || '';
    }
    if (!paymentIntent) return send(res, 400, { error: 'missing_payment_intent', message: '需要 payment_intent，或能解析出它的 checkout session id。' });
    const params = new URLSearchParams();
    params.set('payment_intent', paymentIntent);
    if (body.amount != null && Number(body.amount) > 0) params.set('amount', String(Math.round(Number(body.amount) * 100)));
    params.set('metadata[by]', admin.email || '');
    const r = await stripeFormRequest('refunds', params);
    return send(res, 200, { ok: true, refund_id: r && r.id, status: r && r.status, amount: r && r.amount, note: '退款已发起；报告/会员权益回收由 webhook 自动处理（全额撤权、部分保留）。' });
  } catch (error) {
    return send(res, 500, { error: 'refund_failed', message: String((error && (error.detail?.error?.message || error.message)) || '退款失败').slice(0, 200) });
  }
}

// 手动发放报告权益（补履约）：webhook 抖动导致"付了钱没解锁"时兜底。带一年有效期（与购买一致）。
async function grantEntitlement(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const body = req.body || {};
  const userId = String(body.userId || '').trim();
  const reportType = String(body.reportType || '').trim();
  const kind = String(body.kind || 'trade').trim();
  const days = Number(body.days) > 0 ? Math.min(3650, Math.round(Number(body.days))) : 365;
  if (!userId || !reportType) return send(res, 400, { error: 'missing_params', message: '需要 userId + reportType。' });
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  try {
    if (kind === 'fortune') {
      await supabaseInsert('fortune_reports', { user_id: userId, report_key: `${reportType}-entitlement`, report_type: reportType, target_period: null, title: '已解锁命理报告（人工发放）', context: { source: 'admin_grant', by: admin.email, expires_at: expiresAt, validity_days: days }, report_html: '<div class="report-paywall">报告权益已解锁，请回到页面生成完整报告。</div>', access_level: 'paid' }, { upsert: true, onConflict: 'user_id,report_key' });
    } else {
      await supabaseInsert('report_entitlements', { user_id: userId, report_type: reportType, source: 'admin', status: 'active', payload: { by: admin.email, expires_at: expiresAt, validity_days: days } }, { upsert: true, onConflict: 'user_id,report_type' });
    }
    await supabaseInsert('membership_events', { user_id: userId, event_type: 'admin_grant_entitlement', payload: { by: admin.email, kind, reportType, days } }).catch(() => null);
    return send(res, 200, { ok: true, kind, reportType, expiresAt });
  } catch (error) {
    return send(res, 500, { error: 'grant_entitlement_failed', message: error.message });
  }
}

async function revokeEntitlement(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { supabaseUpdate } = await import('./_supabase.js');
  const body = req.body || {};
  const userId = String(body.userId || '').trim();
  const reportType = String(body.reportType || '').trim();
  const kind = String(body.kind || 'trade').trim();
  if (!userId || !reportType) return send(res, 400, { error: 'missing_params', message: '需要 userId + reportType。' });
  try {
    if (kind === 'fortune') {
      await supabaseUpdate('fortune_reports', `user_id=eq.${encodeURIComponent(userId)}&report_type=eq.${encodeURIComponent(reportType)}`, { access_level: 'preview', context: { revoked: true, by: admin.email, at: new Date().toISOString() } });
    } else {
      await supabaseUpdate('report_entitlements', `user_id=eq.${encodeURIComponent(userId)}&report_type=eq.${encodeURIComponent(reportType)}`, { status: 'refunded', payload: { revoked: true, by: admin.email, at: new Date().toISOString() } });
    }
    await supabaseInsert('membership_events', { user_id: userId, event_type: 'admin_revoke_entitlement', payload: { by: admin.email, kind, reportType } }).catch(() => null);
    return send(res, 200, { ok: true, kind, reportType, revoked: true });
  } catch (error) {
    return send(res, 500, { error: 'revoke_entitlement_failed', message: error.message });
  }
}

// ===== 批4 合规 + 审计 =====
// 删除申请队列（PIPEDA/GDPR 有法定删除时限，原来请求永远停在 requested）。
async function deleteRequests(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const [reqs, users] = await Promise.all([
      supabaseSelect('account_delete_requests', 'select=user_id,status,reason,created_at&order=created_at.desc&limit=200'),
      listAllAuthUsers()
    ]);
    const email = new Map(); (users || []).forEach((u) => email.set(u.id, u.email || ''));
    const rows = (reqs || []).map((r) => ({ ...r, email: email.get(r.user_id) || '' }));
    return send(res, 200, { requests: rows, pending: rows.filter((r) => r.status === 'requested').length });
  } catch (error) {
    return send(res, 500, { error: 'delete_requests_failed', message: error.message });
  }
}

// 履行删除：默认只标记"已处理"；hardDelete=true 时才真正删除 auth 用户（强破坏、需 UI 双重确认）。
async function fulfillDelete(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { supabaseUpdate } = await import('./_supabase.js');
  const body = req.body || {};
  const userId = String(body.userId || '').trim();
  const hardDelete = body.hardDelete === true;
  if (!userId) return send(res, 400, { error: 'missing_user_id' });
  try {
    let authDeleted = false;
    if (hardDelete) {
      // 删除前先抓邮箱+语言并发「账号已删除」确认——删除后 auth 用户消失就无从发信（隐私合规礼节）。
      let deletedEmail = null, deletedLocale = 'zh';
      try { const u = await authAdminFetch('users/' + encodeURIComponent(userId)); deletedEmail = (u && u.email) || null; } catch (e) { /* 取不到邮箱就不发确认 */ }
      try { deletedLocale = normalizeEmailLocale(await getUserLocale(userId)); } catch (e) { /* 默认简体 */ }
      await authAdminFetch('users/' + encodeURIComponent(userId), { method: 'DELETE' });
      authDeleted = true;
      try {
        if (deletedEmail) { const { subject, html } = accountDeletedEmail(deletedLocale, {}); await sendEmail({ to: deletedEmail, subject, html }); }
      } catch (e) { /* 发信失败不影响删除结果 */ }
    }
    await supabaseUpdate('account_delete_requests', `user_id=eq.${encodeURIComponent(userId)}`, { status: hardDelete ? 'fulfilled' : 'reviewed', payload: { by: admin.email, at: new Date().toISOString(), hard_delete: hardDelete } });
    await supabaseInsert('account_events', { user_id: userId, event_type: hardDelete ? 'account_deleted' : 'delete_reviewed', payload: { by: admin.email } }).catch(() => null);
    return send(res, 200, { ok: true, userId, authDeleted });
  } catch (error) {
    return send(res, 500, { error: 'fulfill_delete_failed', message: error.message });
  }
}

// 管理员操作审计日志（只读）：从既有 membership_events / account_events 汇总带 by 或含 admin/cancel/grant/revoke/refund 的事件。
// 刻意不收常规 email_confirmed / login（每次登录都产生、无操作人，纯噪音）；管理员手动验证邮箱那条带 by_admin，仍会保留。
async function auditLog(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const [memEvents, acctEvents, users] = await Promise.all([
      supabaseSelect('membership_events', 'select=user_id,event_type,payload,created_at&order=created_at.desc&limit=250'),
      supabaseSelect('account_events', 'select=user_id,event_type,payload,created_at&order=created_at.desc&limit=250'),
      listAllAuthUsers()
    ]);
    const email = new Map(); (users || []).forEach((u) => email.set(u.id, u.email || ''));
    const adminish = (ev) => /admin|override|cancel|grant|revoke|refund/i.test(ev.event_type || '') || (ev.payload && (ev.payload.by || ev.payload.by_admin));
    const rows = [];
    [...(memEvents || []), ...(acctEvents || [])].forEach((ev) => {
      if (!adminish(ev)) return;
      const by = (ev.payload && (ev.payload.by || ev.payload.by_admin)) || '';
      rows.push({ at: ev.created_at, email: email.get(ev.user_id) || '', userId: ev.user_id, event: ev.event_type, by, detail: ev.payload ? JSON.stringify(ev.payload).slice(0, 240) : '' });
    });
    rows.sort((a, b) => ts(b.at) - ts(a.at));
    return send(res, 200, { audit: rows.slice(0, 200), total: rows.length });
  } catch (error) {
    return send(res, 500, { error: 'audit_log_failed', message: error.message });
  }
}

// 补发收据：重设该扣款的 receipt_email 触发 Stripe 重新发送（需 Stripe 已开启邮件收据）。
async function resendReceipt(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { stripeFormRequest, stripeGet } = await import('./_stripe.js');
  const body = req.body || {};
  let paymentIntent = String(body.paymentIntent || '').trim();
  const sessionId = String(body.sessionId || '').trim();
  const toEmail = String(body.email || '').trim();
  try {
    if (!paymentIntent && sessionId) {
      const s = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`);
      paymentIntent = (s && (typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id))) || '';
    }
    if (!paymentIntent) return send(res, 400, { error: 'missing_payment_intent', message: '需要 payment_intent 或 session id。' });
    const pi = await stripeGet(`payment_intents/${encodeURIComponent(paymentIntent)}`);
    const chargeId = pi && (pi.latest_charge || (pi.charges && pi.charges.data && pi.charges.data[0] && pi.charges.data[0].id));
    if (!chargeId) return send(res, 400, { error: 'no_charge', message: '未找到对应扣款。' });
    const params = new URLSearchParams();
    if (toEmail) params.set('receipt_email', toEmail);
    else {
      const ch = await stripeGet(`charges/${encodeURIComponent(chargeId)}`);
      const to = ch && (ch.receipt_email || (ch.billing_details && ch.billing_details.email));
      if (!to) return send(res, 400, { error: 'no_email', message: '该扣款没有收据邮箱，请在参数里指定 email。' });
      params.set('receipt_email', to);
    }
    const r = await stripeFormRequest(`charges/${encodeURIComponent(chargeId)}`, params);
    return send(res, 200, { ok: true, charge_id: chargeId, receipt_email: r && r.receipt_email, note: 'Stripe 将向该邮箱重新发送收据（需 Stripe Dashboard 已开启邮件收据）。' });
  } catch (error) {
    return send(res, 500, { error: 'resend_receipt_failed', message: String((error && (error.detail?.error?.message || error.message)) || '重发收据失败').slice(0, 200) });
  }
}
async function fixProductNames(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { cleanEnv, stripeGet, stripeFormRequest } = await import('./_stripe.js');
  if (!process.env.STRIPE_SECRET_KEY) return send(res, 503, { error: 'stripe_not_configured', message: 'Stripe 未配置。' });
  const results = [];
  const doneProducts = new Set();
  for (const item of PRODUCT_NAME_MAP) {
    let priceId = '';
    for (const e of item.envs) { const v = cleanEnv(process.env[e]); if (v) { priceId = v; break; } }
    if (!priceId) { results.push({ name: item.name, status: 'env_missing', envs: item.envs }); continue; }
    try {
      const price = await stripeGet(`prices/${encodeURIComponent(priceId)}`);
      const productId = price && (typeof price.product === 'string' ? price.product : (price.product && price.product.id));
      if (!productId) { results.push({ name: item.name, status: 'no_product' }); continue; }
      if (doneProducts.has(productId)) { results.push({ name: item.name, status: 'dup_skipped', productId }); continue; }
      doneProducts.add(productId);
      const params = new URLSearchParams();
      params.set('name', item.name);
      params.set('description', item.description);
      await stripeFormRequest(`products/${encodeURIComponent(productId)}`, params);
      results.push({ name: item.name, status: 'updated', productId });
    } catch (error) {
      results.push({ name: item.name, status: 'error', error: String(error && error.message).slice(0, 140) });
    }
  }
  return send(res, 200, { ok: true, updated: results.filter((r) => r.status === 'updated').length, results });
}

// 一键把履约所需事件补进 Stripe webhook endpoint（幂等：合并现有 enabled_events，不删任何已订阅事件）。
// dashboard 的事件选择器是自定义组件、自动化不可靠，用 API 直接更新最稳。
async function addWebhookEvents(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { stripeGet, stripeFormRequest } = await import('./_stripe.js');
  if (!process.env.STRIPE_SECRET_KEY) return send(res, 503, { error: 'stripe_not_configured' });
  const WANT = ['invoice.payment_failed', 'charge.dispute.created', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'];
  try {
    const list = await stripeGet('webhook_endpoints?limit=30');
    const ep = ((list && list.data) || []).find((e) => /stripe-webhook/.test(e.url || ''));
    if (!ep) return send(res, 404, { error: 'endpoint_not_found', message: '未找到 /api/stripe-webhook 的 webhook endpoint。' });
    const current = ep.enabled_events || [];
    if (current.indexOf('*') >= 0) return send(res, 200, { ok: true, note: 'endpoint 已监听全部事件(*)，无需添加', before: current.length });
    const missing = WANT.filter((e) => current.indexOf(e) < 0);
    if (!missing.length) return send(res, 200, { ok: true, already: true, before: current.length, addedCount: 0 });
    const merged = Array.from(new Set(current.concat(WANT)));
    const params = new URLSearchParams();
    merged.forEach((e) => params.append('enabled_events[]', e));
    const updated = await stripeFormRequest(`webhook_endpoints/${encodeURIComponent(ep.id)}`, params);
    return send(res, 200, { ok: true, endpoint: ep.url, before: current.length, after: (updated.enabled_events || []).length, addedCount: missing.length });
  } catch (error) {
    return send(res, 500, { error: 'add_events_failed', message: String(error && (error.detail && error.detail.error && error.detail.error.message || error.message)).slice(0, 200) });
  }
}

export default async function handler(req, res) {
  const action = requestAction(req);
  if (action === 'whoami') return whoami(req, res);
  if (action === 'overview') return overview(req, res);
  if (action === 'users') return usersList(req, res);
  if (action === 'user') return userDetail(req, res);
  if (action === 'grant-credits') return grantCredits(req, res);
  if (action === 'set-membership') return setMembership(req, res);
  if (action === 'cancel-subscription') return cancelSubscription(req, res);
  if (action === 'verify-email') return verifyEmail(req, res);
  if (action === 'fix-product-names') return fixProductNames(req, res);
  if (action === 'list-prices') return listPrices(req, res);
  if (action === 'update-price') return updatePrice(req, res);
  if (action === 'set-sale') return setSale(req, res);
  if (action === 'clear-sale') return clearSale(req, res);
  if (action === 'rename-product') return renameProduct(req, res);
  if (action === 'toggle-product') return toggleProduct(req, res);
  if (action === 'translate-name') return translateName(req, res);
  if (action === 'transactions') return transactions(req, res);
  if (action === 'refund') return refund(req, res);
  if (action === 'grant-entitlement') return grantEntitlement(req, res);
  if (action === 'revoke-entitlement') return revokeEntitlement(req, res);
  if (action === 'delete-requests') return deleteRequests(req, res);
  if (action === 'fulfill-delete') return fulfillDelete(req, res);
  if (action === 'audit-log') return auditLog(req, res);
  if (action === 'resend-receipt') return resendReceipt(req, res);
  if (action === 'add-webhook-events') return addWebhookEvents(req, res);
  return send(res, 400, {
    error: 'invalid_admin_action',
    message: '后台接口 action 无效。',
    actions: ['whoami', 'overview', 'users', 'user', 'grant-credits', 'set-membership', 'cancel-subscription', 'verify-email', 'fix-product-names', 'list-prices', 'update-price', 'set-sale', 'clear-sale', 'rename-product', 'toggle-product', 'translate-name', 'transactions', 'refund', 'grant-entitlement', 'revoke-entitlement', 'delete-requests', 'fulfill-delete', 'audit-log', 'resend-receipt']
  });
}
