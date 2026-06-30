import { getUserFromRequest, hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';

const FORTUNE_REPORT_TYPES = {
  full: { label: '全盘解读', price: '¥69' },
  dayun: { label: '流年大运解读', price: '¥99' },
  month: { label: '每月运程', price: '¥29' }
};

function send(res, status, body) {
  res.status(status).json(body);
}

function cleanText(value, fallback = '') {
  return String(value || fallback).trim().slice(0, 2000);
}

function elementLabel(value) {
  return { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' }[value] || value || '';
}

function profileSummary(profile) {
  if (!profile) return '尚未提供命盘';
  const pillars = profile.pillarsStr || {};
  return [
    `日主：${profile.dayStem || '-'}${profile.dayElement || ''}`,
    `强弱：${profile.strength && profile.strength.category ? profile.strength.category : '-'}`,
    `年柱：${pillars.year || '-'}`,
    `月柱：${pillars.month || '-'}`,
    `日柱：${pillars.day || '-'}`,
    `时柱：${pillars.hour || '-'}`,
  ].join('；');
}

function buildFortuneReport(type, profile, targetPeriod) {
  const product = FORTUNE_REPORT_TYPES[type] || FORTUNE_REPORT_TYPES.full;
  const period = cleanText(targetPeriod, type === 'month' ? '本月' : '当前周期');
  const summary = profileSummary(profile);
  const yong = profile && profile.yongShen && Array.isArray(profile.yongShen.xi)
    ? profile.yongShen.xi.map(elementLabel).join('、')
    : '以命盘强弱和调候综合判断';
  const dayun = profile && profile.currentDayunIdx >= 0 && profile.daYun && profile.daYun[profile.currentDayunIdx]
    ? profile.daYun[profile.currentDayunIdx].pillar
    : '尚未起运或未识别';

  return [
    `<div class="report-generated fortune-generated">`,
    `<h2>${product.label} · 命理详细版</h2>`,
    `<span class="report-badge">${period}</span>`,
    `<span class="report-badge">基于统一八字命盘</span>`,
    `<h3>一、命盘基础</h3><p>${summary}。喜用参考：${yong}。</p>`,
    `<h3>二、核心判断</h3><p>系统会综合原局强弱、十神正偏、藏干权重、调候、通根透干、大运、流年和流月来判断趋势。当前大运为 ${dayun}，固定报告会优先判断该周期对婚姻、事业、财运、人际和健康倾向的影响。</p>`,
    `<h3>三、建议方向</h3><p>顺势周期适合推进已经准备好的计划；压力周期适合修正策略、减少冲动决定，并优先处理长期稳定性。财运只按传统命理解释收入机会、花费压力和破财风险，不提供具体投资标的建议。</p>`,
    `<h3>四、风险提示</h3><p>命理报告用于自我观察和决策辅助，不构成投资、医疗或法律建议；重大事项仍建议结合现实信息和专业人士意见。</p>`,
    `</div>`
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
  const reportType = cleanText(body.reportType || body.type || 'full');
  if (!FORTUNE_REPORT_TYPES[reportType]) {
    return send(res, 400, { error: 'invalid_report_type' });
  }
  if (!body.profile) {
    return send(res, 400, { error: 'missing_profile', message: '请先生成并保存八字命盘。' });
  }
  const key = reportKey(reportType, body.targetPeriod);
  if (hasSupabaseService()) {
    const auth = await getUserFromRequest(req);
    if (auth.user) {
      const existing = await supabaseSelect('fortune_reports', `user_id=eq.${encodeURIComponent(auth.user.id)}&report_key=eq.${encodeURIComponent(key)}&select=report_type,title,report_html,access_level,updated_at&limit=1`);
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
    }
  }
  const reportHtml = buildFortuneReport(reportType, body.profile, body.targetPeriod);
  if (hasSupabaseService()) {
    const auth = await getUserFromRequest(req);
    if (auth.user) {
      await supabaseInsert('fortune_reports', {
        user_id: auth.user.id,
        report_key: key,
        report_type: reportType,
        target_period: cleanText(body.targetPeriod, ''),
        title: FORTUNE_REPORT_TYPES[reportType].label,
        context: body.context || {},
        report_html: reportHtml,
        access_level: body.accessLevel || 'preview'
      }, { upsert: true, onConflict: 'user_id,report_key' });
    }
  }
  return send(res, 200, {
    reportType,
    title: FORTUNE_REPORT_TYPES[reportType].label,
    reportHtml,
    accessLevel: body.accessLevel || 'preview',
    disclaimer: '不构成投资、医疗或法律建议'
  });
}
