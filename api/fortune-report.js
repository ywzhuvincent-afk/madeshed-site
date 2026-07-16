import { authorizeFortuneReportAccess, cleanText, escapeHtml, loadSavedProfile } from './_access.js';
import { getUserFromRequest, hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';

// 命理报告：调 LLM + 完整命盘，逐领域产出师傅级深度解读（不再是死模板）。
export const config = { maxDuration: 60 };

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

function llmConfigured() {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
}

// —— 公历年份 → 流年干支（天干 (year-4)%10，地支 (year-4)%12）。
const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
function ganzhiForYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return '';
  const g = ((y - 4) % 10 + 10) % 10;
  const z = ((y - 4) % 12 + 12) % 12;
  return GAN[g] + ZHI[z];
}

function genderLabel(g) {
  return (g === 'M' || g === 1 || g === '1' || g === '男') ? '男' : '女';
}

// —— 把完整命盘拼成可读文本喂给 LLM（越具体，解读越深）。
function buildChartText(profile) {
  if (!profile) return '（未提供命盘）';
  const p = profile.pillarsStr || {};
  const y = profile.yongShen || {};
  const xi = Array.isArray(y.xi) && y.xi.length ? y.xi.map(elementLabel).join('、') : '（按强弱调候综合）';
  const ji = Array.isArray(y.ji) && y.ji.length ? y.ji.map(elementLabel).join('、') : '（结合流年流月触发）';
  const main = y.main ? elementLabel(y.main) : '';
  const dy = Array.isArray(profile.daYun) ? profile.daYun : [];
  const dyText = dy.length
    ? dy.map((d) => `${d.pillar || d.ganzhi || ''}(${d.range || `${d.startAge != null ? d.startAge : '?'}-${d.endAge != null ? d.endAge : '?'}岁`})`).join('　')
    : '（未起运/未识别）';
  const cur = (profile.currentDayunIdx != null && profile.currentDayunIdx >= 0 && dy[profile.currentDayunIdx]) ? dy[profile.currentDayunIdx] : null;
  const curText = cur ? `${cur.pillar || cur.ganzhi || ''}(${cur.range || `${cur.startAge}-${cur.endAge}岁`})` : '（尚未起运/未识别）';
  const nowYear = new Date().getUTCFullYear();
  const nowMonth = new Date().getUTCMonth() + 1;
  const strength = profile.strength ? `${profile.strength.category || ''}${profile.strength.score != null ? `（${profile.strength.score}分）` : ''}` : '（未判定）';
  const lines = [
    '【命主八字】',
    `性别：${genderLabel(profile.gender)}`,
    profile.birth ? `出生：公历 ${profile.birth}${profile.time ? ' ' + profile.time : ''}` : null,
    `四柱：年柱 ${p.year || '-'}　月柱 ${p.month || '-'}　日柱 ${p.day || '-'}　时柱 ${p.hour || '-'}`,
    `日主：${profile.dayStem || '-'}${profile.dayElement || ''}；强弱：${strength}`,
    profile.monthBranch ? `月令：${profile.monthBranch}` : null,
    `用神：${main || '（见喜神）'}；喜神：${xi}；忌神：${ji}`,
    `大运：${dyText}`,
    `当前大运：${curText}`,
    `今年流年：${ganzhiForYear(nowYear)}（公历 ${nowYear} 年）；当前月份：公历 ${nowMonth} 月`
  ].filter(Boolean);
  return lines.join('\n');
}

const SYSTEM_PROMPT = '你是一位有数十年经验的资深八字命理师，精通子平命理：格局、十神、藏干、旺衰、用神喜忌、调候、大运流年。你根据命主真实八字做深入、全面、逐项到位的解读，像面对面算命一样有条理、可执行。铁律：①每条结论都必须结合这张命盘的具体四柱、日主强弱、十神、五行、用神喜忌、大运来讲，要引用命盘里的实际干支和五行，绝不说放之四海皆准的空话；②要求覆盖的领域一个都不能少，篇幅要充分；③专业但通俗、条理清楚；④合规红线：财运只讲命理层面的财星/求财方式/破财风险/收入机会，绝不预测股市行情、不推荐任何具体投资标的、不承诺必然发生的收益或结果；健康只作命理提示并提醒就医、不替代医疗诊断；法律或极端风险请当事人找持牌专业人士；不承诺必然。输出简体中文。';

