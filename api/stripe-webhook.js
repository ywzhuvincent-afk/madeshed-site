import crypto from 'node:crypto';
import { hasSupabaseService, supabaseInsert, supabaseSelect, supabaseUpdate } from './_supabase.js';
import { cleanEnv, stripeGet, stripeFormRequest } from './_stripe.js';

function send(res, status, body) {
  res.status(status).json(body);
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifyStripeSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const parts = Object.fromEntries(signature.split(',').map((p) => {
    const [k, v] = p.split('=');
    return [k, v];
  }));
  if (!parts.t || !parts.v1) return false;
  const payload = `${parts.t}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (Buffer.byteLength(expected) !== Buffer.byteLength(parts.v1)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

function stripeTime(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

function currentGrantMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function activeMembershipStatus(status) {
  if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'canceled') return status;
  return 'inactive';
}

function subscriptionIdFromInvoice(invoice) {
  return invoice.subscription ||
    (invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription) ||
    (invoice.lines && invoice.lines.data && invoice.lines.data[0] && invoice.lines.data[0].subscription) ||
    null;
}

function subscriptionPriceId(subscription) {
  return subscription &&
    subscription.items &&
    subscription.items.data &&
    subscription.items.data[0] &&
    subscription.items.data[0].price &&
    subscription.items.data[0].price.id;
}

// Stripe 2025-03-31.basil 起 current_period_* 从订阅根对象移到 items 上——根字段拿不到时从 item 取，
// 否则 memberships.current_period_end 恒为 null，会员永远看不到到期日。
function subscriptionPeriodEnd(subscription) {
  if (!subscription) return null;
  const item = subscription.items && subscription.items.data && subscription.items.data[0];
  return subscription.current_period_end || (item && item.current_period_end) || null;
}
function subscriptionPeriodStart(subscription) {
  if (!subscription) return null;
  const item = subscription.items && subscription.items.data && subscription.items.data[0];
  return subscription.current_period_start || (item && item.current_period_start) || null;
}

async function creditBalance(userId) {
  const rows = await supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&select=amount`);
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

async function grantMembershipCredits(userId, tier, source, referenceId = currentGrantMonth()) {
  if (!hasSupabaseService() || !userId || tier !== 'ultimate') return { granted: false };
  // 幂等口径：每用户每个日历月至多一次月度赠点（按 created_at 月窗口查重，而非只比 reference_id——
  // 否则 invoice 键与月份键并存的多事件源会在同月各发一次 30 点）。
  const monthStart = `${currentGrantMonth()}-01T00:00:00Z`;
  const existing = await supabaseSelect(
    'credit_ledger',
    `user_id=eq.${encodeURIComponent(userId)}&entry_type=eq.membership_grant&created_at=gte.${encodeURIComponent(monthStart)}&select=id&limit=1`
  );
  if (existing.length) return { granted: false, duplicate: true };
  const balance = await creditBalance(userId);
  await supabaseInsert('credit_ledger', {
    user_id: userId,
    entry_type: 'membership_grant',
    amount: 30,
    balance_after: balance + 30,
    reference_type: 'membership_month',
    reference_id: referenceId,
    payload: { tier, source }
  });
  return { granted: true, amount: 30 };
}

async function logMembershipEvent(event, userId) {
  if (!hasSupabaseService()) return;
  try {
    await supabaseInsert('membership_events', {
      user_id: userId || null,
      stripe_event_id: event.id || null,
      event_type: event.type || 'unknown',
      payload: event
    }, { upsert: true, onConflict: 'stripe_event_id' });
  } catch (error) {
    // Older databases may not have membership_events yet; webhook processing should continue.
  }
}

async function membershipForSubscription(subscriptionId) {
  if (!hasSupabaseService() || !subscriptionId) return null;
  const rows = await supabaseSelect(
    'memberships',
    `stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*&limit=1`
  );
  return rows[0] || null;
}

