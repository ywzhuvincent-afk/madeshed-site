import { getUserFromRequest, hasSupabaseService, requireAccountReadyForPaidAction, supabaseSelect } from './_supabase.js';
import { cleanEnv, priceFromEnv, siteOrigin, stripeFormRequest, stripeGet, ensureStripeCustomer } from './_stripe.js';
import { hasTradeReportEntitlement, hasFortuneReportEntitlement } from './_access.js';
import { resolveCurrencyPrice, parseSale, activeSaleAmount, toUnitAmount } from './_catalog.js';
import { resolveUserLocale, t } from './_locale.js';

// 商品名中英文各自一份：结账页按用户语言显示各自语言（不混）。改名时两边都要改。
const CREDIT_PACK_PRODUCT = {
  credits: 10,
  label: '问大师 10 点包',
  labelEn: 'Ask Master · 10 Credits',
  labelHant: '問大師 10 點包',
  price: '¥49'
};

/* 会员层级 × 计费周期。tier/plan 均只接受本表里的键（白名单），绝不用请求值拼环境变量名。
   monthlyCredits 必须与 _access.js 的 MEMBERSHIP_MONTHLY_CREDITS 一致（发点以那张表为准）。 */
const MEMBERSHIP_PRODUCTS = {
  ultimate: {
    label: '高级会员',
    labelEn: 'Ultimate Membership',
    labelHant: '高級會員',
    price: '¥39.9/月',
    monthlyCredits: 30,
    priceEnv: ['STRIPE_ULTIMATE_PRICE_ID', 'STRIPE_MEMBERSHIP_PRICE_ID'],
    plans: {
      monthly: { priceEnv: ['STRIPE_ULTIMATE_PRICE_ID', 'STRIPE_MEMBERSHIP_PRICE_ID'] }
    }
  },
  highest: {
    label: '至尊VIP会员',
    labelEn: 'VIP Membership',
    labelHant: '至尊VIP會員',
    price: '¥299/月',
    monthlyCredits: 200,
    priceEnv: ['STRIPE_HIGHEST_PRICE_ID'],
    plans: {
      monthly: { priceEnv: ['STRIPE_HIGHEST_PRICE_ID'] },
      annual: { priceEnv: ['STRIPE_HIGHEST_ANNUAL_PRICE_ID'] }
    }
  }
};

const REPORT_PRODUCTS = {
  '7': { label: '7 天报告', labelEn: 'Trade Report · 7 Days', labelHant: '7 天報告', priceEnv: ['STRIPE_REPORT_7_PRICE_ID'] },
  '30': { label: '月度报告', labelEn: 'Trade Report · Monthly', labelHant: '月度報告', priceEnv: ['STRIPE_REPORT_30_PRICE_ID', 'STRIPE_REPORT_PRICE_ID'] },
  '365': { label: '年度报告', labelEn: 'Trade Report · Yearly', labelHant: '年度報告', priceEnv: ['STRIPE_REPORT_365_PRICE_ID'] },
  all: { label: '全部历史报告', labelEn: 'Trade Report · All History', labelHant: '全部歷史報告', priceEnv: ['STRIPE_REPORT_ALL_PRICE_ID'] }
};

const FORTUNE_PRODUCTS = {
  full: { label: '全盘解读', labelEn: 'Full Chart Reading', labelHant: '全盤解讀', priceEnv: ['STRIPE_FORTUNE_FULL_PRICE_ID'] },
  dayun: { label: '流年大运解读', labelEn: 'Luck Pillar Reading', labelHant: '流年大運解讀', priceEnv: ['STRIPE_FORTUNE_DAYUN_PRICE_ID'] },
  month: { label: '每月运程', labelEn: 'Monthly Timing Reading', labelHant: '每月運程', priceEnv: ['STRIPE_FORTUNE_MONTH_PRICE_ID'] },
  wealth: { label: '偏财运机会财专测', labelEn: 'Windfall Wealth Reading', labelHant: '偏財運機會財專測', priceEnv: ['STRIPE_FORTUNE_WEALTH_PRICE_ID'] },
  // 尊享线：基础会员不含（见 _access.js VIP_ONLY_FORTUNE_REPORTS），至尊VIP免费、他人可单买。
  timing: { label: '八字投资择时全案', labelEn: 'Investment Timing Master Plan', labelHant: '八字投資擇時全案', priceEnv: ['STRIPE_FORTUNE_TIMING_PRICE_ID'] }
};

