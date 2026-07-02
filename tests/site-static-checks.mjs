import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const utf8 = 'utf8';
const index = readFileSync('index.html', utf8);
const chart = readFileSync('chart-full.html', utf8);
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
  "url.searchParams.set('lang',l==='en'?'en':'zh')",
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
  "url.searchParams.set('lang',l==='en'?'en':'zh')",
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
  'Action Index = timing strength + behavior risk',
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
includesAll(index, [
  "priceEn:'$5'",
  "priceEn:'$9'",
  "priceEn:'$29'",
  "priceEn:'$59'",
  'function productDisplayPrice(product)',
  "localeIsEn()&&product.priceEn?product.priceEn:product.price",
  "REPORT_PRODUCTS[type].priceEn",
  "FORTUNE_PRODUCTS[type].priceEn",
], 'English USD pricing for paid products');
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
  '✓✓=大赚',
  'XX=大亏',
  '大赚+赚 / 已交易',
], 'six outcome checkin tracking');

includesAll(index, [
  'const COLOR_MEANING',
  'function formatHeatmapDate',
  'function outcomeMark',
  'class="hm-date"',
  'class="hm-mark"',
  '浅绿=高顺势',
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
  'interactionPenalty',
  'interaction.adjust',
  'interaction.penalty',
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
  "const mkt=document.querySelector('.dash-hero > .dash-meta .v.up');if(mkt)mkt.textContent='▲ 开盘中'",
], 'switching language after a chart is generated re-renders profile surfaces (refresh reachable across scope) and restores the Chinese market label');

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
  "mark:now.getDate()+'号 行动指数'",
  'Math.round(dr.zScore*0.65+chartScore(profile,today.day)*0.35)',
  '60+(triggerScore-60)*0.75+(dr.cScore-55)*0.35+(foundation.score-60)*0.25+(dr.rootAdjust||0)*.25-riskPenalty',
  'if(foundation.score<=45)cap=64;else if(foundation.score<=55)cap=72;else if(foundation.score<=66)cap=84;else cap=92;',
], 'daily trend uses action score');
includesAll(index, [
  'data.push(monthActionScore(profile,dt))',
  'MONTHLY ACTION TREND',
  'var monthRead=dailyRead(profile,{day:gz.month})',
  'var monthScore=chartScore(profile,gz.month)',
  'var trigger=Math.round((monthRead?monthRead.zScore:60)*0.48+monthScore*0.34+wealth*0.18)',
  '60+(trigger-60)*.82+(wealth-55)*.25+(base-60)*.18+(monthRead&&monthRead.rootAdjust?monthRead.rootAdjust*.15:0)-riskPenalty',
  "calibrateActionScore(raw,'month'",
  'data=smoothTrendData(data)',
  'details.forEach(function(d,i){d.score=data[i]',
  "mark:(now.getMonth()+1)+'",
], 'monthly trend uses steady calibrated monthly action score');
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
  'checkout.sessions',
  "mode:'payment'",
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

console.log('Static site checks passed');
