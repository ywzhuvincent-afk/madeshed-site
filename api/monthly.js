import { actionBand, buildProfileFromRequest, loadBaziEngine } from './_bazi-runtime.js';

export default function handler(req, res) {
  try {
    const engine = loadBaziEngine();
    const profile = buildProfileFromRequest(req.query || {});
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    // 与前端流月趋势同一套：monthActionDetail（分层底盘+触发+财运+校准），非把月干支当日干支
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const dt = new Date(year, month - 1, 15);
      const mgz = engine.trendGzForDate(dt);
      const md = engine.monthActionDetail(profile, dt);
      const dr = engine.dailyReadFull(profile, { day: mgz.month });
      const band = actionBand(md.score);
      return {
        month,
        ganzhi: mgz.month,
        score: md.score,
        color: band.color,
        label: band.label,
        role: dr?.role || null,
        wealth_score: dr?.cScore || null,
        foundation_score: md.base
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
