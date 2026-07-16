import { authorizeFortuneReportAccess, cleanText, escapeHtml, loadSavedProfile } from './_access.js';
import { getUserFromRequest, hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';
import { resolveUserLocale, normalizeLocale, t, LLM_LANGUAGE_RULE } from './_locale.js';

// 命理报告：调 LLM + 完整命盘，逐领域产出师傅级深度解读（不再是死模板）。
export const config = { maxDuration: 60 };

const FORTUNE_REPORT_TYPES = {
  // label 三语齐全：报告标题会直接显示给用户，只有中文就会让英文/繁体用户看到中文标题。
  full: { label: '全盘解读', labelHant: '全盤解讀', labelEn: 'Full Chart Reading', price: '¥29' },
  dayun: { label: '流年大运解读', labelHant: '流年大運解讀', labelEn: 'Luck Pillar Reading', price: '¥25' },
  month: { label: '每月运程', labelHant: '每月運程', labelEn: 'Monthly Timing Reading', price: '¥9.9' },
  wealth: { label: '偏财运 · 机会财专测', labelHant: '偏財運 · 機會財專測', labelEn: 'Windfall Wealth Reading', price: '¥19' },
  // 尊享线旗舰：基础会员不含（_access.js VIP_ONLY_FORTUNE_REPORTS），至尊VIP免费、他人单买。
  timing: { label: '八字投资择时全案', labelHant: '八字投資擇時全案', labelEn: 'Investment Timing Master Plan', price: '¥688' }
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

const SYSTEM_PROMPT = '你是一位有数十年经验的资深八字命理师，精通子平命理：格局、十神、藏干、旺衰、用神喜忌、调候、大运流年。你根据命主真实八字做深入、全面、逐项到位的解读，像面对面算命一样有条理、可执行。铁律：①每条结论都必须结合这张命盘的具体四柱、日主强弱、十神、五行、用神喜忌、大运来讲，要引用命盘里的实际干支和五行，绝不说放之四海皆准的空话；②要求覆盖的领域一个都不能少，篇幅要充分；③专业但通俗、条理清楚；④合规红线：财运只讲命理层面的财星/求财方式/破财风险/收入机会，绝不预测股市行情、不推荐任何具体投资标的、不承诺必然发生的收益或结果；健康只作命理提示并提醒就医、不替代医疗诊断；法律或极端风险请当事人找持牌专业人士；不承诺必然。';

const FORMAT_SPEC = '\n\n【输出格式】每一章用「## 章节标题」另起一行作标题；正文分段，段与段之间空一行；要点用「- 」开头。不要输出任何 HTML 标签，不要用 markdown 的 ** 加粗。';

const PROMPTS = {
  fullA: `这是【全盘命理解读 · 第一部分】。请像资深命理师当面批命一样，基于下面这个人的真实八字深入解读以下三个方面（命格总论、性格天赋、事业格局）。每一章都必须有、都要结合这张命盘的具体干支五行来讲、篇幅充分，不许泛泛而谈：

## 一、命格总论
定这张八字的格局与层次：日主是什么五行、在月令是否得令、整体旺衰（结合给出的强弱判断），用神/喜神/忌神是哪些五行、为什么这样取。给出这个命的整体气象、格局高低与一生大方向。

## 二、性格与天赋
由日主五行、十神组合、旺衰，剖析性格底色、思维与行为方式、优点与短板、潜在天赋与适合发挥的方向。

## 三、事业与格局
适合的行业与五行方向（结合喜用神）、宜打工还是宜自立、事业上的贵人与竞争关系、一生事业的高低起伏节奏、务实的发展策略。`,

  fullB: `这是【全盘命理解读 · 第二部分】。请像资深命理师当面批命一样，基于下面这个人的真实八字，把以下三个方面（财运、婚姻感情、健康）逐项讲深讲透，务必都要有、都结合命盘具体干支五行：

## 四、财运（务必详细）
分两条线讲：正财（稳定/正职收入）与偏财（机会财、投资投机性收益、意外之财）。看财星旺衰、日主能否担财（身强能担、身弱财多则看得到赚不到、反而易破财）；正财与偏财各自的强弱与求财方式。重点讲偏财：你偏财旺不旺、适不适合走机会财/投机性求财、哪些大运流年偏财被引动（偏财运相对活跃的窗口）、哪些年份偏财受制宜守。务必给理性与风险提示（偏财来去快、需克制、量力而行、不借贷不透支不沉迷）。只讲命理层面，不预测行情、不荐股、不承诺任何收益或中奖。

## 五、婚姻感情（务必详细）
配偶星（男看财星、女看官杀）的旺衰与位置；夫妻宫（日支）的状态与冲合刑害；桃花与异性缘；正缘的特征、以及容易出现或成婚的有利时机（落到大运流年）；婚姻的稳定度与要留意的地方；相处建议。

## 六、健康（务必详细）
从五行的太过与不及，看容易偏弱的脏腑与系统（木肝胆、火心小肠、土脾胃、金肺大肠、水肾膀胱）、体质倾向、要留意的季节与年份、冲刑对健康的影响、调养与生活建议。只作命理提示，务必叮嘱有不适请就医、不替代医疗诊断。`,

  fullC: `这是【全盘命理解读 · 第三部分】。请像资深命理师当面批命一样，基于下面这个人的真实八字深入解读以下三个方面（六亲缘分、大运流年与关键时间、趋吉避凶开运），都要有、都结合命盘具体干支五行：

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

只讲命理层面，不预测行情、不荐股、不承诺必然。`,

  wealth: `这是一份【偏财运 · 机会财专测】。请像资深命理师一样，专门针对这个人的偏财与机会财，基于其真实八字逐章深入解读、结合命盘具体干支五行、篇幅充分：

## 一、你的财星格局
先定日主强弱、财星（正财/偏财）在命盘中的旺衰与位置、日主能否担财；说明这个命整体偏「正财型（靠稳定/正职积累）」还是「偏财型（有机会财/投机性求财的潜质）」。

## 二、偏财与机会财潜质
重点看偏财：你偏财旺不旺、有没有偏财命、身能不能担偏财（身弱财多则看得到赚不到、反而易破财）；适不适合走机会财、投资投机性求财这条路，以及为什么。

## 三、偏财运的大运流年
结合当前大运与今年流年，讲你偏财运的高低起伏：哪些大运/年份偏财被引动、机会财相对活跃；哪些年份偏财受制、宜守不宜进。落到具体公历年份。

## 四、机会财活跃的时间窗
在偏财运活跃的阶段里，进一步指出相对更顺的流月/时段倾向（结合喜忌五行与财星引动），作为「什么时候偏财倾向较活跃」的参考。

## 五、风险与理性提示
偏财的特点是来得快去得快、波动大。请务必给出理性建议：量力而行、设好上限、切勿借贷或透支去博机会财、不可沉迷、更不能把偏财当稳定收入。

只讲命理层面的偏财倾向与时机参考，不预测任何具体结果、不承诺收益或中奖、不构成投资建议。`,

  /* 【八字投资择时全案】尊享线旗舰（一次性 ¥688）。与 full 同样拆 3 段并行生成：
     单段更短不会被 max_tokens 截断，并行墙钟≈单段。三段合起来是全站最深的一份报告。 */
  timingA: `这是一份【八字投资择时全案】的第 1/3 部分——本站最高规格的深度专案，读者已付费购买尊享服务，请拿出资深命理师压箱底的功力，逐章展开、篇幅充分、务必结合命盘里的具体干支五行讲透，不要泛泛而谈：

## 一、你的财富格局总纲
定日主强弱与格局；正财、偏财在命盘中的旺衰、位置、透干通根情况；日主能否担财。给出这个命的财富总定位：是靠正财稳健积累，还是有偏财/机会财的潜质，抑或需先补身再谈财。

## 二、你的用神喜忌与「财路」
明确用神、喜神、忌神，并把它们翻译成可用的择时语言：哪些五行/十神出现时你的财被引动、状态最好；哪些出现时最容易破财、冲动、判断失准。这是后面所有择时的底层依据，务必讲清原理。

## 三、你的行为风险画像
从命理角度讲清你在求财时最容易犯的错（如身弱财多易追高、比劫重易被劫财/合伙纠纷、伤官旺易冲动开仓、印重易犹豫错失等），并指出这些倾向在什么五行时段会被放大。`,

  timingB: `这是一份【八字投资择时全案】的第 2/3 部分（承接前文，直接从第四章开始，不要重复前面内容）。这是本报告最核心、读者最看重的部分，请务必详尽、落到具体年份月份：

## 四、未来三年逐年推演
以当前大运为背景，对未来三年（从今年起，逐年写出具体公历年份与流年干支）逐年深入推演：该年流年与命局的生克合冲、财星是否被引动、整体是进取年还是守成年、该年的主线机会与主要风险。每年都要单独成段、讲透。

## 五、逐月择时年历
这是本专案的招牌。请对未来三年，逐年列出「相对顺手的月份」与「需要提防的月份」（用公历月份，并说明对应的五行/十神理由）。要具体到月，形成一份可对照使用的择时年历。宁可讲清楚少数几个关键月，也不要含糊带过。`,

  timingC: `这是一份【八字投资择时全案】的第 3/3 部分（承接前文，直接从第六章开始，不要重复前面内容）：

## 六、关键时间窗口清单
把前面的推演收敛成一份「窗口清单」：列出未来三年里最值得把握的几个时间窗（年+月），以及最该收手观望的几个窗口，各自给出命理依据与该窗口的建议姿态（进取／标准／保守／观望）。

## 七、风险与纪律
针对这个命盘量身给出求财纪律：仓位与上限如何设、什么信号出现必须收手、如何对治第三章里那些行为弱点。务必强调：偏财/机会财来去快，量力而行、不借贷、不透支、不沉迷，不可把机会财当稳定收入。

## 八、给你的话
以资深命理师的口吻做一段有分量的总结与寄语，回到「命是底盘、运是节奏、人是变量」，鼓励其用纪律把好的时机兑现。

全篇只讲命理层面的倾向与时机参考：不预测具体点位或结果、不推荐任何标的、不承诺收益或中奖、不构成投资建议。`
};

/* 提示词本身是中文写的（命理术语用中文表达更精准），但输出语言由 locale 决定：
   把语言指令放在最后，是因为模型对末尾指令的遵循度最高。不带它 → 一律输出简体中文，
   英文/繁体用户会拿到中文报告（曾真实发生）。 */
function buildUserPrompt(type, profile, targetPeriod, locale) {
  const base = PROMPTS[type] || PROMPTS.fullA;
  const period = cleanText(targetPeriod);
  const periodLine = type === 'month' && period ? `\n\n【目标月份】${period}` : '';
  const lang = LLM_LANGUAGE_RULE[normalizeLocale(locale)] || LLM_LANGUAGE_RULE.zh;
  return `${base}${FORMAT_SPEC}\n\n以下是这个人的真实命盘，请严格据此解读：\n${buildChartText(profile)}${periodLine}\n\n【输出语言 · 最高优先级】${lang}`;
}

async function callLlm(userPrompt, maxTokens, locale) {
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
          // 语言指令同时放系统提示与用户提示末尾：双保险，避免长上下文里被稀释。
          { role: 'system', content: SYSTEM_PROMPT + '\n' + (LLM_LANGUAGE_RULE[normalizeLocale(locale)] || LLM_LANGUAGE_RULE.zh) },
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

// 报告标题按 locale 取三语商品名；缺失时退回中文名（绝不留空）。
function productLabelFor(type, locale) {
  const p = FORTUNE_REPORT_TYPES[type] || FORTUNE_REPORT_TYPES.full;
  const loc = normalizeLocale(locale);
  return (loc === 'en' ? p.labelEn : loc === 'zh-Hant' ? p.labelHant : p.label) || p.label;
}

function wrapReport(type, period, accessLevel, bodyHtml, locale) {
  return [
    '<div class="report-generated fortune-generated">',
    `<h2>${escapeHtml(productLabelFor(type, locale))} · ${escapeHtml(t(locale, 'report_detail_suffix'))}</h2>`,
    `<span class="report-badge">${escapeHtml(period)}</span>`,
    `<span class="report-badge">${escapeHtml(t(locale, accessLevel === 'membership' ? 'report_badge_member' : 'report_badge_unlocked'))}</span>`,
    `<span class="report-badge">${escapeHtml(t(locale, 'report_badge_chart'))}</span>`,
    bodyHtml,
    `<div class="report-warning">${escapeHtml(t(locale, 'report_disclaimer'))}</div>`,
    '</div>'
  ].join('');
}

// —— LLM 未配置/失败时的兜底：结构完整但简版，并提示可刷新重试（不入库缓存）。
// 命盘摘要（四柱/日主）本身是命理数据，三语通用，只翻译包裹它的说明文字。
function chartSummaryLine(profile) {
  const p = profile && profile.pillarsStr ? profile.pillarsStr : {};
  return `${profile?.dayStem || '-'}${profile?.dayElement || ''} · ${profile?.strength?.category || '-'} · ${p.year || '-'}·${p.month || '-'}·${p.day || '-'}·${p.hour || '-'}`;
}

function buildFallback(type, profile, period, accessLevel, locale) {
  const body = [
    `<p>${escapeHtml(chartSummaryLine(profile))}</p>`,
    `<p>${escapeHtml(t(locale, 'report_fallback_generating'))}</p>`
  ].join('');
  return wrapReport(type, period, accessLevel, body, locale);
}

function buildFortunePreview(type, profile, targetPeriod, locale) {
  const period = cleanText(targetPeriod) || t(locale, type === 'month' ? 'period_this_month' : 'period_current');
  const summary = profile ? chartSummaryLine(profile) : t(locale, 'preview_no_chart');
  return [
    '<div class="report-generated fortune-generated">',
    `<h2>${escapeHtml(productLabelFor(type, locale))} · ${escapeHtml(t(locale, 'preview_suffix'))}</h2>`,
    `<span class="report-badge">${escapeHtml(period)}</span>`,
    `<span class="report-badge">${escapeHtml(t(locale, 'preview_badge'))}</span>`,
    `<p>${escapeHtml(summary)} ${escapeHtml(t(locale, 'preview_intro'))}</p>`,
    `<h3>${escapeHtml(t(locale, 'preview_includes_title'))}</h3>`,
    `<ul>${t(locale, 'preview_includes_list')}</ul>`,
    `<div class="report-warning">${escapeHtml(t(locale, 'preview_warning'))}</div>`,
    '</div>'
  ].join('');
}

// v2：升级为 LLM 深度报告后换 key，让旧的浅版缓存自然失效、下次查看即重新生成；
// 同时把目标月份纳入 key（此前 month 各月共用一个 key、会互相覆盖）。
/* 缓存键必须包含 locale：报告正文是按语言生成的，若不隔离，英文用户会命中别人缓存的
   中文报告（反之亦然），而且用户切换语言后永远拿不到新语言的版本。v3 = 加入 locale 后的新代次，
   顺带让此前生成的所有单语缓存自然失效。 */
function reportKey(type, targetPeriod, locale) {
  const p = cleanText(targetPeriod).replace(/\s+/g, '-') || 'default';
  return `${type}:${p}:${normalizeLocale(locale)}:v3`;
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
    const pvLocale = await resolveUserLocale(req, null);
    return send(res, 200, {
      reportType,
      title: productLabelFor(reportType, pvLocale),
      reportHtml: buildFortunePreview(reportType, profile, body.targetPeriod, pvLocale),
      locale: pvLocale,
      accessLevel: 'preview',
      mode,
      disclaimer: t(locale, 'report_disclaimer')
    });
  }

  const gate = await authorizeFortuneReportAccess(req, reportType, mode);
  if (!gate.ok) return send(res, gate.status, gate.body);

  // 用户注册时选的语言（gate 已按 account_profiles.locale 解析），全程以它为准。
  const locale = gate.locale || (await resolveUserLocale(req, gate.user && gate.user.id));
  const period = cleanText(body.targetPeriod) || (reportType === 'month' ? '本月' : '当前周期');
  const key = reportKey(reportType, body.targetPeriod, locale);
  const existing = await supabaseSelect('fortune_reports', `user_id=eq.${encodeURIComponent(gate.user.id)}&report_key=eq.${encodeURIComponent(key)}&access_level=in.(paid,membership)&select=report_type,title,report_html,access_level,updated_at&limit=1`);
  if (existing.length && existing[0].report_html && !body.forceRefresh) {
    return send(res, 200, {
      reportType,
      title: existing[0].title,
      reportHtml: existing[0].report_html,
      accessLevel: existing[0].access_level,
      source: 'fortune_reports',
      disclaimer: t(locale, 'report_disclaimer')
    });
  }

  // 调 AI 命理师生成深度报告。全盘拆成上/下两半并行生成（各更短更快，避免单次超时），再拼接。
  // 失败/未配置则返回兜底（不入库，允许刷新重试）。
  let aiText = '';
  let llmError = '';
  if (llmConfigured()) {
    try {
      if (reportType === 'full' || reportType === 'timing') {
        // 拆 3 段并行生成：单段更短不会被 max_tokens 截断，并行墙钟≈单段，覆盖全部章节。
        // timing 是尊享旗舰（¥688），给更大的 token 预算以撑起"五千字级"的深度。
        const parts = reportType === 'timing' ? ['timingA', 'timingB', 'timingC'] : ['fullA', 'fullB', 'fullC'];
        const mtPart = reportType === 'timing' ? 3600 : 2800;
        const [a, b, c] = await Promise.all(parts.map((p) => callLlm(buildUserPrompt(p, gate.profile, body.targetPeriod, locale), mtPart, locale)));
        aiText = [a.text, b.text, c.text].filter(Boolean).join('\n\n');
        llmError = a.error || b.error || c.error || '';
      } else {
        const mt = reportType === 'month' ? 1600 : (reportType === 'wealth' ? 2800 : 2000);
        const llm = await callLlm(buildUserPrompt(reportType, gate.profile, body.targetPeriod, locale), mt, locale);
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
      title: productLabelFor(reportType, locale),
      reportHtml: buildFallback(reportType, gate.profile, period, gate.accessLevel, locale),
      accessLevel: gate.accessLevel,
      source: 'fallback',
      degraded: true,
      llmError,
      disclaimer: t(locale, 'report_disclaimer')
    });
  }

  const reportHtml = wrapReport(reportType, period, gate.accessLevel, mdToHtml(aiText), locale);
  await supabaseInsert('fortune_reports', {
    user_id: gate.user.id,
    report_key: key,
    report_type: reportType,
    target_period: cleanText(body.targetPeriod),
    title: productLabelFor(reportType, locale),
    context: body.context || {},
    report_html: reportHtml,
    access_level: gate.accessLevel
  }, { upsert: true, onConflict: 'user_id,report_key' });
  return send(res, 200, {
    reportType,
    title: productLabelFor(reportType, locale),
    reportHtml,
    accessLevel: gate.accessLevel,
    source: 'ai',
    disclaimer: t(locale, 'report_disclaimer')
  });
}
