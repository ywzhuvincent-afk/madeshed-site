// 语言唯一真源。规则：任何"用户会看到的文字"都必须经过这里，不得在业务代码里写死中文。
//
// 为什么放服务端：用户注册时选的语言存在 account_profiles.locale，是账号的持久属性。
// 邮件、异步生成的 AI 报告这些场景根本没有前端参与，只有服务端知道该用哪种语言——
// 所以语言解析和文案都必须由服务端负责，前端传来的 locale 只是"本次请求的提示"。
//
// 新增文案时：往 MESSAGES 里加一个 key，三种语言必须齐全。
// 缺任何一种语言、或在业务代码里写死中文 message，tests/i18n-checks.mjs 会直接报红。
//
// 注意：api/ 下非下划线文件已达 Vercel 的 12 个函数上限，本文件必须保持 `_` 前缀（共享库不计数）。

import { supabaseSelect, hasSupabaseService } from './_supabase.js';

export const LOCALES = ['zh', 'zh-Hant', 'en'];
export const DEFAULT_LOCALE = 'zh';

// 归一化到三种受支持语言。与 _email.js 的 normalizeEmailLocale 同口径（那边直接复用本函数）。
export function normalizeLocale(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.indexOf('en') === 0) return 'en';
  if (s.indexOf('hant') >= 0 || s.indexOf('-tw') >= 0 || s.indexOf('-hk') >= 0 || s.indexOf('-mo') >= 0) return 'zh-Hant';
  return 'zh';
}

/* 用户语言的真源顺序：
   1) account_profiles.locale —— 注册时写入、之后跟随账号（用户明确改过语言才会变）
   2) 本次请求带的 body.locale —— 仅当账号上还没有记录时使用（如注册前的匿名请求）
   3) 'zh'
   刻意让"账号上存的语言"优先于"请求里带的"：这样邮件/异步报告等没有前端的场景，
   与用户在站上看到的语言始终一致。 */
export async function resolveUserLocale(req, userId) {
  const fromBody = req && req.body && req.body.locale ? normalizeLocale(req.body.locale) : null;
  if (userId && hasSupabaseService()) {
    try {
      const rows = await supabaseSelect('account_profiles', `user_id=eq.${encodeURIComponent(userId)}&select=locale&limit=1`);
      const stored = rows && rows[0] && rows[0].locale;
      if (stored) return normalizeLocale(stored);
    } catch (e) { /* 查不到就退回请求里的语言，绝不因此让业务失败 */ }
  }
  return fromBody || DEFAULT_LOCALE;
}

// AI 生成内容的输出语言指令。报告/问大师必须带上，否则模型默认输出简体中文。
export const LLM_LANGUAGE_RULE = {
  zh: '全文使用简体中文输出。',
  'zh-Hant': '全文使用繁體中文（台灣/香港用語習慣）輸出，不得使用簡體字。',
  en: 'Write the ENTIRE response in natural, fluent English. Do NOT use any Chinese characters, except that BaZi pillars/stems/branches (e.g. 甲子) may appear followed by an English gloss on first use. Translate all BaZi terminology into English (Day Master, favorable elements, Luck Pillar, Wealth Star, etc.).'
};

