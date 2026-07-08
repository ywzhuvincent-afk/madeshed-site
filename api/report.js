import {
  authorizeTradeReportAccess,
  cleanText,
  escapeHtml,
  loadCloudCheckins,
  loadSavedProfile,
  saveGeneratedTradeReport
} from './_access.js';

const REPORT_PRODUCTS = {
  '7': { label: '7 天报告', days: 7 },
  '30': { label: '月度报告', days: 30 },
  '365': { label: '年度报告', days: 365 },
  all: { label: '全部历史报告', days: null }
};

const OUTCOMES = ['big_win', 'win', 'flat', 'loss', 'big_loss', 'notrade'];
const REPORT_ENTITLEMENTS_TABLE = 'report_entitlements';
const GENERATED_REPORTS_TABLE = 'generated_reports';

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
  // 仅对有真实分数(引擎下限34，绝不为0/null)的记录求均分；无分数记录不计入分子分母，
  // 否则 Number(null)===0 会被当成有效 0 分，把均分强行拉低。
  const scored = entries.filter((entry) => Number.isFinite(entry.score));
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, entry) => sum + entry.score, 0) / scored.length)
    : null;
  const confidence = traded.length >= 50 ? '高可信' : traded.length >= 20 ? '中等可信' : traded.length >= 5 ? '初步参考' : '样本不足';
  return {
    total: entries.length,
    traded: traded.length,
    wins,
    losses,
    rate: percent(wins, traded.length),
    avgScore,
    confidence,
    counts
  };
}

function profileLine(profile) {
  const pillars = profile?.pillarsStr;
  if (!pillars) return '未保存统一命盘';
  return Object.values(pillars).join(' · ');
}

function reportKey(type, period) {
  return `${type}-${period.start}-${period.end}`;
}

function buildReportHtml(type, period, summary, profile, accessLevel) {
  const product = REPORT_PRODUCTS[type] || REPORT_PRODUCTS['30'];
  const yong = profile?.yongShen?.xi?.length
    ? profile.yongShen.xi.map((x) => ({ wood: '木', fire: '火', earth: '土', metal: '金', water: '水' }[x] || x)).join('、')
    : '尚未生成';
  const sampleWarn = summary.traded < 20
    ? '<div class="report-warning">当前交易样本少于 20 条，报告会给出方向性建议；统计结论需要继续累积真实记录验证。</div>'
    : '';
  return [
    '<div class="report-generated">',
    `<h2>${product.label} · 服务端详细版</h2>`,
    `<span class="report-badge">${escapeHtml(period.label)}</span>`,
    `<span class="report-badge">${escapeHtml(period.start)} 至 ${escapeHtml(period.end)}</span>`,
    `<span class="report-badge">${accessLevel === 'membership' ? '高级会员' : '已解锁'}</span>`,
    `<span class="report-badge">胜率 ${escapeHtml(summary.rate)}</span>`,
    sampleWarn,
    '<h3>一、统计结论</h3>',
    `<p>本周期共记录 ${summary.total} 天，实际交易 ${summary.traded} 次；大赚 ${summary.counts.big_win} 次，赚 ${summary.counts.win} 次，平 ${summary.counts.flat} 次，亏 ${summary.counts.loss} 次，大亏 ${summary.counts.big_loss} 次，未交易 ${summary.counts.notrade} 天。当前样本可信度：${summary.confidence}。</p>`,
    '<h3>二、八字与数据结合</h3>',
    `<p>统一命盘：${escapeHtml(profileLine(profile))}。当前喜用倾向：${escapeHtml(yong)}。报告会把真实交易记录与命理颜色、五行和十神状态一起观察，优先寻找“哪些状态下你更容易执行计划，哪些状态下更容易冲动或回撤”。</p>`,
    '<h3>三、风险模式</h3>',
    `<p>本周期亏损类交易 ${summary.losses} 次，大亏 ${summary.counts.big_loss} 次。若大亏集中在橙/红状态、亏损后追单或高波动时段，下一阶段应默认降低仓位，并把“亏损后冷静期”写入规则。</p>`,
    '<h3>四、未来行动建议</h3>',
    '<p>浅绿/绿状态按计划执行；黄状态只做小仓验证；橙/红状态优先防守。任何连续亏损后的下一笔交易都应降低规模，直到真实记录重新显示执行质量稳定。</p>',
    '<p>报告用于交易纪律和风险管理，不构成投资建议。</p>',
    '</div>'
  ].join('');
}

function buildPreviewHtml(type) {
  const product = REPORT_PRODUCTS[type] || REPORT_PRODUCTS['30'];
  return [
    '<div class="report-generated">',
    `<h2>${product.label} · 结构预览</h2>`,
    '<p>完整报告需要登录、已确认邮箱、已购买本报告或拥有最高级会员，并从云端真实记录生成。</p>',
    '<ul><li>统计：交易样本、胜率、大赚/大亏分布。</li><li>命理：颜色、五行、十神与统一八字命盘。</li><li>建议：下一阶段仓位纪律、风险窗口和复盘重点。</li></ul>',
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
    return send(res, 200, {
      reportType,
      reportHtml: buildPreviewHtml(reportType),
      accessLevel: 'preview',
      mode,
      disclaimer: '不构成投资建议'
    });
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
  const reportHtml = buildReportHtml(reportType, period, summary, profile, gate.accessLevel);
  const report = {
    reportKey: reportKey(reportType, period),
    reportType,
    periodStart: period.start === 'all' ? entries[0].date : period.start,
    periodEnd: period.end === 'all' ? entries[entries.length - 1].date : period.end,
    title: `${REPORT_PRODUCTS[reportType].label} · 服务端详细版`,
    summary,
    reportHtml,
    accessLevel: gate.accessLevel
  };
  await saveGeneratedTradeReport(gate.user.id, report);
  return send(res, 200, {
    ...report,
    entriesUsed: entries.length,
    source: 'server-gated',
    disclaimer: '不构成投资建议'
  });
}
