import { getUserFromRequest, hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';
import { MEMBERSHIP_MONTHLY_CREDITS } from './_access.js';

const MASTER_CATEGORIES = ['marriage', 'career', 'wealth', 'windfall', 'family', 'health', 'timing', 'life', 'custom'];
const MASTER_DEPTH_COST = { normal:1, deep:3 };

function send(res, status, body) {
  res.status(status).json(body);
}

function clip(value, max = 3000) {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function elementLabel(value) {
  return { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' }[value] || value || '';
}

function llmConfigured() {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
}

function buildFortuneContext(profile, payload) {
  const pillars = profile && profile.pillarsStr ? profile.pillarsStr : {};
  const yong = profile && profile.yongShen ? profile.yongShen : {};
  return {
    dayMaster: profile ? `${profile.dayStem || ''}${profile.dayElement || ''}` : '',
    strength: profile && profile.strength ? profile.strength.category : '',
    pillars,
    yongShen: {
      main: elementLabel(yong.main),
      xi: Array.isArray(yong.xi) ? yong.xi.map(elementLabel) : [],
      ji: Array.isArray(yong.ji) ? yong.ji.map(elementLabel) : []
    },
    currentDayun: profile && profile.currentDayunIdx >= 0 && profile.daYun ? profile.daYun[profile.currentDayunIdx] : null,
    category: payload.category,
    horizon: payload.horizon,
    targetDate: payload.targetDate || '',
    targetMonth: payload.targetMonth || ''
  };
}

function buildMasterPrompt(context, question, depth) {
  return [
    '你是一位谨慎、专业的传统命理师。必须基于提供的结构化八字上下文分析，不得编造不存在的命盘信息。',
    '回答格式固定为：结论、命理依据、关键时间窗口、风险点、建议行动、可追问方向。',
    '财运只讲传统命理里的收入机会、事业财星、破财风险、花费压力和适合求稳/开拓，不提供具体投资标的建议。',
    '涉及偏财/机会财/投机性求财时，从命理偏财星旺弱、日主能否担财与引动时机分析倾向，务必给理性与风险提示（偏财来去快、量力而行、不借贷不透支不沉迷），绝不承诺收益或中奖。',
    '不得承诺必然发生。医疗、法律、极端风险问题必须建议用户寻求现实专业帮助。',
    `深度：${depth}`,
    `结构化上下文：${JSON.stringify(context)}`,
    `用户问题：${question}`
  ].join('\n');
}

async function callLlm(prompt) {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4.1-mini';
  if (!baseUrl || !apiKey) {
    return { configured: false, answer: '' };
  }
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你输出中文，语气像专业命理师，但要克制、清楚、可执行。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4
    })
  });
  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status}`);
  }
  const data = await response.json();
  return { configured: true, answer: data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '' };
}

function currentGrantMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function creditBalance(userId) {
  const rows = await supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&select=amount`);
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

/* 月度赠点兜底：按"活跃会员 + 当月未领"发放，与账单周期无关。
   这是年费会员在两次账单之间的 11 个月拿到点数的唯一途径（webhook 的 invoice.paid 一年只触发一次），
   删掉它会让年费会员每年只得一次点数。额度取自 _access.js 共用表（基础 30 / 至尊VIP 200）。 */
async function maybeGrantUltimateCredits(userId) {
  const memberships = await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(userId)}&select=tier,status&limit=1`);
  const membership = memberships[0];
  const amount = membership && MEMBERSHIP_MONTHLY_CREDITS[membership.tier];
  const activeMember = amount && (membership.status === 'active' || membership.status === 'trialing');
  if (!activeMember) return;
  const referenceId = currentGrantMonth();
  // 与 stripe-webhook 同口径：按"日历月窗口"查重（webhook 的 grant 以 invoice.id 为 reference_id，
  // 若仍按 reference_id 精确比对，本兜底会在同月再发一次点数）
  const monthStart = `${referenceId}-01T00:00:00Z`;
  const grants = await supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&entry_type=eq.membership_grant&created_at=gte.${encodeURIComponent(monthStart)}&select=id&limit=1`);
  if (grants.length) return;
  const balance = await creditBalance(userId);
  await supabaseInsert('credit_ledger', {
    user_id: userId,
    entry_type: 'membership_grant',
    amount,
    balance_after: balance + amount,
    reference_type: 'membership_month',
    reference_id: referenceId,
    payload: { tier: membership.tier }
  });
}

