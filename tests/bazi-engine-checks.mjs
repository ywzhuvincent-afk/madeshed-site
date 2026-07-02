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

// ---- 9. 服务端统一分数源 ----
const s1 = scoreFromProfileAndGanzhi(p1, '丙子', { year: '丙午', month: '甲午', dayun: '丁亥' });
assert.ok(Number.isFinite(s1.score), '服务端分数有效');
assert.ok(Number.isFinite(s1.read.tiaohouAdjust), '服务端已走增强通道（含调候）');
assert.ok(s1.read.cScore != null, '服务端保留财运维度');

console.log('BaZi engine v2 checks passed');
