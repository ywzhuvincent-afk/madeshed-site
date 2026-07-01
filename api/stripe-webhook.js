import crypto from 'node:crypto';
import { hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';
import { stripeGet } from './_stripe.js';

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

async function creditBalance(userId) {
  const rows = await supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&select=amount`);
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

async function grantMembershipCredits(userId, tier, source, referenceId = currentGrantMonth()) {
  if (!hasSupabaseService() || !userId || tier !== 'ultimate') return { granted: false };
  const existing = await supabaseSelect(
    'credit_ledger',
    `user_id=eq.${encodeURIComponent(userId)}&entry_type=eq.membership_grant&reference_id=eq.${encodeURIComponent(referenceId)}&select=id&limit=1`
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
  const currentPeriodEnd = stripeTime(subscription.current_period_end || fallback.currentPeriodEnd);
  const payload = {
    stripe_status: subscription.status || null,
    stripe_price_id: subscriptionPriceId(subscription) || fallback.priceId || null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    current_period_start: stripeTime(subscription.current_period_start),
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
  if (status === 'active' || status === 'trialing') {
    await grantMembershipCredits(userId, tier, 'subscription_event');
  }
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
  await grantMembershipCredits(userId, tier, 'checkout_session');
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

async function handleTradeReport(session, metadata) {
  if (!hasSupabaseService() || !metadata.user_id || !metadata.report_type) return;
  await supabaseInsert('report_entitlements', {
    user_id: metadata.user_id,
    report_type: metadata.report_type,
    source: 'purchase',
    status: 'active',
    stripe_session_id: session.id || '',
    payload: { amount_total: session.amount_total, currency: session.currency }
  }, { upsert: true, onConflict: 'user_id,report_type' });
}

async function handleFortuneReport(session, metadata) {
  if (!hasSupabaseService() || !metadata.user_id || !metadata.fortune_report_type) return;
  const type = metadata.fortune_report_type;
  await supabaseInsert('fortune_reports', {
    user_id: metadata.user_id,
    report_key: `${type}-entitlement`,
    report_type: type,
    target_period: null,
    title: '已解锁命理报告',
    context: { stripe_session_id: session.id || '', product: 'fortune_report' },
    report_html: '<div class="report-paywall">报告权益已解锁，请回到页面生成完整报告。</div>',
    access_level: 'paid'
  }, { upsert: true, onConflict: 'user_id,report_key' });
}

async function handleCheckoutCompleted(session) {
  const metadata = session.metadata || {};
  const product = metadata.product;
  if (product === 'credit_pack') await handleCreditPack(session, metadata);
  if (product === 'membership') return upsertMembershipFromCheckout(session, metadata);
  if (product === 'report') await handleTradeReport(session, metadata);
  if (product === 'fortune_report') await handleFortuneReport(session, metadata);
  return { userId: metadata.user_id || null, product };
}

async function handleInvoicePaid(invoice) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return null;
  const subscription = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  const updated = await upsertMembershipFromSubscription(subscription || { id: subscriptionId, customer: invoice.customer, status: 'active' });
  if (updated && updated.userId && updated.tier === 'ultimate') {
    await grantMembershipCredits(updated.userId, updated.tier, 'invoice.paid', currentGrantMonth());
  }
  return updated;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
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
    if (event.type === 'checkout.session.completed') {
      result = await handleCheckoutCompleted(object);
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      result = await upsertMembershipFromSubscription(object, {
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : object.status
      });
    } else if (event.type === 'invoice.paid') {
      result = await handleInvoicePaid(object);
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
