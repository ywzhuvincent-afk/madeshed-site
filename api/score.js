import { actionBand, buildProfileFromRequest, loadBaziEngine, scoreFromProfileAndGanzhi } from './_bazi-runtime.js';

export default function handler(req, res) {
  try {
    const engine = loadBaziEngine();
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const profile = buildProfileFromRequest(req.query || {});
    // 与前端一致：取该日的年/月/日干支，日分走当日、年月经 foundation 分层
    const gz = engine.trendGzForDate(new Date(`${date}T12:00:00`));
    const result = scoreFromProfileAndGanzhi(profile, gz.day, { year: gz.year, month: gz.month });
    const band = actionBand(result.score);
    res.status(200).json({
      date,
      birth: profile.birth,
      ganzhi: gz.day,
      score: result.score,
      color: band.color,
      label: band.label,
      position_pct: band.positionPct,
      advice: result.read?.advice || band.advice,
      components: {
        day_score: result.read?.zScore || null,
        wealth_score: result.read?.cScore || null,
        foundation_score: result.base,
        role: result.read?.role || null,
        current_dayun_pillar: profile.currentDayunIdx >= 0 && profile.daYun?.[profile.currentDayunIdx]
          ? profile.daYun[profile.currentDayunIdx].pillar
          : null
      },
      source: 'bazi-engine'
    });
  } catch (error) {
    res.status(500).json({ error: 'score_calculation_failed', message: error.message });
  }
}
