// api/_email.js —— 统一交易邮件层（唯一发信实现）。
// 一切客户/店主邮件走 Resend REST API。未配置 RESEND_API_KEY 时全部安全空转：
// 不发信、不报错、不抛异常，因此把它接进 webhook/checkout/account 绝不会因发信失败而 500 或漏履约。
// 设计铁律：本文件所有导出都自我兜底，永远 return（成功/skipped/error 对象），永远不 throw。
import { cleanEnv } from './_stripe.js';

const RESEND_API_KEY = cleanEnv(process.env.RESEND_API_KEY);
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const EMAIL_FROM = cleanEnv(process.env.EMAIL_FROM) || 'Madeshed <noreply@madeshed.com>';
const OWNER_NOTIFY_EMAIL = cleanEnv(process.env.OWNER_NOTIFY_EMAIL) || 'zhuvincent@hotmail.com';
const SUPPORT_EMAIL = cleanEnv(process.env.SUPPORT_EMAIL) || 'support@madeshed.com';
const SITE_URL = (cleanEnv(process.env.PUBLIC_SITE_URL) || 'https://madeshed.com').replace(/\/+$/, '');
const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL) || 'https://tkltasrbhjqwurybcyxo.supabase.co';
const SERVICE_ROLE_KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function emailEnabled() {
  return Boolean(RESEND_API_KEY);
}

// 站点三语 -> 邮件三语（en / zh-Hant / zh）。宽松匹配：繁体各地区码、hant 都归 zh-Hant。
export function normalizeEmailLocale(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.indexOf('en') === 0) return 'en';
  if (s.indexOf('hant') >= 0 || s.indexOf('-tw') >= 0 || s.indexOf('-hk') >= 0 || s.indexOf('-mo') >= 0 || s === 'zh-tw' || s === 'zh-hk') return 'zh-Hant';
  return 'zh';
}

