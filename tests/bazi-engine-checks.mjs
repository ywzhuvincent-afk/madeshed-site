// 八字引擎 v2 单元测试：排盘、司令分野、调候表、合会、五合、特殊格局、增强流日、前后端同源
import assert from 'node:assert/strict';
import { loadBaziEngine, scoreFromProfileAndGanzhi } from '../api/_bazi-runtime.js';

const e = loadBaziEngine();

function cast(date, time, city, ziPolicy) {
  return e.calcBaziCore({ date, time, gender: 'M', timeKnown: true, calendar: 'solar', city: city || null, ziPolicy: ziPolicy || 'late-zi-next-day' });
}

// ---- 1. 排盘 + 真太阳时（含均时差）----
const p1 = cast('1987-03-05', '07:45', { name: '上海', lng: 121.47, tz: 8 });
assert.equal(Object.values(p1.pillarsStr).join(' '), '丁卯 壬寅 癸丑 丙辰', '1987-03-05 上海排盘');
assert.equal(p1.trueSolarOffsetMinutes, -6, '真太阳时偏移应含均时差（-6 分）');
assert.equal(p1.kongWang.join(''), '寅卯', '癸丑日旬空应为寅卯');
assert.equal(p1.siLing, '甲', '寅月节后29天当令应为甲');
assert.equal(p1.daysAfterJie, 29, '立春后天数');

// 乌鲁木齐 23:30 → 真太阳时 21:20，时柱应为亥时而非子时
const p2 = cast('1990-06-15', '23:30', { name: '乌鲁木齐', lng: 87.62, tz: 8 });
assert.equal(p2.pillarsStr.hour[1], '亥', '乌鲁木齐 23:30 真太阳时应为亥时');
assert.equal(p2.ziSegment, 'none', '不应触发子时规则');

// ---- 2. 司令分野 ----
assert.equal(e.siLingStem('寅', 3), '戊');
assert.equal(e.siLingStem('寅', 10), '丙');
assert.equal(e.siLingStem('寅', 20), '甲');
assert.equal(e.siLingStem('子', 5), '壬');
assert.equal(e.siLingStem('子', 15), '癸');

// ---- 3. 调候表（穷通宝鉴120格）----
assert.equal(e.tiaohouFor('庚', '子').els[0], '火', '庚金子月首取丁火');
assert.equal(e.tiaohouFor('甲', '寅').stems.join(''), '丙癸', '甲木寅月取丙癸');
assert.ok(e.tiaohouFor('丙', '亥').els.indexOf('木') >= 0, '丙火亥月含甲木');
// 全表完整性：10 日主 × 12 月支全部有值
['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'].forEach((s) => {
  ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'].forEach((b) => {
    assert.ok(e.tiaohouFor(s, b).stems.length >= 1, `调候表缺 ${s}×${b}`);
  });
});

// ---- 4. 合会 / 五合检测 ----
const combos = e.detectCombos(['申', '子', '辰', '酉']);
assert.ok(combos.some((c) => c.kind === '三合' && c.el === '水'), '申子辰三合水局');
assert.ok(combos.some((c) => c.kind === '六合' && c.members === '辰酉'), '辰酉六合');
assert.ok(e.detectCombos(['寅', '卯', '辰']).some((c) => c.kind === '三会' && c.el === '木'), '寅卯辰三会木方');
assert.ok(e.detectCombos(['子', '辰']).some((c) => c.kind === '半合' && c.el === '水'), '子辰半合水');
const sc = e.stemCombos(['甲', '己', '丙', '壬']);
assert.ok(sc.some((c) => c.kind === '五合' && c.el === '土'), '甲己五合化土');
assert.ok(sc.some((c) => c.kind === '天干冲' && c.members === '丙壬'), '丙壬天干冲');

// ---- 5. 十神（含阴阳正偏）----
assert.equal(e.tenGodFor('甲', '庚'), '七杀');
assert.equal(e.tenGodFor('甲', '辛'), '正官');
assert.equal(e.tenGodFor('癸', '丙'), '正财');
assert.equal(e.tenGodFor('癸', '壬'), '劫财');

