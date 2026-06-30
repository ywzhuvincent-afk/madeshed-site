import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const utf8 = 'utf8';
const index = readFileSync('index.html', utf8);
const chart = readFileSync('chart-full.html', utf8);

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
  '进入演示仪表盘',
  '真实账号登录即将开放',
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
], 'shared user profile rendering');

console.log('Static site checks passed');
