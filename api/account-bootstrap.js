import {
  getUserFromRequest,
  hasSupabaseService,
  hasVerifiedEmail,
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
    return send(res, 503, { error: 'supabase_service_not_configured', message: '账号系统暂未连接云端。' });
  }

  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录。' });
  }

  const body = req.body || {};
  const displayName = String(body.display_name || body.displayName || auth.user.user_metadata?.display_name || '').trim().slice(0, 80);
  const marketingOptIn = body.marketing_opt_in === true || body.marketingOptIn === true;
  const payload = {
    user_id: auth.user.id,
    email: auth.user.email || '',
    display_name: displayName || null,
    locale: String(body.locale || 'zh-CN').slice(0, 20),
    timezone: String(body.timezone || 'America/Vancouver').slice(0, 80),
    marketing_opt_in: marketingOptIn,
    onboarding_status: String(body.onboarding_status || body.onboardingStatus || 'started').slice(0, 40),
    payload: {
      email_confirmed_at: auth.user.email_confirmed_at || auth.user.confirmed_at || null,
      provider: auth.user.app_metadata?.provider || 'email'
    }
  };

  try {
    const rows = await supabaseInsert('account_profiles', payload, { upsert: true, onConflict: 'user_id' });
    await logAccountEvent(req, auth.user.id, hasVerifiedEmail(auth.user) ? 'email_confirmed' : 'login', {
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
