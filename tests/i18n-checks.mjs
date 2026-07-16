/* 三语契约测试 —— 让"忘记翻译"变成构建失败，而不是等用户投诉。
 *
 * 背景：站点长期靠"中文写死 + 事后补翻译"，结果英文/繁体用户拿到中文 AI 报告、中文报错。
 * 根因是"新增内容默认是中文的，漏了没人知道"。本文件把语言变成可验证的契约：
 *   1) MESSAGES 每个 key 必须三语齐全、且不得互相照抄
 *   2) 面向用户的 API 不得再写死中文 message —— 必须走 t(locale, key)
 *   3) AI 生成入口必须注入按 locale 的输出语言规则，且缓存键必须含 locale
 *
 * 以后新增文案：往 _locale.js 加 key（三语），业务里用 t(locale,'key')。漏一种语言这里就红。
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MESSAGES, LOCALES, normalizeLocale, t, LLM_LANGUAGE_RULE } from '../api/_locale.js';

const utf8 = 'utf8';
const read = (p) => readFileSync(p, utf8);
const CJK = /[一-鿿]/;
let checks = 0;
const ok = (name) => { checks++; console.log(`  ok  ${name}`); };

/* 简繁写法本来就完全相同的文案，必须显式列在这里。
   刻意做成"白名单"而不是"智能判断"：宁可误报，也不能让一条真该繁体化的文案悄悄溜过去。
   新增文案若简繁相同，请在此登记一次——这是一个需要有意识做出的声明。 */
const HANT_SAME_OK = new Set(['period_this_month']);

// ── 1. MESSAGES 三语完整性 ────────────────────────────────────────────────
{
  const keys = Object.keys(MESSAGES);
  assert.ok(keys.length > 0, 'MESSAGES 不能为空');
  const missing = [];
  const notTranslated = [];
  for (const k of keys) {
    for (const loc of LOCALES) {
      const v = MESSAGES[k][loc];
      if (typeof v !== 'string' || !v.trim()) missing.push(`${k}.${loc}`);
    }
    // 英文文案里不该出现汉字（干支等命理专名不会进 MESSAGES）
    if (MESSAGES[k].en && CJK.test(MESSAGES[k].en)) notTranslated.push(`${k}.en 仍含中文: ${MESSAGES[k].en.slice(0, 40)}`);
    // 繁体不能原样照抄简体（照抄=没真翻）；确实相同的必须登记进 HANT_SAME_OK
    if (MESSAGES[k].zh && MESSAGES[k]['zh-Hant'] === MESSAGES[k].zh && CJK.test(MESSAGES[k].zh) && !HANT_SAME_OK.has(k)) {
      notTranslated.push(`${k}['zh-Hant'] 与简体完全相同，未做繁体化: ${MESSAGES[k].zh.slice(0, 30)}（若简繁本就相同，请登记进 HANT_SAME_OK）`);
    }
  }
  assert.deepEqual(missing, [], `以下文案缺少语言（三语必须齐全）：\n  ${missing.join('\n  ')}`);
  assert.deepEqual(notTranslated, [], `以下文案没有真正翻译：\n  ${notTranslated.join('\n  ')}`);
  ok(`MESSAGES 三语齐全且已真实翻译（${keys.length} 条 × ${LOCALES.length} 语言）`);
}

// ── 2. 面向用户的 API 不得写死中文 message ───────────────────────────────
{
  // admin.js 是运营者自己的后台（操作者=站长本人），中文是刻意的，豁免。
  // _email.js 自带三语模板体系，不走 MESSAGES。
  const EXEMPT = new Set(['admin.js', '_email.js', '_locale.js']);
  const offenders = [];
  for (const f of readdirSync('api').filter((f) => f.endsWith('.js') && !EXEMPT.has(f))) {
    const src = read(`api/${f}`);
    const re = /message:\s*(?:`([^`]{2,300})`|'([^']{2,300})'|"([^"]{2,300})")/g;
    let m;
    while ((m = re.exec(src))) {
      const v = m[1] || m[2] || m[3];
      if (CJK.test(v)) offenders.push(`api/${f}:${src.slice(0, m.index).split('\n').length} → ${v.slice(0, 56)}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    `面向用户的 API 不得写死中文 message（英文/繁体用户会原样看到中文）。\n请改用 t(locale,'key') 并在 _locale.js 补三语：\n  ${offenders.join('\n  ')}`,
  );
  ok('面向用户的 API 无写死中文 message');
}

// ── 3. AI 生成入口必须按 locale 输出语言 ─────────────────────────────────
{
  for (const f of ['fortune-report.js', 'report.js', 'master-question.js']) {
    const src = read(`api/${f}`);
    assert.ok(/from '\.\/_locale\.js'/.test(src), `api/${f} 必须引入 _locale.js`);
    assert.ok(
      src.includes('LLM_LANGUAGE_RULE[normalizeLocale(locale)]'),
      `api/${f} 必须把按 locale 的输出语言规则注入 LLM，否则一律输出简体中文`,
    );
    // 系统提示里不得再写死语言，否则会与注入的语言规则打架
    assert.equal(/输出简体中文。/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')), false,
      `api/${f} 的提示词不得写死"输出简体中文"——会与按 locale 注入的语言规则冲突`);
  }
  ok('三个 AI 入口都按 locale 注入输出语言规则');
}