async function membershipForCustomer(customerId) {
  if (!hasSupabaseService() || !customerId) return null;
  const rows = await supabaseSelect(
    'memberships',
    `stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`
  );
  return rows[0] || null;
}

async function upsertMembershipFromSubscription(subscription, fallback = {}) {
  if (!hasSupabaseService() || !subscription) return null;
  const metadata = subscription.metadata || {};
  let userId = metadata.user_id || fallback.user_id || fallback.userId || null;
  const subscriptionId = subscription.id || fallback.subscriptionId || null;
  const customerId = subscription.customer || fallback.customerId || null;
  if (!userId && subscriptionId) {
    const existing = await membershipForSubscription(subscriptionId);
    userId = existing && existing.user_id;
  }
  if (!userId && customerId) {
    const existing = await membershipForCustomer(customerId);
    userId = existing && existing.user_id;
  }
  if (!userId) return null;
  const tier = metadata.tier || fallback.tier || 'ultimate';
  const status = activeMembershipStatus(subscription.status || fallback.status || 'active');
  // 防"旧订阅期末取消事件压掉新订阅"（曾为 blocker：取消→改主意重订后，旧订阅 deleted 事件会把
  // 正常扣费的新订阅整行覆盖成 canceled）：canceled 事件只在 subscription_id 匹配当前行时才写。
  if (status === 'canceled' && subscriptionId) {
    const existingRow = await membershipForCustomer(customerId) || await membershipForSubscription(subscriptionId);
    const current = existingRow || (userId ? (await supabaseSelect('memberships', `user_id=eq.${encodeURIComponent(userId)}&select=stripe_subscription_id,status&limit=1`))[0] : null);
    if (current && current.stripe_subscription_id && current.stripe_subscription_id !== subscriptionId) {
      return { userId, tier, status: current.status, skipped: 'stale_subscription_cancel' };
    }
  }
  const currentPeriodEnd = stripeTime(subscriptionPeriodEnd(subscription) || fallback.currentPeriodEnd);
  const payload = {
    stripe_status: subscription.status || null,
    stripe_price_id: subscriptionPriceId(subscription) || fallback.priceId || null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    current_period_start: stripeTime(subscriptionPeriodStart(subscription)),
    trial_end: stripeTime(subscription.trial_end),
    latest_invoice: subscription.latest_invoice || null
  };
  await supabaseInsert('memberships', {
    user_id: userId,
    tier,
    status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    current_period_end: currentPeriodEnd,
    payload
  }, { upsert: true, onConflict: 'user_id' });
  // 月度赠点只在真实付款事件发放（invoice.paid / checkout 完成）——订阅状态事件不发点，
  // 否则用户在 portal 点取消都会触发 subscription.updated 白拿新月份 30 点。
  return { userId, tier, status };
}

async function upsertMembershipFromCheckout(session, metadata) {
  const subscriptionId = session.subscription || null;
  let subscription = null;
  if (subscriptionId) subscription = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (subscription) {
    return upsertMembershipFromSubscription(subscription, {
      user_id: metadata.user_id,
      tier: metadata.tier || 'ultimate',
      customerId: session.customer || null,
      subscriptionId
    });
  }
  const userId = metadata.user_id;
  if (!userId) return null;
  const tier = metadata.tier || 'ultimate';
  await supabaseInsert('memberships', {
    user_id: userId,
    tier,
    status: 'active',
    stripe_customer_id: session.customer || null,
    stripe_subscription_id: subscriptionId,
    current_period_end: null,
    payload: { checkout_session_id: session.id || null, source: 'checkout.session.completed' }
  }, { upsert: true, onConflict: 'user_id' });
  // 赠点统一由 invoice.paid 发放（订阅结账后首张发票立即触发），此处不再重复发
  return { userId, tier, status: 'active' };
}

