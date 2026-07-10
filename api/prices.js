// 公开实时价格接口：前端页面价格显示的唯一权威来源（与结账实际扣费同源）。
// 后台"价格管理"改价后，这里返回的就是新价——页面显示与扣费永不脱节。
// CDN 缓存 5 分钟（s-maxage），把 Stripe 调用量压到可忽略。
import { PRODUCT_CATALOG, resolveCatalogItem } from './_catalog.js';

export default async function handler(req, res) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'stripe_not_configured' });
  }
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
