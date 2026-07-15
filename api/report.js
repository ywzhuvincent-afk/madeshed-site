import {
  authorizeTradeReportAccess,
  cleanText,
  escapeHtml,
  loadCloudCheckins,
  loadSavedProfile,
  saveGeneratedTradeReport
} from './_access.js';

// 交易复盘报告：真实交易统计 + 命盘，调 LLM 做命理×行为的深度复盘（不再是死模板）。
export const config = { maxDuration: 60 };

const REPORT_PRODUCTS = {
  '7': { label: '7 天报告', days: 7 },
  '30': { label: '月度报告', days: 30 },
  '365': { label: '年度报告', days: 365 },
  all: { label: '全部历史报告', days: null }
};

const OUTCOMES = ['big_win', 'win', 'flat', 'loss', 'big_loss', 'notrade'];

function send(res, status, body) {
  res.status(status).json(body);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function canonicalOutcome(row) {
  const payloadOutcome = row?.payload?.outcome;
  const raw = String(payloadOutcome || row?.outcome || '').trim();
  if (OUTCOMES.includes(raw)) return raw;
  if (raw === '盈' || raw === '赚') return 'win';
  if (raw === '亏') return 'loss';
  if (raw === '未交易') return 'notrade';
  return 'flat';
}

function isTrade(outcome) {
  return ['big_win', 'win', 'flat', 'loss', 'big_loss'].includes(outcome);
}

function isWin(outcome) {
  return outcome === 'big_win' || outcome === 'win';
}

function isLoss(outcome) {
  return outcome === 'big_loss' || outcome === 'loss';
}

function normalizedEntry(row) {
  return {
    date: row.checkin_date,
    outcome: canonicalOutcome(row),
    magnitude: row.magnitude || row.payload?.mag || null,
    label: row.label || row.payload?.label || null,
    score: Number.isFinite(Number(row.score)) ? Number(row.score) : null,
    day: row.day_ganzhi || row.payload?.day || null
  };
}

function periodFor(type) {
  const product = REPORT_PRODUCTS[type] || REPORT_PRODUCTS['30'];
  if (type === 'all') return { start: 'all', end: 'all', label: '全部历史' };
  const end = todayKey();
  const start = addDays(end, -(product.days - 1));
  return { start, end, label: product.label };
}

function inPeriod(entry, period) {
  if (period.start === 'all') return true;
  return entry.date >= period.start && entry.date <= period.end;
}

function percent(n, d) {
  if (!d) return '—';
  return `${Math.round((n / d) * 100)}%`;
}

function summarize(entries) {
  const counts = OUTCOMES.reduce((acc, outcome) => {
    acc[outcome] = entries.filter((entry) => entry.outcome === outcome).length;
    return acc;
  }, {});
  const traded = entries.filter((entry) => isTrade(entry.outcome));
  const wins = traded.filter((entry) => isWin(entry.outcome)).length;
  const losses = traded.filter((entry) => isLoss(entry.outcome)).length;
  const scored = entries.filter((entry) => Number.isFinite(entry.score));
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, entry) => sum + entry.score, 0) / scored.length)
    : null;
  const confidence = traded.length >= 50 ? '高可信' : traded.length >= 20 ? '中等可信' : traded.length >= 5 ? '初步参考' : '样本不足';
  return { total: entries.length, traded: traded.length, wins, losses, rate: percent(wins, traded.length), avgScore, confidence, counts };
}

function profileLine(profile) {
  const pillars = profile?.pillarsStr;
  if (!pillars) return '未保存统一命盘';
  return Object.values(pillars).join(' · ');
}

