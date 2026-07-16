# Supabase 认证邮件三语模板（需在 Supabase 后台粘贴一次）

## 为什么需要手动一步

注册确认 / 密码重置这类邮件由 **Supabase (GoTrue) 自己发**，不经过我们的 `api/_email.js` 三语邮件层。
所以代码改不到它们——必须在 Supabase 后台把模板换成下面的版本。**这是英文用户收到的第一封信**。

## 前置条件（代码侧已完成）

注册时已把语言写进 `user_metadata`：

```js
supa.auth.signUp({ email, password, options:{ data:{ display_name, locale: checkoutLocaleValue() } } })
```

→ 模板里可用 `{{ .Data.locale }}` 取到 `zh` / `zh-Hant` / `en`。

> ⚠️ 只有**新注册**用户带 locale。老用户 `.Data.locale` 为空 → 下面模板会走 `else` 分支（简体），这是安全的兜底。

## 操作路径

Supabase 后台 → **Authentication → Emails → Templates**，逐个替换。

---

### 1. Confirm signup（注册确认）

**Subject：**
```
{{ if eq .Data.locale "en" }}Confirm your Madeshed account{{ else if eq .Data.locale "zh-Hant" }}確認你的 Madeshed 帳號{{ else }}确认你的 Madeshed 账号{{ end }}
```

**Body：**
```html
{{ if eq .Data.locale "en" }}
<h2>Confirm your email</h2>
<p>Welcome to Madeshed. Click below to confirm your account and start using your BaZi trading dashboard.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm my account</a></p>
<p>If you did not sign up, you can safely ignore this email.</p>
<hr><p style="color:#888;font-size:12px">Madeshed · This is a decision-support tool, not investment advice.</p>
{{ else if eq .Data.locale "zh-Hant" }}
<h2>確認你的電子郵件</h2>
<p>歡迎使用 Madeshed。點擊下方連結確認帳號，即可開始使用你的八字交易儀表板。</p>
<p><a href="{{ .ConfirmationURL }}">確認我的帳號</a></p>
<p>若你並未註冊，請忽略本郵件。</p>
<hr><p style="color:#888;font-size:12px">Madeshed · 本產品為決策輔助工具，不構成投資建議。</p>
{{ else }}
<h2>确认你的邮箱</h2>
<p>欢迎使用 Madeshed。点击下方链接确认账号，即可开始使用你的八字交易仪表盘。</p>
<p><a href="{{ .ConfirmationURL }}">确认我的账号</a></p>
<p>若你并未注册，请忽略本邮件。</p>
<hr><p style="color:#888;font-size:12px">Madeshed · 本产品为决策辅助工具，不构成投资建议。</p>
{{ end }}
```

---

### 2. Reset password（重置密码）

**Subject：**
```
{{ if eq .Data.locale "en" }}Reset your Madeshed password{{ else if eq .Data.locale "zh-Hant" }}重設你的 Madeshed 密碼{{ else }}重置你的 Madeshed 密码{{ end }}
```

**Body：**
```html
{{ if eq .Data.locale "en" }}
<h2>Reset your password</h2>
<p>Click below to set a new password. This link expires shortly.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>If you did not request this, you can safely ignore this email — your password will not change.</p>
{{ else if eq .Data.locale "zh-Hant" }}
<h2>重設你的密碼</h2>
<p>點擊下方連結設定新密碼。此連結將於短時間內失效。</p>
<p><a href="{{ .ConfirmationURL }}">重設密碼</a></p>
<p>若非你本人操作，請忽略本郵件，密碼不會變更。</p>
{{ else }}
<h2>重置你的密码</h2>
<p>点击下方链接设置新密码。此链接会在短时间内失效。</p>
<p><a href="{{ .ConfirmationURL }}">重置密码</a></p>
<p>若非你本人操作，请忽略本邮件，密码不会变更。</p>
{{ end }}
```

---

### 3. Magic Link（免密登录）

**Subject：**
```
{{ if eq .Data.locale "en" }}Your Madeshed sign-in link{{ else if eq .Data.locale "zh-Hant" }}你的 Madeshed 登入連結{{ else }}你的 Madeshed 登录链接{{ end }}
```

**Body：**
```html
{{ if eq .Data.locale "en" }}
<h2>Sign in to Madeshed</h2>
<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
<p>This link can only be used once. If you did not request it, ignore this email.</p>
{{ else if eq .Data.locale "zh-Hant" }}
<h2>登入 Madeshed</h2>
<p><a href="{{ .ConfirmationURL }}">登入</a></p>
<p>此連結僅能使用一次。若非你本人操作，請忽略本郵件。</p>
{{ else }}
<h2>登录 Madeshed</h2>
<p><a href="{{ .ConfirmationURL }}">登录</a></p>
<p>此链接仅能使用一次。若非你本人操作，请忽略本邮件。</p>
{{ end }}
```

---

### 4. Change email address（更换邮箱）

**Subject：**
```
{{ if eq .Data.locale "en" }}Confirm your new Madeshed email{{ else if eq .Data.locale "zh-Hant" }}確認你的新 Madeshed 電子郵件{{ else }}确认你的新 Madeshed 邮箱{{ end }}
```

**Body：**
```html
{{ if eq .Data.locale "en" }}
<h2>Confirm your new email</h2>
<p>Click below to confirm changing your Madeshed email to {{ .Email }}.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm new email</a></p>
{{ else if eq .Data.locale "zh-Hant" }}
<h2>確認你的新電子郵件</h2>
<p>點擊下方連結，確認將 Madeshed 帳號郵箱更換為 {{ .Email }}。</p>
<p><a href="{{ .ConfirmationURL }}">確認新郵箱</a></p>
{{ else }}
<h2>确认你的新邮箱</h2>
<p>点击下方链接，确认将 Madeshed 账号邮箱更换为 {{ .Email }}。</p>
<p><a href="{{ .ConfirmationURL }}">确认新邮箱</a></p>
{{ end }}
```

---

## 验证方法

用英文站注册一个测试邮箱（切到 EN 再注册），确认收到的是**英文**确认邮件。
繁体同理（切到「繁」再注册）。老用户/未带 locale 的会收到简体——这是刻意的安全兜底。