async function handleCreditPack(session, metadata) {
  if (!hasSupabaseService() || !metadata.user_id) return;
  const credits = Number(metadata.credits) || 10;
  const existing = await supabaseSelect('credit_ledger', `stripe_session_id=eq.${encodeURIComponent(session.id || '')}&select=id&limit=1`);
  if (existing.length) return;
  const balance = await creditBalance(metadata.user_id);
  await supabaseInsert('credit_ledger', {
    user_id: metadata.user_id,
    entry_type: 'purchase',
    amount: credits,
    balance_after: balance + credits,
    reference_type: 'stripe_checkout',
    reference_id: session.id || '',
    stripe_session_id: session.id || '',
    payload: { product: 'credit_pack', credits, amount_total: session.amount_total, currency: session.currency }
  });
}

// 单次购买报告有效期：30 天（会员生成的不受此限）。到期后 _access 判为 expired、可再次购买。
const REPORT_VALIDITY_DAYS = 30;
function reportExpiryFromNow() {
  return new Date(Date.now() + REPORT_VALIDITY_DAYS * 86400000).toISOString();
}

async function handleTradeReport(session, metadata) {
  if (!hasSupabaseService() || !metadata.user_id || !metadata.report_type) return;
  const sid = session.id || '';
  // 幂等 + 防退款复权：同一 checkout session 已处理过（active 或 refunded）→ 不重复履约、不把已退款翻回 active、
  // 不因事件重投滑动 30 天有效期。过期后复购会带新的 session id，正常授予新窗口。
  const existing = await supabaseSelect(
    'report_entitlements',
    `user_id=eq.${encodeURIComponent(metadata.user_id)}&report_type=eq.${encodeURIComponent(metadata.report_type)}&select=stripe_session_id&limit=1`
  );
  if (existing[0] && existing[0].stripe_session_id === sid) return;
  await supabaseInsert('report_entitlements', {
    user_id: metadata.user_id,
    report_type: metadata.report_type,
    source: 'purchase',
    status: 'active',
    stripe_session_id: sid,
    payload: { amount_total: session.amount_total, currency: session.currency, payment_intent: session.payment_intent || null, expires_at: reportExpiryFromNow(), validity_days: REPORT_VALIDITY_DAYS }
  }, { upsert: true, onConflict: 'user_id,report_type' });
}

async function handleFortuneReport(session, metadata) {
  if (!hasSupabaseService() || !metadata.user_id || !metadata.fortune_report_type) return;
  const type = metadata.fortune_report_type;
  const sid = session.id || '';
  // 幂等 + 防退款复权：读权益行 context.stripe_session_id，同一 session 重投（含退款后重投）直接跳过。
  // 退款时 markFortuneReportRefunded 会保留原 session_id，使此守卫在退款后仍能匹配到同一会话。
  const existing = await supabaseSelect(
    'fortune_reports',
    `user_id=eq.${encodeURIComponent(metadata.user_id)}&report_key=eq.${encodeURIComponent(type + '-entitlement')}&select=context&limit=1`
  );
  if (existing[0] && existing[0].context && existing[0].context.stripe_session_id === sid) return;
  await supabaseInsert('fortune_reports', {
    user_id: metadata.user_id,
    report_key: `${type}-entitlement`,
    report_type: type,
    target_period: null,
    title: '已解锁命理报告',
    context: { stripe_session_id: sid, payment_intent: session.payment_intent || null, product: 'fortune_report', expires_at: reportExpiryFromNow(), validity_days: REPORT_VALIDITY_DAYS },
    report_html: '<div class="report-paywall">报告权益已解锁，请回到页面生成完整报告。</div>',
    access_level: 'paid'
  }, { upsert: true, onConflict: 'user_id,report_key' });
}

async function checkoutSessionForPaymentIntent(paymentIntent) {
  if (!paymentIntent) return null;
  const data = await stripeGet(`checkout/sessions?payment_intent=${encodeURIComponent(paymentIntent)}&limit=1`);
  return data && data.data && data.data[0] ? data.data[0] : null;
}