const FORMAT_SPEC = '\n\n【输出格式】每一章用「## 章节标题」另起一行作标题；正文分段，段与段之间空一行；要点用「- 」开头。不要输出任何 HTML 标签，不要用 markdown 的 ** 加粗。';

const PROMPTS = {
  fullA: `这是【全盘命理解读 · 上篇】。请像资深命理师当面批命一样，基于下面这个人的真实八字深入解读以下五个方面。每一章都必须有、都要结合这张命盘的具体干支五行来讲、篇幅充分，不许泛泛而谈：

## 一、命格总论
定这张八字的格局与层次：日主是什么五行、在月令是否得令、整体旺衰（结合给出的强弱判断），用神/喜神/忌神是哪些五行、为什么这样取。给出这个命的整体气象、格局高低与一生大方向。

## 二、性格与天赋
由日主五行、十神组合、旺衰，剖析性格底色、思维与行为方式、优点与短板、潜在天赋与适合发挥的方向。

## 三、事业与格局
适合的行业与五行方向（结合喜用神）、宜打工还是宜自立、事业上的贵人与竞争关系、一生事业的高低起伏节奏、务实的发展策略。

## 四、财运（务必详细）
分正财与偏财；看财星旺衰以及日主能否担财（身强能担财、身弱财多则看得到赚不到）；求财方式（正职/偏门/合作/投资倾向）；破财与花费压力的来源；哪些大运流年财旺、哪些财紧；守财与理财提醒。只讲命理层面，不预测行情、不荐股。

## 五、婚姻感情（务必详细）
配偶星（男看财星、女看官杀）的旺衰与位置；夫妻宫（日支）的状态与冲合刑害；桃花与异性缘；正缘的特征、以及容易出现或成婚的有利时机（落到大运流年）；婚姻的稳定度与要留意的地方；相处建议。`,

  fullB: `这是【全盘命理解读 · 下篇】。请像资深命理师当面批命一样，基于下面这个人的真实八字深入解读以下方面（不要重复前面的内容，直接从健康讲起）。每一章都必须有、都要结合这张命盘的具体干支五行来讲、篇幅充分：

## 六、健康（务必详细）
从五行的太过与不及，看容易偏弱的脏腑与系统（木肝胆、火心小肠、土脾胃、金肺大肠、水肾膀胱）、体质倾向、要留意的季节与年份、冲刑对健康的影响、调养与生活建议。只作命理提示，务必叮嘱有不适请就医、不替代医疗诊断。

## 七、六亲缘分
父母、兄弟姐妹、子女的缘分厚薄与助力或消耗（父母看印/财、兄弟看比劫、子女男看官杀女看食伤）、相处提示。

## 八、大运与关键时间
结合给出的当前大运，讲它与日主/用神的关系、这十年的主题；结合给出的今年流年干支讲今年的引动；再把未来几年的高低节奏落到具体年份，明确指出顺势窗口与要谨慎的窗口。

## 九、趋吉避凶与开运建议
根据喜用五行给出可执行的开运建议：有利的颜色、方位、行业、饮食、作息、可借力的贵人属相等，以及要规避的忌神方向。

最后用一段话做总体寄语。`,

  dayun: `这是一份【流年大运解读】，请基于下面这个人的真实八字，重点解读运程走势，逐章深入、结合具体命盘：

## 一、命盘与用神小结
简述日主、旺衰、用神喜忌，作为看运的基准（一段即可）。

## 二、当前大运详解
结合给出的当前大运干支，讲它与日主、用神的生克关系，引动了哪些十神，这十年的主题、机遇与考验，在事业、财运、感情、健康各方面的大致走向。

## 三、今年流年
结合给出的今年流年干支，讲它对命局与当前大运的引动，今年在事业、财运、感情、健康、人际各方面的表现与要注意的地方。

## 四、未来三到五年节奏
逐年（落到具体公历年份与流年干支）讲高低起伏，指出哪些年顺势可进取、哪些年宜守宜稳，以及各年的侧重（求财/感情/变动/守成）。

## 五、关键时间窗口与建议
把最值得把握与最需谨慎的时间点挑出来，给出务实、可执行的行动与规避建议。

只讲命理层面，不预测股市行情、不荐股、不承诺必然。`,

  month: `这是一份【每月运程】解读，请基于下面这个人的真实八字，聚焦目标月份，深入而具体：

## 一、本月气势
结合本月流月的五行干支与命主用神喜忌，判断本月对命主是顺是逆、整体基调。

## 二、各领域本月表现
分「事业/工作」「财运」「感情/人际」「健康」四块，分别讲本月的机会、压力与注意事项，结合命盘具体五行十神来讲。

## 三、流日节奏与窗口
指出本月大致哪些时段/日子相对顺、适合推进，哪些时段宜观望或防守（可结合喜忌五行的日子来谈）。

## 四、本月开运小建议
给几条可落地的开运与调整建议（颜色、作息、心态、可为与不可为）。

只讲命理层面，不预测行情、不荐股、不承诺必然。`
};

