import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import lunar from 'lunar-javascript';

let cachedEngine = null;

function moduleValue(name) {
  return lunar && (lunar[name] || (lunar.default && lunar.default[name]));
}

export function loadBaziEngine() {
  if (cachedEngine) return cachedEngine;
  const Solar = moduleValue('Solar');
  const Lunar = moduleValue('Lunar');
  if (!Solar || !Lunar) throw new Error('lunar_javascript_not_loaded');

  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, '..', 'bazi-engine.js'), 'utf8');
  const sandbox = {
    window: { Solar, Lunar },
    Solar,
    Lunar,
    console,
    Date,
    Math,
    String,
    Number,
    Object,
    Array,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, sandbox, { filename: 'bazi-engine.js' });
  cachedEngine = sandbox.window.MadeshedBazi;
  if (!cachedEngine) throw new Error('bazi_engine_not_loaded');
  return cachedEngine;
}

export function parseCityParam(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    const [name, lng, tz] = raw.split('|');
    return {
      name: name || raw,
      en: name || raw,
      country: '',
      lng: Number(lng) || 116.41,
      tz: Number(tz) || 8
    };
  }
}

// 分档/标签/仓位与引擎 actionScore（trendScoreLabel 82/70/56/44 + position 80/60/40/20/观望）完全一致，
// 使 /api/score、/api/monthly 的 标签/颜色/仓位 与用户在仪表盘看到的逐档相等。
export function actionBand(score) {
  if (score >= 82) return { color: '绿', label: '强顺势', position: '80%', positionPct: 0.80, advice: '可按计划顺势推进，仍控制仓位上限' };
  if (score >= 70) return { color: '浅绿', label: '顺势', position: '60%', positionPct: 0.60, advice: '可正常执行计划，避免临时加码' };
  if (score >= 56) return { color: '黄', label: '中性', position: '40%', positionPct: 0.40, advice: '标准仓位，等待确认后再动' };
  if (score >= 44) return { color: '橙', label: '谨慎', position: '20%', positionPct: 0.20, advice: '轻仓确认、控制风险，少追单' };
  return { color: '红', label: '高风险', position: '观望', positionPct: 0, advice: '观望或轻仓，优先防守' };
}

export function buildProfileFromRequest(query = {}) {
  const engine = loadBaziEngine();
  const profile = engine.calcBaziCore({
    date: query.birth || query.date || '1985-06-15',
    time: query.time || '12:00',
    gender: query.gender || 'F',
    timeKnown: query.timeKnown !== 'false',
    calendar: query.calendar === 'lunar' ? 'lunar' : 'solar',
    leapMonth: query.leapMonth === 'true',
    city: parseCityParam(query.city),
    ziPolicy: query.ziPolicy || 'late-zi-next-day'
  });
  if (!profile) throw new Error('profile_calculation_failed');
  return profile;
}

export function ganzhiForDate(dateLike) {
  const engine = loadBaziEngine();
  const date = dateLike ? new Date(`${dateLike}T12:00:00`) : new Date();
  return engine.gzDayD(date);
}

export function monthGanzhi(year, month) {
  return loadBaziEngine().gzMonth(year, month);
}

export function scoreFromProfileAndGanzhi(profile, ganzhi, ctx = {}) {
  const engine = loadBaziEngine();
  // 统一分数源 v3：与前端 renderLuck / actionRead 完全同一套算法（唯一实现在 bazi-engine.js）。
  // 约定与前端一致：当日 dr 只按当日干支（大运由 profile 自动注入流日互动），
  // 年/月/大运通过 foundation 分层进入综合底盘，最终行动指数走 actionScore。
  const today = { year: ctx.year, month: ctx.month, day: ganzhi };
  const dr = engine.dailyReadFull(profile, { day: ganzhi });
  const foundation = engine.foundationRead(profile, today);
  const action = engine.actionScore(profile, today, dr, foundation);
  return { score: action.score, read: dr, base: foundation.score, action, foundation };
}
