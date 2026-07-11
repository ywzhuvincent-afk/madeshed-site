// 商品目录（唯一实现）：后台改名/改价、公开价格接口、结账价格解析共用。
// 以价格环境变量为"锚"定位 Stripe 商品；实际生效价 = 商品当前 default_price（后台改价即设默认价）。
import { cleanEnv, stripeGet } from './_stripe.js';

export const PRODUCT_CATALOG = [
  { key: 'credit', envs: ['STRIPE_CREDIT_PRICE_ID'], name: '问大师 10 点包', description: '问大师 AI 命理咨询 10 点点数包（普通问题 1 点、深度分析 3 点）。' },
  { key: 'ultimate', envs: ['STRIPE_ULTIMATE_PRICE_ID', 'STRIPE_MEMBERSHIP_PRICE_ID'], name: '最高级会员（订阅）', description: '固定命理报告免费生成 + 问大师每月赠送 30 点，适合高频咨询与长期复盘。' },
  { key: 'report_7', envs: ['STRIPE_REPORT_7_PRICE_ID'], name: '交易复盘报告 · 近 7 天', description: '基于你的真实打卡记录生成的近 7 天交易复盘报告。' },
  { key: 'report_30', envs: ['STRIPE_REPORT_30_PRICE_ID', 'STRIPE_REPORT_PRICE_ID'], name: '交易复盘报告 · 月度', description: '基于真实记录的月度交易复盘报告。' },
  { key: 'report_365', envs: ['STRIPE_REPORT_365_PRICE_ID'], name: '交易复盘报告 · 年度', description: '基于真实记录的年度交易复盘报告。' },
  { key: 'report_all', envs: ['STRIPE_REPORT_ALL_PRICE_ID'], name: '交易复盘报告 · 全部历史', description: '基于全部历史记录的交易复盘报告。' },
  { key: 'fortune_full', envs: ['STRIPE_FORTUNE_FULL_PRICE_ID'], name: '八字全盘解读', description: '日主强弱、用神喜忌、婚姻、事业、财运、健康的长期主题解读。' },
  { key: 'fortune_dayun', envs: ['STRIPE_FORTUNE_DAYUN_PRICE_ID'], name: '流年大运解读', description: '当前大运、今年流年、以及未来三年的高低节奏。' },
  { key: 'fortune_month', envs: ['STRIPE_FORTUNE_MONTH_PRICE_ID'], name: '每月运程报告', description: '流月五行、财星与风险，本月适合推进 / 观望 / 避险的时间窗口。' }
];

const ZERO_DECIMAL_CURRENCIES = ['jpy', 'krw', 'vnd', 'clp'];
export function toUnitAmount(amountMajor, currency) {
  const zero = ZERO_DECIMAL_CURRENCIES.indexOf(String(currency || '').toLowerCase()) >= 0;
  return Math.round(Number(amountMajor) * (zero ? 1 : 100));
}
export function fromUnitAmount(unitAmount, currency) {
  const zero = ZERO_DECIMAL_CURRENCIES.indexOf(String(currency || '').toLowerCase()) >= 0;
  return Number(unitAmount) / (zero ? 1 : 100);
}

// 查同一 Stripe 商品下指定币种的"当前生效价"。人民币价由 default_price 驱动（见 resolveCatalogItem/
// resolveEffectivePrice）；美元价不设默认，取该商品最新的 active 美元价（改价时会停用旧美元价保证唯一）。
export async function resolveCurrencyPrice(productId, currency) {
  if (!productId || !currency) return null;
  const cur = String(currency).toLowerCase();
  const list = await stripeGet(`prices?product=${encodeURIComponent(productId)}&active=true&limit=100`);
  const prices = list && Array.isArray(list.data) ? list.data : [];
  const matches = prices.filter((p) => p && p.active && p.unit_amount && String(p.currency).toLowerCase() === cur);
  if (!matches.length) return null;
  matches.sort((a, b) => (b.created || 0) - (a.created || 0));
  const p = matches[0];
  return {
    priceId: p.id,
    currency: p.currency,
    unitAmount: p.unit_amount,
    amount: fromUnitAmount(p.unit_amount, p.currency),
    interval: (p.recurring && p.recurring.interval) || null
  };
}

export async function resolveCatalogItem(item) {
  let priceId = '';
  for (const e of item.envs) { const v = cleanEnv(process.env[e]); if (v) { priceId = v; break; } }
  if (!priceId) return { key: item.key, name: item.name, status: 'env_missing' };
  const anchorPrice = await stripeGet(`prices/${encodeURIComponent(priceId)}`);
  const productId = anchorPrice && (typeof anchorPrice.product === 'string' ? anchorPrice.product : anchorPrice.product && anchorPrice.product.id);
  if (!productId) return { key: item.key, name: item.name, status: 'no_product' };
  const product = await stripeGet(`products/${encodeURIComponent(productId)}`);
  let effective = anchorPrice;
  const defaultPriceId = product && (typeof product.default_price === 'string' ? product.default_price : product.default_price && product.default_price.id);
  if (defaultPriceId && defaultPriceId !== priceId) {
    const dp = await stripeGet(`prices/${encodeURIComponent(defaultPriceId)}`);
    if (dp && dp.active && dp.unit_amount) effective = dp;
  }
  // 美元副价（英文站结账用）——默认价本身就是美元时不再重复解析。
  let usd = null;
  try {
    if (String(effective.currency).toLowerCase() !== 'usd') {
      const u = await resolveCurrencyPrice(productId, 'usd');
      if (u) usd = { priceId: u.priceId, amount: u.amount, currency: u.currency };
    }
  } catch (e) { usd = null; }
  return {
    key: item.key,
    name: (product && product.name) || item.name,
    status: 'ok',
    productId,
    anchorPriceId: priceId,
    effectivePriceId: effective.id,
    currency: effective.currency,
    unitAmount: effective.unit_amount,
    amount: fromUnitAmount(effective.unit_amount, effective.currency),
    interval: (effective.recurring && effective.recurring.interval) || null,
    usd
  };
}