function T(locale, m) {
  if (locale === 'en') return m.en;
  if (locale === 'zh-Hant') return m.hant || m.zh;
  return m.zh;
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// —— 商品展示名（报告就绪 / 退款邮件共用），三语。
export function productLabel(locale, { product, reportType, fortuneType } = {}) {
  if (product === 'credit_pack') return T(locale, { zh: '问大师 10 点包', hant: '問大師 10 點包', en: 'Ask Master 10-Credit Pack' });
  if (product === 'membership') return T(locale, { zh: '最高级会员', hant: '最高級會員', en: 'Ultimate Membership' });
  if (product === 'report') {
    const map = {
      '7': { zh: '交易复盘报告（近 7 天）', hant: '交易復盤報告（近 7 天）', en: 'Trading Review Report (7 days)' },
      '30': { zh: '月度交易复盘报告', hant: '月度交易復盤報告', en: 'Monthly Trading Review Report' },
      '365': { zh: '年度交易复盘报告', hant: '年度交易復盤報告', en: 'Yearly Trading Review Report' },
      all: { zh: '全部历史交易报告', hant: '全部歷史交易報告', en: 'Full-History Trading Report' }
    };
    return T(locale, map[String(reportType)] || map['30']);
  }
  if (product === 'fortune_report') {
    const map = {
      full: { zh: '八字全盘解读', hant: '八字全盤解讀', en: 'Full BaZi Chart Reading' },
      dayun: { zh: '流年大运解读', hant: '流年大運解讀', en: 'Luck Pillar Reading' },
      month: { zh: '每月运程报告', hant: '每月運程報告', en: 'Monthly Timing Reading' }
    };
    return T(locale, map[String(fortuneType)] || map.full);
  }
  return T(locale, { zh: '你的订单', hant: '你的訂單', en: 'your order' });
}

// —— HTML 外壳（内联样式，邮件客户端安全、移动端自适应、浅色底）。
function layout(locale, o) {
  const heading = esc(o.heading);
  const intro = esc(o.intro || '');
  const bullets = (o.bullets || []).filter(Boolean).map((b) =>
    `<tr><td style="padding:5px 0;font-size:14px;line-height:1.6;color:#334155"><span style="color:#64748b">${esc(b.label)}</span>&nbsp;&nbsp;<b style="color:#0f172a">${esc(b.value)}</b></td></tr>`
  ).join('');
  const bulletsBlock = bullets ? `<tr><td style="padding:6px 0"><table role="presentation" width="100%" style="border-collapse:collapse;background:#f8fafc;border-radius:8px;padding:6px 14px">${bullets}</table></td></tr>` : '';
  const cta = (o.ctaText && o.ctaHref)
    ? `<tr><td style="padding:14px 0 4px"><a href="${esc(o.ctaHref)}" style="display:inline-block;background:#8b1e1e;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;font-size:15px">${esc(o.ctaText)}</a></td></tr>`
    : '';
  const note = o.footnote ? `<tr><td style="padding:12px 0 0;font-size:12px;line-height:1.6;color:#94a3b8">${esc(o.footnote)}</td></tr>` : '';
  const footerTxt = T(locale, {
    zh: '这是一封来自 Madeshed 的交易通知邮件。如有疑问请回复本邮件或联系 ',
    hant: '這是一封來自 Madeshed 的交易通知郵件。如有疑問請回覆本郵件或聯絡 ',
    en: 'This is a transactional email from Madeshed. Questions? Reply to this email or contact '
  });
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f7">
<table role="presentation" width="100%" style="border-collapse:collapse;background:#eef2f7">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;border-collapse:collapse;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,.08)">
<tr><td style="background:#0f172a;padding:18px 28px"><span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.5px">Madeshed</span></td></tr>
<tr><td style="padding:26px 28px 22px">
<table role="presentation" width="100%" style="border-collapse:collapse">
<tr><td style="font-size:19px;font-weight:700;color:#0f172a;padding-bottom:8px">${heading}</td></tr>
${intro ? `<tr><td style="font-size:14px;line-height:1.7;color:#475569;padding-bottom:4px">${intro}</td></tr>` : ''}
${bulletsBlock}
${cta}
${note}
</table>
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #eef2f7;font-size:12px;line-height:1.6;color:#94a3b8">${footerTxt}<a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:#8b1e1e">${esc(SUPPORT_EMAIL)}</a>.<br><a href="${esc(SITE_URL)}" style="color:#94a3b8">${esc(SITE_URL.replace(/^https?:\/\//, ''))}</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// fetch + 超时：任何一个上游（Resend / Supabase Admin）卡住都不能拖垮支付关键的 webhook。
// 超时会 abort -> fetch reject -> 被各自的 try/catch 吞掉，接口照常尽快返回 200。
async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 5000);
  try {
    return await fetch(url, { ...(options || {}), signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// —— 底层发信：POST Resend。无 key / 无收件人 -> skipped。任何异常都吞掉并返回。
export async function sendEmail({ to, subject, html, replyTo } = {}) {
  try {
    if (!RESEND_API_KEY) return { skipped: 'no_api_key' };
    if (!to) return { skipped: 'no_recipient' };
    const resp = await fetchWithTimeout(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: Array.isArray(to) ? to : [to], subject: subject || '(no subject)', html: html || '', reply_to: replyTo || SUPPORT_EMAIL })
    }, 5000);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, status: resp.status, error: (data && (data.message || data.name)) || 'resend_error' };
    return { ok: true, id: data && data.id };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error).slice(0, 200) };
  }
}

