import { getUserFromRequest, hasSupabaseService, requireAccountReadyForPaidAction } from './_supabase.js';
import { priceFromEnv, siteOrigin, stripeFormRequest } from './_stripe.js';

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

function productFor(body) {
  const kind = body.productKind === 'fortune_report' || body.fortuneReportType ? 'fortune_report' : 'report';
  const type = kind === 'fortune_report' ? String(body.fortuneReportType || body.reportType || 'full') : String(body.reportType || '30');
  const config = kind === 'fortune_report' ? FORTUNE_PRODUCTS[type] : REPORT_PRODUCTS[type];
  return config ? { kind, type, config } : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  if (!hasSupabaseService()) {
    return send(res, 503, { error: 'supabase_service_not_configured', message: '报告权益系统暂未连接云端。' });
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录后再购买报告。' });
  }
  const readiness = await requireAccountReadyForPaidAction(req, auth.user);
  if (!readiness.ok) return send(res, readiness.status, readiness.body);

  const item = productFor(req.body || {});
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
  params.set('client_reference_id', auth.user.id);
  if (auth.user.email) params.set('customer_email', auth.user.email);
  params.set('metadata[product]', item.kind);
  params.set('metadata[user_id]', auth.user.id);
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