function buildUserPrompt(type, profile, targetPeriod) {
  const base = PROMPTS[type] || PROMPTS.fullA;
  const period = cleanText(targetPeriod);
  const periodLine = type === 'month' && period ? `\n\n【目标月份】${period}` : '';
  return `${base}${FORMAT_SPEC}\n\n以下是这个人的真实命盘，请严格据此解读：\n${buildChartText(profile)}${periodLine}`;
}

async function callLlm(userPrompt, maxTokens) {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4.1-mini';
  if (!baseUrl || !apiKey) return { text: '', error: 'not_configured' };
  const ctrl = new AbortController();
  // 52s 中止：留出兜底与返回时间，保证在 maxDuration(60s) 内返回，不被平台硬杀。
  const timer = setTimeout(() => ctrl.abort(), 52000);
  try {
    // 用 max_tokens 限定单次输出长度以控住生成时间（全盘拆两半并行时每半更短、更快）。DeepSeek 等均支持该参数。
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: maxTokens || 2000
      }),
      signal: ctrl.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { text: '', error: `LLM ${response.status}: ${String(detail).slice(0, 180)}` };
    }
    const data = await response.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    return { text: String(text || '').trim(), error: '' };
  } catch (e) {
    return { text: '', error: String((e && e.message) || e).slice(0, 180) };
  } finally {
    clearTimeout(timer);
  }
}

// —— LLM 的纯文本（## 标题 / - 要点 / 段落）安全转 HTML。
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

function wrapReport(type, period, accessLevel, bodyHtml) {
  const product = FORTUNE_REPORT_TYPES[type] || FORTUNE_REPORT_TYPES.full;
  return [
    '<div class="report-generated fortune-generated">',
    `<h2>${product.label} · 命理详细版</h2>`,
    `<span class="report-badge">${escapeHtml(period)}</span>`,
    `<span class="report-badge">${accessLevel === 'membership' ? '高级会员' : '已解锁'}</span>`,
    '<span class="report-badge">基于账号统一八字命盘</span>',
    bodyHtml,
    '<div class="report-warning">本内容为传统命理参考与自我规划，不构成投资、医疗或法律建议；财运只讨论命理层面的机会与风险，不预测行情、不推荐标的；涉及疾病、法律纠纷或极端风险请寻求持牌专业人士帮助。</div>',
    '</div>'
  ].join('');
}

// —— LLM 未配置/失败时的兜底：结构完整但简版，并提示可刷新重试（不入库缓存）。
function buildFallback(type, profile, period, accessLevel) {
  const p = profile && profile.pillarsStr ? profile.pillarsStr : {};
  const y = profile && profile.yongShen ? profile.yongShen : {};
  const xi = Array.isArray(y.xi) && y.xi.length ? y.xi.map(elementLabel).join('、') : '综合判断';
  const chart = `日主 ${profile?.dayStem || '-'}${profile?.dayElement || ''}，强弱 ${profile?.strength?.category || '-'}；四柱 ${p.year || '-'}·${p.month || '-'}·${p.day || '-'}·${p.hour || '-'}；喜用 ${xi}。`;
  const body = [
    `<p>${escapeHtml(chart)}</p>`,
    '<p>完整深度解读（命格总论、性格天赋、事业、财运、婚姻感情、健康、六亲、大运流年、开运建议）正在生成，请稍后回到本页点击「生成报告」刷新重试。若持续无法生成，请联系 support@madeshed.com。</p>'
  ].join('');
  return wrapReport(type, period, accessLevel, body);
}

