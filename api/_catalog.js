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
    interval: (effective.recurring && effective.recurring.interval) || null
  };
}