async function chargeForRefund(refund) {
  const chargeId = refund && refund.charge;
  if (!chargeId || typeof chargeId !== 'string') return null;
  return stripeGet(`charges/${encodeURIComponent(chargeId)}`);
}

function latestRefundFromCharge(charge) {
  const refunds = charge && charge.refunds && Array.isArray(charge.refunds.data) ? charge.refunds.data : [];
  return refunds[0] || null;
}

async function resolveRefundContext(event) {
  const object = event.data && event.data.object ? event.data.object : {};
  const refund = event.type === 'refund.created' || event.type === 'refund.updated' ? object : latestRefundFromCharge(object);
  const charge = event.type === 'charge.refunded' ? object : await chargeForRefund(refund);
  const payment_intent = refund?.payment_intent || charge?.payment_intent || null;
  const session = await checkoutSessionForPaymentIntent(payment_intent);
  const metadata = session?.metadata || {};
  const invoice = charge?.invoice ? await stripeGet(`invoices/${encodeURIComponent(charge.invoice)}`) : null;
  const subscriptionId = session?.subscription || subscriptionIdFromInvoice(invoice || {});
  let membership = null;
  if (subscriptionId) membership = await membershipForSubscription(subscriptionId);
  if (!membership && charge?.customer) membership = await membershipForCustomer(charge.customer);
  let product = metadata.product || (subscriptionId ? 'membership' : '');
  let userId = metadata.user_id || membership?.user_id || null;
  let reportType = metadata.report_type || null;
  let fortuneReportType = metadata.fortune_report_type || null;
  let sessionId = session?.id || null;
  // 兜底：session 解析不出 product（拒付晚到 / session 老化 / Stripe list 抖动）但有 payment_intent 时，
  // 按 payment_intent 回查已授予的权益行恢复 product/user/type，保证退款/拒付仍能撤权（曾为静默不撤销缺陷）。
  if (!product && payment_intent) {
    const tr = await supabaseSelect('report_entitlements', `payload->>payment_intent=eq.${encodeURIComponent(payment_intent)}&select=user_id,report_type,stripe_session_id&limit=1`);
    if (tr[0]) {
      product = 'report';
      userId = userId || tr[0].user_id;
      reportType = reportType || tr[0].report_type;
      sessionId = sessionId || tr[0].stripe_session_id || null;
    } else {
      const fr = await supabaseSelect('fortune_reports', `context->>payment_intent=eq.${encodeURIComponent(payment_intent)}&select=user_id,report_type&limit=1`);
      if (fr[0]) {
        product = 'fortune_report';
        userId = userId || fr[0].user_id;
        fortuneReportType = fortuneReportType || fr[0].report_type;
      }
    }
  }
  const refund_id = refund?.id || `${charge?.id || event.id}-refund`;
  // 累计退款判定：优先取 charge.amount_refunded（Stripe 累计值），使多笔部分退款累计达 100% 能正确判为 full_refund 并撤权。
  const amountRefunded = Number(charge?.amount_refunded || refund?.amount || 0);
  const amountTotal = Number(session?.amount_total || charge?.amount || 0);
  return {
    product,
    userId,
    refund_id,
    payment_intent,
    charge_id: charge?.id || refund?.charge || null,
    customer_id: session?.customer || charge?.customer || membership?.stripe_customer_id || null,
    subscription_id: subscriptionId || membership?.stripe_subscription_id || null,
    session_id: sessionId,
    report_type: reportType,
    fortune_report_type: fortuneReportType,
    credits: Number(metadata.credits) || 10,
    amount_refunded: amountRefunded,
    amount_total: amountTotal,
    full_refund: amountTotal > 0 ? amountRefunded >= amountTotal : Boolean(charge?.refunded),
    session,
    charge,
    refund
  };
}