function buildFortunePreview(type, profile, targetPeriod) {
  const product = FORTUNE_REPORT_TYPES[type] || FORTUNE_REPORT_TYPES.full;
  const period = cleanText(targetPeriod) || (type === 'month' ? '本月' : '当前周期');
  const p = profile && profile.pillarsStr ? profile.pillarsStr : {};
  const summary = profile ? `日主 ${profile.dayStem || '-'}${profile.dayElement || ''}，强弱 ${profile.strength?.category || '-'}；四柱 ${p.year || '-'}·${p.month || '-'}·${p.day || '-'}·${p.hour || '-'}。` : '尚未提供命盘';
  return [
    '<div class="report-generated fortune-generated">',
    `<h2>${product.label} · 结构预览</h2>`,
    `<span class="report-badge">${escapeHtml(period)}</span>`,
    '<span class="report-badge">预览版</span>',
    `<p>${escapeHtml(summary)} 完整报告会读取账号里的统一命盘，校验会员/购买权益后由 AI 命理师逐项深入生成。</p>`,
    '<h3>完整报告包含</h3>',
    '<ul><li>命格总论、格局层次、用神喜忌。</li><li>性格天赋、事业方向、财运（正偏财/求财/破财/财旺时机）。</li><li>婚姻感情（配偶星、夫妻宫、正缘时机）、健康（五行脏腑）、六亲缘分。</li><li>当前大运、今年流年、未来节奏与关键时间窗口。</li><li>趋吉避凶与开运建议。</li></ul>',
    '<div class="report-warning">预览不返回完整正文；解锁后由 AI 命理师生成逐项深度解读。</div>',
    '</div>'
  ].join('');
}

// v2：升级为 LLM 深度报告后换 key，让旧的浅版缓存自然失效、下次查看即重新生成；
// 同时把目标月份纳入 key（此前 month 各月共用一个 key、会互相覆盖）。
function reportKey(type, targetPeriod) {
  const p = cleanText(targetPeriod).replace(/\s+/g, '-') || 'default';
  return `${type}:${p}:v2`;
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

  const period = cleanText(body.targetPeriod) || (reportType === 'month' ? '本月' : '当前周期');
  const key = reportKey(reportType, body.targetPeriod);
  const existing = await supabaseSelect('fortune_reports', `user_id=eq.${encodeURIComponent(gate.user.id)}&report_key=eq.${encodeURIComponent(key)}&access_level=in.(paid,membership)&select=report_type,title,report_html,access_level,updated_at&limit=1`);
  if (existing.length && existing[0].report_html && !body.forceRefresh) {
    return send(res, 200, {
      reportType,
      title: existing[0].title,
      reportHtml: existing[0].report_html,
      accessLevel: existing[0].access_level,
      source: 'fortune_reports',
      disclaimer: '不构成投资、医疗或法律建议'
    });
  }

  // 调 AI 命理师生成深度报告。全盘拆成上/下两半并行生成（各更短更快，避免单次超时），再拼接。
  // 失败/未配置则返回兜底（不入库，允许刷新重试）。
  let aiText = '';
  let llmError = '';
  if (llmConfigured()) {
    try {
      if (reportType === 'full') {
        const [a, b] = await Promise.all([
          callLlm(buildUserPrompt('fullA', gate.profile, body.targetPeriod), 2000),
          callLlm(buildUserPrompt('fullB', gate.profile, body.targetPeriod), 2000)
        ]);
        aiText = [a.text, b.text].filter(Boolean).join('\n\n');
        llmError = a.error || b.error || '';
      } else {
        const llm = await callLlm(buildUserPrompt(reportType, gate.profile, body.targetPeriod), reportType === 'month' ? 1600 : 2000);
        aiText = llm.text || '';
        llmError = llm.error || '';
      }
    } catch (error) {
      llmError = String((error && error.message) || error).slice(0, 180);
    }
  } else {
    llmError = 'llm_not_configured';
  }

  if (!aiText || aiText.length < 120) {
    return send(res, 200, {
      reportType,
      title: FORTUNE_REPORT_TYPES[reportType].label,
      reportHtml: buildFallback(reportType, gate.profile, period, gate.accessLevel),
      accessLevel: gate.accessLevel,
      source: 'fallback',
      degraded: true,
      llmError,
      disclaimer: '不构成投资、医疗或法律建议'
    });
  }

  const reportHtml = wrapReport(reportType, period, gate.accessLevel, mdToHtml(aiText));
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
    source: 'ai',
    disclaimer: '不构成投资、医疗或法律建议'
  });
}
