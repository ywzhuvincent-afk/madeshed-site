import { getUserFromRequest, hasSupabaseService, requireAccountReadyForPaidAction, supabaseSelect } from './_supabase.js';
import { priceFromEnv, siteOrigin, stripeFormRequest } from './_stripe.js';

const CREDIT_PACK_PRODUCT = {
  credits: 10,
  label: '问大师 10 点包',
  price: '¥99'
};

const MEMBERSHIP_PRODUCTS = {
  ultimate: {
    label: '最高级会员',
    price: '¥199/月',
    monthlyCredits: 30,
    priceEnv: ['STRIPE_ULTIMATE_PRICE_ID', 'STRIPE_MEMBERSHIP_PRICE_ID']
  }
};

const REPORT_PRODUCTS = {
  '7': { label: '7 天报告', priceEnv: ['STRIPE_REPORT_7_PRICE_ID'] },
  '30': { label: '月度报告', priceEnv: ['STRIPE_REPORT_30_PRICE_ID', 'STRIPE_REPORT_PRICE_ID'] },
  '365': { label: '年度报告', priceEnv: ['STRIPE_REPORT_365_PRICE_ID'] },
  all: { label: '全部历史报告', priceEnv: ['STRIPE_REPORT_ALL_PRICE_ID'] }
};

const FORTUNE_PRODUCTS = {
  full: { label: '全盘解读', priceEnv: ['STRIPE_FORTUNE_FULL_PRICE_ID'] },
  dayun: { label: '流年大运解读', priceEnv: ['STRIPE_FORTUNE_DAYUN_PRICE_ID'] },
  month: { label: '每月运程', priceEnv: ['STRIPE_FORTUNE_MONTH_PRICE_ID'] }
};

function send(res, status, body) {
  res.status(status).json(body);
}

function requestAction(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  return String(req.query?.action || url.searchParams.get('action') || req.body?.action || '').trim().toLowerCase();
}

async function requireUser(req, res, message) {
  if (!hasSupabaseService()) {
    send(res, 503, { error: 'supabase_service_not_configured', message: '会员账号系统暂未连接云端。' });
    return null;
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    send(res, 401, { error: auth.error || 'unauthorized', message });
    return null;
  }
  return auth.user;
}

async function ensurePaidAccount(req, res, user) {
  const readiness = await requireAccountReadyForPaidAction(req, user);
  if (!readiness.ok) {
    send(res, readiness.status, readiness.body);
    return null;
  }
  return readiness.account;
}

async function createCreditCheckout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res, '请先登录后再购买点数。');
  if (!user) return null;
  if (!(await ensurePaidAccount(req, res, user))) return null;

  const priceId = process.env.STRIPE_CREDIT_PRICE_ID;
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return send(res, 503, { error: 'stripe_not_configured', message: '点数购买暂未配置 Stripe。' });
  }

  const origin = siteOrigin(req);
  const stripeResource = 'checkout.sessions';
  const checkoutMode = "mode:'payment'";
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', `${origin}/#/fortune?credits=success`);
  params.set('cancel_url', `${origin}/#/fortune?credits=cancel`);
  params.set('metadata[product]', 'credit_pack');
  params.set('metadata[credits]', String(CREDIT_PACK_PRODUCT.credits));
  params.set('metadata[user_id]', user.id);

  try {
    const session = await stripeFormRequest('checkout/sessions', params);
    return send(res, 200, { url: session.url, id: session.id, stripeResource, checkoutMode, product: CREDIT_PACK_PRODUCT });
  } catch (error) {
    return send(res, error.status || 500, { error: error.message || 'stripe_error', detail: error.detail || null, stripeResource, checkoutMode });
  }
}

async function createMembershipCheckout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res, '请先登录后再开通会员。');
  if (!user) return null;
  if (!(await ensurePaidAccount(req, res, user))) return null;

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
  params.set('client_reference_id', user.id);
  if (user.email) params.set('customer_email', user.email);
  params.set('allow_promotion_codes', 'true');
  params.set('metadata[product]', 'membership');
  params.set('metadata[user_id]', user.id);
  params.set('metadata[tier]', tier);
  params.set('metadata[monthly_credits]', String(product.monthlyCredits));
  params.set('subscription_data[metadata][product]', 'membership');
  params.set('subscription_data[metadata][user_id]', user.id);
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

function reportProductFor(body) {
  const kind = body.productKind === 'fortune_report' || body.fortuneReportType ? 'fortune_report' : 'report';
  const type = kind === 'fortune_report' ? String(body.fortuneReportType || body.reportType || 'full') : String(body.reportType || '30');
  const config = kind === 'fortune_report' ? FORTUNE_PRODUCTS[type] : REPORT_PRODUCTS[type];
  return config ? { kind, type, config } : null;
}

async function createReportCheckout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res, '请先登录后再购买报告。');
  if (!user) return null;
  if (!(await ensurePaidAccount(req, res, user))) return null;

  const item = reportProductFor(req.body || {});
  if (!item) return send(res, 400, { error: 'invalid_report_type', message: '报告类型无效。' });
  const price = priceFromEnv(item.config.priceEnv);
  if (!process.env.STRIPE_SECRET_KEY || !price.value) {
    return send(res, 503, {
      error: 'stripe_not_configured',
      message: `报告购买暂未配置 Stripe。缺少 ${!process.env.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY' : price.key}。`,
      missing: !process.env.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY' : price.key
    });
  }

  const origin = siteOrigin(req);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('line_items[0][price]', price.value);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', `${origin}/#/${item.kind === 'fortune_report' ? 'fortune' : 'report'}?purchase=success`);
  params.set('cancel_url', `${origin}/#/${item.kind === 'fortune_report' ? 'fortune' : 'report'}?purchase=cancel`);
  params.set('client_reference_id', user.id);
  if (user.email) params.set('customer_email', user.email);
  params.set('metadata[product]', item.kind);
  params.set('metadata[user_id]', user.id);
  if (item.kind === 'fortune_report') {
    params.set('metadata[fortune_report_type]', item.type);
  } else {
    params.set('metadata[report_type]', item.type);
  }

  try {
    const session = await stripeFormRequest('checkout/sessions', params);
    return send(res, 200, {
      url: session.url,
      id: session.id,
      mode: 'payment',
      product: item.config,
      productKind: item.kind,
      reportType: item.type,
      priceEnv: price.key
    });
  } catch (error) {
    return send(res, error.status || 500, {
      error: error.message || 'stripe_error',
      detail: error.detail || null,
      message: '报告购买页面创建失败，请稍后再试。'
    });
  }
}

async function createCustomerPortal(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res, '请先登录后再管理会员。');
  if (!user) return null;
  const rows = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,status,tier&limit=1`);
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

export default async function handler(req, res) {
  const action = requestAction(req);
  if (action === 'credit') return createCreditCheckout(req, res);
  if (action === 'membership') return createMembershipCheckout(req, res);
  if (action === 'report') return createReportCheckout(req, res);
  if (action === 'portal') return createCustomerPortal(req, res);
  return send(res, 400, {
    error: 'invalid_checkout_action',
    message: '付款接口 action 无效。',
    actions: ['credit', 'membership', 'report', 'portal']
  });
}