// 退款幂等（跨事件）：refund.created 与 charge.refunded 对同一笔退款可能生成不同 reference_id
// （新 Stripe API 版本 charge 不再内嵌 refunds 列表 → 兜底键为 chargeId-refund），故再按 session 查重，
// 否则同一笔退款会被两个事件各回收一次点数（曾为 blocker：-10×2 / -30×2）。
async function refundAlreadyRecorded(ctx) {
  const byRef = await supabaseSelect(
    'credit_ledger',
    `reference_id=eq.${encodeURIComponent(ctx.refund_id)}&entry_type=eq.refund&select=id&limit=1`
  );
  if (byRef.length) return true;
  if (ctx.session_id) {
    const bySession = await supabaseSelect(
      'credit_ledger',
      `stripe_session_id=eq.${encodeURIComponent(ctx.session_id)}&entry_type=eq.refund&select=id&limit=1`
    );
    if (bySession.length) return true;
  }
  return false;
}

async function reverseCreditPack(ctx) {
  if (!hasSupabaseService() || !ctx.userId) return { reversed: false };
  if (await refundAlreadyRecorded(ctx)) return { reversed: false, duplicate: true };
  const purchased = ctx.session_id
    ? await supabaseSelect('credit_ledger', `stripe_session_id=eq.${encodeURIComponent(ctx.session_id)}&entry_type=eq.purchase&select=amount&limit=1`)
    : [];
  const purchasedCredits = Math.max(1, Number(purchased[0]?.amount) || ctx.credits || 10);
  const ratio = ctx.amount_total > 0 && ctx.amount_refunded > 0 ? Math.min(1, ctx.amount_refunded / ctx.amount_total) : 1;
  const creditsToReverse = Math.max(1, Math.round(purchasedCredits * ratio));
  const balance = await creditBalance(ctx.userId);
  await supabaseInsert('credit_ledger', {
    user_id: ctx.userId,
    entry_type: 'refund',
    amount: -creditsToReverse,
    balance_after: balance - creditsToReverse,
    reference_type: 'stripe_refund',
    reference_id: ctx.refund_id,
    stripe_session_id: ctx.session_id || '',
    payload: {
      product: 'credit_pack',
      refund_id: ctx.refund_id,
      payment_intent: ctx.payment_intent,
      charge_id: ctx.charge_id,
      amount_refunded: ctx.amount_refunded,
      amount_total: ctx.amount_total
    }
  });
  return { reversed: true, credits: creditsToReverse };
}

async function markTradeReportRefunded(ctx) {
  if (!hasSupabaseService() || !ctx.userId) return { updated: false };
  const query = ctx.session_id
    ? `stripe_session_id=eq.${encodeURIComponent(ctx.session_id)}`
    : `user_id=eq.${encodeURIComponent(ctx.userId)}&report_type=eq.${encodeURIComponent(ctx.report_type || '30')}`;
  await supabaseUpdate('report_entitlements', query, {
    status: 'refunded',
    payload: {
      refund_id: ctx.refund_id,
      payment_intent: ctx.payment_intent,
      charge_id: ctx.charge_id,
      amount_refunded: ctx.amount_refunded,
      amount_total: ctx.amount_total
    }
  });
  return { updated: true, reportType: ctx.report_type };
}

async function markFortuneReportRefunded(ctx) {
  if (!hasSupabaseService() || !ctx.userId || !ctx.fortune_report_type) return { updated: false };
  await supabaseUpdate(
    'fortune_reports',
    `user_id=eq.${encodeURIComponent(ctx.userId)}&report_type=eq.${encodeURIComponent(ctx.fortune_report_type)}`,
    {
      access_level: 'preview',
      context: {
        refunded: true,
        stripe_session_id: ctx.session_id || null,
        refund_id: ctx.refund_id,
        payment_intent: ctx.payment_intent,
        charge_id: ctx.charge_id,
        amount_refunded: ctx.amount_refunded,
        amount_total: ctx.amount_total
      }
    }
  );
  return { updated: true, reportType: ctx.fortune_report_type };
}

