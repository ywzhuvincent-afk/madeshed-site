import { getUserFromRequest, hasSupabaseService, supabaseSelect } from './_supabase.js';
import { siteOrigin, stripeFormRequest } from './_stripe.js';

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  if (!hasSupabaseService()) {
    return send(res, 503, { error: 'supabase_service_not_configured', message: '会员账号系统暂未连接云端。' });
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录后再管理会员。' });
  }
  const rows = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(auth.user.id)}&select=stripe_customer_id,status,tier&limit=1`);
  const membership = rows[0];
  if (!membership || !membership.stripe_customer_id) {
    return send(res, 404, { error: 'membership_not_found', message: '当前账号还没有可管理的 Stripe 会员订阅。' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return send(res, 503, { error: 'stripe_not_configured', message: 'Stripe 暂未配置，不能打开会员管理页面。' });
  }
  const params = new URLSearchParams();
  params.set('customer', membership.stripe_customer_id);
  params.set('return_url', `${siteOrigin(req)}/#/account`);
  try {
    const session = await stripeFormRequest('billing_portal/sessions', params);
    return send(res, 200, { url: session.url, id: session.id });
  } catch (error) {
    return send(res, error.status || 500, {
      error: error.message || 'stripe_error',
      detail: error.detail || null,
      message: '会员管理页面创建失败，请稍后再试。'
    });
  }
}
