// Madeshed Bazi API - Monthly Trend
// Returns 12-month score trend for given year

export default function handler(req, res) {
  const birth = req.query.birth || '1985-06-15';
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();

  // Placeholder curve - matches the SVG path in frontend mockup
  const baseCurve = [55, 62, 70, 78, 82, 88, 76, 70, 63, 72, 78, 82];

  function pickColor(score) {
    if (score >= 85) return '深绿';
    if (score >= 75) return '绿';
    if (score >= 65) return '浅绿';
    if (score >= 55) return '黄';
    return '橙';
  }

  const monthly = baseCurve.map((score, i) => ({
    month: i + 1,
    score,
    color: pickColor(score)
  }));

  const today = new Date();
  const currentMonth = year === today.getFullYear() ? today.getMonth() + 1 : null;

  res.status(200).json({
    birth,
    year,
    average: Math.round(baseCurve.reduce((a, b) => a + b, 0) / 12 * 10) / 10,
    current_month: currentMonth,
    current_month_score: currentMonth ? baseCurve[currentMonth - 1] : null,
    monthly,
    _placeholder: true
  });
}