export const MESSAGES = {
  // —— 账号 / 鉴权 ——
  login_required: {
    zh: '请先登录。',
    'zh-Hant': '請先登入。',
    en: 'Please sign in first.'
  },
  master_login_required: {
    zh: '请先登录后再使用问大师。',
    'zh-Hant': '請先登入後再使用問大師。',
    en: 'Please sign in before using Ask Master.'
  },
  supabase_not_configured: {
    zh: '云端账号系统暂未配置。',
    'zh-Hant': '雲端帳號系統暫未設定。',
    en: 'The cloud account service is not configured yet.'
  },
  account_cloud_not_configured: {
    zh: '账号系统暂未连接云端。',
    'zh-Hant': '帳號系統暫未連接雲端。',
    en: 'The account service is not connected to the cloud yet.'
  },
  membership_cloud_not_configured: {
    zh: '会员账号系统暂未连接云端。',
    'zh-Hant': '會員帳號系統暫未連接雲端。',
    en: 'The membership account service is not connected to the cloud yet.'
  },
  legal_acceptance_required: {
    zh: '请先阅读并接受服务条款、隐私政策、风险免责声明和会员扣费条款。',
    'zh-Hant': '請先閱讀並接受服務條款、隱私政策、風險免責聲明與會員扣費條款。',
    en: 'Please read and accept the Terms of Service, Privacy Policy, Risk Disclaimer, and Billing Terms first.'
  },
  legal_docs_required: {
    zh: '请选择需要确认的法律文件。',
    'zh-Hant': '請選擇需要確認的法律文件。',
    en: 'Please select which legal documents to accept.'
  },
  invalid_type: {
    zh: 'type 无效。',
    'zh-Hant': 'type 無效。',
    en: 'Invalid type.'
  },
  invalid_account_action: {
    zh: '账号接口 action 无效。',
    'zh-Hant': '帳號介面 action 無效。',
    en: 'Invalid account action.'
  },

  // —— 报告权益 / 付费闸门 ——
  trade_report_paywall: {
    zh: '这份完整报告需要单次购买，或开通高级会员后生成。',
    'zh-Hant': '這份完整報告需要單次購買，或開通高級會員後生成。',
    en: 'This full report requires a one-time purchase, or an Ultimate membership.'
  },
  vip_required_for_other_person: {
    zh: '为家人或朋友生成报告是至尊VIP专属功能。开通至尊VIP后即可添加他人命盘。',
    'zh-Hant': '為家人或朋友生成報告是至尊VIP專屬功能。開通至尊VIP後即可添加他人命盤。',
    en: 'Generating readings for family or friends is a VIP-only feature. Upgrade to VIP to add other people.'
  },
  invalid_person_profile: {
    zh: '这个人的命盘信息不完整，请重新填写出生日期和时辰。',
    'zh-Hant': '這個人的命盤資訊不完整，請重新填寫出生日期和時辰。',
    en: 'This person’s chart data is incomplete. Please re-enter their birth date and time.'
  },
  fortune_report_paywall: {
    zh: '这份完整命理报告需要单次购买，或开通高级会员后生成。',
    'zh-Hant': '這份完整命理報告需要單次購買，或開通高級會員後生成。',
    en: 'This full BaZi reading requires a one-time purchase, or an Ultimate membership.'
  },
  saved_profile_required: {
    zh: '请先登录并保存八字命盘；完整报告必须使用账号里的统一命盘生成。',
    'zh-Hant': '請先登入並儲存八字命盤；完整報告必須使用帳號裡的統一命盤生成。',
    en: 'Please sign in and save your BaZi chart first — full reports are generated from the single chart saved on your account.'
  },
  profile_required: {
    zh: '请先生成并保存八字命盘。',
    'zh-Hant': '請先生成並儲存八字命盤。',
    en: 'Please generate and save your BaZi chart first.'
  },
  insufficient_cloud_records: {
    zh: '云端真实记录不足，完整报告不能使用示例数据生成。请先记录并同步更多交易结果。',
    'zh-Hant': '雲端真實記錄不足，完整報告不能使用範例資料生成。請先記錄並同步更多交易結果。',
    en: 'Not enough synced records yet. Full reports are never generated from sample data — please log and sync more real trading results first.'
  },

  // —— 问大师 / 点数 ——
  credits_ledger_not_configured: {
    zh: '云端点数账本暂未配置，本次不消耗点数。',
    'zh-Hant': '雲端點數帳本暫未設定，本次不消耗點數。',
    en: 'The cloud credit ledger is not configured yet. No credits were used.'
  },
  insufficient_credits: {
    zh: '点数余额不足，本次需要 {n} 点。',
    'zh-Hant': '點數餘額不足，本次需要 {n} 點。',
    en: 'Not enough credits — this request needs {n}.'
  },
  llm_not_configured: {
    zh: 'AI 服务暂未配置，本次不消耗点数。',
    'zh-Hant': 'AI 服務暫未設定，本次不消耗點數。',
    en: 'The AI service is not configured yet. No credits were used.'
  },
  master_history_placeholder: {
    zh: '云端历史接口已预留；前端会先显示本机历史记录。',
    'zh-Hant': '雲端歷史介面已預留；前端會先顯示本機歷史記錄。',
    en: 'Cloud history is reserved for later; your local history is shown for now.'
  },

  // —— 结账 / 支付 ——
  login_before_purchase: {
    zh: '请先登录后再购买。',
    'zh-Hant': '請先登入後再購買。',
    en: 'Please sign in before purchasing.'
  },
  login_before_membership: {
    zh: '请先登录后再开通会员。',
    'zh-Hant': '請先登入後再開通會員。',
    en: 'Please sign in before starting a membership.'
  },
  stripe_not_configured: {
    zh: '支付暂未配置 Stripe，当前不会扣费。',
    'zh-Hant': '支付暫未設定 Stripe，目前不會扣費。',
    en: 'Payments are not configured yet — you were not charged.'
  },
  checkout_session_failed: {
    zh: '支付页面创建失败，请稍后再试；当前不会扣费。',
    'zh-Hant': '支付頁面建立失敗，請稍後再試；目前不會扣費。',
    en: 'Could not open the payment page. Please try again — you were not charged.'
  },
  invalid_report_type: {
    zh: '报告类型无效。',
    'zh-Hant': '報告類型無效。',
    en: 'Invalid report type.'
  },
  no_subscription_to_manage: {
    zh: '当前账号还没有可管理的 Stripe 会员订阅。',
    'zh-Hant': '目前帳號還沒有可管理的 Stripe 會員訂閱。',
    en: 'This account has no Stripe subscription to manage yet.'
  },
  portal_stripe_not_configured: {
    zh: 'Stripe 暂未配置，不能打开会员管理页面。',
    'zh-Hant': 'Stripe 暫未設定，無法開啟會員管理頁面。',
    en: 'Stripe is not configured, so the billing portal cannot be opened.'
  },
  invalid_checkout_action: {
    zh: '付款接口 action 无效。',
    'zh-Hant': '付款介面 action 無效。',
    en: 'Invalid checkout action.'
  },
  checkout_error: {
    zh: '购买接口出错，当前不会扣费。',
    'zh-Hant': '購買介面發生錯誤，目前不會扣費。',
    en: 'The checkout service hit an error — you were not charged.'
  },
  already_member: {
    zh: '你已经是会员，无需重复开通。请用「管理会员/账单」查看或调整订阅——本次未创建新的订阅、未扣费。',
    'zh-Hant': '你已經是會員，無需重複開通。請用「管理會員/帳單」檢視或調整訂閱——本次未建立新的訂閱、未扣費。',
    en: 'You already have an active membership. Use "Manage Billing" to view or change it — no second subscription was created and you were not charged.'
  },
  // —— 报告外壳（标题后缀 / 徽章 / 免责声明 / 兜底 / 预览）——
  report_detail_suffix: {
    zh: '命理详细版', 'zh-Hant': '命理詳細版', en: 'Detailed Reading'
  },
  report_badge_member: {
    zh: '高级会员', 'zh-Hant': '高級會員', en: 'Ultimate'
  },
  report_badge_unlocked: {
    zh: '已解锁', 'zh-Hant': '已解鎖', en: 'Unlocked'
  },
  report_badge_chart: {
    zh: '基于账号统一八字命盘', 'zh-Hant': '基於帳號統一八字命盤', en: 'From your saved BaZi chart'
  },
  report_disclaimer: {
    zh: '本内容为传统命理参考与自我规划，不构成投资、医疗或法律建议；财运只讨论命理层面的机会与风险，不预测行情、不推荐标的；涉及疾病、法律纠纷或极端风险请寻求持牌专业人士帮助。',
    'zh-Hant': '本內容為傳統命理參考與自我規劃，不構成投資、醫療或法律建議；財運只討論命理層面的機會與風險，不預測行情、不推薦標的；涉及疾病、法律糾紛或極端風險請尋求持牌專業人士協助。',
    en: 'This is traditional BaZi guidance for self-reflection and planning. It is not investment, medical, or legal advice. Wealth sections discuss opportunity and risk at the BaZi level only — no market forecasts, no security recommendations. For illness, legal disputes, or extreme risk, please consult a licensed professional.'
  },
  report_fallback_generating: {
    zh: '完整深度解读正在生成，请稍后回到本页点击「生成报告」刷新重试。若持续无法生成，请联系 support@madeshed.com。',
    'zh-Hant': '完整深度解讀正在生成，請稍後回到本頁點擊「生成報告」重新整理重試。若持續無法生成，請聯絡 support@madeshed.com。',
    en: 'Your full in-depth reading is still being generated. Please come back to this page and click "Generate Report" to retry. If it keeps failing, contact support@madeshed.com.'
  },
  preview_suffix: {
    zh: '结构预览', 'zh-Hant': '結構預覽', en: 'Structure Preview'
  },
  preview_badge: {
    zh: '预览版', 'zh-Hant': '預覽版', en: 'Preview'
  },
  preview_no_chart: {
    zh: '尚未提供命盘', 'zh-Hant': '尚未提供命盤', en: 'No chart provided yet'
  },
  preview_intro: {
    zh: '完整报告会读取账号里的统一命盘，校验会员/购买权益后由 AI 命理师逐项深入生成。',
    'zh-Hant': '完整報告會讀取帳號裡的統一命盤，驗證會員/購買權益後由 AI 命理師逐項深入生成。',
    en: 'The full report reads the chart saved on your account, verifies your membership or purchase, then generates a section-by-section in-depth reading.'
  },
  preview_includes_title: {
    zh: '完整报告包含', 'zh-Hant': '完整報告包含', en: 'The full report covers'
  },
  preview_includes_list: {
    zh: '<li>命格总论、格局层次、用神喜忌。</li><li>性格天赋、事业方向、财运（正偏财/求财/破财/财旺时机）。</li><li>婚姻感情（配偶星、夫妻宫、正缘时机）、健康（五行脏腑）、六亲缘分。</li><li>当前大运、今年流年、未来节奏与关键时间窗口。</li><li>趋吉避凶与开运建议。</li>',
    'zh-Hant': '<li>命格總論、格局層次、用神喜忌。</li><li>性格天賦、事業方向、財運（正偏財/求財/破財/財旺時機）。</li><li>婚姻感情（配偶星、夫妻宮、正緣時機）、健康（五行臟腑）、六親緣分。</li><li>當前大運、今年流年、未來節奏與關鍵時間窗口。</li><li>趨吉避凶與開運建議。</li>',
    en: '<li>Overall chart structure, pattern level, favorable and unfavorable elements.</li><li>Character and talents, career direction, wealth (direct/indirect wealth, earning, loss, peak-wealth timing).</li><li>Relationships (spouse star, spouse palace, timing of committed partnership), health (Five Elements and organs), family affinity.</li><li>Current Luck Pillar, this year, upcoming rhythm and key time windows.</li><li>How to lean into good timing and manage the bad.</li>'
  },
  preview_warning: {
    zh: '预览不返回完整正文；解锁后由 AI 命理师生成逐项深度解读。',
    'zh-Hant': '預覽不返回完整正文；解鎖後由 AI 命理師生成逐項深度解讀。',
    en: 'The preview does not include the full text. Once unlocked, an AI BaZi master generates the complete section-by-section reading.'
  },
  // —— 交易复盘报告外壳 ——
  trade_detail_suffix: {
    zh: '深度复盘版', 'zh-Hant': '深度複盤版', en: 'Deep Review'
  },
  trade_period_to: {
    zh: '至', 'zh-Hant': '至', en: 'to'
  },
  trade_winrate: {
    zh: '胜率 {v}', 'zh-Hant': '勝率 {v}', en: 'Win rate {v}'
  },
  trade_disclaimer: {
    zh: '报告用于交易纪律与命理参考，不构成投资建议，不预测行情、不推荐标的。',
    'zh-Hant': '報告用於交易紀律與命理參考，不構成投資建議，不預測行情、不推薦標的。',
    en: 'This report is for trading discipline and BaZi reference only. It is not investment advice, does not forecast markets, and recommends no securities.'
  },
  trade_fallback_generating: {
    zh: '命理×行为的完整深度复盘正在生成，请稍后回到本页点击「生成报告」刷新重试。若持续无法生成，请联系 support@madeshed.com。',
    'zh-Hant': '命理×行為的完整深度複盤正在生成，請稍後回到本頁點擊「生成報告」重新整理重試。若持續無法生成，請聯絡 support@madeshed.com。',
    en: 'Your full BaZi-by-behaviour review is still being generated. Please come back and click "Generate Report" to retry. If it keeps failing, contact support@madeshed.com.'
  },
  trade_stats_heading: {
    zh: '一、统计结论', 'zh-Hant': '一、統計結論', en: '1. Statistics'
  },
  trade_chart_heading: {
    zh: '二、命盘', 'zh-Hant': '二、命盤', en: '2. Your chart'
  },
  trade_note_heading: {
    zh: '三、说明', 'zh-Hant': '三、說明', en: '3. Note'
  },
  trade_stats_line: {
    zh: '本周期共记录 {total} 天，实际交易 {traded} 次。',
    'zh-Hant': '本週期共記錄 {total} 天，實際交易 {traded} 次。',
    en: 'This period logged {total} days with {traded} trades.'
  },
  trade_preview_note: {
    zh: '完整报告需要登录、已购买本报告或拥有高级会员，并从云端真实记录生成。',
    'zh-Hant': '完整報告需要登入、已購買本報告或擁有高級會員，並從雲端真實記錄生成。',
    en: 'The full report requires sign-in plus a purchase or Ultimate membership, and is generated from your real synced records.'
  },
  trade_preview_list: {
    zh: '<li>战绩综述：交易样本、胜率、大赚/大亏分布。</li><li>命理×行为印证：财星、日主强弱与实际盈亏的对照。</li><li>风险模式：连亏后加码、忌神日追单等行为识别。</li><li>下一阶段纪律建议。</li>',
    'zh-Hant': '<li>戰績綜述：交易樣本、勝率、大賺/大虧分布。</li><li>命理×行為印證：財星、日主強弱與實際盈虧的對照。</li><li>風險模式：連虧後加碼、忌神日追單等行為識別。</li><li>下一階段紀律建議。</li>',
    en: '<li>Performance summary: trade sample, win rate, big-win/big-loss distribution.</li><li>BaZi vs behaviour: wealth star and Day Master strength checked against your real P&L.</li><li>Risk patterns: adding size after losses, chasing on unfavorable days.</li><li>Discipline plan for the next period.</li>'
  },
  trade_preview_warning: {
    zh: '预览不返回完整付费正文。', 'zh-Hant': '預覽不返回完整付費正文。', en: 'The preview does not include the full paid report.'
  },

  period_this_month: {
    zh: '本月', 'zh-Hant': '本月', en: 'This month'
  },
  period_current: {
    zh: '当前周期', 'zh-Hant': '當前週期', en: 'Current cycle'
  },

  already_member_upgrade: {
    zh: '你已有生效中的会员订阅。要更换档位请点「管理会员/账单」在订阅里切换，Stripe 会自动按比例计费——本次未创建新订阅、未扣费。',
    'zh-Hant': '你已有生效中的會員訂閱。要更換檔位請點「管理會員/帳單」在訂閱裡切換，Stripe 會自動按比例計費——本次未建立新訂閱、未扣費。',
    en: 'You already have an active membership. To switch plans, open "Manage Billing" and change your subscription there — Stripe will prorate it. No second subscription was created and you were not charged.'
  }
};

/* 取文案。vars 用于 {n} 这类占位符替换。
   找不到 key 时故意抛错——宁可在开发/测试期炸掉，也不要悄悄把中文漏给英文用户。 */
export function t(locale, key, vars) {
  const row = MESSAGES[key];
  if (!row) throw new Error(`i18n: unknown message key "${key}"`);
  const loc = normalizeLocale(locale);
  let s = row[loc] || row[DEFAULT_LOCALE];
  if (vars) {
    Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(String(vars[k])); });
  }
  return s;
}
