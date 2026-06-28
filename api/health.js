// Madeshed Bazi API - Health Check
// Vercel Serverless Function (Node.js runtime)

export default function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0-mini',
    service: 'madeshed-bazi-api',
    endpoints: ['/api/health', '/api/score', '/api/profile', '/api/monthly']
  });
}