async function markMembershipRefunded(ctx) {
  if (!hasSupabaseService() || !ctx.userId) return { updated: false };
  await supabaseUpdate('memberships', `user_id=eq.${encodeURIComponent(ctx.userId)}`, {
    status: 'canceled',
    payload: {
      refunded: true,
      refund_id: ctx.refund_id,
      payment_intent: ctx.payment_intent,
      charge_id: ctx.charge_id,
      subscription_id: ctx.subscription_id,
      customer_id: ctx.customer_id,
      amount_refunded: ctx.amount_refunded,
      amount_total: ctx.amount_total
    }
  });
  // 同步取消 Stripe 订阅（曾为 major：只改本地库不取消订阅→下月照扣 ¥199，invoice.paid 又把状态翻回 active，
  // 退款形同虚设）。取消失败不阻断退款处理，但记录下来供人工跟进。
  let stripeCancel = null;
  if (ctx.subscription_id) {
    try {
      await stripeFormRequest(`subscriptions/${encodeURIComponent(ctx.subscription_id)}`, new URLSearchParams(), { method: 'DELETE' });
      stripeCancel = 'canceled';
    } catch (error) {
      stripeCancel = 'cancel_failed:' + String(error && (error.detail?.error?.message || error.message)).slice(0, 100);
    }
  }
  if (!(await refundAlreadyRecorded(ctx))) {
    const balance = await creditBalance(ctx.userId);
    await supabaseInsert('credit_ledger', {
      user_id: ctx.userId,
      entry_type: 'refund',
      amount: -30,
      balance_after: balance - 30,
      reference_type: 'stripe_refund',
      reference_id: ctx.refund_id,
      stripe_session_id: ctx.session_id || '',
      payload: { product: 'membership', refund_id: ctx.refund_id, payment_intent: ctx.payment_intent }
    });
  }
  return { updated: true, status: 'canceled', stripeCancel };
}

async function handleCheckoutCompleted(session) {
  const metadata = session.metadata || {};
  const product = metadata.product;
  // 延迟到账支付方式下 session 以 payment_status='unpaid' 完成——未收到钱绝不履约，
  // 等 checkout.session.async_payment_succeeded 再发货（曾为 major：先发货后收款）。
  if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return { userId: metadata.user_id || null, product, deferred: 'awaiting_payment(' + session.payment_status + ')' };
  }
  if (product === 'credit_pack') await handleCreditPack(session, metadata);
  if (product === 'membership') return upsertMembershipFromCheckout(session, metadata);
  if (product === 'report') await handleTradeReport(session, metadata);
  if (product === 'fortune_report') await handleFortuneReport(session, metadata);
  return { userId: metadata.user_id || null, product };
}

async function handleRefund(event) {
  const ctx = await resolveRefundContext(event);
  let action = { handled: false, reason: 'unmatched_refund' };
  // 部分退款不撤权益（曾为 major：善意退 ¥20 会没收全部已付权益）；点数包按比例回冲维持原逻辑。
  if (ctx.product === 'credit_pack') action = await reverseCreditPack(ctx);
  if (ctx.product === 'report') action = ctx.full_refund ? await markTradeReportRefunded(ctx) : { skipped: 'partial_refund_entitlement_kept' };
  if (ctx.product === 'fortune_report') action = ctx.full_refund ? await markFortuneReportRefunded(ctx) : { skipped: 'partial_refund_entitlement_kept' };
  if (ctx.product === 'membership') action = ctx.full_refund ? await markMembershipRefunded(ctx) : { skipped: 'partial_refund_membership_kept' };
  return {
    userId: ctx.userId,
    product: ctx.product || 'unknown',
    refund_id: ctx.refund_id,
    payment_intent: ctx.payment_intent,
    full_refund: ctx.full_refund,
    action
  };
}

