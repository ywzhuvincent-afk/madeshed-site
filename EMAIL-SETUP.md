# 交易邮件系统 · 上线配置清单

本站的交易邮件走 **Resend**（统一发信层 `api/_email.js`）。
代码已全部就绪，但**在你配置好 `RESEND_API_KEY` 之前，所有邮件都安全空转**
（不发信、不报错、不影响支付与履约）。配置完成后自动开始发信，无需改代码。

## 一、一次性配置（约 15 分钟）

1. 注册 https://resend.com （免费额度足够起步）。
2. **Domains → Add Domain**，添加 `madeshed.com`，按提示在域名 DNS 里加 Resend 给的
   **SPF / DKIM** 记录（还有可选的 DMARC）。等状态变 **Verified**。
   - 只有验证过的域名才能用 `noreply@madeshed.com` 作为发件人；否则邮件会被拒或进垃圾箱。
3. **API Keys → Create**，复制 key（形如 `re_xxx`）。
4. 到 **Vercel → 项目 → Settings → Environment Variables**，添加下列变量（Production + Preview），保存后 **Redeploy**：

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `RESEND_API_KEY` | ✅ 必填 | 无 | 没有它=不发任何邮件 |
| `EMAIL_FROM` | 建议 | `Madeshed <noreply@madeshed.com>` | 发件人，必须在已验证域名下 |
| `OWNER_NOTIFY_EMAIL` | 建议 | `zhuvincent@hotmail.com` | 店主通知收件箱（新单/退款/拒付/删除申请） |
| `SUPPORT_EMAIL` | 可选 | `support@madeshed.com` | 邮件的 reply-to 与页脚客服地址 |
| `PUBLIC_SITE_URL` | 已有 | `https://madeshed.com` | 邮件里按钮链接用（通常已配置） |

## 二、这套系统会自动发哪些邮件

**给客户（自动按其选择的语言：简体 / 繁體 / English）**
- 报告购买后：**「报告已就绪 + 访问链接」**（一次性报告/命理报告）
- 点数包购买后：**「点数已到账」**
- 会员开通：**「最高级会员欢迎」**
- 续费扣款失败：**「请更新银行卡」**（仅首次转宽限期时发一次）
- 退款：**「退款已处理」**（真实退款；拒付不发）
- 删除账号：申请时「已收到删除申请」、硬删除时「账号已删除」
- 改密码：**「密码已修改」安全提醒**

**给你（店主，中文，发到 `OWNER_NOTIFY_EMAIL`）**
- 新购买 / 新会员
- 退款发生
- **拒付/争议**（含"有举证时限"提醒）
- 扣款失败
- 新的账号删除申请（含法定时限提醒）

## 三、Stripe 侧仍建议核对（这套系统不替代 Stripe 自带收据）

我们的 Resend 邮件是"报告就绪/点数/欢迎/退款/催款"等业务邮件；**正式收据/发票**仍走 Stripe。
现在结账已给 Stripe 客户写入 `preferred_locales`（简→zh、繁→zh-TW、英→en），
所以 Stripe 收据也会跟随用户语言。仍请在 Stripe 后台（Live 模式）确认：
- Customer emails → **Successful payments** 开启（会员续费收据靠它）
- Customer emails → **Send emails for refunds**（可选，我们已另发退款邮件）
- **Failed payments / Smart Retries**、**Expiring card** 开启（多一层挽留）

## 四、上线后自测

配置好 key 并 Redeploy 后，做一笔小额真实购买（或用 Stripe Test 模式触发 webhook）：
- 客户邮箱应收到「报告已就绪 / 点数已到账」等对应邮件；
- `OWNER_NOTIFY_EMAIL` 应收到「新的购买」通知。
> 注意：Stripe **测试模式**永远不发 Stripe 自带收据；但我们的 Resend 业务邮件在测试/正式都会发（只要配了 key）。
