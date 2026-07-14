import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const utf8 = 'utf8';
const index = readFileSync('index.html', utf8);
const chart = readFileSync('chart-full.html', utf8);

// 内联 <script> 必须能被 JS 引擎解析——纯字符串断言抓不到语法错误（曾有三元表达式括号错位
// 导致整段脚本抛 SyntaxError、window.madeshed 从未定义、整站 JS 全废，而所有字符串断言仍通过）。
(function parseCheckInlineScripts() {
  for (const [file, html] of [['index.html', index], ['chart-full.html', chart]]) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m, i = 0;
    while ((m = re.exec(html))) {
      i++;
      const attrs = m[1] || '', code = m[2];
      if (/\bsrc=/i.test(attrs)) continue;
      if (/\btype=/i.test(attrs) && !/type=["']?(text\/javascript|module|application\/javascript)["']?/i.test(attrs)) continue;
      if (!code.trim()) continue;
      try { new vm.Script(code, { filename: `${file}#inline${i}` }); }
      catch (e) { assert.fail(`${file} 第 ${i} 个内联脚本存在语法错误: ${e.message}`); }
    }
  }
})();
const baziEnginePath = 'bazi-engine.js';
const baziEngine = existsSync(baziEnginePath)
  ? readFileSync(baziEnginePath, utf8)
  : '';
const supabaseSchemaPath = 'supabase/schema.sql';
const supabaseSchema = existsSync(supabaseSchemaPath)
  ? readFileSync(supabaseSchemaPath, utf8)
  : '';
const packageJson = existsSync('package.json')
  ? readFileSync('package.json', utf8)
  : '';

function includesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} missing: ${value}`);
  }
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function assertHasLabelFor(source, id, label) {
  assert.ok(
    new RegExp(`<label\\b[^>]*\\bfor="${id}"`, 'u').test(source),
    `${label} should have a label for ${id}`,
  );
}

includesAll(index, [
  '<link rel="canonical" href="https://madeshed.com/">',
  '<meta property="og:title"',
  '<meta property="og:description"',
  '<meta name="twitter:card"',
  '<link rel="icon"',
], 'index SEO metadata');

includesAll(chart, [
  '<meta name="description"',
  '<link rel="canonical" href="https://madeshed.com/chart-full.html">',
  '<meta property="og:title"',
  '<meta name="twitter:card"',
], 'chart SEO metadata');

includesAll(chart, [
  'function chartLocaleIsEn',
  'function applyChartEnglishLocale',
  'function renderBasicEnglish',
  'function renderYongEnglish',
  'function renderWealthEnglish',
  'function renderSizhuEnglish',
  'function chartPillarDisplayEn',
  'function tenGodEn',
  'function shenShaEn',
  'function naYinEn',
  'Full BaZi Chart',
  'How to read this: your Day Master is your core self',
  'Birth Date',
  'Favorable Elements',
  'Wealth / Investment',
  'Four Pillars Chart',
  'Luck / Year / Month / Day Timeline',
  'Chinese = original pillar',
  'Pinyin = pronunciation',
  'English = element + zodiac meaning',
  'Not investment advice',
], 'chart-full English localization');

includesAll(chart, [
  'function setupCollapsibleSections()',
  "head.classList.add('toggle')",
  "head.setAttribute('aria-expanded',open?'true':'false')",
  'body.hidden=!open',
  "e.target.closest('.s-head.toggle')",
  'setupCollapsibleSections();',
  'id="sz-adv-toggle"',
  'class="sz-adv-label"',
  "e.target.closest('#sz-adv-toggle')",
  "tbl.classList.toggle('show-adv',!open)",
  '.sz tr.sz-adv{display:none}',
  '.sz.show-adv tr.sz-adv{display:table-row}',
  'Show advanced details (Na Yin, Void branches, Symbolic Stars)',
], 'chart-full progressive disclosure: sections collapse (Basic open by default) and esoteric rows hide behind a toggle');

assert.equal(
  countMatches(chart, /<tr class="sz-adv">/g) >= 6 ? 1 : 0,
  1,
  'both Chinese and English four-pillar tables tag Na Yin / Void / Symbolic Stars rows as advanced (3 rows each)',
);

assert.ok(existsSync('robots.txt'), 'robots.txt should exist');
assert.ok(existsSync('sitemap.xml'), 'sitemap.xml should exist');

assert.ok(existsSync('guide/trading-persona.html'), 'English SEO landing page should exist');
assert.ok(existsSync('guide/trading-persona.zh.html'), 'Chinese SEO landing page should exist');
const guideEn = readFileSync('guide/trading-persona.html', utf8);
const guideZh = readFileSync('guide/trading-persona.zh.html', utf8);
includesAll(guideEn, [
  '<link rel="canonical" href="https://madeshed.com/guide/trading-persona.html">',
  'hreflang="zh-Hans" href="https://madeshed.com/guide/trading-persona.zh.html"',
  'hreflang="x-default"',
  '"@type":"FAQPage"',
  '"@type":"BreadcrumbList"',
  'The Disciplined Executor',
  'The Momentum Striker',
  'https://madeshed.com/?lang=en#/onboarding',
  'Not investment advice',
], 'English landing page has crawlable content, hreflang, structured data, and app CTA');
includesAll(guideZh, [
  '<link rel="canonical" href="https://madeshed.com/guide/trading-persona.zh.html">',
  'hreflang="en" href="https://madeshed.com/guide/trading-persona.html"',
  '"@type":"FAQPage"',
  '纪律执行者',
  '动量快枪手',
  'https://madeshed.com/?lang=zh#/onboarding',
  '不构成投资建议',
], 'Chinese landing page has crawlable content, hreflang, structured data, and app CTA');
const sitemap = readFileSync('sitemap.xml', utf8);
includesAll(sitemap, [
  'https://madeshed.com/guide/trading-persona.html',
  'https://madeshed.com/guide/trading-persona.zh.html',
  'xhtml:link rel="alternate" hreflang="zh-Hans"',
], 'sitemap lists both landing pages with hreflang alternates');
includesAll(index, [
  'data-guide-link',
  "setLocaleText('.footer-links a[data-guide-link]','Trading Persona')",
  "setLocaleAttr('.footer-links a[data-guide-link]','href','/guide/trading-persona.html')",
], 'app footer links to the guide (internal crawl path), locale-aware');

includesAll(index, [
  'function bandColor(score)',
  'function bandTint(score)',
  "'red':'#EF5350'",
  '.today-score .score-max{',
  '.today-meta{font-size:18px;color:var(--text);font-weight:600',
  'scoreEl.innerHTML=score+\'<span class="score-max">/100</span>\';scoreEl.style.color=col;',
  '今日: <span style="color:\'+col+\'">\'+action.label+\'</span>',
  'meta.innerHTML=\'仓位 <b>\'+position+\'</b> · \'+dr.advice',
], 'daily today block: risk word + score colored by history band, score shows /100, advice enlarged, ten-god role removed');
assert.equal(
  index.includes("title.textContent='今日: '+action.label+' · '+dr.role"),
  false,
  'daily headline should not append the ten-god role or leave the risk label uncolored',
);

includesAll(index, [
  'function paintScoreNum(el,score)',
  'function paintScorePill(el,score)',
  'el.innerHTML=score+\'<span class="score-max">/100</span>\';el.style.color=bandColor(score)',
  '.score-n .score-max{',
  '.score-l::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}',
  'document.querySelectorAll(\'.score-n\').forEach(function(el){if(Number.isFinite(Number(state.score)))paintScoreNum(el,state.score);})',
], 'dashboard score card also uses the /100 + history-band-color pattern (zh and en)');
assert.ok(existsSync(baziEnginePath), 'shared bazi-engine.js should exist');

includesAll(index, [
  'class="mobile-menu-toggle"',
  'id="mobile-menu"',
  'aria-controls="mobile-menu"',
  'aria-expanded="false"',
  '@media (max-width:760px)',
  'html,body{width:100%;overflow-x:hidden}',
  '.nav-links,.nav-right{display:none}',
  '.mobile-menu-toggle{display:inline-flex;flex:0 0 38px;margin-left:auto}',
  '.hero-h h1{font-size:30px',
], 'mobile navigation');

includesAll(index, [
  '<body data-locale="en">',
  'id="language-gate"',
  'data-language-choice="zh-CN"',
  'data-language-choice="en"',
  'data-locale-switch="zh-CN"',
  'data-locale-switch="en"',
  'madeshed_locale_v1',
  'function localeFromUrl',
  'function defaultLocale',
  'function syncLocaleUrl',
  'function rerenderLocaleSurfaces',
  'function restoreChineseDailyWidgets',
  "restoreChineseDailyWidgets();",
  "rangeLabels={30:'近 1 月',7:'近 7 天',365:'近 1 年',all:'全部',custom:'自定义'}",
  "cardTitles[0].textContent='按命理颜色分组'",
  "cardTitles[1].textContent='近 30 天日历'",
  "if(typeof refresh==='function')refresh();",
  "if(typeof renderStoredCheckin==='function')renderStoredCheckin();",
  "if(typeof renderDailyStats==='function')renderDailyStats();",
  "if(typeof renderReport==='function')renderReport();",
  "rerenderLocaleSurfaces();",
  "url.searchParams.set('lang',l==='en'?'en':(l==='zh-Hant'?'zh-hant':'zh'))",
  "const initialUrlLocale=localeFromUrl()",
  "const storedLocale=initialUrlLocale||readStoredLocale()",
  "if(!storedLocale)document.body.classList.add('language-pending')",
  "if(storedLocale){applyLocale(storedLocale,true);}else{applyLocale(defaultLocale(),false);}",
  'window.MadeshedLocale',
  'madeshed:locale-change',
  'applyAccountLocale',
  'j.account.profile.locale',
  'window.MadeshedLocale.get()',
], 'default English homepage, Chinese entry, and account locale persistence');

assert.equal(index.includes('<body class="language-pending">'), false, 'language-pending must be toggled by JS (first visit only), not hard-coded on every load');

includesAll(index, [
  'id="home-generate"',
  'class="hero-gender"',
  'id="home-birth-date"',
  'id="home-birth-time"',
  'id="home-time-unknown"',
  'id="home-submit"',
  'data-home-gender="M"',
  'var profile=m.calcBazi(d.value,time,gender,timeKnown);',
  "location.hash='#/dashboard';",
], 'landing page carries the inline birth-info generator that feeds the whole site');

assert.equal(
  index.includes("<button class=\"hero-cta\" data-route=\"/onboarding\">"),
  false,
  'hero CTA should scroll to the inline form, not route away to a separate onboarding page',
);

includesAll(index, [
  'id="home-city-input"',
  'id="home-city-suggestions"',
  'function attachCityPicker(input,suggestions,meta)',
  'function cityInitials(c)',
  "String(c.py||'').includes(ql)||cityInitials(c).includes(ql)",
  "attachCityPicker(document.getElementById('home-city-input'),document.getElementById('home-city-suggestions'),document.getElementById('home-city-meta'))",
  "['.hf-city-label','Birthplace']",
], 'landing city picker: shared engine matches Chinese name, pinyin, English, and initials on both forms');

{
  const cityCount = (index.match(/const CITIES = \[([\s\S]*?)\n\];/)[1].match(/\{name:/g) || []).length;
  assert.ok(cityCount >= 120, `world-city list should be comprehensive (found ${cityCount})`);
  ['纽约','伦敦','东京','迪拜','悉尼','孟买','圣保罗','开罗','首尔','莫斯科'].forEach(c => {
    assert.ok(index.includes(`name:'${c}'`), `city list should include ${c}`);
  });
  assert.ok(/\{name:'北京',en:'Beijing',country:'中国',py:'beijing'/.test(index), 'each city should carry a pinyin (py) field for fuzzy search');
}

includesAll(index, [
  "if(storedLocale){applyLocale(storedLocale,true);}else{applyLocale(defaultLocale(),false);}",
], 'initial applyLocale runs at the end of the script block so late consts are initialized before any dynamic render');

// Real-data mode: no demo/sample trading data anywhere the user sees.
includesAll(index, [
  'function getAnalysisEntries(){return getActualEntries();}',
  'function setDayColors(profileSig,scoreFn)',
  'function dayColorFor(d)',
  ',color=dayColorFor(d)',
  'function setDailyInsight()',
], 'Daily/Report use only real check-ins; the calendar is colored by the real chart day-color, trades come only from real logs');

assert.equal(index.includes('function genEntries'), false, 'demo trade generator must be removed');
assert.equal(index.includes('sampleEntries'), false, 'sample-entries fallback must be removed');
assert.equal(index.includes('示例数据'), false, 'no "示例数据" (demo data) label anywhere');
assert.equal(index.includes('仅演示'), false, 'no "仅演示" (demo only) label anywhere');
assert.equal(/<strong>示例历史/.test(index), false, 'daily insight must not show a fake "示例历史" win rate');
assert.ok(index.includes("return{entries:filterEntriesByRange(actual,{type:type}),usingSample:false"), 'report entries are real-only');

includesAll(chart, [
  'function chartLocaleFromUrl',
  'function chartDefaultLocale',
  'function chartSyncLocaleUrl',
  "url.searchParams.set('lang',l==='en'?'en':(l==='zh-Hant'?'zh-hant':'zh'))",
  'var initialChartLocale=chartLocaleFromUrl()||chartStoredLocale()||chartDefaultLocale()',
], 'chart full default English and URL locale entry');

includesAll(index, [
  'const EN_COPY',
  'function localizeStaticContent',
  'function localizeDynamicContent',
  'function applyEnglishAfterRender',
  'function scoreBandEn',
  'function renderEnglishScoreDetails',
  'function localizeEnglishMetaContent',
  'function stemInfoEn',
  'function branchInfoEn',
  'function pillarLabelEn',
  'function renderEnglishPillarDetails',
  'function refreshPillarsForLocale',
  'Trade with your rhythm, not your impulse.',
  'A trading discipline dashboard powered by BaZi timing and your own behavior data.',
  'Four Pillars / BaZi Chart',
  'Four Pillars = Year, Month, Day, Hour',
  'Chinese = original chart',
  'Pinyin = pronunciation',
  'English = element + zodiac meaning',
  'translated into timing, risk, and discipline signals',
  'function renderLuckCycleCell',
  'function translateLuckCyclesForEnglish',
  'Chinese = original luck-cycle pillar',
  'function renderForecastPillarEnglish',
  'function translateForecastPillarsForEnglish',
  'Chinese = original daily pillar',
  'Yi Hai',
  'Yin Wood Pig',
  'Geng Yin',
  'Yang Metal Tiger',
  'Xin Wei',
  'Yang Earth Rat',
  'Hidden Stem',
  'Action Mode: Full Plan',
  'Wealth Signal',
  'Suggested Discipline',
  'Day Master',
  'Luck Pillar',
  'Revenge-trade Guard',
  'Behavioral Timing',
  'This is not investment advice.',
  'Scores describe timing and behavioral risk, not expected return.',
], 'English investor locale positioning');

includesAll(index, [
  'function localizeEnglishWholeSite',
  'function localizeEnglishDailyView',
  'function localizeEnglishReportView',
  'function localizeEnglishFortuneView',
  'function localizeEnglishAccountView',
  'function localizeEnglishLegalViews',
  'function localizeEnglishDynamicWidgets',
  'Daily Journal',
  'Record what happened after the close',
  'Pattern Review',
  'Trading Reports',
  'Free summary first. Detailed reports when you need deeper review.',
  'BaZi Advisor',
  'Ask one focused question about timing, planning, or risk.',
  'Account Center',
  'Risk Waiver',
  'Not investment advice',
  'Use scores as timing and behavior signals, not trade calls.',
  'Scores are calibrated to express timing rhythm, not expected return.',
  'Base Timing',
  'Flow Trigger',
  'Wealth Signal',
  'Risk Penalty',
  'Sample size matters',
  'Reading login session...',
  'If this page did not sign you in automatically, return to Login and send a new link.',
], 'full English product localization');

assert.ok(
  index.includes('function localizeEnglishWholeSite(){localizeEnglishDailyView();'),
  'whole-site locale restore must run reversible static locale functions for Chinese too',
);
assert.equal(
  index.includes('function localizeEnglishWholeSite(){if(!localeIsEn())return;'),
  false,
  'whole-site locale restore must not early-return before restoring Chinese static copy',
);

assert.equal(
  index.includes('Original Chinese characters are kept for accuracy; the English layers explain pronunciation and meaning.'),
  false,
  'English pillar helper should teach without repeating the full chart',
);

assert.equal(index.includes('选择语言 · Choose Language'), false, 'language gate should not show explanatory title copy');
assert.equal(index.includes('首次进入请先选择使用语言'), false, 'language gate should not show explanatory paragraph copy');
assert.equal(index.includes('不会使用 IP 强制切换语言'), false, 'language gate should not show bottom note copy');
assert.equal(index.includes('进入中文界面'), false, 'language gate buttons should be label-only');
assert.equal(index.includes('Continue in English'), false, 'language gate buttons should be label-only');

assert.equal(
  countMatches(index, /<a\b(?=[^>]*\bdata-route=)(?![^>]*\bhref=)[^>]*>/g),
  0,
  'all routed anchors should also have href attributes',
);

assertHasLabelFor(index, 'birth-date', 'onboarding form');
assertHasLabelFor(index, 'birth-time', 'onboarding form');
assertHasLabelFor(index, 'city-input', 'onboarding form');
includesAll(index, [
  'role="combobox"',
  'role="listbox"',
  'aria-pressed="true"',
], 'form accessibility');

assertHasLabelFor(chart, 'in-date', 'chart form');
assertHasLabelFor(chart, 'in-time', 'chart form');
assertHasLabelFor(chart, 'in-gender', 'chart form');

includesAll(index, [
  'risk-note',
  '不构成投资建议',
  '进入仪表盘',
  '邮箱登录保存',
  ':focus-visible',
  'prefers-reduced-motion',
], 'trust and accessibility copy');

includesAll(chart, [
  'risk-note',
  '不构成投资建议',
  ':focus-visible',
  '@media(max-width:640px)',
  '.inbar{display:grid;grid-template-columns:1fr;align-items:stretch}',
], 'chart trust and accessibility copy');

includesAll(chart, [
  'class="nav"',
  'class="logo"',
  'class="nav-right"',
  'class="mobile-menu-toggle"',
  'id="mobile-menu"',
  'href="/#/daily"',
  'href="/#/dashboard"',
  'href="/chart-full.html"',
  'href="/#/report"',
  'href="/#/fortune"',
  'href="/#/account"',
], 'chart navigation matches homepage pattern');
assert.equal(chart.includes('class="site-nav"'), false, 'chart page should not use standalone header navigation');
assert.equal(chart.includes('返回主仪表盘'), false, 'chart page should not add a separate dashboard back button in nav');

includesAll(chart, [
  'function applySavedProfile()',
  "localStorage.getItem('madeshed_profile_v1')",
  'p.birth',
  "p.gender==='M'?'1':'0'",
], 'chart saved profile integration');

assert.equal(index.includes('\u00a5299'), false, 'site should not show old ¥299 buyout pricing');
assert.equal(index.includes('\u00a549'), false, 'site should not show old ¥49 PRO pricing');
// 英文价签用 CN¥（与实际扣费货币一致）；旧断言曾钉死编造的 $ 价，已纠正
includesAll(index, [
  "priceEn:'CN¥29'",
  "priceEn:'CN¥79'",
  "priceEn:'CN¥199'",
  "priceEn:'CN¥399'",
  'function productDisplayPrice(product)',
  "localeIsEn()&&product.priceEn?product.priceEn:product.price",
  "REPORT_PRODUCTS[type].priceEn",
  "FORTUNE_PRODUCTS[type].priceEn",
], 'English pricing labels use CN¥ (same currency as actual charge)');
assert.equal(index.includes('Beta ·'), false, 'production landing copy should not show beta badge');
assert.equal(index.includes('href="#terms"'), false, 'onboarding terms link should use #/terms route');
assert.equal(index.includes('href="#privacy"'), false, 'onboarding privacy link should use #/privacy route');
assert.equal(chart.includes('function calcYongShen(dgStem, strengthPct, monthBranch)'), false, 'chart page should not keep a second yongshen algorithm');
includesAll(index, [
  "var cat=strength&&typeof strength==='object'?(strength.category||strength.label):null",
  "'中和':'Balanced'",
  "n<=24?'Very Weak':(n<=42?'Weak':(n<58?'Balanced':(n<=78?'Strong':'Very Strong')))",
  'strengthNameEn(p.strength)',
], 'dashboard English strength label derives from the shared engine category (matches chart-full, not divergent score thresholds)');
assert.equal(
  index.includes('strengthNameEn(p.strength&&p.strength.score)'),
  false,
  'dashboard should not label strength from score alone with thresholds that disagree with the engine',
);
includesAll(chart, [
  '(st.category||st.label)',
], 'chart-full shows the same strength category word as the dashboard (中和, not 均衡)');

includesAll(index, [
  'dyList.innerHTML=profile.daYun.map((dy,i)=>{const isC=i===profile.currentDayunIdx;',
], 'dashboard rebuilds the luck-cycle timeline from the profile instead of only updating pre-existing cells (fixes empty timeline after a clear/generate race)');

includesAll(index, [
  "['.pricing-card.featured .price','Free']",
  "['.pricing-card:not(.featured) .currency','$']",
  "['.pricing-card:not(.featured) .price','19']",
  "['.pricing-card:not(.featured) .period','/ mo']",
  "body[data-locale=\"en\"] .pricing-card.featured::before{content:'Recommended'}",
], 'landing pricing card amount and recommended badge are localized to English (no ¥/开始/月/推荐 leak)');

includesAll(index, [
  'const en=localeIsEn();const dayLabel=en?(st.score!=null?scoreBandEn(st.score):',
  "const editTxt=en?'Edit':'修改'",
], 'the "logged today" check-in summary card renders in English, not hardcoded Chinese');

includesAll(index, [
  'var PERSONA_ELEMENTS=',
  'function buildTradingPersona(profile)',
  'function personaCardHtml(p)',
  'function renderTradingPersona()',
  'function personaCopySummary()',
  'function personaSaveImage()',
  'function personaStrengthBucket(cat)',
  'id="persona-result"',
  'id="persona-dash"',
  'data-persona-action="copy"',
  'data-persona-action="save"',
  "e.target.closest('[data-persona-action]')",
  'if(typeof renderTradingPersona===\'function\')renderTradingPersona();',
  'Your Trading Persona · Free',
  '你的交易人格 · 免费',
  'The Disciplined Executor',
  'The Momentum Striker',
  'The Adaptive Opportunist',
  'The Growth Trend-Follower',
  'The Steady Operator',
], 'instant free Trading Persona report (day-1 value + shareable card) renders on result and dashboard in both languages');
includesAll(chart, [
  'state.shared=window.MadeshedBazi.calcBaziCore',
  'state.yong=state.shared.yongShen',
  'state.wealth=state.shared.wealth',
  'state.shared.inputMeta',
], 'chart uses shared bazi engine as single source of truth');
includesAll(index, [
  'id="refund-support"',
  'data-refund-action="contact"',
  'const legalText=!signedIn',
  'const membershipText=!signedIn',
], 'account center refund support and logged-out legal status copy');

includesAll(index, [
  "document.querySelectorAll('.pillars,.result-pillars,.m-pillars')",
  'function updateTodaySurfaces(profile,today,dr)',
  'window.__todayState',
  '.m-score-num',
  '.today-score',
  'window.MadeshedBazi.calcBaziCore',
  'class="forecast-card',
  "min-width:'+(en?'98px':'72px')",
], 'shared user profile rendering');

includesAll(index, [
  'function clearProfileSurfaces(today)',
  'window.__todayState=null',
  "pillars.textContent='尚未生成命盘'",
  "sl.textContent='请先生成命盘'",
  "scoreEl.textContent='—'",
  "tag.textContent='未生成命盘'",
  'function refresh(){const p=loadProfile(),t=getTodayGZ();if(p)applyProfile(p,t);else clearProfileSurfaces(t);}',
], 'no saved profile neutral state');

includesAll(index, [
  'const PROFILE_SCHEMA_VERSION',
  'function stampProfile(profile,source)',
  'profileSchemaVersion',
  'updatedAt',
  "source||'local'",
  'function getProfileUpdatedAt(profile,rowUpdatedAt)',
  'function writeLocalProfile(profile,rowUpdatedAt)',
  'function resolveProfileSync(localProfile,remoteProfile,remoteUpdatedAt)',
  'remoteTime>localTime',
  "localStorage.setItem('madeshed_profile_v1',JSON.stringify(next))",
  "if(chosen&&chosen.source==='cloud')",
  'withMadeshed(function(m){m.refresh();})',
], 'single bazi profile source');

includesAll(baziEngine, [
  'function convertLunarToSolarYmd',
  'function calcTrueSolarOffsetMinutes',
  'function applyTrueSolarTime',
  'function adjustForZiPolicy',
  'function calcStrength',
  'function calcYongShen',
  'function calcBaziCore',
  "ziSegment='late'",
  "ziSegment='early'",
  'trueSolarOffsetMinutes',
  'usedCalendar',
], 'shared bazi accuracy engine');

includesAll(index, [
  'SELECTED_CITY_KEY',
  'getSelectedCity()',
  'calendar-toggle',
  'usedCalendar',
  'trueSolarTime',
  'ziSegment',
  'id="yong-list"',
  'renderYongProfile(profile)',
  '个人真实记录',
], 'accurate input and real-record labels');

includesAll(chart, [
  '/bazi-engine.js',
  'window.MadeshedBazi.calcBaziCore',
  'trueSolarTime',
  'ziSegment',
], 'chart shared engine integration');

includesAll(index, [
  "'report'",
  "'account'",
  "'signup'",
  "'login'",
  "'forgot-password'",
  "'reset-password'",
  "'auth-callback'",
  "'account-security'",
  "'waiver'",
  "'terms'",
  "'privacy'",
  "'about'",
  "'contact'",
  'data-view="report"',
  'data-view="account"',
  'data-view="signup"',
  'data-view="login"',
  'data-view="forgot-password"',
  'data-view="reset-password"',
  'data-view="auth-callback"',
  'data-view="account-security"',
  'data-view="waiver"',
  'data-view="terms"',
  'data-view="privacy"',
  'data-view="about"',
  'data-view="contact"',
  'href="#/report"',
  'href="#/account"',
  'href="#/login"',
  'href="#/signup"',
  'href="#/waiver"',
], 'production routes');

// 使用指南页 + 首页 3 步上手（三语 + 首次生成引导）
includesAll(index, [
  'data-view="guide"',
  "'/guide':'guide'",
  'href="#/guide" data-route="/guide"',
  'how-strip',
  '使用指南',
  'How to Use Madeshed',
  'Get started in 3 steps',
  'guide-hint-toast',
  'madeshed_guide_hint_v1',
], 'usage guide page');

includesAll(index, [
  'id="signup-form"',
  'id="signup-email"',
  'id="signup-password"',
  'id="signup-password-confirm"',
  'id="signup-display-name"',
  'id="signup-accept-terms"',
  'id="signup-accept-privacy"',
  'id="signup-accept-risk"',
  'id="signup-accept-ai"',
  'id="signup-accept-billing"',
  'id="signup-accept-age"',
  'id="login-form"',
  'id="forgot-password-form"',
  'id="reset-password-form"',
  'id="account-security-form"',
  'id="account-email-form"',
  'id="account-delete-form"',
  'id="account-export-data"',
  'function signUpWithPassword',
  'function signInWithPassword',
  'function sendPasswordReset',
  'function updateAccountPassword',
  'function updateAccountEmail',
  'function resendSignupConfirmation',
  'function exportAccountData',
  'function submitAccountDeleteRequest',
  'function hasVerifiedEmail',
  'function hasRequiredLegalAcceptances',
  'function ensurePaidActionAllowed',
  'LEGALLY_REQUIRED_ACCEPTANCES',
  'data-auth-action="accept-legal"',
  'id="account-legal-output"',
], 'complete account auth frontend');

includesAll(index, [
  "const CHECKINS='madeshed_checkins_v1'",
  'function loadCheckins()',
  'function saveCheckins(items)',
  'function recordCheckin(o,m)',
  'function renderCheckinForm(item)',
  'function bindCheckinForm()',
  'id="checkin-pnl"',
  'data-checkin-action="save"',
  "e.target.closest('#checkin-card .outcome-btn')",
  "e.target.closest('#checkin-card [data-checkin-action=\"save\"]')",
  "e.target.closest('.edit-link')",
  'function renderStoredCheckin()',
  'function renderReport()',
  'function renderAccount()',
], 'local persistence shell');

includesAll(index, [
  'const OUTCOME_META',
  'const TRADE_OUTCOMES',
  'function canonicalOutcome(item)',
  'function isTradeOutcome(outcome)',
  'function isWinOutcome(outcome)',
  'function storageOutcome(outcome)',
  'function outcomeFromRemote(row)',
  "big_win:{label:'大赚'",
  "big_loss:{label:'大亏'",
  "recordCheckin(raw,buildMagnitude(raw,input&&input.value))",
  "payload:Object.assign({},x,{outcome:x.outcome})",
  'class="outcome-dist"',
  '✓✓ 大赚 | ✓ 赚',
  'XX 大亏',
  '大赚+赚 / 已交易',
], 'six outcome checkin tracking');

includesAll(index, [
  'const COLOR_MEANING',
  'function formatHeatmapDate',
  'function outcomeMark',
  'class="hm-date"',
  'class="hm-mark"',
  '浅绿=顺势',
  '颜色=命理状态',
], 'heatmap visible dates and legend meanings');

includesAll(index, [
  'id="color-meaning"',
  'id="color-stats-note"',
  'function renderColorMeaning',
  'COLOR_MEANING_DESC',
  '命理状态',
  '右侧大百分比=胜率',
  'N=样本数',
  '95%置信区间',
  '适合按计划推进',
], 'color meaning explainer');

includesAll(index, [
  'let DAY_COLORS={}',
  'function normalizeDateKey',
  'function scoreToColor',
  'function checkinToEntry',
  'function mergeActualEntries',
  'function getActualEntries',
  'function getAnalysisEntries',
  'function filterEntriesByRange',
  'function setStatsRange',
  'function updateStatsHeader',
  'function renderDailyStats',
  'renderColorStats(filtered)',
  'renderDailyStats();renderReport();renderAccount();',
  "if(typeof renderDailyStats==='function')renderDailyStats();",
], 'daily checkins refresh stats charts');

includesAll(index, [
  'function compactDateForTrend(date)',
  'id="trend-title"',
  'id="trend-scroll"',
  '.chart{position:relative;height:340px;',
  '.chart .trend-hit{cursor:pointer}',
  'function trendGzForDate(dt)',
  'function foundationRead(profile,today)',
  'function actionRead(profile,today,dr,foundation)',
  'function trendActionScore(profile,dt)',
  'function monthActionScore(profile,dt)',
  'function hourActionScore(profile,dt,h)',
  'function trendY(score)',
  'function trendPointMark(trend,idx,mode)',
  'function selectTrendPoint(idx)',
  'function daysInMonth(year,month)',
  'function buildMonthTrend(profile,now)',
  'function buildDayTrend(profile,now)',
  'function buildHourTrend(profile,now)',
  'function scrollTrendToCurrent(curIdx,count,width)',
  'data-m="day"',
  "e.target.closest('.trend-toggle [data-m]')",
  "e.target.closest('#trend-svg .trend-hit')",
  'class="trend-hit"',
  'data-selected-index',
  'window.__trendMode=mode',
  "renderTrend(window.__trendMode||'day')",
  "svg.setAttribute('viewBox','0 0 '+width+' 260')",
  'buildTrendSVG(trend.labels,trend.data,selectedIdx,selectedMark,trend.subs,width)',
], 'trend month day hour scroll modes');

includesAll(index, [
  'function clampScore(n,min,max)',
  'function calibrateActionScore(raw,mode,context)',
  'function smoothTrendData(data)',
  'function trendScoreDetails(trend,idx,mode)',
  'function renderTrendExplanation(trend,idx,mode)',
  'id="trend-explain"',
  "rawScore:raw",
  "mode==='month'",
  "mode==='day'",
  "mode==='hour'",
], 'steady but responsive trend calibration layer');
includesAll(index, [
  'function roleForElement(dayEl,el)',
  'function stemPolarity(stem)',
  'function tenGodForStem(dayStem,stem)',
  'function roleFamilyForTenGod(tenGod)',
  'function hiddenStemProfile(profile,branch)',
  'function pillarBranches(profile)',
  'function branchInteractions(profile,gz)',
  'function seasonalAdjustment(profile,flow)',
  'function rootAndReveal(profile,flow)',
  'function professionalFactors(profile,flow)',
  'function hiddenStemElements(branch)',
  'function flowElementProfile(profile,gz)',
  'function branchInteraction(profile,gz)',
  'function enhanceScoreDetails(profile,today,dr,action)',
  'enhanceScoreDetails(profile,today,dr,action)',
  'BAZI.HIDDEN_STEMS',
  'branchRole',
  'hiddenRoles',
  'hiddenProfile',
  'weightedHiddenScore',
  'tenGod',
  'seasonalAdjust',
  'rootAdjust',
  'professionalAdjust',
  'branchScore',
  'hiddenScore',
  '正财',
  '偏财',
  '七杀',
  '通根',
  '透干',
  '调候',
  '结构分',
  '四柱互动',
], 'professional bazi flow scoring uses branch hidden stems and interactions');
includesAll(index, [
  'function personalBacktestNote(score)',
  'getActualEntries',
  'isTradeOutcome',
  'isWinOutcome',
  'scoreToColor(score',
  '个人记录',
  '不参与调分',
  'personalBacktestNote(d.score)',
], 'action score explains personal backtest validation');

includesAll(index, [
  'function scoreReasonZh(dr,action)',
  'function scoreReasonFromStateEn(state)',
  'function scoreSignalChipsEn(state)',
  'function scoreDetailToggleHtml(label)',
  'class="score-reason"',
  'class="score-signals"',
  'class="score-chip"',
  'data-score-toggle',
  'class="score-detail-rows"',
  ".addEventListener('click',function(e){var toggle=e.target.closest&&e.target.closest('[data-score-toggle]')",
  "interactionNote:(dr.interaction&&dr.interaction.note)||''",
  "interactionAdjust:(dr.interaction&&dr.interaction.adjust)||0",
], 'progressive disclosure: plain-language headline stays visible, BaZi jargon collapses behind a toggle');

includesAll(index, [
  'function ensureDailyDetailBox(daily)',
  'function renderDailyScoreDetailZh(daily,dr,action)',
  'function renderDailyScoreDetailEn(daily,state)',
  "box.id='daily-score-detail'",
  'renderDailyScoreDetailZh(daily,dr,action)',
  'renderDailyScoreDetailEn(dailyEnEl,state)',
], 'daily page reuses the same collapsible BaZi detail pattern');

includesAll(index, [
  'if(window.madeshed&&typeof window.madeshed.refresh===\'function\')window.madeshed.refresh();else if(typeof refresh===\'function\')refresh();',
  "if(dashTop[2])dashTop[2].textContent='市场'",
  "const mkt=document.querySelector('.dash-hero > .dash-meta .v.up');if(mkt)mkt.textContent=marketStatusZh();",
], 'switching language after a chart is generated re-renders profile surfaces (refresh reachable across scope) and restores the Chinese market label');

// 结果页 result-meta 的 用神/喜/忌 必须来自引擎 yongShen（mainCn/xiCn/jiCn），
// 不能再套用 dash-meta 的 月令/大运 写法（该 bug 会把喜忌显示反、忌槽残留占位符）
includesAll(index, [
  'const ys=profile.yongShen||{};',
  "(ys.mainCn||'—')",
  "ys.xiCn.join(', ')",
  "ys.jiCn.join(', ')",
], 'result summary card fills 用神/喜/忌 from the engine yongShen, not from month/dayun');
assert.ok(
  !index.includes("if(items[2]){const v=items[2].querySelector('.v');if(v)v.textContent=profile.monthBranch+' · '+profile.monthRelation;}"),
  'result-meta 用神 slot must not be filled with 月令 (the old dash-meta pattern bug that inverted 喜忌)',
);

assert.ok(
  !/meta\.textContent='仓位 '\+position\+' · 底盘 '/.test(index),
  'daily headline should not show a raw unexplained foundation number by default',
);
assert.ok(
  !/'\.today-meta'\)\.forEach\(function\(el\)\{el\.textContent=state\.positionText\+' - base '/.test(index),
  'English daily headline should not show raw base/wealth numbers by default',
);
assert.ok(
  !index.includes('var spread=base<=50?28:(base<=66?34:38)'),
  'monthly trend should not keep the old extreme spread',
);
assert.ok(
  !index.includes('60+(trigger-60)*1.15+(wealth-55)*0.35+(base-60)*0.25-riskPenalty'),
  'monthly trend should not keep the old over-amplified raw formula',
);

includesAll(index, [
  "data.push(trendActionScore(profile,dt))",
  "title:y+'年'+m+'月 每日行动指数 · DAILY ACTION TREND'",
  "?'Today':(now.getDate()+'号 行动指数')",
], 'daily trend uses action score（英文态 mark 为 Today）');
// 趋势提示英文态：Today/Now/This month + When·Score，不再有别扭的 "13 Action" / "Slot"
includesAll(index, ['function trendHourEn', "?'Now':(trendPad2(now.getHours())", "?'This month':", "localeIsEn())?' · ':' '"], '趋势图提示英文态口语化（Today/Now/This month · 分数），去掉 13号/Slot');
includesAll(index, [
  'data.push(monthActionScore(profile,dt))',
  'MONTHLY ACTION TREND',
  'data=smoothTrendData(data)',
  'details.forEach(function(d,i){d.score=data[i]',
  "?'This month':((now.getMonth()+1)+'",
], 'monthly trend uses steady calibrated monthly action score');
// v3 统一分数源：行动指数/流月核心公式的唯一实现已移入 bazi-engine.js，前端只做委托
includesAll(index, [
  'function dailyRead(profile,today){return BAZI.dailyReadFull(profile,today);}',
  'function foundationRead(profile,today){return BAZI.foundationRead(profile,today);}',
  'function actionRead(profile,today,dr,foundation){return BAZI.actionScore(profile,today,dr,foundation);}',
  'function monthActionDetail(profile,dt){return BAZI.monthActionDetail(profile,dt);}',
  'function trendGzForDate(dt){return BAZI.trendGzForDate(dt);}',
], 'front-end delegates the whole action-score pipeline to the shared engine (single source)');
includesAll(baziEngine, [
  'function dailyReadFull(profile,today)',
  'function foundationRead(profile,today)',
  'function actionScore(profile,today,dr,foundation)',
  'function monthActionDetail(profile,dt)',
  'Math.round(dr.zScore*0.65+chartScore(profile,today.day)*0.35)',
  '60+(triggerScore-60)*0.75+(dr.cScore-55)*0.35+(foundation.score-60)*0.25+(dr.rootAdjust||0)*.25-riskPenalty',
  'if(foundation.score<=45)cap=64;else if(foundation.score<=55)cap=72;else if(foundation.score<=66)cap=84;else cap=92;',
  'var monthRead=dailyReadFull(profile,{day:gz.month})',
  'var monthScore=chartScore(profile,gz.month)',
  'var trigger=Math.round((monthRead?monthRead.zScore:60)*0.48+monthScore*0.34+wealth*0.18)',
  '60+(trigger-60)*.82+(wealth-55)*.25+(base-60)*.18+(monthRead&&monthRead.rootAdjust?monthRead.rootAdjust*.15:0)-riskPenalty',
  "a_calibrateActionScore(raw,'month'",
  'interactionPenalty',
  'interaction.adjust',
  'interaction.penalty',
  'actionScore:actionScore',
  'dailyReadFull:dailyReadFull',
], 'shared engine hosts the single action-score + monthly implementation');
assert.ok(
  baziEngine.includes("function getTodayGZ(){if(typeof global.Solar==='undefined')return null;return trendGzForDate(new Date());}"),
  'getTodayGZ delegates to trendGzForDate so the dashboard today-card uses the same 立春-boundary ganzhi as the trends and server',
);
assert.ok(
  !/function buildMonthTrend\(profile,now\)[\s\S]{0,360}data\.push\(chartScore\(profile,gzMonth/.test(index),
  'monthly trend should not use month single score',
);

includesAll(index, [
  'data.push(hourActionScore(profile,new Date(y,m-1,d),h))',
  'HOURLY ACTION TREND',
  'hourRead=dailyRead(profile,{day:hourGz})',
  'hourTrigger=Math.round(hourScore*.55+(hourRead?hourRead.zScore:60)*.45)',
  'dayAction.score+(hourTrigger-60)*.75+(hourRead&&hourRead.rootAdjust?hourRead.rootAdjust*.1:0)-riskPenalty',
  "calibrateActionScore(raw,'hour'",
  'var sc=hourActionScore(profile,now,(i*2)%24)',
], 'hourly trend uses intraday action score');
assert.ok(
  !/function buildHourTrend\(profile,now\)[\s\S]{0,360}data\.push\(chartScore\(profile,gz\)\)/.test(index),
  'hourly trend should not use hour single score',
);
assert.ok(
  !index.includes('onclick="window.__setTrend'),
  'trend mode buttons should use delegated click handling',
);
assert.ok(
  !index.includes("function buildDayTrend(profile,now){var y=now.getFullYear(),m=now.getMonth()+1,days=daysInMonth(y,m),labels=[],subs=[],data=[];for(var d=1;d<=days;d++){var dt=new Date(y,m-1,d),gz=gzDayD(dt);labels.push(d+'号');subs.push(gz);data.push(chartScore(profile,gz));}"),
  'daily trend should not use flow-day single score',
);

assert.equal(
  countMatches(index, /if\(dr\)updateTodaySurfaces\(profile,today,dr\);/g),
  1,
  'dashboard should not overwrite composite today score after renderLuck',
);
assert.ok(
  !/renderLuck\(profile,today\);[\s\S]{0,220}if\(dr\)updateTodaySurfaces\(profile,today,dr\);/.test(index),
  'renderLuck composite score should remain the final dashboard score',
);
includesAll(index, [
  '综合年月日 <b style="color:var(--accent)">',
  '今日行动指数',
  '<span class="k">综合年月日</span>',
  '<span class="k">流日触发</span>',
  '<span class="k">风险扣分</span>',
  'paintScoreNum(sn,action.score)',
  "sl.textContent=action.label+' · 财运 '+(drT?drT.cScore:'')+' · 底盘 '+foundation.score;paintScorePill(sl,action.score)",
], 'dashboard action score rendering');

includesAll(index, [
  '今日行动指数 · TODAY',
  'window.__todayState={dateText,compactDate,day:today.day,label:action.label,score:action.score',
  'flow:action.flowScore',
  "document.querySelectorAll('.m-score-label').forEach(el=>{el.textContent='今日行动指数';});",
  "document.querySelectorAll('.score-n').forEach(el=>{paintScoreNum(el,action.score);});",
  "document.querySelectorAll('.score-l').forEach(el=>{el.textContent=action.label+' · 财运 '+dr.cScore+' · 底盘 '+action.foundation.score;paintScorePill(el,action.score);});",
  "html+='<div class=\"forecast-card",
  "+(en?'Action ':'行动 ')+a.score",
], 'connected action score surfaces');

includesAll(index, [
  '.grid{display:grid;grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:20px;margin-bottom:20px}',
  '.card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;min-width:0}',
  '.chart{position:relative;height:340px;width:100%;min-width:0;overflow:hidden}',
  '.trend-scroll{height:100%;width:100%;max-width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;',
], 'trend scroll stays inside chart');

includesAll(index, [
  '.lower{display:grid;grid-template-columns:minmax(260px,.72fr) minmax(0,1.45fr) minmax(0,1fr);gap:20px}',
  '.el-row{display:grid;grid-template-columns:32px minmax(0,210px) auto;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}',
  '.el-w{font-family:var(--font-mono);font-size:12px;color:var(--text-2);justify-self:start}',
  '.el-i{min-width:0}',
  "window.matchMedia('(max-width:900px)').matches?'1fr':'minmax(260px,.72fr) minmax(0,1.45fr)'",
], 'favorables dayun balanced layout');

includesAll(index, [
  '.el-note{margin-top:12px;padding-top:10px;border-top:1px dashed var(--border);font-size:11px;line-height:1.65;color:var(--text-3)}',
  '.el-note b{color:var(--text-2)}',
  'id="yong-weight-note"',
  'function yongWeightNoteHtml()',
  '右侧数字=用神权重',
  '正数代表喜用',
  '负数代表忌神',
], 'favorable weight explanation');

includesAll(index, [
  'id="stats-range-controls"',
  'data-range="7"',
  'data-range="30"',
  'data-range="365"',
  'data-range="all"',
  'data-range="custom"',
  'id="stats-start"',
  'id="stats-end"',
  'data-stats-action="apply-custom"',
  '个人真实历史',
  '持续累积更多真实记录',
], 'daily stats range controls');

includesAll(index, [
  'data-history-action="open"',
  'id="history-modal"',
  'id="history-calendar"',
  'function renderHistoryPanel',
  'function renderMonthCalendar',
  'function openHistoryModal',
  'function closeHistoryModal',
  '查看全部历史',
  '按月份查看全部累计记录',
], 'full history modal');

includesAll(index, [
  'id="report-range-controls"',
  'data-report-range="7"',
  'data-report-range="30"',
  'data-report-range="365"',
  'data-report-range="all"',
  'id="report-free-stats"',
  'id="paid-report-products"',
  'id="premium-report-output"',
  'const REPORT_PRODUCTS',
  'const STRIPE_CHECKOUT_ENDPOINT',
  'const MEMBERSHIP_CHECKOUT_ENDPOINT',
  'function summarizeReportEntries(entries,profile)',
  'function renderReportCenter()',
  'function renderPaidReportProducts()',
  'function buildDetailedReport(type,summary,profile)',
  'function beginReportCheckout(type)',
  'function hasReportAccess(type)',
  'data-report-action="buy"',
  'data-report-action="generate"',
  '高级会员免费生成',
  '不构成投资建议',
], 'paid detailed report center');

includesAll(index, [
  'id="generated-report-list"',
  'const GENERATED_REPORTS_KEY',
  "const AUTO_REPORT_TYPES=['7','30','365','all']",
  'function reportPeriodFor(type,now)',
  'function generatedReportKey(type,period)',
  'function loadGeneratedReports()',
  'function saveGeneratedReports(items)',
  'function buildGeneratedReportRecord(type,period,entries,profile)',
  'function autoGenerateDueReports()',
  'function renderGeneratedReports()',
  'function syncGeneratedReportsToCloud()',
  'data-generated-report-key',
  'autoGenerated:true',
  'generated_reports',
], 'automatic generated reports');

assert.ok(existsSync(supabaseSchemaPath), 'supabase/schema.sql should exist');

includesAll(supabaseSchema, [
  'create table if not exists public.profiles',
  'create table if not exists public.checkins',
  'create table if not exists public.account_profiles',
  'create table if not exists public.legal_acceptances',
  'create table if not exists public.account_events',
  'create table if not exists public.account_delete_requests',
  'create table if not exists public.report_entitlements',
  'create table if not exists public.memberships',
  'create table if not exists public.membership_events',
  'create table if not exists public.generated_reports',
  'alter table public.profiles enable row level security',
  'alter table public.checkins enable row level security',
  'alter table public.account_profiles enable row level security',
  'alter table public.legal_acceptances enable row level security',
  'alter table public.account_events enable row level security',
  'alter table public.account_delete_requests enable row level security',
  'alter table public.report_entitlements enable row level security',
  'alter table public.memberships enable row level security',
  'alter table public.membership_events enable row level security',
  'alter table public.generated_reports enable row level security',
  'auth.uid() = user_id',
  'profiles_select_own',
  'checkins_select_own',
  'account_profiles_select_own',
  'legal_acceptances_select_own',
  'account_events_select_own',
  'account_delete_requests_select_own',
  'report_entitlements_select_own',
  'memberships_select_own',
  'membership_events_select_own',
  'generated_reports_select_own',
  'unique (user_id, checkin_date)',
  'unique (user_id, report_key)',
  'unique (user_id, document_type)',
], 'Supabase schema and RLS');

includesAll(supabaseSchema, [
  "check (document_type in ('terms', 'privacy', 'risk_waiver', 'ai_disclaimer', 'billing_terms'))",
  "check (event_type in ('signup', 'login', 'email_confirmed', 'password_reset_requested', 'password_updated', 'email_change_requested', 'legal_acceptance', 'signout', 'delete_requested'))",
  "check (status in ('requested', 'processing', 'completed', 'canceled'))",
  'ip_hash text',
  'user_agent text',
  'marketing_opt_in boolean not null default false',
], 'account compliance schema');

includesAll(supabaseSchema, [
  'create or replace function public.upsert_auto_generated_reports',
  'create extension if not exists pg_cron',
  "cron.schedule('madeshed-auto-generated-reports'",
  "on conflict (user_id, report_key) do update",
  "payload->>'outcome'",
  "'big_win'",
  "'big_loss'",
  "'database_cron'",
], 'scheduled generated report job');

includesAll(index, [
  "const CLOUD_PROFILE_TABLE='profiles'",
  "const CLOUD_CHECKINS_TABLE='checkins'",
  'data-route="/dashboard"><span class="icon">↗</span><span>进入仪表盘</span>',
  'function syncProfileToCloud(profile)',
  'function syncCheckinsToCloud()',
  'function syncCloudToLocal()',
  'function bootstrapCloudSync(session)',
  'window.syncProfileToCloud=syncProfileToCloud',
  'window.syncCheckinsToCloud=syncCheckinsToCloud',
  'if(window.syncProfileToCloud)window.syncProfileToCloud(stamped)',
  'if(window.syncCheckinsToCloud)window.syncCheckinsToCloud()',
  'data-auth-action="signin"',
  'function signOut()',
], 'Supabase auth and sync shell');

includesAll(index, [
  "'fortune'",
  'data-view="fortune"',
  'href="#/fortune"',
  'id="fortune-tabs"',
  'id="fortune-products"',
  'id="master-question-form"',
  'id="master-question-category"',
  'id="master-question-horizon"',
  'id="master-question-depth"',
  'id="master-question-text"',
  'id="master-answer-output"',
  'id="master-history-list"',
  'const FORTUNE_PRODUCTS',
  'const MASTER_CATEGORY_LABELS',
  'const CREDIT_PACK_PRODUCT',
  'function getFortuneProfile()',
  'function buildFortuneContext(profile)',
  'function renderFortuneCenter()',
  'function renderFortuneProducts()',
  'function renderMasterForm()',
  'function submitMasterQuestion()',
  'function renderMasterHistory()',
  'data-fortune-tab="ask"',
  'data-fortune-report-type="full"',
  'data-fortune-report-type="dayun"',
  'data-fortune-report-type="month"',
  '全盘解读',
  '流年大运解读',
  '每月运程',
  '问大师',
  '点数余额',
  '不提供具体投资标的建议',
], 'fortune consultation frontend');

includesAll(supabaseSchema, [
  'create table if not exists public.credit_ledger',
  'create table if not exists public.fortune_reports',
  'create table if not exists public.master_questions',
  'alter table public.credit_ledger enable row level security',
  'alter table public.fortune_reports enable row level security',
  'alter table public.master_questions enable row level security',
  'credit_ledger_select_own',
  'fortune_reports_select_own',
  'master_questions_select_own',
  "check (entry_type in ('purchase', 'membership_grant', 'spend', 'refund', 'admin'))",
  "check (report_type in ('full', 'dayun', 'month'))",
  "check (category in ('marriage', 'career', 'wealth', 'family', 'health', 'timing', 'life', 'custom'))",
  'unique (user_id, report_key)',
], 'fortune schema and RLS');

[
  'api/account.js',
  'api/_bazi-runtime.js',
  'api/fortune-report.js',
  'api/master-question.js',
  'api/master-history.js',
  'api/report.js',
  'api/checkout.js',
  'api/stripe-webhook.js',
].forEach((file) => assert.ok(existsSync(file), `${file} should exist`));

includesAll(packageJson, [
  '"lunar-javascript"',
  '"1.6.13"',
], 'server bazi dependency');

const accountApi = readFileSync('api/account.js', utf8);
const accessApi = readFileSync('api/_access.js', utf8);
const baziRuntimeApi = readFileSync('api/_bazi-runtime.js', utf8);
const fortuneReportApi = readFileSync('api/fortune-report.js', utf8);
const masterQuestionApi = readFileSync('api/master-question.js', utf8);
const masterHistoryApi = readFileSync('api/master-history.js', utf8);
const reportApi = readFileSync('api/report.js', utf8);
const checkoutApi = readFileSync('api/checkout.js', utf8);
const stripeWebhookApi = readFileSync('api/stripe-webhook.js', utf8);
const healthApi = readFileSync('api/health.js', utf8);
const scoreApi = readFileSync('api/score.js', utf8);
const profileApi = readFileSync('api/profile.js', utf8);
const monthlyApi = readFileSync('api/monthly.js', utf8);

includesAll(baziRuntimeApi, [
  'lunar-javascript',
  'runInNewContext',
  'window.MadeshedBazi',
  'loadBaziEngine',
], 'server bazi runtime');

// v3 统一分数源：服务端必须走引擎 actionScore/foundationRead/dailyReadFull（与前端同一套），不得再用旧的线性拼分公式
includesAll(baziRuntimeApi, [
  'engine.dailyReadFull(profile',
  'engine.foundationRead(profile, today)',
  'engine.actionScore(profile, today, dr, foundation)',
], 'server daily score is the unified engine actionScore pipeline');
assert.ok(
  !/base \* 0\.54 \+ z \* 0\.26/.test(baziRuntimeApi),
  'server must not keep the old crude base*0.54+z*0.26+cScore*0.2 daily formula',
);
includesAll(scoreApi, [
  'engine.trendGzForDate',
  'scoreFromProfileAndGanzhi(profile, gz.day, { year: gz.year, month: gz.month })',
], 'score API feeds year/month ganzhi so its daily score equals the dashboard');
includesAll(monthlyApi, [
  'engine.monthActionDetail(profile, dt)',
  'engine.trendGzForDate(dt)',
], 'monthly API uses the unified monthActionDetail (same as the front-end month trend)');

[
  ['score API', scoreApi],
  ['profile API', profileApi],
  ['monthly API', monthlyApi],
].forEach(([label, source]) => {
  includesAll(source, ['loadBaziEngine'], label);
  assert.ok(!/placeholder|_placeholder/i.test(source), `${label} should not expose placeholder responses`);
});

includesAll(healthApi, [
  'configuration',
  'stripeConfigured',
  'llmConfigured',
  'supabaseConfigured',
], 'health configuration readiness');

includesAll(accountApi, [
  "action === 'bootstrap'",
  "action === 'status'",
  "action === 'legal'",
  "action === 'delete'",
  'account_profiles',
  'logAccountEvent',
  'email_confirmed_at',
  'display_name',
  'marketing_opt_in',
], 'account bootstrap API');

includesAll(accountApi, [
  'accountStatusForUser',
  'emailConfirmed',
  'legalComplete',
], 'account status API');

includesAll(accountApi, [
  'legal_acceptances',
  'logAccountEvent',
  'LEGAL_DOCUMENT_TYPES',
  'ip_hash',
  'user_agent',
], 'legal acceptance API');

includesAll(accountApi, [
  'account_delete_requests',
  'delete_requested',
  'logAccountEvent',
], 'account delete request API');

includesAll(fortuneReportApi, [
  'FORTUNE_REPORT_TYPES',
  'buildFortuneReport',
  'authorizeFortuneReportAccess',
  'loadSavedProfile',
  "mode === 'preview'",
  'full',
  'dayun',
  'month',
  '不构成投资、医疗或法律建议',
], 'fortune report API');

includesAll(reportApi, [
  'authorizeTradeReportAccess',
  'loadCloudCheckins',
  'report_entitlements',
  'generated_reports',
  "mode === 'preview'",
  '不构成投资建议',
], 'server trade report API');

includesAll(accessApi, [
  'report_entitlements',
  'generated_reports',
  'fortune_reports',
  'authorizeTradeReportAccess',
  'authorizeFortuneReportAccess',
], 'shared paid access API');

includesAll(masterQuestionApi, [
  'MASTER_CATEGORIES',
  'normal:1',
  'deep:3',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'AI 服务暂未配置',
  '不消耗点数',
  '不提供具体投资标的建议',
  'buildMasterPrompt',
], 'master question API');

includesAll(masterHistoryApi, [
  'master_questions',
  'history',
], 'master history API');

includesAll(checkoutApi, [
  "action === 'credit'",
  "action === 'membership'",
  "action === 'report'",
  "action === 'portal'",
  'checkout/sessions',
  "params.set('mode', 'payment')",
  'CREDIT_PACK_PRODUCT',
  'STRIPE_SECRET_KEY',
  'STRIPE_CREDIT_PRICE_ID',
], 'credit checkout API');

includesAll(checkoutApi, [
  'checkout/sessions',
  "mode', 'subscription'",
  'STRIPE_ULTIMATE_PRICE_ID',
  'STRIPE_MEMBERSHIP_PRICE_ID',
  'requireAccountReadyForPaidAction',
  'metadata[user_id]',
  'subscription_data[metadata][tier]',
], 'membership checkout API');

includesAll(checkoutApi, [
  'checkout/sessions',
  'STRIPE_REPORT_30_PRICE_ID',
  'STRIPE_FORTUNE_FULL_PRICE_ID',
  'requireAccountReadyForPaidAction',
  'metadata[product]',
  'fortune_report',
], 'report checkout API');

includesAll(checkoutApi, [
  'requireAccountReadyForPaidAction',
], 'credit checkout account gate');

includesAll(checkoutApi, [
  'billing_portal/sessions',
  'stripe_customer_id',
  'membership_not_found',
], 'customer portal API');

includesAll(stripeWebhookApi, [
  'STRIPE_WEBHOOK_SECRET',
  'stripe_webhook_secret_required',
  'checkout.session.completed',
  'refund.created',
  'charge.refunded',
  'handleRefund',
  'markTradeReportRefunded',
  'markFortuneReportRefunded',
  'reverseCreditPack',
  'markMembershipRefunded',
  'customer.subscription.updated',
  'invoice.paid',
  'credit_ledger',
  'memberships',
  'membership_events',
  'report_entitlements',
  'fortune_reports',
], 'stripe webhook API');

assert.ok(!stripeWebhookApi.includes('if (secret &&'), 'stripe webhook must not accept unsigned production events when secret is missing');

includesAll(stripeWebhookApi, [
  "entry_type: 'refund'",
  "status: 'refunded'",
  "status: 'canceled'",
  'refund_id',
  'payment_intent',
  'checkout/sessions',
], 'stripe refund reversal handling');

includesAll(index, [
  '重复扣费、系统故障或未交付',
  'support@madeshed.com',
  'Stripe 退款邮件',
], 'consumer refund policy copy');

includesAll(index, [
  "const TRADE_REPORT_ENDPOINT='/api/report'",
], 'server trade report frontend integration');

assert.ok(!index.includes('LLM_API_KEY'), 'frontend must not expose LLM_API_KEY');
assert.ok(!index.includes('STRIPE_SECRET_KEY'), 'frontend must not expose STRIPE_SECRET_KEY');

// ===== 全站一致性审计回归守卫（2026-07-08）：钉死本轮修复，防止再退化 =====
// 1) 分数→颜色分档必须与引擎标签分档一致(82/70/56/44)，禁止回到 70/60/50/40
//    颜色梯度：深绿(green)=强顺势 > 浅绿(green-l)=顺势 > 黄 > 橙 > 红（越深越强，2026-07-11 调整）
includesAll(index, [
  "if(n>=82)return'green';if(n>=70)return'green-l';if(n>=56)return'yellow';if(n>=44)return'orange';return'red';",
  "'green':'强顺势'",
  "'green-l':'顺势'",
  'function positionAdviceZh(score)',
  'function marketOpenNow()',
], '分数→颜色/仓位分档与引擎一致；深绿=强顺势、浅绿=顺势');
// 颜色↔强弱：绿(深)=强顺势、浅绿=顺势（越深越强），全站一致（前端 + 服务端 actionBand + chart-full）
assert.ok(/绿=强顺势/.test(index) && /浅绿=顺势/.test(index), '图例：绿=强顺势、浅绿=顺势');
assert.ok(/score >= 82\) return \{ color: '绿'/.test(baziRuntimeApi) && /score >= 70\) return \{ color: '浅绿'/.test(baziRuntimeApi), '服务端 actionBand：强顺势=绿、顺势=浅绿');
assert.ok(/s>=82\?'#26A69A':\(s>=70\?'#4DD0E1'/.test(chart), 'chart-full ldColor：强顺势=深绿(#26A69A)、顺势=浅绿(#4DD0E1)');
// 动态重建的日历/状态图例（zh restoreChineseDailyWidgets + en localizeEnglishDailyWidgets/ScoreEducation）不得残留旧“浅绿=强”
assert.ok(!index.includes('浅绿=高顺势') && !index.includes('Light Green = strong'), '不得残留旧图例（浅绿=强）：含动态重建的中英日历/状态图例');
assert.ok(index.includes('Green = strong support') && index.includes('Light Green = supportive'), 'EN 图例：深绿=strong support、浅绿=supportive');
// COLORS 顺序驱动"按命理颜色分组"列表 + 命理状态图例 + insights：最强在上→绿在前、浅绿次之
assert.ok(/const COLORS=\['green','green-l','yellow','orange','red'\]/.test(index), 'COLORS 顺序：绿(强顺势)在前、浅绿(顺势)次之（列表/图例最强在上）');
// 标记图例整洁化（| 分隔，中英同步）
assert.ok(index.includes('✓✓ 大赚 | ✓ 赚 | — 平 | X 亏 | XX 大亏 | · 未交易 | 空白 无记录'), 'zh 标记图例：| 分隔、整洁');
assert.ok(index.includes('✓✓ Big win | ✓ Win | — Flat | X Loss | XX Big loss | · No trade | (blank) No record'), 'EN 标记图例：同步整洁化');
assert.ok(!index.includes('✓✓=大赚'), '不得残留旧标记图例（✓✓=大赚 run-on）');
// 老用户打开根路径直接进仪表盘（新访客保留营销首页）；只拦 landing，深链放行
assert.ok(/function isReturningUser/.test(index) && index.includes("view==='landing' && isReturningUser()"), '路由：老用户(有命盘或已登录)打开首页→今日仪表盘，新访客保留营销首页');
// 繁体中文：3 语言 + 运行时简→繁转换（简体唯一源）
includesAll(index, ['function localeIsHant', 'function applyHantAfterRender', 'function ensureS2T', 'function restoreHant', 'opencc-js', 'data-language-choice="zh-Hant"', 'data-locale-switch="zh-Hant"', '繁體中文'], '繁体：3 语言选择器 + opencc 运行时简→繁转换');
assert.ok(/'zh-hant'|zh-hant/.test(index) && /return'zh-Hant'/.test(index), '繁体：normalizeLocale 归一化 zh-Hant');
assert.ok(!/if\(n>=70\)return'green-l';if\(n>=60\)return'green';if\(n>=50\)return'yellow';if\(n>=40\)return'orange'/.test(index), 'scoreToColor 不得退回旧 70/60/50/40 分档');
// 2) 服务端 actionBand 必须对齐引擎分档/标签
includesAll(baziRuntimeApi, ["score >= 82", "label: '强顺势'", "position: '80%'"], '服务端 actionBand 对齐引擎 82/70/56/44');
assert.ok(!/score >= 78/.test(baziRuntimeApi), 'actionBand 不得退回旧 78/66/54/42 分档');
includesAll(scoreApi, ['action.label || band.label', 'action.position'], 'score API 标签/仓位取引擎 action');
includesAll(monthlyApi, ['md.label || band.label'], 'monthly API 标签取引擎 md.label');
// 3) 禁止写死的假数据（本轮事故的同型）
assert.ok(!index.includes('追单胜率') && !/22%<\/strong> \(N=9\)/.test(index), '不得再出现写死的"追单胜率22% (N=9)"假回测');
assert.ok(!index.includes("mkt.textContent='▲ 开盘中'"), '市场状态不得写死为永久"开盘中"');
assert.ok(!/Example history:<\/strong> Light Green days traded/.test(index), '英文不得出现伪造的"Example history 12次/67%"');
assert.ok(!index.includes("scoreBandEn(score){var n=Number(score);if(!Number.isFinite(n))return'Full Plan'"), 'scoreBandEn 无分数时不得伪造"Full Plan"档位');
includesAll(index, ['function renderAlerts(profile,today,dr,action)', 'renderAlerts(profile,today,drT,action)'], '今日警示改为真实数据驱动');
// 4) 喜用神理由支持中和/特殊格局；今日指数 day-only
includesAll(index, ['中和：制化当令、通关流转为喜', 'function dailyRead(profile,today){return BAZI.dailyReadFull(profile,today);}'], '喜用神理由含中和分支；前端委托引擎');
// 5) chart-full 查询不粘滞 + 立春时间轴；服务端 API 数值健壮
includesAll(chart, ['state.userQueried=true', 'state.nowYearGz=tEc.getYear()', 'y.getGanZhi()===state.nowYearGz'], 'chart-full 主动查询不被保存盘覆盖 + 立春边界"今"');
// 时间轴 流月→流日 下钻：流月可点(data-mon) + 点击处理 + 流日随所选流月渲染该节气月
includesAll(chart, ["dataKey:'mon'", 'cell.dataset.mon!=null', 'state.selMonthGz=cell.dataset.mon', 'dec.getMonth()!==selMonthGz'], 'chart-full 时间轴：流月可点并驱动流日行显示该节气月的实际日子');
// 流日可点 → 弹出该日行动指数明细（走同一引擎 actionScore，含所选大运）
includesAll(chart, ["dataKey:'ld'", 'cell.dataset.ld!=null', 'function renderDayDetail', 'B.actionScore(prof,ctx,dr,fnd)', 'id="ld-detail"'], 'chart-full 时间轴：点流日弹出行动指数明细（财运/结构/互动/岁运/风险，引擎口径）');
// 流日明细英文态：命理"值"也译成英文（不止行标签）——band/仓位/十神/财运/互动/岁运
includesAll(chart, ['function ldBandEn', 'function ldInterEn', 'function ldCLabelEn', 'en?ldBandEn(act.label)', 'en?ldInterEn(dr.interaction.note)'], 'chart-full 流日明细：英文态把命理值(标签/仓位/财运/四柱互动/岁运)整体译成英文');
includesAll(fortuneReportApi, ['cleanText(targetPeriod) || (type'], 'fortune-report 期间用 cleanText||默认，不再恒空');
assert.ok(/const scored = entries\.filter\(\(entry\) => Number\.isFinite\(entry\.score\)\)/.test(reportApi), 'report avgScore 只计入有真实分数的记录');
// 购买前置：去掉冗余的"邮箱确认"闸门（Stripe 自会验证付款邮箱），仅保留法律条款接受
const supabaseLib = readFileSync('api/_supabase.js', utf8);
assert.ok(!supabaseLib.includes("error: 'email_not_confirmed'"), '服务端购买前置不再强制邮箱确认');
assert.ok(/requireAccountReadyForPaidAction/.test(supabaseLib) && /if \(!status\.legalComplete\)/.test(supabaseLib), '服务端购买前置仍保留法律条款接受');
assert.ok(!index.includes('确认邮箱后才能购买会员'), '前端购买提示不再强制邮箱确认');
// 结账双语：会话按语言传 locale + price_data 本地化商品名；每个商品有 labelEn；4 个入口都传站点语言
assert.ok(/function checkoutLocale/.test(checkoutApi) && /setLocalizedLineItem/.test(checkoutApi) && /params\.set\('locale', stripePageLocale\(locale\)\)/.test(checkoutApi), '结账会话按语言(繁体映射 zh-TW)传 locale + 用 price_data 本地化商品名');
assert.ok(/labelEn:/.test(checkoutApi) && /labelHant:/.test(checkoutApi), '结账商品配置简/繁/英三份(label + labelHant + labelEn)');
assert.ok((index.match(/locale:checkoutLocaleValue\(\)/g) || []).length >= 4, '4 个购买入口都把当前站点语言(en/zh-Hant/zh)传给结账接口');
// 后台价格管理：list-prices/update-price（新建价格设为 default_price）+ 结账跟随商品默认价（改价即时生效）
const adminApi = readFileSync('api/admin.js', utf8);
assert.ok(/action === 'list-prices'/.test(adminApi) && /action === 'update-price'/.test(adminApi) && /default_price/.test(adminApi), 'admin API 提供价格列表与改价（default_price 流程）');
assert.ok(/function resolveEffectivePrice/.test(checkoutApi) && /resolveEffectivePrice\(priceId\)/.test(checkoutApi), '结账价格解析跟随商品 default_price，后台改价即时生效');
const adminHtml = readFileSync('admin.html', utf8);
assert.ok(/data-tab="prices"/.test(adminHtml) && /data-price-save/.test(adminHtml) && /list-prices/.test(adminHtml), '后台页含价格管理板块（列表+保存新价）');
// 实时价格：页面价格与扣费同源（health?action=prices=商品默认价），前端启动时水合；禁止编造的美元价
// ⚠️ Vercel Hobby 上限 12 个 serverless 函数：api/ 下不得新增路由文件，公共能力并入现有端点 action 分发
const catalogApi = readFileSync('api/_catalog.js', utf8);
assert.ok(/action === 'prices'/.test(healthApi) && /s-maxage/.test(healthApi) && /publicPrices/.test(healthApi), 'health?action=prices 公开实时价格接口（CDN 缓存）');
assert.ok(!existsSync('api/prices.js'), '不得存在独立 api/prices.js 路由（超 Vercel Hobby 12 函数上限会导致整个部署失败）');
assert.ok(readdirSync('api').filter((f) => f.endsWith('.js') && !f.startsWith('_')).length <= 12, 'api/ 路由数必须 ≤12（Vercel Hobby 上限，超出=部署失败）');
assert.ok(/export const PRODUCT_CATALOG/.test(catalogApi) && /default_price/.test(catalogApi), '_catalog.js 是商品目录唯一实现（跟随 default_price）');
assert.ok(/function hydrateLivePrices/.test(index) && index.includes("fetch('/api/health?action=prices')"), '前端启动时用实时价格接口水合全部价格显示');
assert.ok(!/priceEn:'\$/.test(index), '禁止编造美元价：英文价签用 CN¥（与实际扣费货币一致）');

// ===== 购买全流程审计修复钉死（2026-07-10：42 项确认，8 blocker）=====
// 1) 支付回跳：路由剥离 hash query + 消费 success/cancel 参数（确认横幅+延迟重拉权益）
includesAll(index, ["const hash = rawHash.split('?')[0];", 'function handlePurchaseReturn', 'function showPurchaseToast', "params.get('credits')"], '支付回跳：路由兼容带 query 的 hash + 成功/取消确认闭环');
// 2) 结账防重复：已是会员/已购报告返回 409，不再二次扣费；点数包补 customer_email/收据
includesAll(checkoutApi, ["error: 'already_member'", "error: 'already_owned'", 'payment_intent_data[receipt_email]', 'session_id={CHECKOUT_SESSION_ID}', 'invoice_creation[enabled]'], '结账：防重复订阅/重复购买 + 收据邮箱 + 发票 + 回跳带 session_id');
assert.ok((checkoutApi.match(/allow_promotion_codes/g) || []).length >= 3, '全部结账线支持促销码');
// 3) webhook：跨事件退款幂等 / 未收款不履约 / 拒付冻结 / 扣款失败宽限 / 期末日兼容新 API
includesAll(stripeWebhookApi, ['function refundAlreadyRecorded', "session.payment_status !== 'paid'", "event.type === 'charge.dispute.created'", "event.type === 'invoice.payment_failed'", 'function subscriptionPeriodEnd', 'partial_refund_entitlement_kept', "{ method: 'DELETE' }"], 'webhook：退款幂等/收款校验/拒付/宽限期/到期日/退款联动取消订阅');
assert.ok(!/grantMembershipCredits\(userId, tier, 'subscription_event'\)/.test(stripeWebhookApi), '订阅状态事件不再发月度赠点（只在 invoice.paid/真实付款发放）');
// 4) past_due 宽限口径前后端一致
assert.ok(/'active', 'trialing', 'past_due'/.test(accessApi), '服务端权益检查 past_due 宽限');
assert.ok(/m\.status==='past_due'/.test(index), '前端会员判定含 past_due 宽限');
// 5) 购买历史：account?action=purchases + 账号页渲染
assert.ok(/action === 'purchases'/.test(accountApi) && /function purchaseHistory/.test(accountApi), 'account API 提供购买与点数记录');
includesAll(index, ['function renderPurchaseHistory', "fetch('/api/account?action=purchases'", 'id="purchase-history"'], '账号页展示购买记录/点数流水/已解锁权益');
// 6) 数据库硬化脚本存在（需在 Supabase SQL Editor 执行）
assert.ok(existsSync('supabase/2026-07-10-purchase-hardening.sql'), '购买硬化 SQL（封付费绕过+账本唯一约束）');
// 7) 单次报告 30 天有效期：webhook 盖 expires_at + _access 到期判定 + 结账过期可续买 + CTA 标注
assert.ok(/REPORT_VALIDITY_DAYS = 30/.test(accessApi) && /function purchaseStillValid/.test(accessApi) && /accessLevel: 'expired'/.test(accessApi), '_access：报告权益 30 天有效期判定（会员不受限）');
assert.ok(/reportExpiryFromNow\(\)/.test(stripeWebhookApi) && /expires_at: reportExpiryFromNow/.test(stripeWebhookApi), 'webhook：报告购买盖 30 天有效期');
assert.ok(/hasTradeReportEntitlement|hasFortuneReportEntitlement/.test(checkoutApi) && /import \{ hasTradeReportEntitlement/.test(checkoutApi), '结账防重复用到期判定（过期报告允许续买）');
assert.ok(/单次购买 · 30天有效/.test(index) && /Buy · 30-day/.test(index), '报告 CTA 标注"单次购买·30天有效"（承诺与实现一致）');

// 8) 钱路对抗式预检修复（10 项确认缺陷）
// 8.1 结账去重查询失败 fail-closed，不放行创建付款
assert.ok(checkoutApi.includes("error: 'entitlement_check_unavailable'"), '结账：权益查询失败 fail-closed 返回 503，不重复扣款');
// 8.2/8.3 报告授予按 session 幂等 + 退款保留 session_id 防复权
includesAll(stripeWebhookApi, ['existing[0].stripe_session_id === sid', 'existing[0].context.stripe_session_id === sid', 'stripe_session_id: ctx.session_id || null'], 'webhook：报告授予按 session 幂等 + 退款保留 session_id 防复权');
// 8.9 授予存 payment_intent + 退款 session 解析失败按 payment_intent 兜底撤权
includesAll(stripeWebhookApi, ['payment_intent: session.payment_intent || null', 'payload->>payment_intent=eq.', 'context->>payment_intent=eq.'], 'webhook：授予存 payment_intent + 退款按 payment_intent 兜底回查撤权');
// 8.10 累计部分退款判定改用 charge.amount_refunded
assert.ok(stripeWebhookApi.includes('Number(charge?.amount_refunded || refund?.amount || 0)'), 'webhook：full_refund 用累计 charge.amount_refunded 判定');
// 8.4/8.5 命理权益只认 <type>-entitlement 行且 eq.paid；会员由 activeUltimateMembership 独立判定
assert.ok(accessApi.includes("reportType + '-entitlement')") && accessApi.includes('&access_level=eq.paid'), '_access：命理权益只查专属 entitlement 行且 eq.paid');
assert.ok(!accessApi.includes('access_level=in.(paid,membership)'), '_access：不再匹配 membership 内容行（堵会员到期免费泄漏）');
// 8.6 前端访问缓存/徽章尊重 expires_at（交易 + 命理）
includesAll(index, ['a.expires&&a.expires[String(type)]', 'expires:exp', 'r.expiresAt&&new Date(r.expiresAt).getTime()<=Date.now()'], '前端：报告访问缓存/徽章尊重 expires_at，不再把已过期显示为已解锁');
// 8.7 会员状态文案 locale-aware，EN 不泄漏中文
assert.ok(/enm=\{active:'Active'/.test(index) && /Payment issue/.test(index), '前端：membershipStatusText 中英分离，EN 不泄漏中文会员状态');
// 8.8 购买记录非 active 状态本地化，不暴露 raw token
assert.ok(/refunded:en\?'refunded':'已退款'/.test(index), '前端：购买记录已退款/已取消/已到期本地化显示');
// 繁体中文（运行时简→繁；主站 + chart-full；语言选择器不被转换）
assert.ok(/return'zh-Hant'/.test(index) && /function localeIsHant/.test(index) && /function applyHantAfterRender/.test(index) && index.includes("closest('.lang,[data-language-choice]')"), 'index：繁体 zh-Hant + 运行时转换 + 语言选择器不转换');
assert.ok(index.includes('data-language-choice="zh-Hant"'), 'index：欢迎页 3 语言（简/繁/EN）');
const chartFull = readFileSync('chart-full.html', utf8);
assert.ok(/function chartLocaleIsHant/.test(chartFull) && /function applyChartHant/.test(chartFull) && chartFull.includes("closest('.lang')") && /t==='繁'\?'zh-Hant'/.test(chartFull), 'chart-full：繁体运行时转换 + 3 语言按钮 + 选择器不转换');
// 英文态一致性批B：账户/报告/命理/chart-full（多代理审计 CONFIRMED）
assert.ok(index.includes('synced to Supabase cloud') && index.includes("window.__cloudUser?'This browser + Supabase cloud'"), 'EN 账户 Cloud Sync 行按登录态派生（不再硬编码 Not signed in）');
assert.ok(index.includes('chart cast at noon 12:00') && index.includes('no hour correction') && index.includes('hour pillar estimated at noon'), 'EN 账户无时辰行英文化');
assert.ok(index.includes("Eligible (buy directly; billing email verified by Stripe)"), 'EN 账户会员购买条件英文化');
assert.ok(index.includes('Full auto-report locked.') && index.includes('This auto-report was generated and saved for the period.'), 'EN 交易报告预览英文化');
assert.ok(index.includes("'Generating '+pname") && index.includes('BaZi report service is temporarily unavailable'), 'EN 命理报告 chrome 英文化');
assert.ok(chartFull.includes('branchInfoEn(L.getTimeZhi()).pinyin') && chartFull.includes('[子丑寅卯辰巳午未申酉戌亥]/g'), 'chart-full EN：真实农历 + Interactions 地支转拼音');
assert.ok(index.includes('Your strongest state:') && index.includes('Your weakest state:') && !index.includes('How Madeshed reads patterns'), 'EN insights 输出真实最强/最弱状态+胜率（不再通用罐头覆盖）');
// 交易人格卡：由喜/忌五行推导顺手月份+时段+提防月份（中英）
assert.ok(index.includes('PERSONA_ELEM_MONTHS') && index.includes('PERSONA_ELEM_HOURS') && index.includes('function personaTiming'), '人格卡：五行→月份/时段映射');
assert.ok(index.includes('顺手月份：') && index.includes('顺手时段：') && index.includes('提防月份：') && index.includes('Favorable months:') && index.includes('Favorable hours:'), '人格卡：顺手月份/时段+提防月份（中英）');
// 9) 后台改价后落地页价格跟随 live 价：applyLivePriceNodes 覆盖所有会员月费节点 + 定价卡 + 更新 localeOriginalText 缓存；localize 末尾兜底调用
includesAll(index, ['function applyLivePriceNodes', "'localeOriginalText' in el.dataset", ".pricing-amount .price", 'if(typeof applyLivePriceNodes'], '改价后落地页价格跟随 live 价（覆盖 hero/CTA/定价卡 + 防 localize 还原）');
// 10) 按语言分币种：英文站按美元收（美元副价，不设默认；未配则退回人民币）
includesAll(catalogApi, ['export async function resolveCurrencyPrice', 'usd'], '_catalog：美元副价解析 + resolveCatalogItem 输出 usd');
includesAll(checkoutApi, ['resolveCurrencyPrice', "resolveCurrencyPrice(productId, 'usd')"], '结账：英文站解析美元价覆盖币种/金额，无则退回人民币');
includesAll(adminApi, ['const isDefaultCurrency', "reqCurrency || String(current.currency)"], 'admin：改价按币种，人民币设默认价、美元只作副价');
assert.ok(!/default_price.*newPrice\.id[\s\S]*else/.test(adminApi) || /美元价只作副价/.test(adminApi), 'admin：美元价不设 default_price（避免带偏人民币结账）');
assert.ok(/usd: r\.usd \? r\.usd\.amount : null/.test(healthApi), 'health：公开价格返回美元副价');
includesAll(index, ["x.usd!=null?('$'+x.usd)", 'var useUsd=en&&u.usd!=null'], '前端：英文态用 $+美元价展示，无美元价退回 CN¥');
assert.ok(/data-price-input-usd/.test(adminHtml) && /美元价/.test(adminHtml), '后台价格表含美元价列 + 美元输入');

// 9) 特价系统（限时促销）：metadata 存储 + 结账真扣特价 + 展示划线 + 后台面板
includesAll(catalogApi, ['export function parseSale', 'export function saleActive', 'export function activeSaleAmount', 'sale: parseSale(product)'], '_catalog：特价从商品 metadata 解析 + 有效期判定 + resolveCatalogItem 输出 sale');
includesAll(checkoutApi, ['activeSaleAmount(parseSale(product)', 'saleUnit < unitAmount'], 'checkout：活动期按当前币种特价扣款，且特价不得高于原价（服务端独立判定，不信前端）');
assert.ok(/sale: r\.sale \?/.test(healthApi) && /s-maxage=60/.test(healthApi), 'health：公开价格返回 sale 窗口 + 缓存降至 60s');
includesAll(adminApi, ["action === 'set-sale'", "action === 'clear-sale'", 'async function setSale', 'async function clearSale', 'sale_not_lower'], 'admin：set-sale/clear-sale 写商品 metadata（特价须低于原价 + 时间窗校验）');
includesAll(adminHtml, ['id="sale-key"', 'set-sale', 'clear-sale', 'toLocalInput'], 'admin.html：特价活动面板（选商品/金额/起止/清除，本地时间→ISO）');
includesAll(adminHtml, ['this.showPicker()', 'data-sale-preset', 'dtLocalStr'], 'admin.html：特价时间点击弹日历 + 快捷时段预设（不再手输 mm/dd/yyyy）');
// 批1 P0 后台堵漏
includesAll(adminApi, ['reference_id: referenceId || null', 'would_go_negative', "action === 'cancel-subscription'", 'async function cancelSubscription', 'sale_not_lower_usd', 'unsupported_currency', 'if (periodEnd) record.current_period_end'], 'admin API：发点幂等/拒负余额/取消订阅/美元特价校验/币种白名单/改会员不清到期日');
includesAll(adminHtml, ['referenceId:ref', 'mm-cancel-sub', 'cancel-subscription', '不会停止扣费'], 'admin.html：三写操作确认+防双击、取消订阅按钮、改状态不停扣费红字警告');
// 批2 商品改名 / 英文名 / 一键翻译 / 软下架
includesAll(catalogApi, ['name_zh', 'name_en', 'madeshed_hidden', 'nameZh:', 'nameEn:', 'hidden:'], '_catalog：可编辑中英名 + 软下架标记');
assert.ok(/nameZh: r\.nameZh/.test(healthApi) && /!r\.hidden/.test(healthApi), 'health：下发可编辑名 + 排除软下架商品');
assert.ok(/md\.name_en \|\| nameEn/.test(checkoutApi), 'checkout：结账行项目名用后台可编辑名');
includesAll(index, ['obj.nameZhLive=x.nameZh', 'p.nameEnLive||c.label'], 'index：商品卡用后台改的中英名（未改保留默认）');
includesAll(adminApi, ["action === 'rename-product'", "action === 'toggle-product'", "action === 'translate-name'", 'async function renameProduct', 'async function toggleProduct', 'async function translateName'], 'admin API：改名/软下架/一键翻译');
includesAll(adminHtml, ['id="name-key"', 'rename-product', 'toggle-product', 'translate-name'], 'admin.html：商品名称与上下架面板');
// 批3+4 经营可见性 / 合规审计
includesAll(adminApi, ['async function transactions', 'async function refund', 'async function grantEntitlement', 'async function revokeEntitlement', 'async function deleteRequests', 'async function fulfillDelete', 'async function auditLog', 'async function resendReceipt', "action === 'transactions'", "action === 'refund'", "action === 'audit-log'", 'mrrCents', 'oneTimeRevenueTotalCents'], 'admin API 批3/4：台账/退款/权益补履约/删除队列/审计/收据/经营指标');
includesAll(adminHtml, ['data-tab="orders"', 'data-tab="compliance"', 'id="tx-rows"', 'id="del-rows"', 'id="audit-rows"', 'id="ent-grant"', 'data-tx-refund', 'MRR 月度经常收入', 'function loadTransactions', 'function loadCompliance'], 'admin.html 批3/4：订单台账 + 合规/审计 tab + 退款/补履约 UI + 经营指标卡');
includesAll(index, ['function saleFor', 'function priceDisplayHTML', 'class="price-old"', 'class="sale-window"'], 'index：划线原价 + 特价 + 小字活动时间段，活动期外自动恢复');

// ===== 交易邮件系统（Resend 统一发信层）=====
const emailLib = readFileSync('api/_email.js', utf8);
const stripeLib = readFileSync('api/_stripe.js', utf8);
// 邮件层：Resend + 无 key 安全空转 + 三语（含繁体）+ 各交易场景模板齐全
assert.ok(/api\.resend\.com\/emails/.test(emailLib) && /RESEND_API_KEY/.test(emailLib) && /no_api_key/.test(emailLib), '邮件层用 Resend REST，无 RESEND_API_KEY 时安全空转');
includesAll(emailLib, ['reportReadyEmail', 'creditsAddedEmail', 'membershipWelcomeEmail', 'paymentFailedEmail', 'refundEmail', 'deletionRequestedEmail', 'accountDeletedEmail', 'passwordChangedEmail', 'notifyOwner'], '邮件层含全部交易/账号场景模板 + 店主通知');
assert.ok(/'zh-Hant'/.test(emailLib), '邮件模板支持繁体（zh-Hant）');
// Stripe 客户 preferred_locales：修复收据/发票邮件语言，繁体映射 zh-TW
assert.ok(/ensureStripeCustomer/.test(stripeLib) && /preferred_locales/.test(stripeLib) && /zh-TW/.test(stripeLib), 'Stripe ensureStripeCustomer 写 preferred_locales（繁体映射 zh-TW）');
// 结账接入：绑定带 preferred_locales 的客户 + 写 metadata[locale]
assert.ok(/ensureStripeCustomer/.test(checkoutApi) && /metadata\[locale\]/.test(checkoutApi) && /stripePageLocale/.test(checkoutApi), '结账绑定 preferred_locales 客户 + 写 metadata[locale]');
// webhook 接入：报告就绪/点数到账/扣款失败/退款确认/店主通知；拒付不给客户发"退款成功"；发信不阻断履约
includesAll(stripeWebhookApi, ['emailReportReady', 'emailCreditsAdded', 'emailMembershipWelcome', 'paymentFailedEmail', 'emailRefundConfirmation', 'ownerNotifyPurchase', 'notifyCustomer: false'], 'webhook 接入报告/点数/欢迎/扣款失败/退款/店主通知，且拒付不误发客户退款邮件');
// account 接口：删除确认 + 改密码安全提醒 + notify action
assert.ok(/action === 'notify'/.test(accountApi) && /deletionRequestedEmail/.test(accountApi) && /passwordChangedEmail/.test(accountApi), 'account 接口：删除申请确认 + 改密码安全提醒（notify action）');
// admin 硬删除前发"账号已删除"确认
assert.ok(/accountDeletedEmail/.test(adminApi), 'admin 硬删除前发"账号已删除"确认邮件');
// 前端：改密码后触发安全提醒 + 3 语言 checkout 助手
assert.ok(/ACCOUNT_NOTIFY_ENDPOINT/.test(index) && /type:'password_changed'/.test(index) && /function checkoutLocaleValue/.test(index), '前端：改密码触发安全提醒 + checkoutLocaleValue 三语助手');

console.log('Static site checks passed');
