import crypto from 'node:crypto';
import { hasSupabaseService, supabaseInsert, supabaseSelect } from './_supabase.js';

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
  const payload = `${parts.t}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (!parts.v1 || Buffer.byteLength(expected) !== Buffer.byteLength(parts.v1)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 || ''));
}

async function creditBalance(userId) {
  const rows = await supabaseSelect('credit_ledger', `user_id=eq.${encodeURIComponent(userId)}&select=amount`);
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await readRawBody(req);
  if (secret && !verifyStripeSignature(rawBody, req.headers['stripe-signature'], secret)) {
    return send(res, 400, { error: 'invalid_signature' });
  }
  const event = JSON.parse(rawBody.toString('utf8') || '{}');
  if (event.type === 'checkout.session.completed') {
    const session = event.data && event.data.object ? event.data.object : {};
    const metadata = session.metadata || {};
    const product = metadata.product;
    if (hasSupabaseService() && product === 'credit_pack' && metadata.user_id) {
      const credits = Number(metadata.credits) || 10;
      const existing = await supabaseSelect('credit_ledger', `stripe_session_id=eq.${encodeURIComponent(session.id || '')}&select=id&limit=1`);
      if (existing.length) return send(res, 200, { received: true, product, duplicate: true, tables: ['credit_ledger', 'memberships', 'report_entitlements'] });
      const balance = await creditBalance(metadata.user_id);
      await supabaseInsert('credit_ledger', {
        user_id: metadata.user_id,
        entry_type: 'purchase',
        amount: credits,
        balance_after: balance + credits,
        reference_type: 'stripe_checkout',
        reference_id: session.id || '',
        stripe_session_id: session.id || '',
        payload: { product, credits, amount_total: session.amount_total, currency: session.currency }
      });
    }
    if (hasSupabaseService() && product === 'membership' && metadata.user_id) {
      await supabaseInsert('memberships', {
        user_id: metadata.user_id,
        tier: metadata.tier || 'ultimate',
        status: 'active',
        stripe_customer_id: session.customer || null,
        stripe_subscription_id: session.subscription || null
      }, { upsert: true, onConflict: 'user_id' });
    }
    if (hasSupabaseService() && product === 'report' && metadata.user_id && metadata.report_type) {
      await supabaseInsert('report_entitlements', {
        user_id: metadata.user_id,
        report_type: metadata.report_type,
        status: 'active',
        stripe_session_id: session.id || ''
      }, { upsert: true, onConflict: 'user_id,report_type' });
    }
    return send(res, 200, { received: true, product, tables: ['credit_ledger', 'memberships', 'report_entitlements'] });
  }
  return send(res, 200, { received: true });
}

export const config = {
  api: {
    bodyParser: false
  }
};
