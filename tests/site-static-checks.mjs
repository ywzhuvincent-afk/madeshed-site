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

assert.ok(existsSync('robots.txt'), 'robots.txt should exist');
assert.ok(existsSync('sitemap.xml'), 'sitemap.xml should exist');
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
  'class="site-nav"',
  'aria-label="返回主仪表盘"',
  'href="/#/dashboard"',
  'href="/#/daily"',
  'href="/#/"',
], 'chart navigation');

includesAll(chart, [
  'function applySavedProfile()',
  "localStorage.getItem('madeshed_profile_v1')",
  'p.birth',
  "p.gender==='M'?'1':'0'",
], 'chart saved profile integration');

includesAll(index, [
  "document.querySelectorAll('.pillars,.result-pillars,.m-pillars')",
  'function updateTodaySurfaces(profile,today,dr)',
  'window.__todayState',
  '.m-score-num',
  '.today-score',
  'window.MadeshedBazi.calcBaziCore',
], 'shared user profile rendering');

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
  '示例数据',
  '个人真实记录',
], 'accurate input and sample-data labels');

includesAll(index, [
  'id="trend-rail-shell"',
  'id="trend-rail"',
  'id="hour-rail-shell"',
  'id="hour-rail"',
  'id="forecast-strip"',
  'function renderScrollableRail',
  'function enableRailDrag',
  'function renderTrendRail',
  'aria-label="流月滚轴"',
  'aria-label="流日滚轴"',
  'aria-label="今日时辰滚轴"',
  'for(var i=0;i<24;i++)',
  'for(var i=0;i<30;i++)',
], 'dashboard scrollable month/day/hour rails');

includesAll(chart, [
  '/bazi-engine.js',
  'window.MadeshedBazi.calcBaziCore',
  'trueSolarTime',
  'ziSegment',
], 'chart shared engine integration');

includesAll(index, [
  "'report'",
  "'account'",
  "'terms'",
  "'privacy'",
  "'about'",
  "'contact'",
  'data-view="report"',
  'data-view="account"',
  'data-view="terms"',
  'data-view="privacy"',
  'data-view="about"',
  'data-view="contact"',
  'href="#/report"',
  'href="#/account"',
], 'production routes');

includesAll(index, [
  "const CHECKINS='madeshed_checkins_v1'",
  'function loadCheckins()',
  'function saveCheckins(items)',
  'function recordCheckin(o,m)',
  'function renderStoredCheckin()',
  'function renderReport()',
  'function renderAccount()',
], 'local persistence shell');

assert.ok(existsSync(supabaseSchemaPath), 'supabase/schema.sql should exist');

includesAll(supabaseSchema, [
  'create table if not exists public.profiles',
  'create table if not exists public.checkins',
  'alter table public.profiles enable row level security',
  'alter table public.checkins enable row level security',
  'auth.uid() = user_id',
  'profiles_select_own',
  'checkins_select_own',
  'unique (user_id, checkin_date)',
], 'Supabase schema and RLS');

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
  'if(window.syncProfileToCloud)window.syncProfileToCloud(profile)',
  'if(window.syncCheckinsToCloud)window.syncCheckinsToCloud()',
  'data-auth-action="signin"',
  'function signOut()',
], 'Supabase auth and sync shell');

console.log('Static site checks passed');
