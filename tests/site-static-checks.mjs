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
  'flex:1 1 0;min-width:72px',
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
  '示例数据',
  '个人真实记录',
], 'accurate input and sample-data labels');

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
  'const SAMPLE_ENTRIES=genEntries(42)',
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
  'if(sn)sn.textContent=action.score',
  "if(sl)sl.textContent=action.label+' · 财运 '+(drT?drT.cScore:'')+' · 底盘 '+foundation.score",
], 'dashboard action score rendering');

includesAll(index, [
  '今日行动指数 · TODAY',
  'window.__todayState={dateText,compactDate,day:today.day,label:action.label,score:action.score',
  'flow:action.flowScore',
  "document.querySelectorAll('.m-score-label').forEach(el=>{el.textContent='今日行动指数';});",
  "document.querySelectorAll('.score-n').forEach(el=>{el.textContent=action.score;});",
  "document.querySelectorAll('.score-l').forEach(el=>{el.textContent=action.label+' · 财运 '+dr.cScore+' · 底盘 '+action.foundation.score;});",
  "html+='<div style=\"flex:1 1 0;min-width:72px;",
  "行动 '+a.score",
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
  'create table if not exists public.report_entitlements',
  'create table if not exists public.memberships',
  'create table if not exists public.generated_reports',
  'alter table public.profiles enable row level security',
  'alter table public.checkins enable row level security',
  'alter table public.report_entitlements enable row level security',
  'alter table public.memberships enable row level security',
  'alter table public.generated_reports enable row level security',
  'auth.uid() = user_id',
  'profiles_select_own',
  'checkins_select_own',
  'report_entitlements_select_own',
  'memberships_select_own',
  'generated_reports_select_own',
  'unique (user_id, checkin_date)',
  'unique (user_id, report_key)',
], 'Supabase schema and RLS');

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

console.log('Static site checks passed');
