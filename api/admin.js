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
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || 'ywzhuvincent@gmail.com')
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

async function authAdminFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` }
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

export default async function handler(req, res) {
  const action = requestAction(req);
  if (action === 'whoami') return whoami(req, res);
  if (action === 'overview') return overview(req, res);
  if (action === 'users') return usersList(req, res);
  if (action === 'user') return userDetail(req, res);
  if (action === 'grant-credits') return grantCredits(req, res);
  return send(res, 400, {
    error: 'invalid_admin_action',
    message: '后台接口 action 无效。',
    actions: ['whoami', 'overview', 'users', 'user', 'grant-credits']
  });
}
