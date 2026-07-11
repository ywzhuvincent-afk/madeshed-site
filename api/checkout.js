import { getUserFromRequest, hasSupabaseService, requireAccountReadyForPaidAction, supabaseSelect } from './_supabase.js';
import { cleanEnv, priceFromEnv, siteOrigin, stripeFormRequest, stripeGet } from './_stripe.js';
import { hasTradeReportEntitlement, hasFortuneReportEntitlement } from './_access.js';
import { resolveCurrencyPrice } from './_catalog.js';

// 商品名中英文各自一份：结账页按用户语言显示各自语言（不混）。改名时两边都要改。
const CREDIT_PACK_PRODUCT = {
  credits: 10,
  label: '问大师 10 点包',
  labelEn: 'Ask Master · 10 Credits',
  price: '¥99'
};

const MEMBERSHIP_PRODUCTS = {
  ultimate: {
    label: '最高级会员',
    labelEn: 'Ultimate Membership',
    price: '¥199/月',
    monthlyCredits: 30,
    priceEnv: ['STRIPE_ULTIMATE_PRICE_ID', 'STRIPE_MEMBERSHIP_PRICE_ID']
  }
};

const REPORT_PRODUCTS = {
  '7': { label: '7 天报告', labelEn: 'Trade Report · 7 Days', priceEnv: ['STRIPE_REPORT_7_PRICE_ID'] },
  '30': { label: '月度报告', labelEn: 'Trade Report · Monthly', priceEnv: ['STRIPE_REPORT_30_PRICE_ID', 'STRIPE_REPORT_PRICE_ID'] },
  '365': { label: '年度报告', labelEn: 'Trade Report · Yearly', priceEnv: ['STRIPE_REPORT_365_PRICE_ID'] },
  all: { label: '全部历史报告', labelEn: 'Trade Report · All History', priceEnv: ['STRIPE_REPORT_ALL_PRICE_ID'] }
};

const FORTUNE_PRODUCTS = {
  full: { label: '全盘解读', labelEn: 'Full Chart Reading', priceEnv: ['STRIPE_FORTUNE_FULL_PRICE_ID'] },
  dayun: { label: '流年大运解读', labelEn: 'Luck Pillar Reading', priceEnv: ['STRIPE_FORTUNE_DAYUN_PRICE_ID'] },
  month: { label: '每月运程', labelEn: 'Monthly Timing Reading', priceEnv: ['STRIPE_FORTUNE_MONTH_PRICE_ID'] }
};

