export const STRIPE_API_VERSION = '2026-02-25.clover';

export function siteOrigin(req) {
  return process.env.PUBLIC_SITE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
}

// 清洗环境变量：去掉粘贴时混入的 BOM/零宽字符/首尾空白与引号。
// （曾发生 STRIPE_SECRET_KEY 带 U+FEFF 导致所有 Stripe 请求构造 header 时崩溃）
export function cleanEnv(value) {
  return String(value || '')
    .replace(/[﻿​-‍⁠]/gu, '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

export function stripeSecret() {
  return cleanEnv(process.env.STRIPE_SECRET_KEY);
}

export function priceFromEnv(names) {
  const keys = Array.isArray(names) ? names : [names];
  for (const key of keys) {
    const value = cleanEnv(process.env[key]);
    if (value) return { key, value };
  }
  return { key: keys[0] || '', value: '' };
}

export async function stripeFormRequest(path, params, options = {}) {
  const secret = options.secret || stripeSecret();
  if (!secret) {
    const error = new Error('stripe_not_configured');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, '')}`, {
    method: options.method || 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': STRIPE_API_VERSION
    },
    body: params
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('stripe_error');
    error.status = response.status;
    error.detail = data;
    throw error;
  }
  return data;
}

export async function stripeGet(path, options = {}) {
  const secret = options.secret || stripeSecret();
  if (!secret) return null;
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, '')}`, {
    headers: {
      authorization: `Bearer ${secret}`,
      'stripe-version': STRIPE_API_VERSION
    }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

// 站点三语 -> Stripe preferred_locales（决定 Stripe 收据/发票/催款邮件的语言，
// 与 Checkout 页面 locale 参数是两套系统）。繁体用 zh-TW。
export function stripeLocaleList(locale) {
  const s = String(locale || '').toLowerCase();
  if (s.indexOf('en') === 0) return ['en'];
  if (s.indexOf('hant') >= 0 || s.indexOf('tw') >= 0 || s.indexOf('hk') >= 0) return ['zh-TW'];
  return ['zh'];
}

// 找到或新建 Stripe 客户，并写入 preferred_locales，使 Stripe 自动邮件按用户语言渲染。
// existingId 优先（会员复用既有客户）；否则按邮箱查重复用；再否则新建。任何失败都返回 null，
// 由调用方安全退回 customer_email——绝不因此让结账失败。
export async function ensureStripeCustomer({ email, locale, existingId } = {}) {
  const preferred = stripeLocaleList(locale);
  const setLocales = (p) => { preferred.forEach((l, i) => p.set(`preferred_locales[${i}]`, l)); return p; };
  try {
    if (existingId) {
      await stripeFormRequest(`customers/${encodeURIComponent(existingId)}`, setLocales(new URLSearchParams()));
      return existingId;
    }
    if (!email) return null;
    const found = await stripeGet(`customers?email=${encodeURIComponent(email)}&limit=1`);
    const hit = found && Array.isArray(found.data) ? found.data[0] : null;
    if (hit && hit.id) {
      await stripeFormRequest(`customers/${encodeURIComponent(hit.id)}`, setLocales(new URLSearchParams()));
      return hit.id;
    }
    const created = await stripeFormRequest('customers', setLocales(new URLSearchParams([['email', email]])));
    return (created && created.id) || null;
  } catch (error) {
    return null;
  }
}