async function authorizeAndReserve(req, creditsNeeded) {
  if (!hasSupabaseService()) {
    return { ok: false, status: 503, body: { error: 'supabase_service_not_configured', message: '云端点数账本暂未配置，本次不消耗点数。', creditsSpent: 0 } };
  }
  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    return { ok: false, status: 401, body: { error: auth.error || 'unauthorized', message: '请先登录后再使用问大师。', creditsSpent: 0 } };
  }
  await maybeGrantUltimateCredits(auth.user.id);
  const balance = await creditBalance(auth.user.id);
  if (balance < creditsNeeded) {
    return { ok: false, status: 402, body: { error: 'insufficient_credits', message: `点数余额不足，本次需要 ${creditsNeeded} 点。`, balance, creditsNeeded, creditsSpent: 0 } };
  }
  return { ok: true, user: auth.user, balance };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const body = req.body || {};
  const category = clip(body.category || 'custom', 40);
  const horizon = clip(body.horizon || 'short', 40);
  const depth = body.depth === 'deep' ? 'deep' : 'normal';
  const creditsNeeded = MASTER_DEPTH_COST[depth];
  const question = clip(body.question);
  if (!MASTER_CATEGORIES.includes(category)) return send(res, 400, { error: 'invalid_category' });
  if (!['short', 'month', 'year', 'dayun', 'lifetime'].includes(horizon)) return send(res, 400, { error: 'invalid_horizon' });
  if (!question) return send(res, 400, { error: 'missing_question' });
  if (!body.profile) return send(res, 400, { error: 'missing_profile', message: '请先生成并保存八字命盘。' });
  if (!llmConfigured()) {
    return send(res, 503, {
      error: 'llm_not_configured',
      message: 'AI 服务暂未配置，本次不消耗点数。',
      creditsSpent: 0,
      creditsNeeded,
      noChargeReason: '不消耗点数'
    });
  }

  const context = buildFortuneContext(body.profile, { category, horizon, targetDate: body.targetDate, targetMonth: body.targetMonth });
  const prompt = buildMasterPrompt(context, question, depth);
  const billing = await authorizeAndReserve(req, creditsNeeded);
  if (!billing.ok) return send(res, billing.status, billing.body);
  const llm = await callLlm(prompt);
  if (!llm.configured) {
    return send(res, 503, {
      error: 'llm_not_configured',
      message: 'AI 服务暂未配置，本次不消耗点数。',
      creditsSpent: 0,
      creditsNeeded,
      noChargeReason: '不消耗点数'
    });
  }

  const answerHtml = `<div class="report-generated master-answer">${escapeHtml(clip(llm.answer, 8000)).replace(/\n/g, '<br>')}</div>`;
  const balanceAfter = billing.balance - creditsNeeded;
  await supabaseInsert('master_questions', {
    user_id: billing.user.id,
    category,
    horizon,
    depth,
    target_date: clip(body.targetDate || '', 40) || null,
    target_month: clip(body.targetMonth || '', 40) || null,
    question,
    credits_spent: creditsNeeded,
    context,
    answer_html: answerHtml,
    status: 'answered'
  });
  await supabaseInsert('credit_ledger', {
    user_id: billing.user.id,
    entry_type: 'spend',
    amount: -creditsNeeded,
    balance_after: balanceAfter,
    reference_type: 'master_question',
    reference_id: `${Date.now()}`,
    payload: { category, horizon, depth }
  });
  return send(res, 200, {
    category,
    horizon,
    depth,
    creditsSpent: creditsNeeded,
    balanceAfter,
    context,
    answerHtml,
    safety: '不提供具体投资标的建议'
  });
}