// 结账语言：前端把当前站点语言(localeIsEn)放进 body.locale
function checkoutLocale(req) {
  return String((req.body && req.body.locale) || '').toLowerCase() === 'en' ? 'en' : 'zh';
}
// 价格解析：env 里的 price ID 只是"锚"，实际结账金额跟随该商品的当前 default_price——
// 后台"价格管理"改价（新建价格并设为默认）后立即生效，无需改环境变量或重新部署。
async function resolveEffectivePrice(priceId) {
  const anchor = await stripeGet(`prices/${encodeURIComponent(priceId)}`);
  try {
    const productId = anchor && (typeof anchor.product === 'string' ? anchor.product : anchor.product && anchor.product.id);
    if (!productId) return anchor;
    const product = await stripeGet(`products/${encodeURIComponent(productId)}`);
    const defaultPriceId = product && (typeof product.default_price === 'string' ? product.default_price : product.default_price && product.default_price.id);
    if (defaultPriceId && defaultPriceId !== priceId) {
      const dp = await stripeGet(`prices/${encodeURIComponent(defaultPriceId)}`);
      if (dp && dp.active && dp.unit_amount) return dp;
    }
  } catch (e) { /* 解析失败退回锚价格，保证结账可用 */ }
  return anchor;
}
// 用 price_data 内联本地化商品名——金额/币种/订阅周期取自解析后的有效价格（后台可改），
// 只把展示名换成对应语言。取价失败则安全退回用 price ID（宁可名字是中文，也不让结账失败）。
async function setLocalizedLineItem(params, priceId, nameZh, nameEn, locale) {
  let price = null;
  try { price = await resolveEffectivePrice(priceId); } catch (e) { price = null; }
  params.set('line_items[0][quantity]', '1');
  if (!price || !price.unit_amount || !price.currency) {
    params.set('line_items[0][price]', priceId);
    return;
  }
  let currency = price.currency;
  let unitAmount = price.unit_amount;
  // 英文站按美元收款：该商品若配了美元副价则用美元；否则安全退回人民币价（结账绝不因缺美元价而失败）。
  if (locale === 'en') {
    try {
      const productId = typeof price.product === 'string' ? price.product : (price.product && price.product.id);
      if (productId) {
        const usd = await resolveCurrencyPrice(productId, 'usd');
        if (usd && usd.unitAmount) { currency = usd.currency; unitAmount = usd.unitAmount; }
      }
    } catch (e) { /* 退回人民币价 */ }
  }
  params.set('line_items[0][price_data][currency]', currency);
  params.set('line_items[0][price_data][unit_amount]', String(unitAmount));
  params.set('line_items[0][price_data][product_data][name]', locale === 'en' ? nameEn : nameZh);
  if (price.recurring && price.recurring.interval) {
    params.set('line_items[0][price_data][recurring][interval]', price.recurring.interval);
    if (price.recurring.interval_count && price.recurring.interval_count !== 1) {
      params.set('line_items[0][price_data][recurring][interval_count]', String(price.recurring.interval_count));
    }
  }
}

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

  const priceId = cleanEnv(process.env.STRIPE_CREDIT_PRICE_ID);
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return send(res, 503, { error: 'stripe_not_configured', message: '点数购买暂未配置 Stripe。' });
  }

  const origin = siteOrigin(req);
  const locale = checkoutLocale(req);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('locale', locale);
  await setLocalizedLineItem(params, priceId, CREDIT_PACK_PRODUCT.label, CREDIT_PACK_PRODUCT.labelEn, locale);
  params.set('success_url', `${origin}/#/fortune?credits=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/#/fortune?credits=cancel`);
  // 收据/对账三件套：账号邮箱预填+收据直达、client_reference_id 便于人工对账（此前唯独点数包漏了）
  if (user.email) { params.set('customer_email', user.email); params.set('payment_intent_data[receipt_email]', user.email); }
  params.set('client_reference_id', user.id);
  params.set('allow_promotion_codes', 'true');
  params.set('invoice_creation[enabled]', 'true');
  params.set('metadata[product]', 'credit_pack');
  params.set('metadata[credits]', String(CREDIT_PACK_PRODUCT.credits));
  params.set('metadata[user_id]', user.id);

  try {
    const session = await stripeFormRequest('checkout/sessions', params);
    return send(res, 200, { url: session.url, id: session.id, product: CREDIT_PACK_PRODUCT });
  } catch (error) {
    return send(res, error.status || 500, { error: error.message || 'stripe_error', detail: error.detail || null });
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

  const tier = 'ultimate';
  const product = MEMBERSHIP_PRODUCTS[tier];
  const locale = checkoutLocale(req);

  // 防重复订阅（曾为 blocker：双开标签/换设备可开出两个 ¥199/月 订阅，旧订阅站内不可见持续扣费）
  let existingMembership = null;
  try {
    const rows = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(user.id)}&select=status,tier,stripe_customer_id,stripe_subscription_id&limit=1`);
    existingMembership = rows[0] || null;
  } catch (e) { existingMembership = null; }
  if (existingMembership && ['active', 'trialing', 'past_due'].indexOf(existingMembership.status) >= 0) {
    return send(res, 409, {
      error: 'already_member',
      message: locale === 'en'
        ? 'You already have an active Ultimate membership. Use "Manage Billing" to view or change it — no second subscription was created.'
        : '你已经是最高级会员，无需重复开通。请用「管理会员/账单」查看或调整订阅——本次未创建新的订阅、未扣费。'
    });
  }
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
  params.set('locale', locale);
  await setLocalizedLineItem(params, price.value, product.label, product.labelEn, locale);
  params.set('success_url', `${origin}/#/account?membership=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/#/account?membership=cancel`);
  params.set('client_reference_id', user.id);
  // 复用既有 Stripe customer（避免同一用户散落多个 customer，门户/发票历史才完整）
  if (existingMembership && existingMembership.stripe_customer_id) params.set('customer', existingMembership.stripe_customer_id);
  else if (user.email) params.set('customer_email', user.email);
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
  const locale = checkoutLocale(req);

  // 防重复购买，但仅拦"仍在有效期内"的权益——已过期(30天)的报告允许再次购买（曾为 major）
  // 权益查询失败必须 fail-closed：Supabase 抖动时若放行创建付款，会对已持有有效报告的用户重复扣款（曾为确认缺陷）。
  let ent;
  try {
    ent = item.kind === 'fortune_report'
      ? await hasFortuneReportEntitlement(user.id, item.type)
      : await hasTradeReportEntitlement(user.id, item.type);
  } catch (e) {
    return send(res, 503, {
      error: 'entitlement_check_unavailable',
      message: locale === 'en'
        ? 'We could not verify your existing report access right now. No charge was created — please try again in a moment.'
        : '暂时无法核对你已有的报告权益，本次未创建付款，请稍后再试。'
    });
  }
  if (ent.ok) {
    const isMember = ent.accessLevel === 'membership';
    return send(res, 409, {
      error: 'already_owned',
      accessLevel: ent.accessLevel,
      expiresAt: ent.expiresAt || null,
      message: locale === 'en'
        ? (isMember
          ? 'Your Ultimate membership already includes this report — generate it free from the report page. You were not charged.'
          : 'You already own this report and it is still valid — open it from the report page, no need to buy again. You were not charged.')
        : (isMember
          ? '你的最高级会员已包含此报告，直接在报告页免费生成即可——本次未扣费。'
          : '你已购买过这份报告且仍在有效期内，直接在报告页生成/查看即可，无需重复购买——本次未扣费。')
    });
  }
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
  params.set('locale', locale);
  await setLocalizedLineItem(params, price.value, item.config.label, item.config.labelEn, locale);
  params.set('success_url', `${origin}/#/${item.kind === 'fortune_report' ? 'fortune' : 'report'}?purchase=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/#/${item.kind === 'fortune_report' ? 'fortune' : 'report'}?purchase=cancel`);
  params.set('client_reference_id', user.id);
  if (user.email) { params.set('customer_email', user.email); params.set('payment_intent_data[receipt_email]', user.email); }
  params.set('allow_promotion_codes', 'true');
  params.set('invoice_creation[enabled]', 'true');
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
  try {
    const action = requestAction(req);
    if (action === 'credit') return await createCreditCheckout(req, res);
    if (action === 'membership') return await createMembershipCheckout(req, res);
    if (action === 'report') return await createReportCheckout(req, res);
    if (action === 'portal') return await createCustomerPortal(req, res);
    return send(res, 400, {
      error: 'invalid_checkout_action',
      message: '付款接口 action 无效。',
      actions: ['credit', 'membership', 'report', 'portal']
    });
  } catch (error) {
    // 兜底：任何未捕获异常都回 JSON（否则 Vercel 抛非 JSON 500，前端只会显示"暂不可用"、看不到真因，且从不扣费）
    if (!res.headersSent) {
      return send(res, 500, {
        error: 'checkout_failed',
        message: '购买接口出错：' + ((error && error.message) || 'unknown') + '。当前不会扣费。',
        detail: String((error && error.stack) || error || '').split('\n').slice(0, 3)
      });
    }
  }
}