// —— 店主通知（中文，发到 OWNER_NOTIFY_EMAIL）。lines: [{label,value}]。
export async function notifyOwner({ subject, lines } = {}) {
  try {
    const rows = (lines || []).filter(Boolean).map((l) =>
      `<tr><td style="padding:5px 0;font-size:14px;line-height:1.6;color:#334155"><span style="color:#64748b">${esc(l.label)}</span>&nbsp;&nbsp;<b style="color:#0f172a">${esc(l.value)}</b></td></tr>`
    ).join('');
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f7"><table role="presentation" width="100%" style="border-collapse:collapse;background:#eef2f7"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:520px;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="background:#0f172a;padding:16px 24px"><span style="color:#fff;font-weight:700">Madeshed 后台通知</span></td></tr><tr><td style="padding:22px 24px"><div style="font-size:17px;font-weight:700;color:#0f172a;padding-bottom:10px">${esc(subject)}</div><table role="presentation" width="100%" style="border-collapse:collapse;background:#f8fafc;border-radius:8px;padding:6px 14px">${rows}</table><div style="padding-top:14px"><a href="${esc(SITE_URL)}/admin.html" style="display:inline-block;background:#8b1e1e;color:#fff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:8px;font-size:14px">打开后台</a></div></td></tr></table></td></tr></table></body></html>`;
    return await sendEmail({ to: OWNER_NOTIFY_EMAIL, subject: `[Madeshed] ${subject}`, html });
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error).slice(0, 200) };
  }
}

// —— 按 user_id 查邮箱（Supabase Auth Admin）。仅在 webhook 拿不到 session 邮箱时兜底。
// 无 RESEND_API_KEY 时不发信，也就无需查邮箱——直接返回，让整个模块在未配置时是纯空转（不打 Supabase）。
export async function getUserEmail(userId) {
  try {
    if (!RESEND_API_KEY || !userId || !SERVICE_ROLE_KEY) return null;
    const r = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    }, 5000);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return (j && j.email) || null;
  } catch (error) {
    return null;
  }
}

