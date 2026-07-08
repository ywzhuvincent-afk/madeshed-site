import { authorizeFortuneReportAccess, cleanText, escapeHtml, loadSavedProfile } from './_access.js';
import { getUserFromRequest, hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';

const FORTUNE_REPORT_TYPES = {
  full: { label: '全盘解读', price: '¥69' },
  dayun: { label: '流年大运解读', price: '¥99' },
  month: { label: '每月运程', price: '¥29' }
};

function send(res, status, body) {
  res.status(status).json(body);
}

function elementLabel(value) {
  return { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' }[value] || value || '';
}

function profileSummary(profile) {
  if (!profile) return '尚未提供命盘';
  const pillars = profile.pillarsStr || {};
  return [
    `日主：${profile.dayStem || '-'}${profile.dayElement || ''}`,
    `强弱：${profile.strength?.category || '-'}`,
    `年柱：${pillars.year || '-'}`,
    `月柱：${pillars.month || '-'}`,
    `日柱：${pillars.day || '-'}`,
    `时柱：${pillars.hour || '-'}`
  ].join('；');
}

function currentDayun(profile) {
  return profile && profile.currentDayunIdx >= 0 && profile.daYun && profile.daYun[profile.currentDayunIdx]
    ? profile.daYun[profile.currentDayunIdx]
    : null;
}

function buildFortunePreview(type, profile, targetPeriod) {
  const product = FORTUNE_REPORT_TYPES[type] || FORTUNE_REPORT_TYPES.full;
  const period = cleanText(targetPeriod) || (type === 'month' ? '本月' : '当前周期');
  const summary = profileSummary(profile);
  return [
    '<div class="report-generated fortune-generated">',
    `<h2>${product.label} · 结构预览</h2>`,
    `<span class="report-badge">${escapeHtml(period)}</span>`,
    '<span class="report-badge">预览版</span>',
    `<p>${escapeHtml(summary)}。完整报告会在服务端读取账号保存的统一命盘，并校验会员/购买权益后生成。</p>`,
    '<h3>完整报告包含</h3>',
    '<ul><li>原局强弱、调候、通根透干和十神组合。</li><li>当前大运、流年、流月对婚姻、事业、财运和风险的影响。</li><li>关键时间窗口、现实行动建议和风险边界。</li></ul>',
    '<div class="report-warning">预览不构成完整命理结论；解锁后才返回完整正文。</div>',
    '</div>'
  ].join('');
}

function buildFortuneReport(type, profile, targetPeriod, accessLevel) {
  const product = FORTUNE_REPORT_TYPES[type] || FORTUNE_REPORT_TYPES.full;
  const period = cleanText(targetPeriod) || (type === 'month' ? '本月' : '当前周期');
  const summary = profileSummary(profile);
  const yong = profile?.yongShen?.xi?.length
    ? profile.yongShen.xi.map(elementLabel).join('、')
    : '以命盘强弱和调候综合判断';
  const ji = profile?.yongShen?.ji?.length
    ? profile.yongShen.ji.map(elementLabel).join('、')
    : '需结合流年流月触发判断';
  const dayun = currentDayun(profile);
  const dayunText = dayun ? `${dayun.pillar}（${dayun.range || `${dayun.startAge}-${dayun.endAge}`}）` : '尚未起运或未识别';
  const focus = type === 'full'
    ? '全盘重在判断一生格局、性格底色、事业路径、婚姻关系、财运承载力与长期风险。'
    : type === 'dayun'
      ? '流年大运重在判断当前十年运势、今年流年触发，以及未来三年的关键节点。'
      : '每月运程重在判断本月流月气势、流日节奏、财星触发和适合推进/防守的窗口。';

  return [
    '<div class="report-generated fortune-generated">',
    `<h2>${product.label} · 命理详细版</h2>`,
    `<span class="report-badge">${escapeHtml(period)}</span>`,
    `<span class="report-badge">${accessLevel === 'membership' ? '高级会员' : '已解锁'}</span>`,
    '<span class="report-badge">基于账号统一八字命盘</span>',
    `<h3>一、命盘基础</h3><p>${escapeHtml(summary)}。当前大运：${escapeHtml(dayunText)}。喜用参考：${escapeHtml(yong)}；忌神/压力参考：${escapeHtml(ji)}。</p>`,
    `<h3>二、核心结论</h3><p>${focus} 判断顺序为：先看原局日主强弱和月令气势，再看用神/忌神、十神正偏、藏干权重、调候、通根透干，最后叠加大运、流年、流月触发。</p>`,
    '<h3>三、关键时间窗口</h3><p>顺势窗口优先选择喜用五行到位、财星可承载、冲刑害风险较轻的月份/日期；压力窗口以修正计划、降低冲动决策和保护现金流为主。</p>',
    '<h3>四、风险点</h3><p>若忌神强、比劫争财、财多身弱或冲刑害集中，容易出现花费压力、判断急躁、合作分歧或计划反复。重大决定应结合现实证据，不以单一日期作唯一依据。</p>',
    '<h3>五、建议行动</h3><p>把命理报告用于计划和复盘：长期事项先看大运/流年，中期看流月，短期看流日与个人真实记录。财运只解释收入机会、事业财星、破财风险和求稳/开拓倾向，不提供具体投资标的建议。</p>',
    '<div class="report-warning">本内容用于传统命理参考和自我规划，不构成投资、医疗或法律建议；涉及疾病、法律纠纷或极端风险时，请寻求持牌专业人士帮助。</div>',
    '</div>'
  ].join('');
}

function reportKey(type, targetPeriod) {
  return `${type}:${cleanText(targetPeriod, 'default').replace(/\s+/g, '-')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const body = req.body || {};
  const reportType = cleanText(body.reportType || body.type || 'full', 40);
  const mode = body.mode === 'preview' ? 'preview' : 'full';
  if (!FORTUNE_REPORT_TYPES[reportType]) return send(res, 400, { error: 'invalid_report_type' });

  if (mode === 'preview') {
    let profile = body.profile || null;
    if (!profile && hasSupabaseService()) {
      const auth = await getUserFromRequest(req);
      if (auth.user) profile = await loadSavedProfile(auth.user.id);
    }
    return send(res, 200, {
      reportType,
      title: FORTUNE_REPORT_TYPES[reportType].label,
      reportHtml: buildFortunePreview(reportType, profile, body.targetPeriod),
      accessLevel: 'preview',
      mode,
      disclaimer: '不构成投资、医疗或法律建议'
    });
  }

  const gate = await authorizeFortuneReportAccess(req, reportType, mode);
  if (!gate.ok) return send(res, gate.status, gate.body);

  const key = reportKey(reportType, body.targetPeriod);
  const existing = await supabaseSelect('fortune_reports', `user_id=eq.${encodeURIComponent(gate.user.id)}&report_key=eq.${encodeURIComponent(key)}&access_level=in.(paid,membership)&select=report_type,title,report_html,access_level,updated_at&limit=1`);
  if (existing.length && !body.forceRefresh) {
    return send(res, 200, {
      reportType,
      title: existing[0].title,
      reportHtml: existing[0].report_html,
      accessLevel: existing[0].access_level,
      source: 'fortune_reports',
      disclaimer: '不构成投资、医疗或法律建议'
    });
  }

  const reportHtml = buildFortuneReport(reportType, gate.profile, body.targetPeriod, gate.accessLevel);
  await supabaseInsert('fortune_reports', {
    user_id: gate.user.id,
    report_key: key,
    report_type: reportType,
    target_period: cleanText(body.targetPeriod),
    title: FORTUNE_REPORT_TYPES[reportType].label,
    context: body.context || {},
    report_html: reportHtml,
    access_level: gate.accessLevel
  }, { upsert: true, onConflict: 'user_id,report_key' });
  return send(res, 200, {
    reportType,
    title: FORTUNE_REPORT_TYPES[reportType].label,
    reportHtml,
    accessLevel: gate.accessLevel,
    source: 'server-gated',
    disclaimer: '不构成投资、医疗或法律建议'
  });
}