// ── 4. 报告缓存必须按语言隔离 ────────────────────────────────────────────
{
  const src = read('api/fortune-report.js');
  assert.ok(
    /function reportKey\(type, targetPeriod, locale\)/.test(src) && /\$\{normalizeLocale\(locale\)\}/.test(src),
    '报告缓存键必须包含 locale，否则英文用户会命中别人缓存的中文报告（反之亦然）',
  );
  ok('报告缓存键按语言隔离');
}

// ── 5. 语言解析：账号上存的语言优先于请求带的 ────────────────────────────
{
  const src = read('api/_locale.js');
  assert.ok(/account_profiles/.test(src) && /select=locale/.test(src),
    'resolveUserLocale 必须以 account_profiles.locale（注册时写入、跟随账号）为真源');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('zh-TW'), 'zh-Hant');
  assert.equal(normalizeLocale('zh-HK'), 'zh-Hant');
  assert.equal(normalizeLocale('zh-CN'), 'zh');
  assert.equal(normalizeLocale(''), 'zh');
  assert.equal(normalizeLocale(undefined), 'zh');
  ok('locale 归一化正确（en / zh-Hant / zh）');
}

// ── 6. t() 行为：占位符替换 + 未知 key 必须报错（不许静默漏中文）──────────
{
  assert.equal(t('en', 'insufficient_credits', { n: 3 }), 'Not enough credits — this request needs 3.');
  assert.ok(t('zh-Hant', 'insufficient_credits', { n: 3 }).includes('3'));
  assert.throws(() => t('en', 'no_such_key_at_all'), /unknown message key/, 't() 遇到未知 key 必须抛错，不能静默返回空/中文');
  // 未知语言退回中文，但绝不能返回 undefined
  assert.ok(typeof t('ja', 'login_required') === 'string' && t('ja', 'login_required').length > 0);
  ok('t() 占位符/未知 key/兜底行为正确');
}

// ── 7. LLM 语言规则本身三语齐全 ──────────────────────────────────────────
{
  for (const loc of LOCALES) {
    assert.ok(typeof LLM_LANGUAGE_RULE[loc] === 'string' && LLM_LANGUAGE_RULE[loc].length > 10, `LLM_LANGUAGE_RULE 缺 ${loc}`);
  }
  assert.ok(/English/.test(LLM_LANGUAGE_RULE.en), '英文规则必须明确要求英文输出');
  assert.ok(/繁體/.test(LLM_LANGUAGE_RULE['zh-Hant']), '繁体规则必须明确要求繁体输出');
  ok('LLM 输出语言规则三语齐全');
}

// ── 8. 前端必须把 locale 传给 AI 接口（未登录/预览时服务端只能靠它）──────────
{
  const index = read('index.html');
  for (const ep of ['FORTUNE_REPORT_ENDPOINT', 'TRADE_REPORT_ENDPOINT']) {
    const i = index.indexOf(ep + ',{method');
    assert.ok(i > 0, `找不到 ${ep} 的 fetch 调用`);
    const chunk = index.slice(i, i + 260);
    assert.ok(/locale:checkoutLocaleValue\(\)/.test(chunk), `${ep} 的请求体必须带 locale`);
  }
  assert.ok(/const payload=\{locale:checkoutLocaleValue\(\)/.test(index), '问大师 payload 必须带 locale');
  ok('前端三个 AI 接口都带 locale');
}

// ── 9. 繁体必须能接住异步注入的内容 ──────────────────────────────────────
{
  const index = read('index.html');
  assert.ok(/function ensureHantObserver\(\)/.test(index) && /new MutationObserver/.test(index),
    '繁体必须用 MutationObserver 接住异步注入的内容（AI 报告 20-40 秒后才回来），否则繁体用户看到简体');
  assert.ok(/ensureHantObserver\(\);/.test(index.slice(index.indexOf('function applyLocale('))),
    'applyLocale 切到繁体时必须启动 observer');
  ok('繁体 MutationObserver 已接入（异步内容自动转换）');
}

// ── 10. 交易复盘前端链路必须有英文分支 ───────────────────────────────────
{
  const index = read('index.html');
  const i = index.indexOf('async function renderDetailedReport(type,locked)');
  const chunk = index.slice(i, index.indexOf('function openGeneratedReport(', i));
  assert.ok(/_en\?/.test(chunk), '交易复盘的加载/报错文案必须有英文分支（此前全是写死简体）');
  assert.equal(
    /out\.innerHTML='<div class="report-paywall">AI 正在结合/.test(chunk), false,
    '交易复盘加载文案不得写死简体中文',
  );
  ok('交易复盘前端链路有英文分支');
}

console.log(`\ni18n contract: all ${checks} checks passed`);
