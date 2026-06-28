// Madeshed Bazi API - Daily Score
// Returns placeholder score that varies by date (v0.1 - no real bazi engine yet)

const COLORS = ['深红', '红', '橙', '黄', '浅绿', '绿', '深绿'];

function pickColor(score) {
  if (score >= 85) return '深绿';
  if (score >= 75) return '绿';
  if (score >= 65) return '浅绿';
  if (score >= 55) return '黄';
  if (score >= 45) return '橙';
  if (score >= 35) return '红';
  return '深红';
}

export default function handler(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const birth = req.query.birth || '1985-06-15';

  // Deterministic placeholder: same date -> same score
  const seed = date.split('-').reduce((s, n) => s + parseInt(n, 10), 0);
  const score = 55 + (seed % 35); // 55-89 range
  const color = pickColor(score);

  res.status(200).json({
    date,
    birth,
    score,
    color,
    position_pct: score > 70 ? 0.80 : 0.50,
    advice: score > 70 ? '按计划交易' : '减仓观望',
    alerts: [
      {
        level: 'warn',
        title: '流日地支冲突',
        body: '流日地支 卯 与日柱地支 辰 害,操作避免冲动'
      }
    ],
    components: {
      compatibility: 34.5,
      dayun_multiplier: 1.08,
      yearly_baseline: 8,
      current_dayun_pillar: '庚申'
    },
    _placeholder: true,
    _note: 'v0.1 returns deterministic placeholder. Real bazi engine arrives in v0.2.'
  });
}