// 结账语言：前端把当前站点语言放进 body.locale（en / zh-Hant / zh）。
// 内部三语用于：结账页语言、商品展示名、customer.preferred_locales（收据邮件语言）、metadata。
function checkoutLocale(req) {
  const raw = String((req.body && req.body.locale) || '').toLowerCase();
  if (raw.indexOf('en') === 0) return 'en';
  if (raw.indexOf('hant') >= 0 || raw.indexOf('tw') >= 0 || raw.indexOf('hk') >= 0) return 'zh-Hant';
  return 'zh';
}
// Stripe Checkout 页面 locale 参数只认 en / zh / zh-TW / zh-HK（不认 'zh-Hant'）——繁体映射到 zh-TW。
function stripePageLocale(locale) {
  if (locale === 'en') return 'en';
  if (locale === 'zh-Hant') return 'zh-TW';
  return 'zh';
}
// 价格解析：env 里的 price ID 只是"锚"，实际结账金额跟随该商品的当前 default_price——
// 后台"价格管理"改价（新建价格并设为默认）后立即生效，无需改环境变量或重新部署。
async function resolveEffectivePrice(priceId) {
  const anchor = await stripeGet(`prices/${encodeURIComponent(priceId)}`);
  let product = null;
  try {
    const productId = anchor && (typeof anchor.product === 'string' ? anchor.product : anchor.product && anchor.product.id);
    if (!productId) return { price: anchor, product: null };
    product = await stripeGet(`products/${encodeURIComponent(productId)}`);
    const defaultPriceId = product && (typeof product.default_price === 'string' ? product.default_price : product.default_price && product.default_price.id);
    if (defaultPriceId && defaultPriceId !== priceId) {
      const dp = await stripeGet(`prices/${encodeURIComponent(defaultPriceId)}`);
      if (dp && dp.active && dp.unit_amount) return { price: dp, product };
    }
  } catch (e) { /* 解析失败退回锚价格，保证结账可用 */ }
  return { price: anchor, product };
}
// 用 price_data 内联本地化商品名——金额/币种/订阅周期取自解析后的有效价格（后台可改），
// 只把展示名换成对应语言。取价失败则安全退回用 price ID（宁可名字是中文，也不让结账失败）。
async function setLocalizedLineItem(params, priceId, nameZh, nameEn, nameHant, locale) {
  let price = null, product = null;
  try { const r = await resolveEffectivePrice(priceId); price = r.price; product = r.product; } catch (e) { price = null; }
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
  // 特价：活动期内按当前币种特价收款（服务端独立按 start/end 判定，绝不信前端；划线只是展示）。
  // 该币种没配特价则维持原价。解析失败按原价，绝不让结账失败。
  try {
    const saleMajor = activeSaleAmount(parseSale(product), currency, Date.now());
    if (saleMajor != null && saleMajor > 0) {
      const saleUnit = toUnitAmount(saleMajor, currency);
      if (Number.isFinite(saleUnit) && saleUnit > 0 && saleUnit < unitAmount) unitAmount = saleUnit;
    }
  } catch (e) { /* 按原价 */ }
  // 展示名优先用后台设置的可编辑名（商品 metadata），未设则用各自硬编码名。
  // 繁体优先 name_hant / labelHant，缺失时安全退回简体，绝不留空。
  const md = (product && product.metadata) || {};
  let displayName;
  if (locale === 'en') displayName = md.name_en || nameEn;
  else if (locale === 'zh-Hant') displayName = md.name_hant || nameHant || md.name_zh || nameZh;
  else displayName = md.name_zh || nameZh;
  params.set('line_items[0][price_data][currency]', currency);
  params.set('line_items[0][price_data][unit_amount]', String(unitAmount));
  params.set('line_items[0][price_data][product_data][name]', displayName);
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

// messageKey = _locale.js 里的三语 key（不再传写死的中文句子）。未登录时只能用请求带的语言。
async function requireUser(req, res, messageKey) {
  const locale = await resolveUserLocale(req, null);
  if (!hasSupabaseService()) {
    send(res, 503, { error: 'supabase_service_not_configured', message: t(locale, 'membership_cloud_not_configured'), locale });
    return null;
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    send(res, 401, { error: auth.error || 'unauthorized', message: t(locale, messageKey || 'login_required'), locale });
    return null;
  }
  return auth.user;
}

async function ensurePaidAccount(req, res, user) {
  const readiness = await requireAccountReadyForPaidAction(req, user);
  if (!readiness.ok) {
    /* _supabase.js 不能 import _locale.js（_locale 依赖它，会形成循环依赖），所以那边只回
       messageKey，由这里按用户语言渲染成 message。漏了这一步，用户会收到一条没有正文的报错。 */
    const body = Object.assign({}, readiness.body);
    if (body.messageKey) {
      const lc = await resolveUserLocale(req, user && user.id);
      body.message = t(lc, body.messageKey);
      body.locale = lc;
      delete body.messageKey;
    }
    send(res, readiness.status, body);
    return null;
  }
  return readiness.account;
}

async function createCreditCheckout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res, 'login_before_purchase');
  if (!user) return null;
  if (!(await ensurePaidAccount(req, res, user))) return null;

  const priceId = cleanEnv(process.env.STRIPE_CREDIT_PRICE_ID);
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return send(res, 503, { error: 'stripe_not_configured', message: t(locale, 'stripe_not_configured') });
  }

  const origin = siteOrigin(req);
  const locale = await resolveUserLocale(req, user && user.id);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('locale', stripePageLocale(locale));
  await setLocalizedLineItem(params, priceId, CREDIT_PACK_PRODUCT.label, CREDIT_PACK_PRODUCT.labelEn, CREDIT_PACK_PRODUCT.labelHant, locale);
  params.set('success_url', `${origin}/#/fortune?credits=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/#/fortune?credits=cancel`);
  // 收据/对账 + 邮件语言：优先绑定带 preferred_locales 的 Stripe 客户（Stripe 收据/发票按用户语言渲染），
  // 解析失败安全退回 customer_email；收据邮箱始终单独设，保证一次性购买收据必达。
  const creditCustomer = await ensureStripeCustomer({ email: user.email, locale });
  if (creditCustomer) params.set('customer', creditCustomer);
  else if (user.email) params.set('customer_email', user.email);
  if (user.email) params.set('payment_intent_data[receipt_email]', user.email);
  params.set('client_reference_id', user.id);
  params.set('allow_promotion_codes', 'true');
  params.set('invoice_creation[enabled]', 'true');
  params.set('metadata[product]', 'credit_pack');
  params.set('metadata[credits]', String(CREDIT_PACK_PRODUCT.credits));
  params.set('metadata[user_id]', user.id);
  params.set('metadata[locale]', locale);

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
  const user = await requireUser(req, res, 'login_before_membership');
  if (!user) return null;
  if (!(await ensurePaidAccount(req, res, user))) return null;

  // tier/plan 走白名单：只接受 MEMBERSHIP_PRODUCTS 里存在的键，绝不用请求值拼环境变量名。
  const reqTier = String((req.body && req.body.tier) || '');
  const tier = MEMBERSHIP_PRODUCTS[reqTier] ? reqTier : 'ultimate';
  const product = MEMBERSHIP_PRODUCTS[tier];
  const reqPlan = String((req.body && req.body.plan) || '');
  const plan = product.plans[reqPlan] ? reqPlan : 'monthly';
  const locale = await resolveUserLocale(req, user && user.id);

  // 防重复订阅（曾为 blocker：双开标签/换设备可开出两个 ¥199/月 订阅，旧订阅站内不可见持续扣费）
  let existingMembership = null;
  try {
    const rows = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(user.id)}&select=status,tier,stripe_customer_id,stripe_subscription_id&limit=1`);
    existingMembership = rows[0] || null;
  } catch (e) { existingMembership = null; }
  // 已有订阅一律不再开第二笔（曾为 blocker：双开标签/换设备可开出两个订阅并持续扣费）。
  // 升级/降级（基础↔至尊VIP、月↔年）必须走 Stripe 账单门户改订阅，由 Stripe 处理按比例计费。
  if (existingMembership && ['active', 'trialing', 'past_due'].indexOf(existingMembership.status) >= 0) {
    const upgrading = existingMembership.tier !== tier;
    return send(res, 409, {
      error: 'already_member',
      currentTier: existingMembership.tier || null,
      requestedTier: tier,
      message: locale === 'en'
        ? (upgrading
          ? 'You already have an active membership. To switch plans, open "Manage Billing" and change your subscription there — Stripe will prorate it. No second subscription was created and you were not charged.'
          : 'You already have an active membership. Use "Manage Billing" to view or change it — no second subscription was created.')
        : (upgrading
          ? '你已有生效中的会员订阅。要更换档位请点「管理会员/账单」在订阅里切换，Stripe 会自动按比例计费——本次未创建新订阅、未扣费。'
          : '你已经是会员，无需重复开通。请用「管理会员/账单」查看或调整订阅——本次未创建新的订阅、未扣费。')
    });
  }
  // 加固：Supabase memberships 未命中活跃行时，再查 Stripe 该客户是否已有活跃订阅。
  // 防"遗留/未同步订阅"（Stripe 有活跃订阅但 memberships 无对应行——例如早期缺 user_id 的
  // 测试订阅，webhook 建不了行）被误导去开出重复订阅、跳到重复付款页。查询失败不阻断正常结账。
  // 本站订阅仅用于会员（点数/报告是一次性支付，不会出现在 subscriptions 里），故任一活跃订阅即视为已是会员。
  try {
    let stripeCustomerId = (existingMembership && existingMembership.stripe_customer_id) || null;
    if (!stripeCustomerId && user.email) {
      const found = await stripeGet(`customers?email=${encodeURIComponent(user.email)}&limit=1`);
      stripeCustomerId = found && Array.isArray(found.data) && found.data[0] ? found.data[0].id : null;
    }
    if (stripeCustomerId) {
      const subs = await stripeGet(`subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=all&limit=100`);
      const live = subs && Array.isArray(subs.data)
        ? subs.data.find((s) => s && ['active', 'trialing', 'past_due'].indexOf(s.status) >= 0)
        : null;
      if (live) {
        return send(res, 409, {
          error: 'already_member_stripe',
          message: locale === 'en'
            ? 'You already have an active membership subscription on file. Open "Manage Billing" to view or change it — no second subscription was created and you were not charged.'
            : '你在 Stripe 已有一笔生效中的会员订阅。请点「管理会员/账单」查看或调整——本次未创建新订阅、未扣费。'
        });
      }
    }
  } catch (e) { /* Stripe 查询失败：不阻断正常结账 */ }
  // 计费周期（月/年）由 Stripe 价上的 recurring.interval 决定，setLocalizedLineItem 会原样复制。
  const price = priceFromEnv(product.plans[plan].priceEnv);
  if (!process.env.STRIPE_SECRET_KEY || !price.value) {
    return send(res, 503, {
      error: 'stripe_not_configured',
      message: t(locale, 'stripe_not_configured'),
      missing: !process.env.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY' : price.key
    });
  }

  const origin = siteOrigin(req);
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('locale', stripePageLocale(locale));
  await setLocalizedLineItem(params, price.value, product.label, product.labelEn, product.labelHant, locale);
  params.set('success_url', `${origin}/#/account?membership=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/#/account?membership=cancel`);
  params.set('client_reference_id', user.id);
  // 复用既有 Stripe customer 并写入 preferred_locales（会员每月发票/续费/催款邮件按用户语言渲染）；
  // 解析失败安全退回既有客户 id 或 customer_email，绝不因此让订阅结账失败。
  const memberCustomer = await ensureStripeCustomer({ email: user.email, locale, existingId: existingMembership && existingMembership.stripe_customer_id });
  if (memberCustomer) params.set('customer', memberCustomer);
  else if (existingMembership && existingMembership.stripe_customer_id) params.set('customer', existingMembership.stripe_customer_id);
  else if (user.email) params.set('customer_email', user.email);
  params.set('allow_promotion_codes', 'true');
  params.set('metadata[product]', 'membership');
  params.set('metadata[user_id]', user.id);
  params.set('metadata[tier]', tier);
  params.set('metadata[plan]', plan);
  params.set('metadata[monthly_credits]', String(product.monthlyCredits));
  params.set('metadata[locale]', locale);
  params.set('subscription_data[metadata][product]', 'membership');
  params.set('subscription_data[metadata][user_id]', user.id);
  params.set('subscription_data[metadata][tier]', tier);
  params.set('subscription_data[metadata][plan]', plan);
  params.set('subscription_data[metadata][monthly_credits]', String(product.monthlyCredits));
  params.set('subscription_data[metadata][locale]', locale);

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
      message: t(locale, 'checkout_session_failed')
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
  const user = await requireUser(req, res, 'login_before_purchase');
  if (!user) return null;
  if (!(await ensurePaidAccount(req, res, user))) return null;

  const item = reportProductFor(req.body || {});
  if (!item) return send(res, 400, { error: 'invalid_report_type', message: t(locale, 'invalid_report_type') });
  const locale = await resolveUserLocale(req, user && user.id);

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
          ? '你的高级会员已包含此报告，直接在报告页免费生成即可——本次未扣费。'
          : '你已购买过这份报告且仍在有效期内，直接在报告页生成/查看即可，无需重复购买——本次未扣费。')
    });
  }
  const price = priceFromEnv(item.config.priceEnv);
  if (!process.env.STRIPE_SECRET_KEY || !price.value) {
    return send(res, 503, {
      error: 'stripe_not_configured',
      message: t(locale, 'stripe_not_configured'),
      missing: !process.env.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY' : price.key
    });
  }

  const origin = siteOrigin(req);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('locale', stripePageLocale(locale));
  await setLocalizedLineItem(params, price.value, item.config.label, item.config.labelEn, item.config.labelHant, locale);
  params.set('success_url', `${origin}/#/${item.kind === 'fortune_report' ? 'fortune' : 'report'}?purchase=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/#/${item.kind === 'fortune_report' ? 'fortune' : 'report'}?purchase=cancel`);
  params.set('client_reference_id', user.id);
  const reportCustomer = await ensureStripeCustomer({ email: user.email, locale });
  if (reportCustomer) params.set('customer', reportCustomer);
  else if (user.email) params.set('customer_email', user.email);
  if (user.email) params.set('payment_intent_data[receipt_email]', user.email);
  params.set('allow_promotion_codes', 'true');
  params.set('invoice_creation[enabled]', 'true');
  params.set('metadata[product]', item.kind);
  params.set('metadata[user_id]', user.id);
  params.set('metadata[locale]', locale);
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
      message: t(locale, 'checkout_session_failed')
    });
  }
}

async function createCustomerPortal(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const user = await requireUser(req, res, 'login_before_membership');
  if (!user) return null;
  const locale = await resolveUserLocale(req, user.id);
  const rows = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,status,tier&limit=1`);
  const membership = rows[0];
  if (!membership || !membership.stripe_customer_id) {
    return send(res, 404, { error: 'membership_not_found', message: t(locale, 'no_subscription_to_manage') });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return send(res, 503, { error: 'stripe_not_configured', message: t(locale, 'portal_stripe_not_configured') });
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
      message: t(locale, 'checkout_session_failed')
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
      message: t(await resolveUserLocale(req, null), 'invalid_checkout_action'),
      actions: ['credit', 'membership', 'report', 'portal']
    });
  } catch (error) {
    // 兜底：任何未捕获异常都回 JSON（否则 Vercel 抛非 JSON 500，前端只会显示"暂不可用"、看不到真因，且从不扣费）
    if (!res.headersSent) {
      return send(res, 500, {
        error: 'checkout_failed',
        message: t(await resolveUserLocale(req, null), 'checkout_error'),
        detail: String((error && error.stack) || error || '').split('\n').slice(0, 3)
      });
    }
  }
}
