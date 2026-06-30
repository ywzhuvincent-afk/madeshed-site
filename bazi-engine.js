(function(global){
  'use strict';

  var STEM_EL = {甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
  var BRANCH_EL = {寅:'木',卯:'木',巳:'火',午:'火',辰:'土',戌:'土',丑:'土',未:'土',申:'金',酉:'金',亥:'水',子:'水'};
  var STEM_EN = {甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'};
  var BRANCH_EN = {寅:'wood',卯:'wood',巳:'fire',午:'fire',辰:'earth',戌:'earth',丑:'earth',未:'earth',申:'metal',酉:'metal',亥:'water',子:'water'};
  var EL_CN = {wood:'木',fire:'火',earth:'土',metal:'金',water:'水'};
  var CN_TO_EN = {木:'wood',火:'fire',土:'earth',金:'metal',水:'water'};
  var GEN_NEXT = {wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
  var CTRL_NEXT = {wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};
  var HIDDEN_STEMS = {
    子:['癸'],丑:['己','癸','辛'],寅:['甲','丙','戊'],卯:['乙'],
    辰:['戊','乙','癸'],巳:['丙','戊','庚'],午:['丁','己'],未:['己','丁','乙'],
    申:['庚','壬','戊'],酉:['辛'],戌:['戊','辛','丁'],亥:['壬','甲']
  };
  var DEFAULT_CITY = {name:'北京',en:'Beijing',country:'中国',lng:116.41,tz:8};

  function genOf(el){ for(var k in GEN_NEXT){ if(GEN_NEXT[k]===el) return k; } return null; }
  function ctrlOf(el){ for(var k in CTRL_NEXT){ if(CTRL_NEXT[k]===el) return k; } return null; }
  function uniq(arr){ var out=[]; arr.forEach(function(x){ if(x && out.indexOf(x)<0) out.push(x); }); return out; }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function parseYmd(ymd){ var a=String(ymd||'').split('-').map(Number); return {y:a[0],m:a[1],d:a[2]}; }
  function parseHm(hm){ var a=String(hm||'12:00').split(':').map(Number); return {h:a[0]||0,m:a[1]||0}; }
  function partsToYmd(p){ return p.y+'-'+pad2(p.m)+'-'+pad2(p.d); }
  function partsToHm(p){ return pad2(p.h)+':'+pad2(p.mi); }
  function dateFromParts(p){ return new Date(Date.UTC(p.y,p.m-1,p.d,p.h||0,p.mi||0,0)); }
  function partsFromDate(dt){ return {y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:dt.getUTCDate(),h:dt.getUTCHours(),mi:dt.getUTCMinutes()}; }
  function addMinutes(parts, minutes){ return partsFromDate(new Date(dateFromParts(parts).getTime()+minutes*60000)); }
  function addDays(parts, days){ return partsFromDate(new Date(dateFromParts(parts).getTime()+days*86400000)); }
  function dayOfYear(parts){ var start=Date.UTC(parts.y,0,0); return Math.floor((Date.UTC(parts.y,parts.m-1,parts.d)-start)/86400000); }

  function relation(s,t){
    var SHENG={木:'火',火:'土',土:'金',金:'水',水:'木'};
    var KE={木:'土',土:'水',水:'火',火:'金',金:'木'};
    if(s===t) return s+'比和';
    if(SHENG[s]===t) return s+t+'相生';
    if(SHENG[t]===s) return t+s+'相生';
    if(KE[s]===t) return s+'克'+t;
    if(KE[t]===s) return t+'克'+s;
    return s+t;
  }

  function convertLunarToSolarYmd(ymd, leapMonth){
    if(typeof global.Lunar === 'undefined') return {ymd:ymd,error:'Lunar library not loaded'};
    var p=parseYmd(ymd);
    var lunarMonth = leapMonth ? -Math.abs(p.m) : p.m;
    var solar = global.Lunar.fromYmd(p.y,lunarMonth,p.d).getSolar();
    return {ymd:solar.toYmd(),error:null};
  }

  function calcEquationOfTimeMinutes(parts){
    var n=dayOfYear(parts);
    var b=2*Math.PI*(n-81)/364;
    return 9.87*Math.sin(2*b)-7.53*Math.cos(b)-1.5*Math.sin(b);
  }

  function calcTrueSolarOffsetMinutes(city, parts){
    city=city||DEFAULT_CITY;
    var longitudeOffset=(Number(city.lng)-Number(city.tz)*15)*4;
    var equation=calcEquationOfTimeMinutes(parts);
    return {total:Math.round(longitudeOffset+equation),longitude:longitudeOffset,equation:equation};
  }

  function applyTrueSolarTime(ymd, hm, city){
    var d=parseYmd(ymd), t=parseHm(hm);
    var base={y:d.y,m:d.m,d:d.d,h:t.h,mi:t.m};
    var offset=calcTrueSolarOffsetMinutes(city,base);
    var parts=addMinutes(base,offset.total);
    return {
      parts:parts,
      ymd:partsToYmd(parts),
      hm:partsToHm(parts),
      trueSolarOffsetMinutes:offset.total,
      longitudeOffsetMinutes:Math.round(offset.longitude),
      equationOfTimeMinutes:Math.round(offset.equation)
    };
  }

  function adjustForZiPolicy(parts, ziPolicy){
    var bazi={y:parts.y,m:parts.m,d:parts.d,h:parts.h,mi:parts.mi};
    var ziSegment='none';
    if(parts.h===23){
      ziSegment='late';
      if(ziPolicy!=='keep-clock-day'){
        var next=addDays(parts,1);
        bazi={y:next.y,m:next.m,d:next.d,h:0,mi:30};
      }
    }else if(parts.h===0){
      ziSegment='early';
    }
    return {parts:bazi, ziSegment:ziSegment};
  }

  function normalizeBirthInput(input){
    input=input||{};
    var calendar=input.calendar==='lunar'?'lunar':'solar';
    var solarYmd=input.date;
    var conversionError=null;
    if(calendar==='lunar'){
      var converted=convertLunarToSolarYmd(input.date,!!input.leapMonth);
      solarYmd=converted.ymd;
      conversionError=converted.error;
    }
    var clockTime=input.timeKnown===false?'12:00':(input.time||'12:00');
    var city=input.city||DEFAULT_CITY;
    var trueSolar=applyTrueSolarTime(solarYmd,clockTime,city);
    var adjusted=adjustForZiPolicy(trueSolar.parts,input.ziPolicy||'late-zi-next-day');
    return {
      sourceYmd:input.date,
      solarYmd:solarYmd,
      clockTime:clockTime,
      timeKnown:input.timeKnown!==false,
      city:city,
      usedCalendar:calendar,
      conversionError:conversionError,
      trueSolarYmd:trueSolar.ymd,
      trueSolarTime:trueSolar.hm,
      trueSolarOffsetMinutes:trueSolar.trueSolarOffsetMinutes,
      longitudeOffsetMinutes:trueSolar.longitudeOffsetMinutes,
      equationOfTimeMinutes:trueSolar.equationOfTimeMinutes,
      baziYmd:partsToYmd(adjusted.parts),
      baziTime:partsToHm(adjusted.parts),
      baziParts:adjusted.parts,
      ziPolicy:input.ziPolicy||'late-zi-next-day',
      ziSegment:adjusted.ziSegment
    };
  }

  function solarFromBirthInput(input){
    var norm=normalizeBirthInput(input);
    if(norm.conversionError || typeof global.Solar === 'undefined') return {solar:null,normalized:norm};
    var p=norm.baziParts;
    return {solar:global.Solar.fromYmdHms(p.y,p.m,p.d,p.h,p.mi,0),normalized:norm};
  }

  function calcStrength(stems, branches, hideGans){
    var D=STEM_EN[stems[2]], gen=genOf(D), support=0, total=0;
    var counts={木:0,火:0,土:0,金:0,水:0};
    function countStem(s){ var cn=STEM_EL[s]; if(cn) counts[cn]++; }
    function countBranch(b){ var cn=BRANCH_EL[b]; if(cn) counts[cn]++; }
    stems.forEach(countStem); branches.forEach(countBranch);
    function add(el,w){ total+=w; if(el===D||el===gen) support+=w; }
    var stemW=[1,1.2,0,1];
    stems.forEach(function(s,i){ if(i===2){support+=1.4; total+=1.4; return;} add(STEM_EN[s],stemW[i]); });
    var brW=[1.1,3.0,1.4,1.1];
    branches.forEach(function(b,i){ add(BRANCH_EN[b],brW[i]); });
    (hideGans||branches.map(function(b){return HIDDEN_STEMS[b]||[];})).forEach(function(arr,i){
      arr.forEach(function(g,j){ add(STEM_EN[g],(j===0?0.5:0.25)*(i===1?1.6:1)); });
    });
    var pct=Math.round(support/total*100);
    var label=pct<=24?'太弱':pct<=42?'偏弱':pct<58?'均衡':pct<=78?'偏强':'太强';
    return {pct:pct,score:pct,label:label,category:label==='均衡'?'中和':label,strong:pct>=50,counts:counts};
  }

  function seasonOf(monthBranch){
    if(['寅','卯','辰'].indexOf(monthBranch)>=0) return 'spring';
    if(['巳','午','未'].indexOf(monthBranch)>=0) return 'summer';
    if(['申','酉','戌'].indexOf(monthBranch)>=0) return 'autumn';
    return 'winter';
  }

  function calcYongShen(dgStem, strengthPct, monthBranch){
    var D=STEM_EN[dgStem], gen=genOf(D), child=GEN_NEXT[D], wealth=CTRL_NEXT[D], officer=ctrlOf(D);
    var season=seasonOf(monthBranch), xi=[], ji=[], main, note='';
    if(strengthPct>=58){
      xi=[child,wealth,officer]; ji=[gen,D];
      main=season==='summer'?'water':(season==='winter'?'fire':child);
      note='日主偏旺，宜泄宜耗宜克：用食伤泄秀、财星耗身、官杀制身；忌印比生扶。';
      if(season==='summer'&&xi.indexOf('water')<0) xi.unshift('water');
      if(season==='winter'&&xi.indexOf('fire')<0) xi.unshift('fire');
    }else if(strengthPct<=42){
      xi=[gen,D]; ji=[child,wealth,officer]; main=gen;
      note='日主偏弱，宜生宜扶：以印星生身、比劫帮身为喜；忌财官食伤再耗。';
    }else{
      if(season==='summer'){ xi=['water','metal']; ji=['fire']; main='water'; }
      else if(season==='winter'){ xi=['fire','wood']; ji=['water']; main='fire'; }
      else if(season==='spring'){ xi=['fire','metal']; ji=[]; main='fire'; }
      else { xi=['fire','water']; ji=[]; main='fire'; }
      note='日主中和，以调候为主。';
    }
    xi=uniq(xi); ji=uniq(ji);
    return {xi:xi,ji:ji,main:main,note:note,xiCn:xi.map(function(e){return EL_CN[e];}),jiCn:ji.map(function(e){return EL_CN[e];}),mainCn:EL_CN[main]};
  }

  function calcWealth(dgStem, strengthPct){
    var D=STEM_EN[dgStem], gen=genOf(D), child=GEN_NEXT[D], wealth=CTRL_NEXT[D];
    var YANG={甲:1,丙:1,戊:1,庚:1,壬:1}, isYang=!!YANG[dgStem];
    var ES={wood:['甲','乙'],fire:['丙','丁'],earth:['戊','己'],metal:['庚','辛'],water:['壬','癸']};
    var pian=ES[wealth][isYang?0:1], zheng=ES[wealth][isYang?1:0];
    var xi, ji, band, color, note, alert;
    if(strengthPct>=58){
      band='身强 · 担得起财'; color='#4ade80'; xi=[wealth,child]; ji=[D,gen];
      note='日主偏旺、担得起财，行财星与食伤之运，财气较易流通。';
      alert='防比劫旺导致争财、冲动加仓或分润。';
    }else if(strengthPct<=42){
      band='身弱 · 财多身弱'; color='#f87171'; xi=[D,gen]; ji=[wealth,child];
      note='日主偏弱、担财吃力，宜先得印比帮扶。';
      alert='逢财星旺时最忌追高与加杠杆。';
    }else{
      band='中和 · 财可担、宜节制'; color='#fbbf24'; xi=[wealth,child]; ji=[D];
      note='日主中和，财可担但宜节制。';
      alert='仍需防比劫旺时的情绪化加码。';
    }
    return {wealth:wealth,wealthCn:EL_CN[wealth],pian:pian,zheng:zheng,xi:uniq(xi),ji:uniq(ji),note:note,alert:alert,band:band,color:color};
  }

  function buildDaYun(ec, gender, birthYmd){
    var out=[], idx=-1;
    try{
      var flag=(gender==='M'||gender===1||gender==='1')?1:0;
      var list=ec.getYun(flag).getDaYun();
      var d=parseYmd(birthYmd);
      var age=(new Date()-new Date(d.y,d.m-1,d.d))/31557600000;
      for(var i=0;i<list.length&&out.length<8;i++){
        var dy=list[i], gz=dy.getGanZhi?dy.getGanZhi():'';
        if(!gz||gz.length<2) continue;
        var sa=dy.getStartAge(), ea=dy.getEndAge?dy.getEndAge():sa+10;
        out.push({pillar:gz,startAge:sa,endAge:ea,range:sa+'-'+ea,startYear:dy.getStartYear?dy.getStartYear():null,endYear:dy.getEndYear?dy.getEndYear():null});
        if(age>=sa&&age<ea+1) idx=out.length-1;
      }
    }catch(e){}
    return {daYun:out,currentDayunIdx:idx};
  }

  function calcBaziCore(input){
    var built=solarFromBirthInput(input);
    if(!built.solar) return null;
    var lunar=built.solar.getLunar();
    var ec=lunar.getEightChar();
    var y=ec.getYear(), mo=ec.getMonth(), d=ec.getDay(), t=ec.getTime();
    var stems=[y[0],mo[0],d[0],t[0]], branches=[y[1],mo[1],d[1],t[1]];
    var pillars=[y,mo,d,t].map(function(s){return {stem:s[0],branch:s[1]};});
    var hidden=branches.map(function(b){return HIDDEN_STEMS[b]||[];});
    var strength=calcStrength(stems,branches,hidden);
    var yong=calcYongShen(stems[2],strength.pct,branches[1]);
    var wealth=calcWealth(stems[2],strength.pct);
    var dy=buildDaYun(ec,input.gender,built.normalized.solarYmd);
    var dayEl=STEM_EL[stems[2]], monthEl=BRANCH_EL[branches[1]];
    return {
      birth:built.normalized.solarYmd,
      sourceBirth:built.normalized.sourceYmd,
      time:built.normalized.clockTime,
      timeKnown:built.normalized.timeKnown,
      gender:input.gender,
      pillars:pillars,
      pillarsStr:{year:y,month:mo,day:d,hour:t},
      dayStem:stems[2],
      dayElement:dayEl,
      monthBranch:branches[1],
      monthElement:monthEl,
      monthRelation:relation(monthEl,dayEl),
      strength:strength,
      yongShen:yong,
      wealth:wealth,
      daYun:dy.daYun,
      currentDayunIdx:dy.currentDayunIdx,
      inputMeta:built.normalized,
      usedCalendar:built.normalized.usedCalendar,
      trueSolarTime:built.normalized.trueSolarTime,
      trueSolarOffsetMinutes:built.normalized.trueSolarOffsetMinutes,
      ziSegment:built.normalized.ziSegment
    };
  }

  function zForEl(profile,elCn){
    var dayEl=profile.dayElement, cat=profile.strength.category;
    var SHENG={木:'火',火:'土',土:'金',金:'水',水:'木'};
    var KE={木:'土',土:'水',水:'火',火:'金',金:'木'};
    var yin=Object.keys(SHENG).find(function(k){return SHENG[k]===dayEl;});
    var shi=SHENG[dayEl], cai=KE[dayEl], guan=Object.keys(KE).find(function(k){return KE[k]===dayEl;});
    var strong=(cat==='偏强'||cat==='太强'), weak=(cat==='偏弱'||cat==='太弱'), xi, ji;
    if(strong){xi=[shi,cai,guan];ji=[yin,dayEl];}
    else if(weak){xi=[yin,dayEl];ji=[shi,cai,guan];}
    else{xi=[cai,shi];ji=[dayEl];}
    return xi.indexOf(elCn)>=0?78:(ji.indexOf(elCn)>=0?42:60);
  }

  function dailyRead(profile,today){
    if(!profile||!today)return null;
    var liuStem=today.day.charAt(0), liuEl=STEM_EL[liuStem];
    if(!liuEl)return null;
    var dayEl=profile.dayElement, SHENG={木:'火',火:'土',土:'金',金:'水',水:'木'}, KE={木:'土',土:'水',水:'火',火:'金',金:'木'};
    var yin=Object.keys(SHENG).find(function(k){return SHENG[k]===dayEl;}), shi=SHENG[dayEl], cai=KE[dayEl], guan=Object.keys(KE).find(function(k){return KE[k]===dayEl;});
    var role=liuEl===dayEl?'比劫':liuEl===yin?'印':liuEl===shi?'食伤':liuEl===cai?'财':liuEl===guan?'官杀':'—';
    var zScore=zForEl(profile,liuEl), zLabel=zScore>=70?'顺势':(zScore<=50?'谨慎':'平稳');
    var cScore=role==='财'?(zScore>=70?82:68):role==='食伤'?75:role==='比劫'?42:role==='印'?48:role==='官杀'?50:55;
    var cLabel=role==='财'?'财星到位':role==='食伤'?'食伤生财':role==='比劫'?'比劫争财':role==='印'?'印星护身':role==='官杀'?'官杀克身':'—';
    var cWarn=role==='比劫'&&zScore<=50?'争财/冲动加仓，防破财':'';
    var advice=cWarn||((zScore>=70&&cScore>=70)?'综合与财运俱佳，可按计划执行':(zScore<=50?'轻仓或观望为主，控制风险':'中性，控制仓位、随机应变'));
    return {liuStem:liuStem,liuEl:liuEl,role:role,zScore:zScore,zLabel:zLabel,cScore:cScore,cLabel:cLabel,cWarn:cWarn,advice:advice};
  }

  function gzMonth(y,m){return global.Solar.fromYmdHms(y,m,15,12,0,0).getLunar().getEightChar().getMonth();}
  function gzDayD(dt){return global.Solar.fromYmdHms(dt.getFullYear(),dt.getMonth()+1,dt.getDate(),12,0,0).getLunar().getEightChar().getDay();}
  function gzHour(y,m,d,h){return global.Solar.fromYmdHms(y,m,d,h,0,0).getLunar().getEightChar().getTime();}
  function chartScore(profile,gz){var se=STEM_EL[gz.charAt(0)], be=BRANCH_EL[gz.charAt(1)]||se;return Math.round(zForEl(profile,se)*0.6+zForEl(profile,be)*0.4);}
  function getTodayGZ(){if(typeof global.Solar==='undefined')return null;var n=new Date();var l=global.Solar.fromYmdHms(n.getFullYear(),n.getMonth()+1,n.getDate(),12,0,0).getLunar();return{year:l.getYearInGanZhi(),month:l.getMonthInGanZhi(),day:l.getDayInGanZhi()};}

  global.MadeshedBazi = {
    STEM_EL:STEM_EL,BRANCH_EL:BRANCH_EL,STEM_EN:STEM_EN,BRANCH_EN:BRANCH_EN,EL_CN:EL_CN,CN_TO_EN:CN_TO_EN,
    DEFAULT_CITY:DEFAULT_CITY,HIDDEN_STEMS:HIDDEN_STEMS,relation:relation,
    convertLunarToSolarYmd:convertLunarToSolarYmd,calcTrueSolarOffsetMinutes:calcTrueSolarOffsetMinutes,
    applyTrueSolarTime:applyTrueSolarTime,adjustForZiPolicy:adjustForZiPolicy,normalizeBirthInput:normalizeBirthInput,
    solarFromBirthInput:solarFromBirthInput,calcStrength:calcStrength,calcYongShen:calcYongShen,
    calcWealth:calcWealth,calcBaziCore:calcBaziCore,dailyRead:dailyRead,zForEl:zForEl,
    gzMonth:gzMonth,gzDayD:gzDayD,gzHour:gzHour,chartScore:chartScore,getTodayGZ:getTodayGZ
  };
})(window);
