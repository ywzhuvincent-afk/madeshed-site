import {
  getUserFromRequest,
  hasSupabaseService,
  hasVerifiedEmail,
  supabaseSelect,
  supabaseInsert
} from './_supabase.js';

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
    const [users, accounts, memberships, credits, checkins, reports, questions] = await Promise.all([
      listAllAuthUsers(),
      supabaseSelect('account_profiles', 'select=user_id,display_name,locale,marketing_opt_in'),
      supabaseSelect('memberships', 'select=user_id,tier,status,current_period_end'),
      supabaseSelect('credit_ledger', 'select=user_id,amount,entry_type'),
      supabaseSelect('checkins', 'select=user_id'),
      supabaseSelect('report_entitlements', 'select=user_id,report_type,source,status'),
      supabaseSelect('master_questions', 'select=user_id,credits_spent')
    ]);
    const now = Date.now();
    const d7 = now - 7 * 86400000;
    const d30 = now - 30 * 86400000;
    const activeMembers = memberships.filter((m) => m.status === 'active' || m.status === 'trialing');
    const creditsOutstanding = credits.reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const reportPurchases = reports.filter((r) => r.source === 'purchase').length;
    const creditPurchases = credits.filter((c) => c.entry_type === 'purchase').length;
    return send(res, 200, {
      overview: {
        totalUsers: users.length,
        verifiedUsers: users.filter((u) => u.email_confirmed_at || u.confirmed_at).length,
        signups7d: users.filter((u) => ts(u.created_at) >= d7).length,
        signups30d: users.filter((u) => ts(u.created_at) >= d30).length,
        activeMembers: activeMembers.length,
        ultimateMembers: activeMembers.filter((m) => m.tier === 'ultimate').length,
        withChart: accounts.length,
        creditsOutstanding: Math.max(0, creditsOutstanding),
        checkins: checkins.length,
        reportPurchases,
        creditPurchases,
        masterQuestions: questions.length,
        marketingOptIn: accounts.filter((a) => a.marketing_opt_in).length,
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
  if (!userId) return send(res, 400, { error: 'missing_user_id', message: '缺少 userId。' });
  if (!Number.isFinite(amount) || amount === 0) return send(res, 400, { error: 'invalid_amount', message: '请输入非零整数点数（可为负数扣减）。' });
  try {
    const existing = await supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&select=amount`);
    const before = (existing || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const after = before + amount;
    const rows = await supabaseInsert('credit_ledger', {
      user_id: userId,
      entry_type: 'admin',
      amount,
      balance_after: after,
      reference_type: 'admin_grant',
      payload: { note: note || null, by: admin.email, at: new Date().toISOString() }
    });
    return send(res, 200, { ok: true, entry: rows[0] || null, balanceBefore: Math.max(0, before), balanceAfter: Math.max(0, after) });
  } catch (error) {
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
    const rows = await supabaseInsert('memberships', {
      user_id: userId,
      tier,
      status,
      current_period_end: currentPeriodEnd,
      payload: { ...((prev && prev.payload) || {}), admin_overrides: overrides }
    }, { upsert: true, onConflict: 'user_id' });
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

// 商品目录（后台价格管理 + 商品改名共用）：按价格环境变量锚定 Stripe 商品。
// 改价采用 Stripe 标准做法：在同一商品上创建新价格并设为 default_price（价格对象金额不可改）；
// 结账端(api/checkout.js resolveEffectivePrice)自动跟随商品当前默认价，改价立即生效、无需重新部署。
const PRODUCT_NAME_MAP = [
  { key: 'credit', envs: ['STRIPE_CREDIT_PRICE_ID'], name: '问大师 10 点包', description: '问大师 AI 命理咨询 10 点点数包（普通问题 1 点、深度分析 3 点）。' },
  { key: 'ultimate', envs: ['STRIPE_ULTIMATE_PRICE_ID', 'STRIPE_MEMBERSHIP_PRICE_ID'], name: '最高级会员（订阅）', description: '固定命理报告免费生成 + 问大师每月赠送 30 点，适合高频咨询与长期复盘。' },
  { key: 'report_7', envs: ['STRIPE_REPORT_7_PRICE_ID'], name: '交易复盘报告 · 近 7 天', description: '基于你的真实打卡记录生成的近 7 天交易复盘报告。' },
  { key: 'report_30', envs: ['STRIPE_REPORT_30_PRICE_ID', 'STRIPE_REPORT_PRICE_ID'], name: '交易复盘报告 · 月度', description: '基于真实记录的月度交易复盘报告。' },
  { key: 'report_365', envs: ['STRIPE_REPORT_365_PRICE_ID'], name: '交易复盘报告 · 年度', description: '基于真实记录的年度交易复盘报告。' },
  { key: 'report_all', envs: ['STRIPE_REPORT_ALL_PRICE_ID'], name: '交易复盘报告 · 全部历史', description: '基于全部历史记录的交易复盘报告。' },
  { key: 'fortune_full', envs: ['STRIPE_FORTUNE_FULL_PRICE_ID'], name: '八字全盘解读', description: '日主强弱、用神喜忌、婚姻、事业、财运、健康的长期主题解读。' },
  { key: 'fortune_dayun', envs: ['STRIPE_FORTUNE_DAYUN_PRICE_ID'], name: '流年大运解读', description: '当前大运、今年流年、以及未来三年的高低节奏。' },
  { key: 'fortune_month', envs: ['STRIPE_FORTUNE_MONTH_PRICE_ID'], name: '每月运程报告', description: '流月五行、财星与风险，本月适合推进 / 观望 / 避险的时间窗口。' }
];
const ZERO_DECIMAL_CURRENCIES = ['jpy', 'krw', 'vnd', 'clp'];
function toUnitAmount(amountMajor, currency) {
  const zero = ZERO_DECIMAL_CURRENCIES.indexOf(String(currency || '').toLowerCase()) >= 0;
  return Math.round(Number(amountMajor) * (zero ? 1 : 100));
}
function fromUnitAmount(unitAmount, currency) {
  const zero = ZERO_DECIMAL_CURRENCIES.indexOf(String(currency || '').toLowerCase()) >= 0;
  return Number(unitAmount) / (zero ? 1 : 100);
}
async function resolveCatalogItem(item, stripeGet, cleanEnvFn) {
  let priceId = '';
  for (const e of item.envs) { const v = cleanEnvFn(process.env[e]); if (v) { priceId = v; break; } }
  if (!priceId) return { key: item.key, name: item.name, status: 'env_missing' };
  const anchorPrice = await stripeGet(`prices/${encodeURIComponent(priceId)}`);
  const productId = anchorPrice && (typeof anchorPrice.product === 'string' ? anchorPrice.product : anchorPrice.product && anchorPrice.product.id);
  if (!productId) return { key: item.key, name: item.name, status: 'no_product' };
  const product = await stripeGet(`products/${encodeURIComponent(productId)}`);
  let effective = anchorPrice;
  const defaultPriceId = product && (typeof product.default_price === 'string' ? product.default_price : product.default_price && product.default_price.id);
  if (defaultPriceId && defaultPriceId !== priceId) {
    const dp = await stripeGet(`prices/${encodeURIComponent(defaultPriceId)}`);
    if (dp && dp.active && dp.unit_amount) effective = dp;
  }
  return {
    key: item.key,
    name: (product && product.name) || item.name,
    status: 'ok',
    productId,
    anchorPriceId: priceId,
    effectivePriceId: effective.id,
    currency: effective.currency,
    unitAmount: effective.unit_amount,
    amount: fromUnitAmount(effective.unit_amount, effective.currency),
    interval: (effective.recurring && effective.recurring.interval) || null
  };
}
async function listPrices(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { cleanEnv, stripeGet } = await import('./_stripe.js');
  if (!process.env.STRIPE_SECRET_KEY) return send(res, 503, { error: 'stripe_not_configured', message: 'Stripe 未配置。' });
  const items = [];
  for (const item of PRODUCT_NAME_MAP) {
    try { items.push(await resolveCatalogItem(item, stripeGet, cleanEnv)); }
    catch (error) { items.push({ key: item.key, name: item.name, status: 'error', error: String(error && error.message).slice(0, 120) }); }
  }
  return send(res, 200, { ok: true, items });
}
async function updatePrice(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { cleanEnv, stripeGet, stripeFormRequest } = await import('./_stripe.js');
  const body = req.body || {};
  const item = PRODUCT_NAME_MAP.find((x) => x.key === String(body.key || ''));
  const amountMajor = Number(body.amount);
  if (!item) return send(res, 400, { error: 'invalid_key', message: '商品 key 无效。' });
  if (!Number.isFinite(amountMajor) || amountMajor <= 0 || amountMajor > 1000000) {
    return send(res, 400, { error: 'invalid_amount', message: '价格无效：必须是大于 0 的数字。' });
  }
  try {
    const current = await resolveCatalogItem(item, stripeGet, cleanEnv);
    if (current.status !== 'ok') return send(res, 400, { error: 'catalog_unresolved', message: '无法定位该商品：' + current.status, item: current });
    const unitAmount = toUnitAmount(amountMajor, current.currency);
    const params = new URLSearchParams();
    params.set('product', current.productId);
    params.set('currency', current.currency);
    params.set('unit_amount', String(unitAmount));
    if (current.interval) params.set('recurring[interval]', current.interval);
    params.set('metadata[source]', 'admin_price_update');
    params.set('metadata[updated_by]', admin.email || '');
    const newPrice = await stripeFormRequest('prices', params);
    const dp = new URLSearchParams();
    dp.set('default_price', newPrice.id);
    await stripeFormRequest(`products/${encodeURIComponent(current.productId)}`, dp);
    return send(res, 200, {
      ok: true,
      key: item.key,
      productId: current.productId,
      oldPriceId: current.effectivePriceId,
      newPriceId: newPrice.id,
      amount: amountMajor,
      currency: current.currency,
      interval: current.interval,
      note: current.interval ? '订阅新价格只对新订户生效；已有订户仍按旧价续费（Stripe 标准行为）。' : '新价格立即对所有新购买生效。'
    });
  } catch (error) {
    return send(res, 500, { error: 'price_update_failed', message: String(error && error.message).slice(0, 200) });
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

export default async function handler(req, res) {
  const action = requestAction(req);
  if (action === 'whoami') return whoami(req, res);
  if (action === 'overview') return overview(req, res);
  if (action === 'users') return usersList(req, res);
  if (action === 'user') return userDetail(req, res);
  if (action === 'grant-credits') return grantCredits(req, res);
  if (action === 'set-membership') return setMembership(req, res);
  if (action === 'verify-email') return verifyEmail(req, res);
  if (action === 'fix-product-names') return fixProductNames(req, res);
  if (action === 'list-prices') return listPrices(req, res);
  if (action === 'update-price') return updatePrice(req, res);
  return send(res, 400, {
    error: 'invalid_admin_action',
    message: '后台接口 action 无效。',
    actions: ['whoami', 'overview', 'users', 'user', 'grant-credits', 'set-membership', 'verify-email', 'fix-product-names', 'list-prices', 'update-price']
  });
}