function elementLabel(v) {
  return { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' }[v] || v || '';
}

function reportKey(type, period) {
  return `${type}-${period.start}-${period.end}`;
}

function llmConfigured() {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
}

const OUTCOME_CN = { big_win: '大赚', win: '赚', flat: '平', loss: '亏', big_loss: '大亏', notrade: '未交易' };

function chartText(profile) {
  if (!profile) return '（未保存统一命盘）';
  const p = profile.pillarsStr || {};
  const y = profile.yongShen || {};
  const xi = Array.isArray(y.xi) && y.xi.length ? y.xi.map(elementLabel).join('、') : '综合判断';
  const ji = Array.isArray(y.ji) && y.ji.length ? y.ji.map(elementLabel).join('、') : '结合触发';
  return `日主 ${profile.dayStem || '-'}${profile.dayElement || ''}，强弱 ${profile.strength?.category || '-'}；四柱 ${p.year || '-'}·${p.month || '-'}·${p.day || '-'}·${p.hour || '-'}；喜用 ${xi}；忌神 ${ji}。`;
}

function statsText(type, period, summary, entries) {
  const c = summary.counts;
  const recent = entries.slice(-40).map((e) => `${e.date} ${OUTCOME_CN[e.outcome] || e.outcome}${e.score != null ? '/' + e.score : ''}${e.day ? '/' + e.day : ''}`).join('；');
  return [
    `【周期】${(REPORT_PRODUCTS[type] || {}).label || period.label}（${period.start} 至 ${period.end}）`,
    `【统计】共记录 ${summary.total} 天，实际交易 ${summary.traded} 次；大赚 ${c.big_win} 赚 ${c.win} 平 ${c.flat} 亏 ${c.loss} 大亏 ${c.big_loss} 未交易 ${c.notrade}；胜率 ${summary.rate}；平均行动指数 ${summary.avgScore != null ? summary.avgScore : '—'}；样本可信度 ${summary.confidence}`,
    `【近期逐笔（日期 结果/行动指数/干支）】${recent || '（无）'}`
  ].join('\n');
}

const SYSTEM_PROMPT = '你是一位既懂八字命理、又懂交易纪律与行为金融的复盘顾问。你根据用户真实的交易记录统计和其八字命盘，做命理×行为的深度复盘。铁律：①结论要结合真实统计数字和这张命盘的具体五行/十神/财星/旺衰来讲，不空泛；②样本不足（少于 20 次交易）时必须明确说明结论只是方向性参考；③只讲交易纪律与命理层面的财运特点，绝不预测股市行情、不推荐任何具体投资标的、不承诺盈利或必然结果；④务实、可执行。输出简体中文。';

const FORMAT_SPEC = '\n\n【输出格式】每章用「## 标题」另起一行；正文分段、段间空一行；要点用「- 」开头。不要输出 HTML 标签或 markdown 加粗。';

const TRADE_PROMPT = `这是一份【交易复盘报告】。请结合下面的真实交易统计与命主八字，做逐章深度复盘：

## 一、本期战绩综述
用真实数字讲清这段时间的交易次数、胜率、大赚/大亏分布与样本可信度；样本不足要点明结论仅供参考。

## 二、命理×行为印证
结合命盘的日主强弱、财星与喜忌五行，讲这个人命理上的财运与执行特点，是否与实盘表现印证（例如身弱财多易看得到赚不到、比劫争财易冲动加仓破财、印重偏保守易错失等），并结合逐笔记录里的顺逆节奏来谈。

## 三、风险模式
从亏损分布与命理上易冲动/破财的点，指出这段时间最该防的具体模式（如追单、连亏后加仓、某类状态下出手）。

## 四、下一阶段纪律建议
给出务实可执行的仓位与风控建议（顺势窗口按计划、逆势/高风险状态减仓、连亏后冷静期等）。

只讲交易纪律与命理层面，不预测行情、不荐股、不承诺盈利。`;

async function callLlm(userPrompt) {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4.1-mini';
  if (!baseUrl || !apiKey) return '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 2800
      }),
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error(`LLM ${response.status}`);
    const data = await response.json();
    return String((data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

function mdToHtml(text) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let html = '';
  let inList = false;
  let para = [];
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  const flushPara = () => { if (para.length) { html += '<p>' + para.map(esc).join('<br>') + '</p>'; para = []; } };
  for (const raw of lines) {
    const line = raw.replace(/\*\*/g, '').trim();
    if (!line) { flushPara(); closeList(); continue; }
    if (/^#{1,3}\s+/.test(line)) { flushPara(); closeList(); html += '<h3>' + esc(line.replace(/^#{1,3}\s+/, '')) + '</h3>'; continue; }
    if (/^[-*•]\s+/.test(line)) { flushPara(); if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + esc(line.replace(/^[-*•]\s+/, '')) + '</li>'; continue; }
    para.push(line);
  }
  flushPara(); closeList();
  return html;
}

function wrapReport(type, period, accessLevel, summary, bodyHtml) {
  const product = REPORT_PRODUCTS[type] || REPORT_PRODUCTS['30'];
  return [
    '<div class="report-generated">',
    `<h2>${product.label} · 深度复盘版</h2>`,
    `<span class="report-badge">${escapeHtml(period.label)}</span>`,
    `<span class="report-badge">${escapeHtml(period.start)} 至 ${escapeHtml(period.end)}</span>`,
    `<span class="report-badge">${accessLevel === 'membership' ? '高级会员' : '已解锁'}</span>`,
    `<span class="report-badge">胜率 ${escapeHtml(summary.rate)}</span>`,
    bodyHtml,
    '<div class="report-warning">报告用于交易纪律与命理参考，不构成投资建议，不预测行情、不推荐标的。</div>',
    '</div>'
  ].join('');
}

// 兜底：LLM 未配置/失败时，用真实统计给出结构化简版（不入库缓存，可刷新重试）。
function buildFallback(type, period, summary, profile, accessLevel) {
  const c = summary.counts;
  const body = [
    '<h3>一、统计结论</h3>',
    `<p>本周期共记录 ${summary.total} 天，实际交易 ${summary.traded} 次；大赚 ${c.big_win} 赚 ${c.win} 平 ${c.flat} 亏 ${c.loss} 大亏 ${c.big_loss} 未交易 ${c.notrade}。胜率 ${escapeHtml(summary.rate)}，样本可信度：${summary.confidence}。</p>`,
    '<h3>二、命盘</h3>',
    `<p>${escapeHtml(chartText(profile))}</p>`,
    '<h3>三、说明</h3>',
    '<p>命理×行为的完整深度复盘正在生成，请稍后回到本页点击「生成报告」刷新重试。若持续无法生成，请联系 support@madeshed.com。</p>'
  ].join('');
  return wrapReport(type, period, accessLevel, summary, body);
}

function buildPreviewHtml(type) {
  const product = REPORT_PRODUCTS[type] || REPORT_PRODUCTS['30'];
  return [
    '<div class="report-generated">',
    `<h2>${product.label} · 结构预览</h2>`,
    '<p>完整报告需要登录、已购买本报告或拥有最高级会员，并从云端真实记录生成。</p>',
    '<ul><li>战绩综述：交易样本、胜率、大赚/大亏分布。</li><li>命理×行为印证：财星、日主强弱、喜忌五行与你的实盘表现。</li><li>风险模式与下一阶段仓位纪律建议。</li></ul>',
    '<div class="report-warning">预览不返回完整付费正文。</div>',
    '</div>'
  ].join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const body = req.body || {};
  const reportType = cleanText(body.reportType || body.type || '30', 20);
  const mode = body.mode === 'preview' ? 'preview' : 'full';
  if (!REPORT_PRODUCTS[reportType]) return send(res, 400, { error: 'invalid_report_type' });

  if (mode === 'preview') {
    return send(res, 200, { reportType, reportHtml: buildPreviewHtml(reportType), accessLevel: 'preview', mode, disclaimer: '不构成投资建议' });
  }

  const gate = await authorizeTradeReportAccess(req, reportType, mode);
  if (!gate.ok) return send(res, gate.status, gate.body);

  const [profile, rows] = await Promise.all([
    loadSavedProfile(gate.user.id),
    loadCloudCheckins(gate.user.id)
  ]);
  const period = periodFor(reportType);
  const entries = rows.map(normalizedEntry).filter((entry) => inPeriod(entry, period));
  if (!entries.length) {
    return send(res, 409, {
      error: 'insufficient_cloud_records',
      message: '云端真实记录不足，完整报告不能使用示例数据生成。请先记录并同步更多交易结果。',
      reportType
    });
  }
  const summary = summarize(entries);

  let aiText = '';
  if (llmConfigured()) {
    try {
      const prompt = `${TRADE_PROMPT}${FORMAT_SPEC}\n\n以下是真实数据，请严格据此复盘：\n${statsText(reportType, period, summary, entries)}\n【命盘】${chartText(profile)}`;
      aiText = await callLlm(prompt);
    } catch (error) {
      aiText = '';
    }
  }

  const degraded = !aiText || aiText.length < 120;
  const reportHtml = degraded
    ? buildFallback(reportType, period, summary, profile, gate.accessLevel)
    : wrapReport(reportType, period, gate.accessLevel, summary, mdToHtml(aiText));

  const report = {
    reportKey: reportKey(reportType, period),
    reportType,
    periodStart: period.start === 'all' ? entries[0].date : period.start,
    periodEnd: period.end === 'all' ? entries[entries.length - 1].date : period.end,
    title: `${REPORT_PRODUCTS[reportType].label} · 深度复盘版`,
    summary,
    reportHtml,
    accessLevel: gate.accessLevel
  };
  // 只缓存 AI 成功的报告；兜底版不入库，便于下次刷新重试真正生成。
  if (!degraded) await saveGeneratedTradeReport(gate.user.id, report);
  return send(res, 200, {
    ...report,
    entriesUsed: entries.length,
    source: degraded ? 'fallback' : 'ai',
    degraded,
    disclaimer: '不构成投资建议'
  });
}
