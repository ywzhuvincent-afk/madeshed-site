import { getUserFromRequest, hasSupabaseService, requireAccountReadyForPaidAction } from './_supabase.js';
import { priceFromEnv, siteOrigin, stripeFormRequest } from './_stripe.js';

const MEMBERSHIP_PRODUCTS = {
  ultimate: {
    label: '最高级会员',
    price: '¥199/月',
    monthlyCredits: 30,
    priceEnv: ['STRIPE_ULTIMATE_PRICE_ID', 'STRIPE_MEMBERSHIP_PRICE_ID']
  }
};

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
    return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录后再开通会员。' });
  }
  const readiness = await requireAccountReadyForPaidAction(req, auth.user);
  if (!readiness.ok) return send(res, readiness.status, readiness.body);

  const tier = req.body && req.body.tier === 'ultimate' ? 'ultimate' : 'ultimate';
  const product = MEMBERSHIP_PRODUCTS[tier];
  const price = priceFromEnv(product.priceEnv);
  if (!process.env.STRIPE_SECRET_KEY || !price.value) {
    return send(res, 503, {
      error: 'stripe_not_configured',
      message: `会员订阅暂未配置 Stripe。缺少 ${!process.env.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY' : price.key}。`,
      missing: !process.env.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY' : price.key
    });
  }

  const origin = siteOrigin(req);
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', price.value);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', `${origin}/#/account?membership=success`);
  params.set('cancel_url', `${origin}/#/account?membership=cancel`);
  params.set('client_reference_id', auth.user.id);
  if (auth.user.email) params.set('customer_email', auth.user.email);
  params.set('allow_promotion_codes', 'true');
  params.set('metadata[product]', 'membership');
  params.set('metadata[user_id]', auth.user.id);
  params.set('metadata[tier]', tier);
  params.set('metadata[monthly_credits]', String(product.monthlyCredits));
  params.set('subscription_data[metadata][product]', 'membership');
  params.set('subscription_data[metadata][user_id]', auth.user.id);
  params.set('subscription_data[metadata][tier]', tier);
  params.set('subscription_data[metadata][monthly_credits]', String(product.monthlyCredits));

  try {
    const session = await stripeFormRequest('checkout/sessions', params);
    return send(res, 200, {
      url: session.url,
      id: session.id,
      mode: 'subscription',
      product,
      priceEnv: price.key
    });
  } catch (error) {
    return send(res, error.status || 500, {
      error: error.message || 'stripe_error',
      detail: error.detail || null,
      message: '会员订阅页面创建失败，请稍后再试。'
    });
  }
}
