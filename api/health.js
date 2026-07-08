// Madeshed Bazi API - Health Check + Stripe self-diagnostics
// Vercel Serverless Function (Node.js runtime)
import { stripeGet } from './_stripe.js';

const PRICE_ENVS = [
  { env: 'STRIPE_CREDIT_PRICE_ID', product: '问大师 10 点包', expect: 'one_time' },
  { env: 'STRIPE_ULTIMATE_PRICE_ID', product: '最高级会员（订阅）', expect: 'recurring', fallback: 'STRIPE_MEMBERSHIP_PRICE_ID' },
  { env: 'STRIPE_REPORT_7_PRICE_ID', product: '7 天报告', expect: 'one_time' },
  { env: 'STRIPE_REPORT_30_PRICE_ID', product: '月度报告', expect: 'one_time', fallback: 'STRIPE_REPORT_PRICE_ID' },
  { env: 'STRIPE_REPORT_365_PRICE_ID', product: '年度报告', expect: 'one_time' },
  { env: 'STRIPE_REPORT_ALL_PRICE_ID', product: '全部历史报告', expect: 'one_time' },
  { env: 'STRIPE_FORTUNE_FULL_PRICE_ID', product: '全盘解读', expect: 'one_time' },
  { env: 'STRIPE_FORTUNE_DAYUN_PRICE_ID', product: '流年大运解读', expect: 'one_time' },
  { env: 'STRIPE_FORTUNE_MONTH_PRICE_ID', product: '每月运程', expect: 'one_time' }
];

async function stripeDiagnostics(res) {
  const { cleanEnv, stripeSecret } = await import('./_stripe.js');
  const secret = stripeSecret();
  const keyPrefix = secret.slice(0, 8);
  const keyMode = secret.startsWith('sk_live') || secret.startsWith('rk_live') ? 'live'
    : (secret.startsWith('sk_test') || secret.startsWith('rk_test') ? 'test' : (secret ? 'unknown' : 'missing'));
  const keyKind = secret.startsWith('rk_') ? 'restricted' : (secret.startsWith('sk_') ? 'secret' : 'unknown');
  async function stripeGetDetail(path) {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: { authorization: `Bearer ${secret}`, 'stripe-version': '2026-02-25.clover' }
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  }
  const prices = [];
  for (const item of PRICE_ENVS) {
    const id = cleanEnv(process.env[item.env]) || (item.fallback ? cleanEnv(process.env[item.fallback]) : '');
    if (!id) { prices.push({ product: item.product, env: item.env, status: 'env_missing' }); continue; }
    const resp = await stripeGetDetail(`prices/${encodeURIComponent(id)}`);
    const price = resp.ok ? resp.data : null;
    if (!price || !price.id) {
      const err = (resp.data && resp.data.error) || {};
      prices.push({
        product: item.product, env: item.env,
        status: resp.status === 403 ? 'key_permission_denied' : (err.code === 'resource_missing' ? 'price_not_found' : 'invalid'),
        idPrefix: id.slice(0, 9),
        httpStatus: resp.status,
        stripeCode: err.code || null,
        stripeMessage: (err.message || '').slice(0, 140)
      });
      continue;
    }
    const type = price.recurring ? 'recurring' : 'one_time';
    prices.push({
      product: item.product,
      env: item.env,
      status: !price.active ? 'inactive' : (type !== item.expect ? 'wrong_type' : 'ok'),
      livemode: price.livemode,
      currency: price.currency,
      amount: price.unit_amount,
      type,
      expected: item.expect
    });
  }
  let webhooks = null;
  const hooks = await stripeGet('webhook_endpoints?limit=10');
  if (hooks && Array.isArray(hooks.data)) {
    webhooks = hooks.data.map((h) => ({ url: h.url, status: h.status, livemode: h.livemode, events: (h.enabled_events || []).length }));
  }
  const problems = prices.filter((p) => p.status !== 'ok');
  res.status(200).json({
    keyMode,
    keyKind,
    keyPrefix,
    webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    prices,
    webhooks,
    ok: keyMode === 'live' && problems.length === 0,
    problems
  });
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const action = String(req.query?.action || url.searchParams.get('action') || '').trim();
  if (action === 'stripe-diagnostics') {
    try {
      return await stripeDiagnostics(res);
    } catch (error) {
      return res.status(500).json({ error: 'diagnostics_failed', message: String(error && error.message), stack: String(error && error.stack).split('\n').slice(0, 4) });
    }
  }

  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  const llmConfigured = Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL);
  const stripePricesConfigured = {
    creditPack: Boolean(process.env.STRIPE_CREDIT_PRICE_ID),
    membership: Boolean(process.env.STRIPE_ULTIMATE_PRICE_ID || process.env.STRIPE_MEMBERSHIP_PRICE_ID),
    tradeReports: Boolean(process.env.STRIPE_REPORT_7_PRICE_ID || process.env.STRIPE_REPORT_30_PRICE_ID || process.env.STRIPE_REPORT_365_PRICE_ID || process.env.STRIPE_REPORT_ALL_PRICE_ID),
    fortuneReports: Boolean(process.env.STRIPE_FORTUNE_FULL_PRICE_ID || process.env.STRIPE_FORTUNE_DAYUN_PRICE_ID || process.env.STRIPE_FORTUNE_MONTH_PRICE_ID)
  };
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.2.1',
    service: 'madeshed-bazi-api',
    endpoints: ['/api/health', '/api/score', '/api/profile', '/api/monthly', '/api/report', '/api/fortune-report', '/api/master-question', '/api/checkout', '/api/stripe-webhook'],
    configuration: { supabaseConfigured, stripeConfigured, llmConfigured, stripePricesConfigured }
  });
}
