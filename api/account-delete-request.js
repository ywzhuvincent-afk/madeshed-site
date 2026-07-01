import {
  getUserFromRequest,
  hasSupabaseService,
  logAccountEvent,
  supabaseInsert
} from './_supabase.js';

const ACCOUNT_EVENTS_TABLE = 'account_events';

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  if (!hasSupabaseService()) {
    return send(res, 503, { error: 'supabase_service_not_configured', message: '账号删除申请系统暂未连接云端。' });
  }

  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录。' });
  }

  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  try {
    const rows = await supabaseInsert('account_delete_requests', {
      user_id: auth.user.id,
      reason: reason || null,
      status: 'requested',
      payload: { email: auth.user.email || '', delete_requested: true }
    });
    await logAccountEvent(req, auth.user.id, 'delete_requested', { reason: reason || null });
    return send(res, 200, { request: rows[0], delete_requested: true });
  } catch (error) {
    return send(res, 500, { error: 'delete_request_failed', message: error.message || '提交删除账号申请失败。' });
  }
}
