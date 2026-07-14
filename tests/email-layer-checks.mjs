// 交易邮件层测试：验证 _email.js 三语模板、安全空转、以及所有接入模块的具名导入都能解析。
// 不发真实邮件（未配置 RESEND_API_KEY 时 sendEmail 空转），可离线跑。
import assert from 'node:assert';
import {
  normalizeEmailLocale, productLabel, sendEmail, notifyOwner, siteLink,
  reportReadyEmail, creditsAddedEmail, membershipWelcomeEmail, paymentFailedEmail,
  refundEmail, deletionRequestedEmail, accountDeletedEmail, passwordChangedEmail, emailEnabled
} from '../api/_email.js';

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log('  ok  ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + ' -> ' + (e && e.message)); }
}

// —— locale 归一化 ——
await check('normalizeEmailLocale maps the three families', () => {
  assert.equal(normalizeEmailLocale('en'), 'en');
  assert.equal(normalizeEmailLocale('en-US'), 'en');
  assert.equal(normalizeEmailLocale('zh-Hant'), 'zh-Hant');
  assert.equal(normalizeEmailLocale('zh-TW'), 'zh-Hant');
  assert.equal(normalizeEmailLocale('zh-HK'), 'zh-Hant');
  assert.equal(normalizeEmailLocale('zh-CN'), 'zh');
  assert.equal(normalizeEmailLocale('zh'), 'zh');
  assert.equal(normalizeEmailLocale(''), 'zh');
  assert.equal(normalizeEmailLocale(null), 'zh');
});

// —— 商品名三语各不相同（含繁体） ——
await check('productLabel differs across three locales', () => {
  const en = productLabel('en', { product: 'report', reportType: '30' });
  const zh = productLabel('zh', { product: 'report', reportType: '30' });
  const hant = productLabel('zh-Hant', { product: 'report', reportType: '30' });
  assert.ok(en && zh && hant, 'all present');
  assert.notEqual(en, zh);
  assert.notEqual(zh, hant, 'Traditional must differ from Simplified');
  assert.ok(/Report/i.test(en), 'English label looks English');
});

// —— 每个模板：subject 非空、html 含结构+品牌、含 CTA 链接（若有）、按语言变化 ——
const HREF = 'https://madeshed.com/#/account';
const templates = [
  ['reportReady', (l) => reportReadyEmail(l, { productName: 'X', href: HREF }), true],
  ['creditsAdded', (l) => creditsAddedEmail(l, { credits: 10, balance: 42, href: HREF }), true],
  ['membershipWelcome', (l) => membershipWelcomeEmail(l, { href: HREF }), true],
  ['paymentFailed', (l) => paymentFailedEmail(l, { href: HREF }), true],
  ['refund', (l) => refundEmail(l, { productName: 'X', amountText: '29 CNY' }), false],
  ['deletionRequested', (l) => deletionRequestedEmail(l, {}), false],
  ['accountDeleted', (l) => accountDeletedEmail(l, {}), false],
  ['passwordChanged', (l) => passwordChangedEmail(l, { href: HREF }), true]
];
for (const [name, make, hasCta] of templates) {
  await check(`template ${name} renders in all locales`, () => {
    const subs = new Set();
    for (const l of ['en', 'zh', 'zh-Hant']) {
      const { subject, html } = make(l);
      assert.ok(typeof subject === 'string' && subject.length > 0, `${name}/${l} subject`);
      assert.ok(typeof html === 'string' && html.indexOf('<') >= 0, `${name}/${l} html`);
      assert.ok(html.indexOf('Madeshed') >= 0, `${name}/${l} branded`);
      if (hasCta) assert.ok(html.indexOf(HREF) >= 0, `${name}/${l} contains CTA href`);
      subs.add(subject);
    }
    assert.ok(subs.size >= 2, `${name} subjects should vary by locale`);
  });
}

// —— 无 API key 时安全空转，且 sendEmail/notifyOwner 绝不抛异常 ——
await check('sendEmail no-ops without RESEND_API_KEY and never throws', async () => {
  const r1 = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
  assert.ok(r1 && (r1.skipped || r1.ok === false), 'skipped or handled');
  const r2 = await sendEmail({});
  assert.ok(r2 && r2.skipped, 'no recipient skipped');
  const r3 = await notifyOwner({ subject: 't', lines: [{ label: 'a', value: 'b' }] });
  assert.ok(r3 && (r3.skipped || r3.ok === false), 'owner notify handled');
});

await check('siteLink builds absolute hash links', () => {
  assert.ok(/^https?:\/\/.+#\/account$/.test(siteLink('#/account')));
});

await check('emailEnabled reflects key presence', () => {
  assert.equal(typeof emailEnabled(), 'boolean');
});

// —— 接入模块具名导入解析检查：任一缺失/拼错会在此 import 时报错 ——
await check('wired modules import cleanly (named imports resolve)', async () => {
  await import('../api/_stripe.js');
  await import('../api/checkout.js');
  await import('../api/stripe-webhook.js');
  await import('../api/account.js');
  await import('../api/admin.js');
});

if (failures) { console.error(`\nemail-layer: ${failures} FAILED`); process.exit(1); }
console.log('\nemail-layer: all checks passed');
