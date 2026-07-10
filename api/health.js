// Madeshed Bazi API - Health Check + Stripe self-diagnostics + 公开实时价格(?action=prices)
// Vercel Serverless Function (Node.js runtime)
// ⚠️ Vercel Hobby 计划上限 12 个 serverless 函数（api/ 下非 _ 前缀文件）——已满。
//   新公共能力一律并入现有端点的 action 分发（如本文件），不要新建 api/*.js 路由，否则整个部署会失败。
import { stripeGet } from './_stripe.js';
import { createHash } from 'node:crypto';
import { PRODUCT_CATALOG, resolveCatalogItem } from './_catalog.js';

// 公开实时价格：页面价格显示的唯一权威来源（与结账实际扣费同源=商品当前默认价）。
// 后台"价格管理"改价后这里即返回新价；CDN 缓存 5 分钟压低 Stripe 调用量。
async function publicPrices(res) {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'stripe_not_configured' });
  const items = [];
  for (const item of PRODUCT_CATALOG) {
    try {
      const r = await resolveCatalogItem(item);
      if (r.status === 'ok') items.push({ key: r.key, amount: r.amount, currency: r.currency, interval: r.interval });
    } catch (e) { /* 单个商品失败不影响其他 */ }
  }
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ ok: true, items, fetchedAt: new Date().toISOString() });
}

function keyKind(k) {
  const s = String(k || '');
  if (s.startsWith('sb_publishable')) return 'PUBLISHABLE / anon (WRONG — this is the browser key, no DB privileges)';
  if (s.startsWith('sb_secret')) return 'sb_secret (new-format secret)';
  if (s.startsWith('eyJ')) return 'legacy JWT (role is inside; service_role JWT is ~219 chars)';
  if (!s) return 'MISSING';
  return 'unknown';
}
function keyFingerprint(k) {
  const s = String(k || '');
  if (!s) return null;
  return createHash('sha256').update(s).digest('hex').slice(0, 12);
}
// 解码 JWT 的 payload（公开信息，非签名/密钥本身）以读出 role 声明：anon vs service_role
function jwtRole(k) {
  const s = String(k || '');
  if (!s.startsWith('eyJ')) return 'not-a-jwt';
  try {
    const parts = s.split('.');
    if (parts.length < 2) return 'malformed';
    const json = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return json.role || json.ref ? `role=${json.role || '?'} ref=${json.ref || '?'}` : 'no-role-claim';
  } catch (e) {
    return 'decode-failed';
  }
}

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

function envInfo(v) {
  const s = v == null ? '' : String(v);
  return {
    present: Boolean(s),
    length: s.length,
    firstCharCode: s ? s.charCodeAt(0) : null,
    hasBOM: s.charCodeAt(0) === 0xFEFF,
    hasZeroWidth: /[​-‍⁠﻿]/.test(s),
    trimmedDiffers: s !== s.trim(),
    hasWrappingQuotes: /^["']|["']$/.test(s)
  };
}
async function supabaseDiagnostics(res) {
  const rawUrl = process.env.SUPABASE_URL || '';
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const clean = (v) => String(v || '').replace(/[​-‍⁠﻿]/g, '').trim().replace(/^["']+|["']+$/g, '').trim();
  const cleanUrl = clean(rawUrl), cleanKey = clean(rawKey);
  async function probe(u, k) {
    try {
      const r = await fetch(`${u}/rest/v1/account_profiles?select=user_id&limit=0`, { headers: { apikey: k, authorization: `Bearer ${k}` } });
      const t = await r.text();
      return { ok: r.ok, status: r.status, bodyPrefix: t.slice(0, 100) };
    } catch (e) { return { ok: false, error: String(e && e.message).slice(0, 120) }; }
  }
  const cleaned = await probe(cleanUrl, cleanKey);
  const raw = (rawUrl === cleanUrl && rawKey === cleanKey) ? { note: 'raw==cleaned (no BOM/quotes/space found)' } : await probe(rawUrl.trim(), rawKey);
  res.status(200).json({
    urlEnv: envInfo(rawUrl),
    keyEnv: envInfo(rawKey),
    keyKind: keyKind(cleanKey),
    keyRole: jwtRole(cleanKey),
    keyFingerprint: keyFingerprint(cleanKey),
    cleanedProbe: cleaned,
    rawProbe: raw,
    verdict: cleaned.ok ? 'service key WORKS after cleaning' : 'service key still FAILS after cleaning — check the key value / table / RLS'
  });
}
export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const action = String(req.query?.action || url.searchParams.get('action') || '').trim();
  if (action === 'prices') {
    try {
      return await publicPrices(res);
    } catch (error) {
      return res.status(500).json({ error: 'prices_failed', message: String(error && error.message) });
    }
  }
  if (action === 'supabase-diagnostics') {
    try {
      return await supabaseDiagnostics(res);
    } catch (error) {
      return res.status(500).json({ error: 'supabase_diagnostics_failed', message: String(error && error.message) });
    }
  }
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