// ---- 6. 特殊格局：从弱 / 专旺（喜忌应反转）----
const pf = cast('1950-12-10', '18:00');
assert.equal(pf.structure.type, 'follow-weak', '1950-12-10 应判从弱');
assert.ok(pf.yongShen.jiCn.indexOf('土') >= 0, '从弱格日主（土）应转为忌');
assert.ok(pf.yongShen.jiCn.indexOf('火') >= 0, '从弱格印星（火）应转为忌');
assert.ok(pf.yongShen.xiCn.indexOf('土') < 0, '从弱格喜方不应含日主五行');

const pd = cast('1958-06-20', '10:00');
assert.equal(pd.structure.type, 'dominant', '1958-06-20 应判专旺（稼穑）');
assert.ok(pd.structure.label.indexOf('稼穑') >= 0, '土专旺应为稼穑格');
assert.equal(pd.yongShen.xiCn.slice(0, 2).join(''), '土火', '稼穑喜土火（顺旺）');
assert.ok(pd.yongShen.jiCn.indexOf('木') >= 0, '稼穑最忌木（逆旺神）');

// 普通格局不应误报
assert.equal(p1.structure.type, 'normal', '普通盘不应误判特殊格局');

// ---- 7. zForEl 连续分级 ----
assert.equal(e.zForEl(p1, p1.yongShen.mainCn), 80, '主用神应为 80');
assert.ok(e.zForEl(pd, '木') === 38, '专旺格逆旺神应为 38');

// ---- 8. 增强流日分析（互动/岁运/空亡）----
const r1 = e.readDayEnhanced(p1, { day: '丙子', year: '丙午', month: '甲午', dayun: '丁亥' });
assert.ok(Number.isFinite(r1.zScore) && r1.zScore >= 34 && r1.zScore <= 88, '增强流日分数在界内');
assert.equal(r1.tenGod, '正财', '癸日主见丙为正财');
assert.ok(Number.isFinite(r1.tiaohouAdjust), '调候调整存在');
// 空亡：癸丑日旬空寅卯 → 流日甲寅应触发空亡减力
const rKong = e.readDayEnhanced(p1, { day: '甲寅' });
assert.equal(rKong.kongWang, true, '流支落旬空应被识别');
// 岁运并临
const sp = e.detectCycleSpecials(p1, { yearGz: '丁亥', dayunGz: '丁亥' });
assert.ok(sp.items.some((x) => x.label === '岁运并临'), '岁运并临检测');
// 天克地冲（甲子 vs 庚午：甲庚克、子午冲）
const sp2 = e.detectCycleSpecials(p1, { yearGz: '甲子', dayunGz: '庚午' });
assert.ok(sp2.items.some((x) => x.label === '岁运天克地冲'), '天克地冲检测');
// 三合引动：流支辰 与命局(丑寅卯辰?) — 用构造盘验证引动逻辑走通即可
const rInter = e.readDayEnhanced(p1, { day: '乙巳' });
assert.ok(rInter.interaction && Array.isArray(rInter.interaction.items), '互动结构完整');

// ---- 8.5 用神逻辑不变量（防回归：喜忌自洽性）----
// 甲木酉月中和：官杀当令，喜火水、忌金土；调候庚（金）绝不能混入喜神
const ysJY = e.calcYongShen('甲', 50, '酉');
assert.equal(ysJY.mainCn, '火', '甲酉中和主用神应为火（食伤制官）');
assert.ok(ysJY.xiCn.indexOf('水') >= 0, '甲酉中和应喜水（印化杀）');
assert.ok(ysJY.jiCn.indexOf('金') >= 0, '甲酉中和应忌金（官杀旺）');
assert.ok(ysJY.xiCn.indexOf('金') < 0, '克身当令旺神（金）绝不能进喜神');
// 全维度扫描：10日主 × 12月支 × 3强弱档 —— 忌神非空、喜忌零交集、主用神必在喜内
['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'].forEach((s) => {
  ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'].forEach((b) => {
    [30, 50, 70].forEach((pct) => {
      const y = e.calcYongShen(s, pct, b);
      assert.ok(y.jiCn.length >= 1, `忌神为空: ${s}${b} pct=${pct}`);
      assert.ok(!y.xiCn.some((x) => y.jiCn.includes(x)), `喜忌冲突: ${s}${b} pct=${pct}`);
      assert.ok(y.xiCn.indexOf(y.mainCn) >= 0, `主用神不在喜内: ${s}${b} pct=${pct}`);
    });
  });
});
// 投资喜忌必须与命格喜忌同源
assert.equal(p1.wealth.xi.join(','), p1.yongShen.xi.slice(0, 3).join(','), '投资喜与命格喜同源');
assert.equal(p1.wealth.ji.join(','), p1.yongShen.ji.slice(0, 3).join(','), '投资忌与命格忌同源');

