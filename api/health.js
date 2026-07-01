// Madeshed Bazi API - Health Check
// Vercel Serverless Function (Node.js runtime)

export default function handler(req, res) {
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  const llmConfigured = Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL);
  const stripePricesConfigured = {
    creditPack: Boolean(process.env.STRIPE_CREDIT_PRICE_ID),
    membership: Boolean(process.env.STRIPE_ULTIMATE_PRICE_ID || process.env.STRIPE_MEMBERSHIP_PRICE_ID),
    tradeReports: Boolean(process.env.STRIPE_REPORT_7_PRICE_ID || process.env.STRIPE_REPORT_30_PRICE_ID || process.env.STRIPE_REPORT_365_PRICE_ID || process.env.STRIPE_REPORT_ALL_PRICE_ID),
    fortuneReports: Boolean(process.env.STRIPE_FORTUNE_FULL_PRICE_ID || process.env.STRIPE_FORTUNE_DAYUN_PRICE_ID || process.env.STRIPE_FORTUNE_MONTH_PRICE_ID)
  };
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.2.0',
    service: 'madeshed-bazi-api',
    endpoints: ['/api/health', '/api/score', '/api/profile', '/api/monthly', '/api/report', '/api/fortune-report', '/api/master-question', '/api/checkout', '/api/stripe-webhook'],
    configuration: {
      supabaseConfigured,
      stripeConfigured,
      llmConfigured,
      stripePricesConfigured
    }
  });
}
