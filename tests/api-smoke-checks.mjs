/* 真正调用各 handler 的冒烟测试 —— 抓 node --check 和 import 都抓不到的运行时错误。
 *
 * 来由：i18n 改造时把预览分支的 t(pvLocale,...) 误写成 t(locale,...)。locale 在那个分支
 * 根本不存在 → ReferenceError → 接口 500。但 node --check 过、import 过、所有静态断言全绿，
 * 直到线上真的打接口才发现。静态检查看不见"变量在这个分支里存不存在"。
 *
 * 做法：用假的 req/res 直接调 handler，断言"不许抛异常、必须返回 JSON"。
 * 无需 Supabase/Stripe/LLM 凭据：没配置时这些接口本就该优雅返回 4xx/5xx JSON，而不是崩。
 * 这同时也验证了"未配置外部服务时不会白屏/500"这条产品要求。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function mockRes() {
  const r = { statusCode: null, body: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const mockReq = (over = {}) => ({ method: 'POST', url: over.url || '/api/x', query: over.query || {}, headers: {}, body: over.body || {}, ...over });

let n = 0;
const cases = [
  // [文件, 说明, req]
  ['fortune-report.js', '命理报告·预览(en) —— 曾因 t(locale) 越界 500', mockReq({ body: { locale: 'en', reportType: 'full', mode: 'preview' } })],
  ['fortune-report.js', '命理报告·预览(zh-Hant)', mockReq({ body: { locale: 'zh-Hant', reportType: 'full', mode: 'preview' } })],
  ['fortune-report.js', '命理报告·非法类型', mockReq({ body: { locale: 'en', reportType: 'nope', mode: 'preview' } })],
  ['fortune-report.js', '命理报告·完整(未登录应为 4xx 而非崩)', mockReq({ body: { locale: 'en', reportType: 'full', mode: 'full' } })],
  ['report.js', '交易复盘·预览(en)', mockReq({ body: { locale: 'en', reportType: '30', mode: 'preview' } })],
  ['report.js', '交易复盘·完整(未登录)', mockReq({ body: { locale: 'zh-Hant', reportType: '30', mode: 'full' } })],
  ['master-question.js', '问大师·未登录(en)', mockReq({ body: { locale: 'en', category: 'wealth', horizon: 'short', question: 'Will my cash flow improve this year?', profile: {} } })],
  ['master-question.js', '问大师·缺命盘', mockReq({ body: { locale: 'zh-Hant', category: 'wealth', horizon: 'short', question: '今年財運如何？' } })],
  ['checkout.js', '结账·非法 action(en)', mockReq({ url: '/api/checkout?action=bogus', query: { action: 'bogus' }, body: { locale: 'en' } })],
  ['checkout.js', '结账·会员(未登录, en)', mockReq({ url: '/api/checkout?action=membership', query: { action: 'membership' }, body: { locale: 'en', tier: 'highest', plan: 'annual' } })],
  ['checkout.js', '结账·点数(未登录, zh-Hant)', mockReq({ url: '/api/checkout?action=credit', query: { action: 'credit' }, body: { locale: 'zh-Hant' } })],
  ['checkout.js', '结账·报告(未登录)', mockReq({ url: '/api/checkout?action=report', query: { action: 'report' }, body: { locale: 'en', reportType: '30' } })],
  ['checkout.js', '结账·门户(未登录)', mockReq({ url: '/api/checkout?action=portal', query: { action: 'portal' }, body: { locale: 'en' } })],
  ['account.js', '账号·非法 action', mockReq({ url: '/api/account?action=bogus', query: { action: 'bogus' }, body: { locale: 'en' } })],
  ['account.js', '账号·状态(未登录)', mockReq({ url: '/api/account?action=status', query: { action: 'status' }, body: { locale: 'en' } })],
  ['master-history.js', '问大师历史(未登录)', mockReq({ url: '/api/master-history?action=list', query: { action: 'list' }, body: { locale: 'en' } })],
];

for (const [file, name, req] of cases) {
  const mod = await import(`../api/${file}`);
  const res = mockRes();
  try {
    await mod.default(req, res);
  } catch (e) {
    assert.fail(`${file} · ${name} 抛异常（线上等于 500）: ${e && e.message}\n${(e && e.stack || '').split('\n').slice(1, 3).join('\n')}`);
  }
  assert.ok(res.statusCode !== null, `${file} · ${name} 没有返回任何状态码`);
  assert.ok(res.body !== null && typeof res.body === 'object', `${file} · ${name} 没有返回 JSON`);
  // 返回给用户的报错必须是结构化 JSON（前端靠 error/message 渲染），不能是空对象
  if (res.statusCode >= 400) {
    assert.ok(res.body.error || res.body.message, `${file} · ${name} 的 ${res.statusCode} 响应既无 error 也无 message`);
  }
  n++;
  console.log(`  ok  ${name} → HTTP ${res.statusCode}`);
}

/* 静态守卫：会员结账在 Supabase memberships 未命中活跃行时，必须再查 Stripe 该客户的活跃订阅兜底，
   防"遗留/未同步订阅"（Stripe 有活跃订阅但无 memberships 行，如早期缺 user_id 的测试订阅）
   被误导去开重复订阅、跳重复付款页（2026-07 站长 ¥1 测试号即此症）。 */
{
  const src = readFileSync(new URL('../api/checkout.js', import.meta.url), 'utf8');
  assert.ok(/subscriptions\?customer=/.test(src), 'checkout.js 会员结账必须查 Stripe 客户订阅兜底（subscriptions?customer=）');
  assert.ok(src.includes('already_member_stripe'), 'checkout.js Stripe 已有活跃订阅时须返回 already_member_stripe，不开重复订阅');
  n++;
  console.log('  ok  会员结账 Stripe 订阅兜底守卫存在');
}

console.log(`\napi smoke: all ${n} handler invocations returned JSON without throwing`);
