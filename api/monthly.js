import { actionBand, buildProfileFromRequest, loadBaziEngine, monthGanzhi, scoreFromProfileAndGanzhi } from './_bazi-runtime.js';

export default function handler(req, res) {
  try {
    loadBaziEngine();
    const profile = buildProfileFromRequest(req.query || {});
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const ganzhi = monthGanzhi(year, month);
      const result = scoreFromProfileAndGanzhi(profile, ganzhi);
      const band = actionBand(result.score);
      return {
        month,
        ganzhi,
        score: result.score,
        color: band.color,
        label: band.label,
        role: result.read?.role || null,
        wealth_score: result.read?.cScore || null,
        foundation_score: result.base
      };
    });
    const today = new Date();
    const currentMonth = year === today.getFullYear() ? today.getMonth() + 1 : null;
    const average = Math.round(monthly.reduce((sum, row) => sum + row.score, 0) / monthly.length);
    res.status(200).json({
      birth: profile.birth,
      year,
      average,
      current_month: currentMonth,
      current_month_score: currentMonth ? monthly[currentMonth - 1].score : null,
      monthly,
      source: 'bazi-engine'
    });
  } catch (error) {
    res.status(500).json({ error: 'monthly_calculation_failed', message: error.message });
  }
}