// —— 按 user_id 查用户保存的语言偏好（account_profiles.locale）。同样在未配置发信时直接空转。
export async function getUserLocale(userId) {
  try {
    if (!RESEND_API_KEY || !userId || !SERVICE_ROLE_KEY) return null;
    const r = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/account_profiles?user_id=eq.${encodeURIComponent(userId)}&select=locale&limit=1`, {
      headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    }, 5000);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return (Array.isArray(j) && j[0] && j[0].locale) || null;
  } catch (error) {
    return null;
  }
}

export function siteLink(path) {
  return SITE_URL + (path && path.indexOf('#') === 0 ? '/' + path : path || '');
}

// ============ 客户邮件模板（三语），均返回 { subject, html } ============

export function reportReadyEmail(locale, { productName, href } = {}) {
  const subject = T(locale, { zh: `报告已就绪：${productName}`, hant: `報告已就緒：${productName}`, en: `Your report is ready: ${productName}` });
  const html = layout(locale, {
    heading: T(locale, { zh: '你的报告已解锁', hant: '你的報告已解鎖', en: 'Your report is unlocked' }),
    intro: T(locale, {
      zh: `感谢购买。你的「${productName}」已经解锁。点击下方按钮回到网站即可生成并查看完整报告。`,
      hant: `感謝購買。你的「${productName}」已經解鎖。點擊下方按鈕回到網站即可生成並查看完整報告。`,
      en: `Thanks for your purchase. Your "${productName}" is now unlocked. Click below to return to the site and generate the full report.`
    }),
    ctaText: T(locale, { zh: '查看我的报告', hant: '查看我的報告', en: 'View my report' }),
    ctaHref: href,
    footnote: T(locale, { zh: '单次购买的报告有效期为 30 天，可随时回到网站重新生成。', hant: '單次購買的報告有效期為 30 天，可隨時回到網站重新生成。', en: 'One-time reports stay accessible for 30 days; regenerate anytime on the site.' })
  });
  return { subject, html };
}

export function creditsAddedEmail(locale, { credits, balance, href } = {}) {
  const subject = T(locale, { zh: `点数已到账：+${credits} 点`, hant: `點數已到賬：+${credits} 點`, en: `Credits added: +${credits}` });
  const html = layout(locale, {
    heading: T(locale, { zh: '点数已到账', hant: '點數已到賬', en: 'Your credits are in' }),
    intro: T(locale, {
      zh: '你购买的问大师点数已充值到账户，可直接用于命理咨询。',
      hant: '你購買的問大師點數已充值到賬戶，可直接用於命理諮詢。',
      en: 'The Ask Master credits you purchased have been added to your account and are ready to use.'
    }),
    bullets: [
      { label: T(locale, { zh: '本次到账', hant: '本次到賬', en: 'Added' }), value: `+${credits}` },
      balance != null ? { label: T(locale, { zh: '当前余额', hant: '當前餘額', en: 'Balance' }), value: `${balance}` } : null
    ].filter(Boolean),
    ctaText: T(locale, { zh: '去问大师', hant: '去問大師', en: 'Ask Master' }),
    ctaHref: href
  });
  return { subject, html };
}

export function membershipWelcomeEmail(locale, { href } = {}) {
  const subject = T(locale, { zh: '最高级会员已开通', hant: '最高級會員已開通', en: 'Your Ultimate membership is active' });
  const html = layout(locale, {
    heading: T(locale, { zh: '欢迎成为最高级会员', hant: '歡迎成為最高級會員', en: 'Welcome to Ultimate' }),
    intro: T(locale, {
      zh: '你的最高级会员已开通：固定命理报告免费生成，问大师每月赠送 30 点。会员将按月自动续费，可随时在账号中心的「管理会员/账单」里查看或取消。',
      hant: '你的最高級會員已開通：固定命理報告免費生成，問大師每月贈送 30 點。會員將按月自動續費，可隨時在賬號中心的「管理會員/賬單」裡查看或取消。',
      en: 'Your Ultimate membership is active: fixed BaZi reports are free to generate and you get 30 Ask Master credits every month. It renews monthly; view or cancel anytime under Manage Billing.'
    }),
    ctaText: T(locale, { zh: '进入面板', hant: '進入面板', en: 'Open dashboard' }),
    ctaHref: href
  });
  return { subject, html };
}

export function paymentFailedEmail(locale, { href } = {}) {
  const subject = T(locale, { zh: '会员续费扣款失败，请更新支付方式', hant: '會員續費扣款失敗，請更新支付方式', en: 'Payment failed — please update your card' });
  const html = layout(locale, {
    heading: T(locale, { zh: '这个月的续费没有扣款成功', hant: '這個月的續費沒有扣款成功', en: 'This month\'s renewal did not go through' }),
    intro: T(locale, {
      zh: '我们尝试为你的最高级会员续费，但银行卡扣款失败。你的会员暂时进入宽限期，权益仍可使用几天。请尽快更新支付方式，避免会员到期后被取消。',
      hant: '我們嘗試為你的最高級會員續費，但銀行卡扣款失敗。你的會員暫時進入寬限期，權益仍可使用幾天。請盡快更新支付方式，避免會員到期後被取消。',
      en: 'We tried to renew your Ultimate membership but the card was declined. Your membership is in a short grace period. Please update your payment method soon to avoid losing access.'
    }),
    ctaText: T(locale, { zh: '更新支付方式', hant: '更新支付方式', en: 'Update payment method' }),
    ctaHref: href
  });
  return { subject, html };
}

export function refundEmail(locale, { productName, amountText } = {}) {
  const subject = T(locale, { zh: '退款已处理', hant: '退款已處理', en: 'Your refund has been processed' });
  const html = layout(locale, {
    heading: T(locale, { zh: '退款已办理', hant: '退款已辦理', en: 'Refund processed' }),
    intro: T(locale, {
      zh: '我们已为你的这笔订单办理退款。款项通常会在 5 至 10 个工作日内退回你的原支付方式。',
      hant: '我們已為你的這筆訂單辦理退款。款項通常會在 5 至 10 個工作日內退回你的原支付方式。',
      en: 'We have issued a refund for your order. It typically takes 5 to 10 business days to appear on your original payment method.'
    }),
    bullets: [
      productName ? { label: T(locale, { zh: '订单', hant: '訂單', en: 'Order' }), value: productName } : null,
      amountText ? { label: T(locale, { zh: '退款金额', hant: '退款金額', en: 'Refunded' }), value: amountText } : null
    ].filter(Boolean),
    footnote: T(locale, { zh: '相关的报告或会员权益已同步关闭。如对这笔退款有疑问，请直接回复本邮件。', hant: '相關的報告或會員權益已同步關閉。如對這筆退款有疑問，請直接回覆本郵件。', en: 'Any related report or membership access has been closed. Questions about this refund? Just reply to this email.' })
  });
  return { subject, html };
}

export function deletionRequestedEmail(locale, {} = {}) {
  const subject = T(locale, { zh: '已收到你的账号删除申请', hant: '已收到你的賬號刪除申請', en: 'We received your account deletion request' });
  const html = layout(locale, {
    heading: T(locale, { zh: '已收到删除申请', hant: '已收到刪除申請', en: 'Deletion request received' }),
    intro: T(locale, {
      zh: '我们已收到你删除 Madeshed 账号的申请，会按流程处理。正式删除前，建议你先在账号中心导出数据，删除后将无法恢复。如果这不是你本人操作，请立即回复本邮件联系我们。',
      hant: '我們已收到你刪除 Madeshed 賬號的申請，會按流程處理。正式刪除前，建議你先在賬號中心匯出資料，刪除後將無法恢復。如果這不是你本人操作，請立即回覆本郵件聯絡我們。',
      en: 'We have received your request to delete your Madeshed account and will process it. Before deletion, we recommend exporting your data — deletion is permanent. If this was not you, reply to this email right away.'
    })
  });
  return { subject, html };
}

export function accountDeletedEmail(locale, {} = {}) {
  const subject = T(locale, { zh: '你的 Madeshed 账号已删除', hant: '你的 Madeshed 賬號已刪除', en: 'Your Madeshed account has been deleted' });
  const html = layout(locale, {
    heading: T(locale, { zh: '账号已删除', hant: '賬號已刪除', en: 'Account deleted' }),
    intro: T(locale, {
      zh: '你的 Madeshed 账号及登录身份已按你的申请永久删除。感谢你曾经使用 Madeshed。如果这不是你本人操作，请立即回复本邮件联系我们。',
      hant: '你的 Madeshed 賬號及登入身份已按你的申請永久刪除。感謝你曾經使用 Madeshed。如果這不是你本人操作，請立即回覆本郵件聯絡我們。',
      en: 'Your Madeshed account and login identity have been permanently deleted as requested. Thank you for using Madeshed. If this was not you, reply to this email immediately.'
    })
  });
  return { subject, html };
}

export function passwordChangedEmail(locale, { href } = {}) {
  const subject = T(locale, { zh: '你的登录密码已修改', hant: '你的登入密碼已修改', en: 'Your password was changed' });
  const html = layout(locale, {
    heading: T(locale, { zh: '登录密码已修改', hant: '登入密碼已修改', en: 'Password changed' }),
    intro: T(locale, {
      zh: '你的 Madeshed 账号登录密码刚刚被修改。如果这是你本人操作，可忽略本邮件。如果不是，请立即前往登录页使用「忘记密码」重置，并回复本邮件联系我们。',
      hant: '你的 Madeshed 賬號登入密碼剛剛被修改。如果這是你本人操作，可忽略本郵件。如果不是，請立即前往登入頁使用「忘記密碼」重置，並回覆本郵件聯絡我們。',
      en: 'The password for your Madeshed account was just changed. If this was you, no action is needed. If not, reset it immediately via "Forgot password" on the login page and reply to this email.'
    }),
    ctaText: T(locale, { zh: '前往账号安全', hant: '前往賬號安全', en: 'Go to account security' }),
    ctaHref: href
  });
  return { subject, html };
}
