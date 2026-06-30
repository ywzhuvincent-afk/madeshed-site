import { getUserFromRequest, hasSupabaseService } from './_supabase.js';

const CREDIT_PACK_PRODUCT = {
  credits: 10,
  label: '问大师 10 点包',
  price: '¥99'
};

function send(res, status, body) {
  res.status(status).json(body);
}

function originFromReq(req) {
  return process.env.PUBLIC_SITE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_CREDIT_PRICE_ID;
  if (!hasSupabaseService()) {
    return send(res, 503, { error: 'supabase_service_not_configured', message: '云端点数账本暂未配置，暂不能购买点数。' });
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录后再购买点数。' });
  if (!secret || !priceId) {
    return send(res, 503, { error: 'stripe_not_configured', message: '点数购买暂未配置 Stripe。' });
  }
  const stripeResource = 'checkout.sessions';
  const successUrl = `${originFromReq(req)}/#/fortune?credits=success`;
  const cancelUrl = `${originFromReq(req)}/#/fortune?credits=cancel`;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  const checkoutMode = "mode:'payment'";
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('metadata[product]', 'credit_pack');
  params.set('metadata[credits]', String(CREDIT_PACK_PRODUCT.credits));
  params.set('metadata[user_id]', auth.user.id);

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  const data = await response.json();
  if (!response.ok) return send(res, response.status, { error: 'stripe_error', detail: data, stripeResource, checkoutMode });
  return send(res, 200, { url: data.url, id: data.id, stripeResource, checkoutMode, product: CREDIT_PACK_PRODUCT });
}
