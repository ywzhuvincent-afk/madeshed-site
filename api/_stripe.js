export const STRIPE_API_VERSION = '2026-02-25.clover';

export function siteOrigin(req) {
  return process.env.PUBLIC_SITE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
}

export function stripeSecret() {
  return process.env.STRIPE_SECRET_KEY || '';
}

export function priceFromEnv(names) {
  const keys = Array.isArray(names) ? names : [names];
  for (const key of keys) {
    if (process.env[key]) return { key, value: process.env[key] };
  }
  return { key: keys[0] || '', value: '' };
}

export async function stripeFormRequest(path, params, options = {}) {
  const secret = options.secret || stripeSecret();
  if (!secret) {
    const error = new Error('stripe_not_configured');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, '')}`, {
    method: options.method || 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': STRIPE_API_VERSION
    },
    body: params
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('stripe_error');
    error.status = response.status;
    error.detail = data;
    throw error;
  }
  return data;
}

export async function stripeGet(path, options = {}) {
  const secret = options.secret || stripeSecret();
  if (!secret) return null;
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, '')}`, {
    headers: {
      authorization: `Bearer ${secret}`,
      'stripe-version': STRIPE_API_VERSION
    }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}
