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

export function actionBand(score) {
  if (score >= 78) return { color: '浅绿', label: '高顺势', positionPct: 0.82, advice: '按计划推进，仍然控制仓位上限' };
  if (score >= 66) return { color: '绿', label: '顺势', positionPct: 0.68, advice: '可正常执行计划，避免临时加码' };
  if (score >= 54) return { color: '黄', label: '中性', positionPct: 0.45, advice: '轻仓验证，重点观察执行纪律' };
  if (score >= 42) return { color: '橙', label: '谨慎', positionPct: 0.25, advice: '降低仓位，减少冲动交易' };
  return { color: '红', label: '高风险', positionPct: 0.08, advice: '优先防守，重大交易延后' };
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

export function scoreFromProfileAndGanzhi(profile, ganzhi) {
  const engine = loadBaziEngine();
  const read = engine.dailyRead(profile, { day: ganzhi });
  const base = engine.chartScore(profile, ganzhi);
  const score = Math.max(24, Math.min(92, Math.round(base * 0.54 + (read?.zScore || 60) * 0.26 + (read?.cScore || 55) * 0.2)));
  return { score, read, base };
}
