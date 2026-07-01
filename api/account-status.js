import {
  accountStatusForUser,
  getUserFromRequest,
  hasSupabaseService
} from './_supabase.js';

const ACCOUNT_STATUS_TABLES = [
  'account_profiles',
  'legal_acceptances',
  'memberships',
  'credit_ledger'
];

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  if (!hasSupabaseService()) {
    return send(res, 503, { error: 'supabase_service_not_configured', message: '账号状态系统暂未连接云端。' });
  }

  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录。' });
  }

  try {
    const account = await accountStatusForUser(auth.user);
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
