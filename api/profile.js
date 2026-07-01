import { buildProfileFromRequest, loadBaziEngine } from './_bazi-runtime.js';

export default function handler(req, res) {
  try {
    loadBaziEngine();
    const profile = buildProfileFromRequest(req.query || {});
    const current = profile.currentDayunIdx >= 0 ? profile.daYun?.[profile.currentDayunIdx] : null;
    res.status(200).json({
      input: {
        birth: profile.sourceBirth || profile.birth,
        solarBirth: profile.birth,
        time: profile.time,
        gender: profile.gender,
        meta: profile.inputMeta
      },
      pillars: profile.pillars,
      pillarsStr: profile.pillarsStr,
      day_master: { stem: profile.dayStem, element: profile.dayElement },
      strength: profile.strength,
      month_branch: {
        branch: profile.monthBranch,
        element: profile.monthElement,
        element_relation: profile.monthRelation
      },
      current_dayun: current ? { ...current, order: profile.currentDayunIdx + 1 } : null,
      favorable_elements: profile.yongShen,
      wealth: profile.wealth,
      dayun_sequence: profile.daYun,
      source: 'bazi-engine'
    });
  } catch (error) {
    res.status(500).json({ error: 'profile_calculation_failed', message: error.message });
  }
}
