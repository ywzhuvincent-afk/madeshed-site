import {
  LEGAL_DOCUMENT_VERSIONS,
  LEGALLY_REQUIRED_ACCEPTANCES,
  accountStatusForUser,
  getUserFromRequest,
  hasSupabaseService,
  hasVerifiedEmail,
  logAccountEvent,
  requestIpHash,
  requestUserAgent,
  supabaseInsert,
  supabaseSelect
} from './_supabase.js';

const LEGAL_DOCUMENT_TYPES = new Set(LEGALLY_REQUIRED_ACCEPTANCES);

function send(res, status, body) {
  res.status(status).json(body);
}

function requestAction(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  return String(req.query?.action || url.searchParams.get('action') || req.body?.action || '').trim().toLowerCase();
}

async function requireUser(req, res) {
  if (!hasSupabaseService()) {
    send(res, 503, { error: 'supabase_service_not_configured', message: '账号系统暂未连接云端。' });
    return null;
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录。' });
    return null;
  }
  return auth.user;
}

async function bootstrapAccount(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res);
  if (!user) return null;

  const body = req.body || {};
  const displayName = String(body.display_name || body.displayName || user.user_metadata?.display_name || '').trim().slice(0, 80);
  const marketingOptIn = body.marketing_opt_in === true || body.marketingOptIn === true;
  const payload = {
    user_id: user.id,
    email: user.email || '',
    display_name: displayName || null,
    locale: String(body.locale || 'zh-CN').slice(0, 20),
    timezone: String(body.timezone || 'America/Vancouver').slice(0, 80),
    marketing_opt_in: marketingOptIn,
    onboarding_status: String(body.onboarding_status || body.onboardingStatus || 'started').slice(0, 40),
    payload: {
      email_confirmed_at: user.email_confirmed_at || user.confirmed_at || null,
      provider: user.app_metadata?.provider || 'email'
    }
  };

  try {
    const rows = await supabaseInsert('account_profiles', payload, { upsert: true, onConflict: 'user_id' });
    await logAccountEvent(req, user.id, hasVerifiedEmail(user) ? 'email_confirmed' : 'login', {
      display_name: displayName || null,
      email_confirmed_at: payload.payload.email_confirmed_at
    });
    return send(res, 200, {
      profile: rows[0] || payload,
      email_confirmed_at: payload.payload.email_confirmed_at
    });
  } catch (error) {
    return send(res, 500, { error: 'account_bootstrap_failed', message: error.message || '账号初始化失败。' });
  }
}

async function accountStatus(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res);
  if (!user) return null;

  try {
    const account = await accountStatusForUser(user);
    return send(res, 200, {
      account,
      emailConfirmed: account.emailConfirmed,
      legalComplete: account.legalComplete,
      missingLegal: account.missingLegal,
      membership: account.membership,
      creditBalance: account.creditBalance
    });
  } catch (error) {
    return send(res, 500, { error: 'account_status_failed', message: error.message || '读取账号状态失败。' });
  }
}

async function acceptLegal(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res);
  if (!user) return null;

  const requested = Array.isArray(req.body?.documents)
    ? req.body.documents
    : [req.body?.document_type || req.body?.documentType].filter(Boolean);
  const documents = [...new Set(requested.map((type) => String(type)))].filter((type) => LEGAL_DOCUMENT_TYPES.has(type));
  if (!documents.length) {
    return send(res, 400, { error: 'invalid_document_type', message: '请选择需要确认的法律文件。' });
  }

  const rows = documents.map((documentType) => ({
    user_id: user.id,
    document_type: documentType,
    document_version: LEGAL_DOCUMENT_VERSIONS[documentType],
    accepted_at: new Date().toISOString(),
    ip_hash: requestIpHash(req),
    user_agent: requestUserAgent(req),
    payload: {
      source: req.body?.source || 'account_flow',
      legal_document_types: [...LEGAL_DOCUMENT_TYPES]
    }
  }));

  try {
    const saved = await supabaseInsert('legal_acceptances', rows, { upsert: true, onConflict: 'user_id,document_type' });
    await logAccountEvent(req, user.id, 'legal_acceptance', {
      documents,
      versions: LEGAL_DOCUMENT_VERSIONS
    });
    return send(res, 200, { acceptances: saved, versions: LEGAL_DOCUMENT_VERSIONS });
  } catch (error) {
    return send(res, 500, { error: 'legal_acceptance_failed', message: error.message || '保存法律同意失败。' });
  }
}

async function requestAccountDelete(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res);
  if (!user) return null;

  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  try {
    const rows = await supabaseInsert('account_delete_requests', {
      user_id: user.id,
      reason: reason || null,
      status: 'requested',
      payload: { email: user.email || '', delete_requested: true }
    });
    await logAccountEvent(req, user.id, 'delete_requested', { reason: reason || null });
    return send(res, 200, { request: rows[0], delete_requested: true });
  } catch (error) {
    return send(res, 500, { error: 'delete_request_failed', message: error.message || '提交删除账号申请失败。' });
  }
}

// 购买与点数记录：用户自助查看订单/点数流水/已解锁权益（专业购买流程标配，曾完全缺失）
async function purchaseHistory(req, res) {
  const auth = await getUserFromRequest(req);
  if (!auth.user) return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录。' });
  if (!hasSupabaseService()) return send(res, 503, { error: 'supabase_service_not_configured' });
  const uid = encodeURIComponent(auth.user.id);
  try {
    const [ledger, reports, fortunes, memberships] = await Promise.all([
      supabaseSelect('credit_ledger', `user_id=eq.${uid}&select=entry_type,amount,balance_after,reference_type,created_at,payload&order=created_at.desc&limit=50`),
      supabaseSelect('report_entitlements', `user_id=eq.${uid}&select=report_type,status,source,payload,created_at&order=created_at.desc&limit=20`),
      supabaseSelect('fortune_reports', `user_id=eq.${uid}&select=report_type,access_level,context,updated_at&order=updated_at.desc&limit=20`),
      supabaseSelect('memberships', `user_id=eq.${uid}&select=tier,status,current_period_end,payload,created_at&limit=1`)
    ]);
    return send(res, 200, { ok: true, ledger, reports, fortunes, membership: memberships[0] || null });
  } catch (error) {
    return send(res, 500, { error: 'purchase_history_failed', message: error.message });
  }
}

export default async function handler(req, res) {
  const action = requestAction(req);
  if (action === 'bootstrap') return bootstrapAccount(req, res);
  if (action === 'status') return accountStatus(req, res);
  if (action === 'legal') return acceptLegal(req, res);
  if (action === 'delete') return requestAccountDelete(req, res);
  if (action === 'purchases') return purchaseHistory(req, res);
  return send(res, 400, {
    error: 'invalid_account_action',
    message: '账号接口 action 无效。',
    actions: ['bootstrap', 'status', 'legal', 'delete', 'purchases']
  });
}