// 拒付（chargeback）：钱已被 Stripe 划走——按全额退款同款逻辑立即冻结对应权益并留痕，
// 避免"货款两失+权益照用"（曾为 major：完全无处理）。
async function handleDispute(event) {
  const dispute = event.data && event.data.object ? event.data.object : {};
  const pseudoEvent = {
    id: event.id,
    type: 'charge.refunded',
    data: { object: { id: dispute.charge, payment_intent: dispute.payment_intent, refunds: { data: [{ id: `dispute-${dispute.id}`, amount: dispute.amount, charge: dispute.charge, payment_intent: dispute.payment_intent }] }, amount: dispute.amount, amount_refunded: dispute.amount, refunded: true, customer: null } }
  };
  const result = await handleRefund(pseudoEvent);
  return { ...result, dispute_id: dispute.id, dispute_reason: dispute.reason || null };
}

// 扣款失败：标记 past_due（权益进入宽限期，前端提示更新支付方式），不静默断权
async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return null;
  const membership = await membershipForSubscription(subscriptionId) || await membershipForCustomer(invoice.customer);
  if (!membership) return null;
  await supabaseUpdate('memberships', `user_id=eq.${encodeURIComponent(membership.user_id)}`, { status: 'past_due' });
  return { userId: membership.user_id, status: 'past_due' };
}

async function handleInvoicePaid(invoice) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return null;
  const subscription = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  const updated = await upsertMembershipFromSubscription(subscription || { id: subscriptionId, customer: invoice.customer, status: 'active' });
  if (updated && updated.userId && updated.tier === 'ultimate' && (updated.status === 'active' || updated.status === 'trialing')) {
    // 引用真实发票 id（月窗口幂等在 grantMembershipCredits 内统一处理）
    await grantMembershipCredits(updated.userId, updated.tier, 'invoice.paid', invoice.id || currentGrantMonth());
  }
  return updated;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const secret = cleanEnv(process.env.STRIPE_WEBHOOK_SECRET);
  const rawBody = await readRawBody(req);
  if (!secret) {
    return send(res, 503, {
      error: 'stripe_webhook_secret_required',
      message: 'STRIPE_WEBHOOK_SECRET is required before Stripe webhook events can be accepted.'
    });
  }
  if (!verifyStripeSignature(rawBody, req.headers['stripe-signature'], secret)) {
    return send(res, 400, { error: 'invalid_signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch (error) {
    return send(res, 400, { error: 'invalid_json' });
  }

  let result = null;
  const object = event.data && event.data.object ? event.data.object : {};
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      result = await handleCheckoutCompleted(object);
    } else if (event.type === 'checkout.session.async_payment_failed') {
      result = { userId: (object.metadata || {}).user_id || null, product: (object.metadata || {}).product || null, note: 'async_payment_failed_no_fulfillment' };
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      result = await upsertMembershipFromSubscription(object, {
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : object.status
      });
    } else if (event.type === 'invoice.paid') {
      result = await handleInvoicePaid(object);
    } else if (event.type === 'invoice.payment_failed') {
      result = await handleInvoicePaymentFailed(object);
    } else if (event.type === 'charge.dispute.created') {
      result = await handleDispute(event);
    } else if (event.type === 'refund.created' || event.type === 'refund.updated' || event.type === 'charge.refunded') {
      result = await handleRefund(event);
    }
    await logMembershipEvent(event, result && result.userId);
  } catch (error) {
    return send(res, 500, { error: 'webhook_processing_failed', message: error.message });
  }

  return send(res, 200, {
    received: true,
    type: event.type,
    result,
    tables: ['credit_ledger', 'memberships', 'report_entitlements', 'fortune_reports', 'membership_events']
  });
}

export const config = {
  api: {
    bodyParser: false
  }
};