// ---- 9. 统一行动指数管道 v3：前端与服务端唯一分数源（bazi-engine.js） ----
// 9a. 引擎导出齐全
['dailyReadFull','foundationRead','actionScore','monthActionScore','monthActionDetail','trendGzForDate'].forEach((fn) => {
  assert.equal(typeof e[fn], 'function', `引擎应导出 ${fn}`);
});
// 9b. 服务端 scoreFromProfileAndGanzhi 必须逐位等于 engine.actionScore（同一套算法）
['癸未', '乙亥', '丙子', '庚戌'].forEach((dayGz) => {
  const year = '丙午', month = '甲午';
  const dr = e.dailyReadFull(p1, { day: dayGz });
  const fnd = e.foundationRead(p1, { year, month, day: dayGz });
  const act = e.actionScore(p1, { year, month, day: dayGz }, dr, fnd);
  const srv = scoreFromProfileAndGanzhi(p1, dayGz, { year, month });
  assert.equal(srv.score, act.score, `服务端行动分应等于引擎 actionScore（${dayGz}）`);
  assert.equal(srv.base, fnd.score, `服务端底盘应等于 foundation.score（${dayGz}）`);
  assert.equal(srv.read.cScore, dr.cScore, `服务端财运维度应等于 dr.cScore（${dayGz}）`);
  assert.equal(srv.read.role, dr.role, `服务端十神角色应一致（${dayGz}）`);
  assert.ok(Number.isFinite(srv.read.zScore) && Number.isFinite(srv.read.seasonalAdjust), '服务端仍走增强通道（zScore/调候）');
});
// 9c. 黄金值锁定：p1（丁卯 壬寅 癸丑 丙辰）真实历日分数不得漂移
const gm1 = e.trendGzForDate(new Date('2026-07-08T12:00:00'));
const dr1 = e.dailyReadFull(p1, { day: gm1.day });
const act1 = e.actionScore(p1, { year: gm1.year, month: gm1.month, day: gm1.day }, dr1, e.foundationRead(p1, { year: gm1.year, month: gm1.month, day: gm1.day }));
assert.equal(gm1.day, '癸未', 'p1 2026-07-08 流日干支');
assert.equal(act1.score, 46, 'p1 2026-07-08 行动指数锁定=46');
assert.equal(act1.label, '谨慎', 'p1 2026-07-08 标签锁定');
assert.equal(dr1.cScore, 49, 'p1 2026-07-08 财运锁定=49');
assert.equal(dr1.role, '比劫', 'p1 2026-07-08 十神角色');
assert.equal(e.monthActionScore(p1, new Date(2026, 6, 15)), 34, 'p1 2026年7月 流月行动分锁定=34');
const gm2 = e.trendGzForDate(new Date('2026-01-01T12:00:00'));
const dr2 = e.dailyReadFull(p1, { day: gm2.day });
const act2 = e.actionScore(p1, { year: gm2.year, month: gm2.month, day: gm2.day }, dr2, e.foundationRead(p1, { year: gm2.year, month: gm2.month, day: gm2.day }));
assert.equal(act2.score, 39, 'p1 2026-01-01 行动指数锁定=39');
assert.equal(dr2.cScore, 41, 'p1 2026-01-01 财运锁定=41');
// 9d. getTodayGZ 必须与 trendGzForDate 同源（立春边界）——杜绝仪表盘"今日"卡片与趋势/服务端在立春~正月之间漂移
const tg = e.getTodayGZ();
if (tg) {
  const tf = e.trendGzForDate(new Date());
  assert.equal(tg.year, tf.year, 'getTodayGZ 流年应与 trendGzForDate 同源(立春边界)');
  assert.equal(tg.month, tf.month, 'getTodayGZ 流月应与 trendGzForDate 同源');
  assert.equal(tg.day, tf.day, 'getTodayGZ 流日应与 trendGzForDate 同源');
}
// 2026-02-04 是立春后、农历新年前的边界日：流年必须是丙午（立春），而非乙巳（农历新年）
const boundary = e.trendGzForDate(new Date('2026-02-04T12:00:00'));
assert.equal(boundary.year, '丙午', '2026-02-04 立春后流年应为丙午');

console.log('BaZi engine v2 checks passed');
