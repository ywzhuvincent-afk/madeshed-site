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
const HANT_SAME_OK = new Set(['period_this_month', 'trade_period_to']);

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

// ── 4. 报告缓存必须按语言隔离（两个报告接口都要）────────────────────────
{
  const fr = read('api/fortune-report.js');
  assert.ok(
    /function reportKey\(type, targetPeriod, locale\)/.test(fr) && /\$\{normalizeLocale\(locale\)\}/.test(fr),
    'fortune-report 缓存键必须包含 locale，否则英文用户会命中别人缓存的中文报告',
  );
  const rp = read('api/report.js');
  assert.ok(
    /function reportKey\(type, period, locale\)/.test(rp) && /\$\{normalizeLocale\(locale\)\}/.test(rp),
    'report.js（交易复盘）缓存键同样必须包含 locale —— 曾漏掉，导致英文用户拿到缓存的中文报告',
  );
  ok('两个报告接口的缓存键都按语言隔离');
}

/* ── 4b. 报告"外壳"必须三语 ───────────────────────────────────────────────
   实测漏网：英文站报告卡显示 "7 Day Report · 深度复盘版" —— 我只本地化了 fortune-report
   的外壳，report.js 的标题后缀/徽章/免责声明仍写死中文，而当时的守卫只查 message: 字段，
   完全看不见报告外壳。这条就是补上那个缺口。 */
{
  for (const f of ['fortune-report.js', 'report.js']) {
    const src = read(`api/${f}`);
    // 商品名必须三语（只有中文 label → 英文用户直接看到中文标题）
    assert.ok(/labelEn:/.test(src) && /labelHant:/.test(src), `api/${f} 的商品名必须有 labelEn/labelHant`);
    // 标题/徽章/免责声明不得写死中文：扫描 HTML 片段里的中文字面量
    const offenders = [];
    const re = /['"`]([^'"`\n]{0,60}?[一-鿿][^'"`\n]{0,60}?)['"`]/g;
    let m;
    while ((m = re.exec(src))) {
      const v = m[1];
      // 只看会进 HTML 输出的片段（带标签或徽章类），其余（提示词/中文注释/干支表）不管
      if (!/<h2>|<h3>|report-badge|report-warning|<p>|<ul>/.test(v)) continue;
      if (!/[一-鿿]/.test(v.replace(/<[^>]*>/g, ''))) continue;
      offenders.push(`api/${f}: ${v.slice(0, 50)}`);
    }
    assert.deepEqual(offenders, [], `报告外壳不得写死中文（英文/繁体用户会直接看到）。请改用 t(locale,'key')：\n  ${offenders.join('\n  ')}`);
  }
  ok('两个报告接口的外壳（标题/徽章/免责）均无写死中文');
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

// ── 11. 前端 UI_TEXT：每条必须 zh+en 齐全（繁体由 opencc 转，不单独存）──────
{
  const index = read('index.html');
  const m = index.match(/const UI_TEXT=\{([\s\S]*?)\n\};/);
  assert.ok(m, '找不到前端 UI_TEXT 文案表');
  const body = m[1];
  /* 逐行解析：每条文案独占一行 `key:{zh:'...',en:'...'},`。
     不能用 [^}]* 抓行内内容——文案里的 {missing}/{name} 占位符会让它提前截断（曾误报）。 */
  const lines = body.split('\n').filter((l) => /^\s{2}\w+:\s*\{/.test(l));
  const keys = lines.map((l) => l.match(/^\s{2}(\w+):/)[1]);
  assert.ok(keys.length >= 20, `UI_TEXT 至少应有 20 条，实际 ${keys.length}`);
  const bad = [];
  lines.forEach((line, i) => {
    const k = keys[i];
    if (!/\bzh:\s*'/.test(line)) bad.push(`${k} 缺 zh`);
    if (!/\ben:\s*'/.test(line)) bad.push(`${k} 缺 en`);
    const en = (line.match(/\ben:\s*'((?:[^'\\]|\\.)*)'/) || [])[1] || '';
    if (CJK.test(en)) bad.push(`${k}.en 仍含中文: ${en.slice(0, 30)}`);
  });
  assert.deepEqual(bad, [], `前端 UI_TEXT 必须 zh+en 齐全且英文不含中文：\n  ${bad.join('\n  ')}`);
  ok(`前端 UI_TEXT zh+en 齐全（${keys.length} 条）`);
}

// ── 12. 付费/错误瞬时态不得再写死中文（用户掏钱那一刻才出现，最容易漏）──────
{
  /* 必须把 UI_TEXT 表本身排除：中文作为 zh 值住在表里是正确的，
     要禁的是"表以外的地方还散着中文字面量"。 */
  const full = read('index.html');
  const tbl = full.match(/const UI_TEXT=\{[\s\S]*?\n\};/);
  const index = tbl ? full.replace(tbl[0], '/*UI_TEXT_TABLE*/') : full;
  /* 这几个函数已 100% 迁移到 T()，因此规则是"函数体内不得出现任何中文字面量"——
     比精确字符串黑名单强得多（黑名单换个写法就绕过去了，曾漏掉一次变异）。
     注：openFortuneReport / renderDetailedReport 仍保留 en?'...':'中文' 三元，由第 10 项覆盖，不在此列。 */
  const STRICT_FNS = [
    'paidActionMessage', 'ensurePaidActionAllowed', 'beginReportCheckout', 'beginFortuneReportCheckout',
    'beginMembershipCheckout', 'beginCustomerPortal', 'beginCreditCheckout', 'submitMasterQuestion',
  ];
  const found = [];
  for (const fn of STRICT_FNS) {
    const i = index.search(new RegExp(`(async\\s+)?function ${fn}\\s*\\(`));
    if (i < 0) { found.push(`${fn}: 找不到该函数`); continue; }
    // 取函数体（按大括号配平）
    let j = index.indexOf('{', i), depth = 0, end = j;
    for (; end < index.length; end++) {
      if (index[end] === '{') depth++;
      else if (index[end] === '}') { depth--; if (depth === 0) break; }
    }
    const body = index.slice(j, end + 1);
    for (const m of body.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      if (CJK.test(m[1])) found.push(`${fn}() 内写死中文: ${m[1].slice(0, 40)}`);
    }
  }
  assert.deepEqual(found, [], `付费/错误瞬时态不得写死中文，请改用 T('key') 并在 UI_TEXT 补 zh+en：\n  ${found.join('\n  ')}`);
  assert.ok(/function T\(k,vars\)/.test(index), '前端必须提供 T(key) 取文案');
  assert.ok(/function productDisplayName\(product\)/.test(index), '商品名必须按语言取（productDisplayName），否则英文用户看到中文商品名');
  ok('付费/错误瞬时态已全部走 T()');
}

// ── 13. 注册语言必须写进 user_metadata（确认邮件先于 account_profiles 建行）──
{
  const index = read('index.html');
  assert.ok(
    /data:\{display_name:displayName,locale:checkoutLocaleValue\(\)\}/.test(index),
    '注册时必须把 locale 写入 user_metadata：确认邮件在 account_profiles 建行之前就发出，' +
    'Supabase 邮件模板只能靠 {{ .Data.locale }} 判断语言',
  );
  ok('注册语言写入 user_metadata（供 Supabase 邮件模板分支）');
}

/* ── 11. 商品卡不得被"罐头文案覆盖层"改写 ─────────────────────────────────
   实测：英文站命理页出现两张一模一样的 "Ultimate Membership"。因为
   localizeEnglishFortuneProducts 按「无 fortuneReportType 即会员卡」来认，把至尊VIP卡
   整张改写成 Ultimate 的假副本（标题/价格/描述/两个按钮/徽章全错）。
   渲染函数自身已按 locale 输出正确英文 —— 覆盖层只会帮倒忙且认不出新卡。 */
{
  const index = read('index.html');
  for (const bad of [
    "if(!type){if(t)t.textContent='Ultimate Membership'",
    "badge.textContent='Single unlock'",
    "if(b.dataset.membershipAction)b.textContent='Start Ultimate'",
  ]) {
    assert.equal(index.includes(bad), false,
      `商品卡不得被罐头文案覆盖（会把 VIP/新商品卡改写成假副本）：${bad}`);
  }
  // 这两个函数只允许"重新渲染"，不得再自己写文案
  for (const fn of ['localizeEnglishReportProducts', 'localizeEnglishFortuneProducts']) {
    const m = index.match(new RegExp(`function ${fn}\\(\\)\\{[^\\n]*`));
    assert.ok(m, `找不到 ${fn}`);
    assert.ok(/render(PaidReport|Fortune)Products\(\)/.test(m[0]),
      `${fn} 必须委托给渲染函数`);
    assert.equal(/textContent\s*=\s*'/.test(m[0]), false,
      `${fn} 不得自己写文案——渲染函数已按 locale 输出，覆盖只会认不出新卡`);
  }
  ok('商品卡无罐头覆盖层（VIP/新卡不会被改写成假副本）');
}

/* ── 12. 关键渲染/本地化函数不得重复定义 ──────────────────────────────────
   本项目已两次被这个坑咬：同名函数声明两次，后者静默覆盖前者，
   导致「我改了代码但线上没变」——localizeDynamicContent 与 localizeEnglishFortuneProducts 都中过。 */
{
  const index = read('index.html');
  const dupes = [];
  for (const fn of [
    'renderFortuneProducts', 'renderPaidReportProducts',
    'localizeEnglishFortuneProducts', 'localizeEnglishReportProducts',
    'localizeDynamicContent', 'applyTodayScoreNodes', 'applyLivePriceNodes',
  ]) {
    const n = (index.match(new RegExp(`function ${fn}\\(`, 'g')) || []).length;
    if (n > 1) dupes.push(`${fn} 被定义 ${n} 次`);
  }
  assert.deepEqual(dupes, [], `以下函数重复定义（后者静默覆盖前者，改了代码线上却不变）：\n  ${dupes.join('\n  ')}`);
  ok('关键渲染/本地化函数无重复定义');
}

console.log(`\ni18n contract: all ${checks} checks passed`);
