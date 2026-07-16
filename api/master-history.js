import { getUserFromRequest, hasSupabaseService, supabaseSelect } from './_supabase.js';
import { resolveUserLocale, t } from './_locale.js';

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  if (!hasSupabaseService()) {
    return send(res, 200, {
      source: 'master_questions',
      history: [],
      message: t(await resolveUserLocale(req, null), 'master_history_placeholder')
    });
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) return send(res, 401, { error: auth.error || 'unauthorized', history: [] });
  const history = await supabaseSelect(
    'master_questions',
    `user_id=eq.${encodeURIComponent(auth.user.id)}&select=category,horizon,depth,target_date,target_month,question,credits_spent,answer_html,status,created_at&order=created_at.desc&limit=50`
  );
  return send(res, 200, { source: 'master_questions', history });
}
