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

  /* ===== v2 专业数据表 ===== */
  var YANG_STEMS = {甲:1,丙:1,戊:1,庚:1,壬:1};
  var WUHE = {甲己:'土',己甲:'土',乙庚:'金',庚乙:'金',丙辛:'水',辛丙:'水',丁壬:'木',壬丁:'木',戊癸:'火',癸戊:'火'};
  var GAN_CHONG = {甲庚:1,庚甲:1,乙辛:1,辛乙:1,丙壬:1,壬丙:1,丁癸:1,癸丁:1};
  var SANHE = [{set:['申','子','辰'],el:'水'},{set:['寅','午','戌'],el:'火'},{set:['巳','酉','丑'],el:'金'},{set:['亥','卯','未'],el:'木'}];
  var SANHUI = [{set:['寅','卯','辰'],el:'木'},{set:['巳','午','未'],el:'火'},{set:['申','酉','戌'],el:'金'},{set:['亥','子','丑'],el:'水'}];
  var LIUHE = {子丑:'土',丑子:'土',寅亥:'木',亥寅:'木',卯戌:'火',戌卯:'火',辰酉:'金',酉辰:'金',巳申:'水',申巳:'水',午未:'土',未午:'土'};
  var WET_EARTH = {辰:1,丑:1}, DRY_EARTH = {未:1,戌:1};
  // 人元司令分野（节后日数 → 当令藏干）
  var SILING = {
    寅:[[7,'戊'],[7,'丙'],[16,'甲']], 卯:[[10,'甲'],[20,'乙']], 辰:[[9,'乙'],[3,'癸'],[18,'戊']],
    巳:[[5,'戊'],[9,'庚'],[16,'丙']], 午:[[10,'丙'],[9,'己'],[11,'丁']], 未:[[9,'丁'],[3,'乙'],[18,'己']],
    申:[[7,'戊'],[7,'壬'],[16,'庚']], 酉:[[10,'庚'],[20,'辛']], 戌:[[9,'辛'],[3,'丁'],[18,'戊']],
    亥:[[7,'戊'],[5,'甲'],[18,'壬']], 子:[[10,'壬'],[20,'癸']], 丑:[[9,'癸'],[3,'辛'],[18,'己']]
  };
  // 调候用神表（穷通宝鉴通行本，日主×月支 → 调候用神天干，按优先序）
  var TIAOHOU = {
    甲:{寅:'丙癸',卯:'庚丁',辰:'庚丁壬',巳:'癸丁庚',午:'癸庚丁',未:'癸庚丁',申:'丁庚壬',酉:'丁丙庚',戌:'庚甲丁',亥:'庚丁丙',子:'丁庚丙',丑:'丁庚丙'},
    乙:{寅:'丙癸',卯:'丙癸',辰:'癸丙戊',巳:'癸',午:'癸丙',未:'癸丙',申:'丙癸己',酉:'癸丙丁',戌:'癸辛',亥:'丙戊',子:'丙',丑:'丙'},
    丙:{寅:'壬庚',卯:'壬己',辰:'壬甲',巳:'壬庚癸',午:'壬庚',未:'壬庚',申:'壬戊',酉:'壬癸',戌:'甲壬',亥:'甲戊庚壬',子:'壬戊己',丑:'壬甲'},
    丁:{寅:'甲庚',卯:'庚甲',辰:'甲庚',巳:'甲庚',午:'壬庚癸',未:'甲壬庚',申:'甲庚丙戊',酉:'甲庚丙戊',戌:'甲庚戊',亥:'甲庚',子:'甲庚',丑:'甲庚'},
    戊:{寅:'丙甲癸',卯:'丙甲癸',辰:'甲丙癸',巳:'甲丙癸',午:'壬甲丙',未:'癸丙甲',申:'丙癸甲',酉:'丙癸',戌:'甲丙癸',亥:'甲丙',子:'丙甲',丑:'丙甲'},
    己:{寅:'丙庚甲',卯:'甲癸丙',辰:'丙癸甲',巳:'癸丙',午:'癸丙',未:'癸丙',申:'丙癸',酉:'丙癸',戌:'甲丙癸',亥:'丙甲戊',子:'丙甲戊',丑:'丙甲戊'},
    庚:{寅:'丙甲戊',卯:'丁甲丙',辰:'甲丁壬',巳:'壬戊丙',午:'壬癸',未:'丁甲',申:'丁甲',酉:'丁甲丙',戌:'甲壬',亥:'丁丙',子:'丁甲丙',丑:'丙丁甲'},
    辛:{寅:'己壬庚',卯:'壬甲',辰:'壬甲',巳:'壬甲癸',午:'壬己癸',未:'壬庚甲',申:'壬甲戊',酉:'壬甲',戌:'壬甲',亥:'壬丙',子:'丙戊壬',丑:'丙壬戊'},
    壬:{寅:'庚丙戊',卯:'戊辛庚',辰:'甲庚',巳:'壬辛庚',午:'癸庚辛',未:'辛甲',申:'戊丁',酉:'甲庚',戌:'甲丙',亥:'戊丙庚',子:'戊丙',丑:'丙丁甲'},
    癸:{寅:'辛丙',卯:'庚辛',辰:'丙辛甲',巳:'辛',午:'庚辛',未:'庚辛',申:'丁',酉:'辛丙',戌:'辛甲',亥:'庚辛戊',子:'丙辛',丑:'丙丁'}
  };

  function siLingStem(monthBranch, daysAfterJie){
    var segs=SILING[monthBranch]; if(!segs) return null;
    var d=Math.max(0,Number(daysAfterJie)||0), acc=0;
    for(var i=0;i<segs.length;i++){ acc+=segs[i][0]; if(d<acc) return segs[i][1]; }
    return segs[segs.length-1][1];
  }
  function tiaohouFor(dayStem, monthBranch){
    var raw=(TIAOHOU[dayStem]||{})[monthBranch]||'';
    var stems=raw.split(''), els=uniq(stems.map(function(s){return STEM_EL[s];}));
    return {stems:stems, els:els, elsEn:els.map(function(e){return CN_TO_EN[e];})};
  }
  function tenGodFor(dayStem, otherStem){
    var D=STEM_EL[dayStem], O=STEM_EL[otherStem]; if(!D||!O) return null;
    var samePolarity=!!YANG_STEMS[dayStem]===!!YANG_STEMS[otherStem];
    var SHENG={木:'火',火:'土',土:'金',金:'水',水:'木'}, KE={木:'土',土:'水',水:'火',火:'金',金:'木'};
    if(O===D) return samePolarity?'比肩':'劫财';
    if(SHENG[O]===D) return samePolarity?'偏印':'正印';
    if(SHENG[D]===O) return samePolarity?'食神':'伤官';
    if(KE[D]===O) return samePolarity?'偏财':'正财';
    if(KE[O]===D) return samePolarity?'七杀':'正官';
    return null;
  }
  function detectCombos(branches){
    var out=[], present={}, counts={};
    branches.forEach(function(b){ if(b){present[b]=1; counts[b]=(counts[b]||0)+1;} });
    SANHUI.forEach(function(g){ if(g.set.every(function(b){return present[b];})) out.push({kind:'三会',el:g.el,members:g.set.join('')}); });
    SANHE.forEach(function(g){
      var have=g.set.filter(function(b){return present[b];});
      if(have.length===3){ out.push({kind:'三合',el:g.el,members:g.set.join('')}); }
      else if(have.length===2 && have.indexOf(g.set[1])>=0){ out.push({kind:'半合',el:g.el,members:have.join('')}); }
    });
    var seen={};
    branches.forEach(function(a,i){ branches.forEach(function(b,j){
      if(i>=j||!a||!b) return; var key=a+b;
      if(LIUHE[key] && !seen[a+'/'+b]){ seen[a+'/'+b]=1; out.push({kind:'六合',el:LIUHE[key],members:a+b}); }
    }); });
    return out;
  }
  function stemCombos(stems){
    var out=[];
    stems.forEach(function(a,i){ stems.forEach(function(b,j){
      if(i>=j||!a||!b) return;
      if(WUHE[a+b]) out.push({kind:'五合',el:WUHE[a+b],members:a+b,idx:[i,j]});
      else if(GAN_CHONG[a+b]) out.push({kind:'天干冲',members:a+b,idx:[i,j]});
    }); });
    return out;
  }

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

  function calcStrength(stems, branches, hideGans, opts){
    opts=opts||{};
    var D=STEM_EN[stems[2]], Dcn=STEM_EL[stems[2]], gen=genOf(D), support=0, total=0;
    var counts={木:0,火:0,土:0,金:0,水:0};
    stems.forEach(function(s){ var cn=STEM_EL[s]; if(cn) counts[cn]++; });
    branches.forEach(function(b){ var cn=BRANCH_EL[b]; if(cn) counts[cn]++; });
    function add(el,w){ total+=w; if(el===D||el===gen) support+=w; }
    // 天干五合绊：相邻两干相合（不含日主）则力量互绊打折；化神当令则化气增力
    var stemW=[1,1.2,0,1];
    var monthMainEl=BRANCH_EN[branches[1]];
    stemCombos(stems).forEach(function(c){
      if(c.kind!=='五合') return;
      if(c.idx.indexOf(2)>=0) return; // 日主之合在格局层处理
      if(Math.abs(c.idx[0]-c.idx[1])!==1) return; // 只按紧贴论合
      if(CN_TO_EN[c.el]===monthMainEl){ add(CN_TO_EN[c.el],0.6); } // 化神当令：合化增力
      else { c.idx.forEach(function(i){ if(i!==2) stemW[i]*=0.6; }); } // 合而不化：互绊
    });
    stems.forEach(function(s,i){ if(i===2){support+=1.4; total+=1.4; return;} add(STEM_EN[s],stemW[i]); });
    // 地支本气：燥湿土区分（湿土辰丑生金有力、燥土未戌脆金助火）
    var brW=[1.1,3.0,1.4,1.1];
    branches.forEach(function(b,i){
      var el=BRANCH_EN[b], w=brW[i];
      if(el==='earth'){
        if(D==='metal' && DRY_EARTH[b]) w*=0.55;      // 燥土难生金
        if(D==='fire' && WET_EARTH[b]) { total+=0.4; } // 湿土晦火额外耗力
      }
      add(el,w);
    });
    // 藏干：司令分野——当令藏干加重，余支按主中余递减
    var siLing=opts.daysAfterJie!=null?siLingStem(branches[1],opts.daysAfterJie):null;
    (hideGans||branches.map(function(b){return HIDDEN_STEMS[b]||[];})).forEach(function(arr,i){
      arr.forEach(function(g,j){
        var w=(j===0?0.5:0.25);
        if(i===1) w*=(siLing&&g===siLing)?2.2:1.2;
        add(STEM_EN[g],w);
      });
    });
    // 地支合会入算：三会>三合>半合>六合，会局五行按整体增力
    var combos=detectCombos(branches);
    combos.forEach(function(c){
      var w=c.kind==='三会'?2.4:(c.kind==='三合'?1.8:(c.kind==='半合'?0.7:0.5));
      add(CN_TO_EN[c.el],w);
    });
    var pct=Math.round(support/total*100);
    var label=pct<=24?'太弱':pct<=42?'偏弱':pct<58?'均衡':pct<=78?'偏强':'太强';
    return {pct:pct,score:pct,label:label,category:label==='均衡'?'中和':label,strong:pct>=50,counts:counts,siLing:siLing,combos:combos};
  }
  // 日主得根强度：本气根1分、中气0.5、余气0.3（从格判定核心依据）
  function dayMasterRootScore(dayStem, branches){
    var D=STEM_EL[dayStem], score=0;
    branches.forEach(function(b){
      var hid=HIDDEN_STEMS[b]||[];
      hid.forEach(function(g,j){ if(STEM_EL[g]===D) score+=(j===0?1:(j===1?0.5:0.3)); });
    });
    return score;
  }
  function detectSpecialStructure(stems, branches, strength){
    var dayStem=stems[2], D=STEM_EL[dayStem], DEn=STEM_EN[dayStem];
    var gen=genOf(DEn), genCn=EL_CN[gen];
    var rootScore=dayMasterRootScore(dayStem, branches);
    var yinRoot=0; branches.forEach(function(b){ (HIDDEN_STEMS[b]||[]).forEach(function(g,j){ if(STEM_EL[g]===genCn) yinRoot+=(j===0?1:(j===1?0.5:0.3)); }); });
    var yinTouGan=stems.filter(function(s,i){ return i!==2 && STEM_EL[s]===genCn; }).length;
    var counts=strength.counts||{};
    if(strength.pct<=22 && rootScore<=0.3 && yinTouGan===0){
      // 从弱候选：日主无根、印星不透。找独旺一方顺势而从
      var drainEls=['木','火','土','金','水'].filter(function(e){ return e!==D && e!==genCn; });
      drainEls.sort(function(a,b){ return (counts[b]||0)-(counts[a]||0); });
      var dominant=drainEls[0];
      var confidence=(yinRoot<=0.5)?'likely':'candidate';
      return {type:'follow-weak',label:'从弱格'+(confidence==='likely'?'':'（候选）'),confidence:confidence,dominant:dominant,rootScore:rootScore,
        note:confidence==='likely'
          ?'日主无根无印、克泄一方独旺，按弃命从势取用：顺从旺势（'+dominant+'）为喜，生扶日主反而不利。'
          :'此盘接近从弱特殊格局（日主近乎无根），自动判定存在不确定性，建议人工复核；当前按从势倾向给出参考。'};
    }
    if(strength.pct>=86 && ((counts[EL_CN[CTRL_NEXT[DEn]]]||0)+(counts[EL_CN[ctrlOf(DEn)]]||0))<=0.5){
      var names={木:'曲直',火:'炎上',土:'稼穑',金:'从革',水:'润下'};
      return {type:'dominant',label:(names[D]||'专旺')+'格（候选）',confidence:'candidate',dominant:D,rootScore:rootScore,
        note:'一行得气、旺之极者，宜顺不宜逆：喜比劫印绶助其旺、食伤泄其秀，最忌官杀强行克制（逆旺神）。'};
    }
    return {type:'normal',label:'普通格局',confidence:'normal',dominant:null,rootScore:rootScore,note:''};
  }

  function seasonOf(monthBranch){
    if(['寅','卯','辰'].indexOf(monthBranch)>=0) return 'spring';
    if(['巳','午','未'].indexOf(monthBranch)>=0) return 'summer';
    if(['申','酉','戌'].indexOf(monthBranch)>=0) return 'autumn';
    return 'winter';
  }

  function calcYongShen(dgStem, strengthPct, monthBranch, stems, branches, strengthObj){
    var D=STEM_EN[dgStem], gen=genOf(D), child=GEN_NEXT[D], wealth=CTRL_NEXT[D], officer=ctrlOf(D);
    var th=tiaohouFor(dgStem, monthBranch);
    var structure={type:'normal',label:'普通格局',confidence:'normal',note:'',dominant:null};
    if(stems&&branches&&strengthObj) structure=detectSpecialStructure(stems,branches,strengthObj);
    var xi=[], ji=[], main, note='';
    if(structure.type==='follow-weak'){
      // 从弱：顺从旺势，旺神与生旺神者为喜；印比生扶反为忌
      var domEn=CN_TO_EN[structure.dominant];
      var feeder=genOf(domEn); // 生旺神者
      xi=[domEn]; if(feeder&&feeder!==D&&feeder!==gen) xi.push(feeder);
      ji=[gen,D];
      main=domEn;
      note=structure.note;
    }else if(structure.type==='dominant'){
      // 专旺：顺其旺势，比劫印绶食伤为喜，官杀逆旺最忌
      xi=[D,gen,child]; ji=[officer]; main=D;
      note=structure.note;
    }else if(strengthPct>=58){
      xi=[child,wealth,officer]; ji=[gen,D]; main=child;
      note='日主偏旺，宜泄宜耗宜克：用食伤泄秀、财星耗身、官杀制身；忌印比生扶。';
    }else if(strengthPct<=42){
      xi=[gen,D]; ji=[child,wealth,officer]; main=gen;
      note='日主偏弱，宜生宜扶：以印星生身、比劫帮身为喜；忌财官食伤再耗。';
    }else{
      // 中和：以月令旺神为纲——当令者旺，旺者宜制化，弱者宜扶通
      var M=BRANCH_EN[monthBranch], rel;
      if(M===D)rel='比劫'; else if(M===gen)rel='印'; else if(M===child)rel='食伤'; else if(M===wealth)rel='财'; else rel='官杀';
      if(rel==='官杀'){ xi=[child,gen]; ji=[officer,wealth]; main=child;
        note='日主中和而月令官杀当令：先以食伤制官、印星化杀通关；忌官杀再旺、财星生杀。'; }
      else if(rel==='财'){ xi=[D,gen]; ji=[wealth,child]; main=D;
        note='日主中和而月令财星当令：喜比劫护身担财、印星生身；忌财食再旺盗泄日主。'; }
      else if(rel==='印'){ xi=[wealth,child]; ji=[gen,D]; main=wealth;
        note='日主中和而月令印星当令：喜财星制印、食伤流通；忌印比再助致偏枯。'; }
      else if(rel==='比劫'){ xi=[officer,child,wealth]; ji=[D,gen]; main=officer;
        note='日主中和而月令比劫当令：喜官杀制劫、食伤泄秀、财星为养；忌印比再助。'; }
      else { xi=[gen,D]; ji=[child,wealth]; main=gen;
        note='日主中和而月令食伤当令：喜印星制伤生身、比劫帮身；忌食伤财星再泄。'; }
    }
    // 调候（穷通宝鉴120格）：调候表描述的是"配置需求"（如丁制庚、庚劈甲），
    // 只有与扶抑/月令喜忌不冲突时才升级为行运喜神；冲突时仅注明配置之意，绝不覆盖忌神。
    var thNote='';
    if(structure.type==='normal' && th.elsEn.length){
      var thPrimary=th.elsEn[0];
      if(ji.indexOf(thPrimary)>=0){
        thNote='调候：'+monthBranch+'月'+dgStem+'日，穷通宝鉴取 '+th.stems.join('')+'；唯 '+th.els[0]+' 为本局忌神，取其制化配置之意（非行运喜神），行运喜忌仍以上述为准。';
      }else{
        if(xi.indexOf(thPrimary)<0) xi.push(thPrimary);
        if(strengthPct>42&&strengthPct<58&&xi.indexOf(thPrimary)>=0) main=thPrimary;
        thNote='调候：'+monthBranch+'月'+dgStem+'日，穷通宝鉴取 '+th.stems.join('')+'（'+th.els.join('')+'）为调候用神。';
      }
    }
    xi=uniq(xi); ji=uniq(ji);
    return {xi:xi,ji:ji,main:main,note:note+(thNote?' '+thNote:''),
      xiCn:xi.map(function(e){return EL_CN[e];}),jiCn:ji.map(function(e){return EL_CN[e];}),mainCn:EL_CN[main],
      structure:structure,tiaohou:{stems:th.stems,els:th.els,elsEn:th.elsEn}};
  }

  function calcWealth(dgStem, strengthPct, yong){
    var D=STEM_EN[dgStem], gen=genOf(D), child=GEN_NEXT[D], wealth=CTRL_NEXT[D];
    var YANG={甲:1,丙:1,戊:1,庚:1,壬:1}, isYang=!!YANG[dgStem];
    var ES={wood:['甲','乙'],fire:['丙','丁'],earth:['戊','己'],metal:['庚','辛'],water:['壬','癸']};
    var pian=ES[wealth][isYang?0:1], zheng=ES[wealth][isYang?1:0];
    var band, color, note, alert;
    if(strengthPct>=58){
      band='身强 · 担得起财'; color='#4ade80';
      note='日主偏旺、担得起财，行财星与食伤之运，财气较易流通。';
      alert='防比劫旺导致争财、冲动加仓或分润。';
    }else if(strengthPct<=42){
      band='身弱 · 财多身弱'; color='#f87171';
      note='日主偏弱、担财吃力，宜先得印比帮扶。';
      alert='逢财星旺时最忌追高与加杠杆。';
    }else{
      band='中和 · 财可担、宜节制'; color='#fbbf24';
      note='日主中和，财可担但宜节制；喜忌随月令旺神取制化。';
      alert='流日逢劫财（同类五行争财）时防情绪化加码。';
    }
    // 投资喜忌与命格喜忌统一同源（yongShen），不再各算一套
    var xi=(yong&&yong.xi&&yong.xi.length)?yong.xi.slice(0,3):[wealth,child];
    var ji=(yong&&yong.ji&&yong.ji.length)?yong.ji.slice(0,3):[D];
    if(yong&&yong.structure&&yong.structure.type==='follow-weak')alert='从弱格顺势而行：生扶日主之运反主破财，切忌逆势重仓。';
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
    var daysAfterJie=null, kongWang=[];
    try{
      var jie=lunar.getPrevJie(); var js=jie&&jie.getSolar&&jie.getSolar();
      if(js){ var jd=Date.UTC(js.getYear(),js.getMonth()-1,js.getDay()), bd=Date.UTC(built.normalized.baziParts.y,built.normalized.baziParts.m-1,built.normalized.baziParts.d);
        daysAfterJie=Math.max(0,Math.round((bd-jd)/86400000)); }
    }catch(e){}
    try{ kongWang=String(ec.getDayXunKong()||'').split('').filter(Boolean); }catch(e){}
    var strength=calcStrength(stems,branches,hidden,{daysAfterJie:daysAfterJie});
    var yong=calcYongShen(stems[2],strength.pct,branches[1],stems,branches,strength);
    var wealth=calcWealth(stems[2],strength.pct,yong);
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
      daysAfterJie:daysAfterJie,
      siLing:strength.siLing||null,
      kongWang:kongWang,
      structure:yong.structure,
      tiaohou:yong.tiaohou,
      inputMeta:built.normalized,
      usedCalendar:built.normalized.usedCalendar,
      trueSolarTime:built.normalized.trueSolarTime,
      trueSolarOffsetMinutes:built.normalized.trueSolarOffsetMinutes,
      ziSegment:built.normalized.ziSegment
    };
  }

  function zForEl(profile,elCn){
    // v2 连续分级：主用神80 / 喜73 / 中性60 / 忌45 / 逆旺神38（专旺格官杀）
    var ys=profile.yongShen;
    if(ys&&ys.xiCn){
      if(ys.mainCn===elCn) return 80;
      if(ys.xiCn.indexOf(elCn)>=0) return 73;
      if(ys.structure&&ys.structure.type==='dominant'&&ys.jiCn.indexOf(elCn)>=0) return 38;
      if(ys.jiCn&&ys.jiCn.indexOf(elCn)>=0) return 45;
      return 60;
    }
    // 兼容旧 profile（无 yongShen 对象时按扶抑口径）
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

  /* ===== v2 流日/岁运互动分析 ===== */
  function isXiEl(profile, elCn){ return zForEl(profile, elCn)>=70; }
  function isJiEl(profile, elCn){ return zForEl(profile, elCn)<=50; }
  // 流支与命局+岁运支的全互动：冲刑害合 + 三合半合三会引动 + 空亡
  function analyzeFlowInteractions(profile, flowGz, extras){
    var flow=String(flowGz||''), fStem=flow.charAt(0), fBranch=flow.charAt(1);
    var items=[], adjust=0, penalty=0, notes=[];
    if(!fBranch) return {adjust:0,penalty:0,items:items,note:'',kongWang:false,ganNotes:[]};
    var pool=[];
    var names=['年支','月支','日支','时支'], brW=[0.45,0.72,1,0.45];
    (profile.pillars||[]).forEach(function(p,i){ if(p.branch) pool.push({branch:p.branch,name:names[i]||'命支',w:brW[i]||0.5}); });
    (extras||[]).forEach(function(x){
      var gz=String(x.gz||''), b=gz.charAt(1);
      if(b) pool.push({branch:b,name:x.tag||'岁运',w:x.tag==='大运'?0.8:(x.tag==='流年'?0.7:0.5)});
    });
    var CHONG={子午:1,丑未:1,寅申:1,卯酉:1,辰戌:1,巳亥:1};
    var HAI={子未:1,丑午:1,寅巳:1,卯辰:1,申亥:1,酉戌:1};
    var XING={子卯:1,寅巳:1,巳申:1,寅申:1,丑戌:1,戌未:1,丑未:1,辰辰:1,午午:1,酉酉:1,亥亥:1};
    function pair(map,a,b){ return !!(map[a+b]||map[b+a]); }
    pool.forEach(function(p){
      var k=null;
      if(pair(CHONG,fBranch,p.branch)) k={label:'冲',adj:-7,pen:5};
      else if(pair(XING,fBranch,p.branch)) k={label:'刑',adj:-5,pen:4};
      else if(pair(HAI,fBranch,p.branch)) k={label:'害',adj:-4,pen:3};
      else if(LIUHE[fBranch+p.branch]) k={label:'合',adj:4,pen:0};
      else if(fBranch===p.branch) k={label:'伏吟',adj:-2,pen:2};
      if(k) items.push({pillar:p.name,branch:p.branch,label:k.label,adjust:k.adj*p.w,penalty:k.pen*p.w});
    });
    // 三合/半合/三会引动：流支与池中支构成合局，按喜忌定吉凶
    var poolBranches=pool.map(function(p){return p.branch;});
    SANHE.forEach(function(g){
      if(g.set.indexOf(fBranch)<0) return;
      var others=g.set.filter(function(b){return b!==fBranch;});
      var have=others.filter(function(b){return poolBranches.indexOf(b)>=0;});
      if(have.length===2){ var good=isXiEl(profile,g.el); items.push({combo:true,pillar:'合局',branch:g.set.join(''),label:'三合'+g.el+'局',adjust:good?8:-6,penalty:good?0:4}); notes.push('流支引动'+g.set.join('')+'三合'+g.el+'局（'+(good?'喜':'忌')+'）'); }
      else if(have.length===1&&(fBranch===g.set[1]||have[0]===g.set[1])){ var good2=isXiEl(profile,g.el); items.push({combo:true,pillar:'半合',branch:fBranch+have[0],label:'半合'+g.el,adjust:good2?3:-2.5,penalty:good2?0:1.5}); notes.push('流支与'+have[0]+'半合'+g.el+'（'+(good2?'喜':'忌')+'）'); }
    });
    SANHUI.forEach(function(g){
      if(g.set.indexOf(fBranch)<0) return;
      var others=g.set.filter(function(b){return b!==fBranch;});
      if(others.every(function(b){return poolBranches.indexOf(b)>=0;})){ var good=isXiEl(profile,g.el); items.push({combo:true,pillar:'会局',branch:g.set.join(''),label:'三会'+g.el+'方',adjust:good?9:-7,penalty:good?0:5}); notes.push('流支引动'+g.set.join('')+'三会'+g.el+'方（'+(good?'喜':'忌')+'）'); }
    });
    // 天干五合/冲：合日主=羁绊；合用神透干=用神被绊；化神当令按喜忌
    var ganNotes=[];
    var natalStems=(profile.pillars||[]).map(function(p){return p.stem;});
    var mainCn=profile.yongShen&&profile.yongShen.mainCn;
    if(fStem){
      natalStems.forEach(function(s,i){
        if(!s) return;
        if(WUHE[fStem+s]){
          if(i===2){ adjust-=3; penalty+=2; ganNotes.push('流日干合日主（羁绊，行动力受制）'); }
          else if(mainCn&&STEM_EL[s]===mainCn){ adjust-=5; penalty+=3; ganNotes.push('流日干合去用神'+s+'（用神被绊）'); }
          else { adjust-=1.5; ganNotes.push('流日干与'+names[i]+'天干相合（互绊）'); }
        }else if(GAN_CHONG[fStem+s]&&i===2){ adjust-=3; penalty+=2; ganNotes.push('流日干冲克日主'); }
      });
    }
    // 空亡：流支落日柱旬空，引动之力打折
    var kong=(profile.kongWang||[]).indexOf(fBranch)>=0;
    if(kong) notes.push('流支'+fBranch+'落空亡，吉凶之力皆减');
    adjust+=items.reduce(function(a,x){return a+x.adjust;},0);
    penalty+=items.reduce(function(a,x){return a+x.penalty;},0);
    if(kong){ adjust*=0.7; penalty*=0.75; }
    var pairItems=items.filter(function(x){return !x.combo;});
    var pairNote=pairItems.length?('四柱互动：流支'+fBranch+'与'+pairItems.slice(0,4).map(function(x){return x.pillar+(x.branch.length===1?x.branch:'')+x.label;}).join('、')+'。'):'';
    return {adjust:Math.round(adjust),penalty:Math.round(penalty),items:items,
      note:pairNote+(notes.length?notes.join('；')+'。':''),kongWang:kong,ganNotes:ganNotes};
  }
  // 岁运特殊格局：岁运并临 / 天克地冲 / 反吟伏吟
  function detectCycleSpecials(profile, ctx){
    ctx=ctx||{};
    var items=[], penalty=0;
    var dayGz=(profile.pillarsStr&&profile.pillarsStr.day)||'';
    function stemsKe(a,b){ var A=STEM_EL[a],B=STEM_EL[b],KE={木:'土',土:'水',水:'火',火:'金',金:'木'}; return KE[A]===B||KE[B]===A; }
    function branchChong(a,b){ var C={子午:1,丑未:1,寅申:1,卯酉:1,辰戌:1,巳亥:1}; return !!(C[a+b]||C[b+a]); }
    var y=String(ctx.yearGz||''), dy=String(ctx.dayunGz||'');
    if(y&&dy&&y===dy){ items.push({label:'岁运并临',detail:y}); penalty+=6; }
    if(y&&dy&&y.length===2&&dy.length===2&&stemsKe(y[0],dy[0])&&branchChong(y[1],dy[1])){ items.push({label:'岁运天克地冲',detail:y+'×'+dy}); penalty+=8; }
    if(y&&dayGz&&y===dayGz){ items.push({label:'流年伏吟日柱',detail:y}); penalty+=4; }
    if(y&&dayGz.length===2&&y.length===2&&stemsKe(y[0],dayGz[0])&&branchChong(y[1],dayGz[1])){ items.push({label:'流年反吟日柱',detail:y+'×'+dayGz}); penalty+=6; }
    return {items:items,penalty:Math.min(12,penalty),
      note:items.length?('岁运警示：'+items.map(function(x){return x.label+'（'+x.detail+'）';}).join('、')+'。'):''};
  }
  // 调候视角下的流日五行加减分
  function tiaohouAdjustFor(profile, flowElCn){
    var th=profile.tiaohou||(profile.yongShen&&profile.yongShen.tiaohou);
    if(!th||!th.els||!th.els.length||!flowElCn) return {adjust:0,note:''};
    var KE={木:'土',土:'水',水:'火',火:'金',金:'木'};
    if(flowElCn===th.els[0]) return {adjust:5,note:'调候：流日得月令第一调候用神'+flowElCn};
    if(th.els.indexOf(flowElCn)>0) return {adjust:3,note:'调候：流日带次级调候用神'+flowElCn};
    if(KE[flowElCn]===th.els[0]) return {adjust:-3,note:'调候：流日'+flowElCn+'克制调候用神'+th.els[0]+'，气候失衡'};
    return {adjust:0,note:''};
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

  // v2 统一增强流日分析：服务端与前端同一来源（藏干加权+调候表+通根透干+全互动+岁运特殊+空亡）
  function readDayEnhanced(profile, ctx){
    ctx=ctx||{};
    var gz=String(ctx.day||''), stem=gz.charAt(0), branch=gz.charAt(1);
    var stemEl=STEM_EL[stem], branchEl=BRANCH_EL[branch]||stemEl;
    if(!profile||!stemEl) return null;
    var hiddens=HIDDEN_STEMS[branch]||[];
    var hw=hiddens.length===1?[1]:(hiddens.length===2?[0.7,0.3]:[0.6,0.25,0.15]);
    var stemScore=zForEl(profile,stemEl), branchScore=zForEl(profile,branchEl);
    var hiddenScore=hiddens.length?Math.round(hiddens.reduce(function(a,g,i){return a+zForEl(profile,STEM_EL[g])*hw[i];},0)):branchScore;
    var tenGod=tenGodFor(profile.dayStem,stem);
    var th=tiaohouAdjustFor(profile,stemEl);
    var natalStems=(profile.pillars||[]).map(function(p){return p.stem;});
    var natalBranches=(profile.pillars||[]).map(function(p){return p.branch;});
    var root=natalBranches.some(function(b){return (HIDDEN_STEMS[b]||[]).some(function(g){return STEM_EL[g]===stemEl;});});
    var reveal=natalStems.indexOf(stem)>=0;
    var rootAdjust=(root?3:0)+(reveal?2:0);
    var extras=[];
    if(ctx.dayun)extras.push({gz:ctx.dayun,tag:'大运'});
    if(ctx.year)extras.push({gz:ctx.year,tag:'流年'});
    if(ctx.month)extras.push({gz:ctx.month,tag:'流月'});
    var inter=analyzeFlowInteractions(profile,gz,extras);
    var specials=(ctx.year||ctx.dayun)?detectCycleSpecials(profile,{yearGz:ctx.year,dayunGz:ctx.dayun}):{items:[],penalty:0,note:''};
    var zRaw=stemScore*0.48+branchScore*0.28+hiddenScore*0.18+th.adjust+rootAdjust+inter.adjust*0.6-specials.penalty*0.5;
    var zScore=Math.max(34,Math.min(88,Math.round(zRaw)));
    var zLabel=zScore>=70?'顺势':(zScore<=50?'谨慎':'平稳');
    return {gz:gz,liuStem:stem,liuEl:stemEl,branch:branch,branchEl:branchEl,tenGod:tenGod,
      stemScore:stemScore,branchScore:branchScore,hiddenScore:hiddenScore,
      tiaohouAdjust:th.adjust,tiaohouNote:th.note,rootAdjust:rootAdjust,root:root,reveal:reveal,
      interaction:inter,interactionPenalty:inter.penalty,kongWang:inter.kongWang,ganNotes:inter.ganNotes,
      specials:specials,zScore:zScore,zLabel:zLabel};
  }

  function gzMonth(y,m){return global.Solar.fromYmdHms(y,m,15,12,0,0).getLunar().getEightChar().getMonth();}
  function gzDayD(dt){return global.Solar.fromYmdHms(dt.getFullYear(),dt.getMonth()+1,dt.getDate(),12,0,0).getLunar().getEightChar().getDay();}
  function gzHour(y,m,d,h){return global.Solar.fromYmdHms(y,m,d,h,0,0).getLunar().getEightChar().getTime();}
  function chartScore(profile,gz){var se=STEM_EL[gz.charAt(0)], be=BRANCH_EL[gz.charAt(1)]||se;return Math.round(zForEl(profile,se)*0.6+zForEl(profile,be)*0.4);}
  // 八字流年/流月必须以立春·节气为界，而非农历正月初一。旧实现用 getYearInGanZhi/getMonthInGanZhi
  // （农历新年边界），会在立春~正月之间的 1~2 天与流年趋势/服务端(均走 trendGzForDate 的 EightChar 立春边界)不一致。
  // 统一委托 trendGzForDate，保证仪表盘"今日"卡片与趋势、服务端逐位同源且断法正确。
  function getTodayGZ(){if(typeof global.Solar==='undefined')return null;return trendGzForDate(new Date());}

  // ===== 统一行动指数管道 v3：前端与服务端唯一分数源 =====
  // 说明：以下逻辑逐字来自原前端 index.html 的 dailyRead/foundationRead/actionRead 等，
  // 只把对 BAZI.* 的调用改成引擎内部函数、Solar 改成 global.Solar、
  // 富版 dailyRead 更名为 dailyReadFull（避免与既有简版 dailyRead 冲突）。
  var A_SHENG={木:'火',火:'土',土:'金',金:'水',水:'木'};
  var A_KE={木:'土',土:'水',水:'火',火:'金',金:'木'};
  function a_clampScore(n,min,max){return Math.max(min,Math.min(max,Math.round(n)));}
  function a_roleForElement(dayEl,el){var yin=Object.keys(A_SHENG).find(function(k){return A_SHENG[k]===dayEl;}),shi=A_SHENG[dayEl],cai=A_KE[dayEl],guan=Object.keys(A_KE).find(function(k){return A_KE[k]===dayEl;});return el===dayEl?'比劫':el===yin?'印':el===shi?'食伤':el===cai?'财':el===guan?'官杀':'—';}
  function a_tenGodForStem(dayStem,stem){return tenGodFor(dayStem,stem)||'—';}
  function a_roleFamilyForTenGod(tenGod){if(tenGod==='比肩'||tenGod==='劫财')return'比劫';if(tenGod==='食神'||tenGod==='伤官')return'食伤';if(tenGod==='正财'||tenGod==='偏财')return'财';if(tenGod==='正官'||tenGod==='七杀')return'官杀';if(tenGod==='正印'||tenGod==='偏印')return'印';return'—';}
  function a_hiddenStemElements(branch){var stems=(HIDDEN_STEMS&&HIDDEN_STEMS[branch])||[];return stems.map(function(s){return STEM_EL[s];}).filter(Boolean);}
  function a_hiddenStemProfile(profile,branch){var stems=(HIDDEN_STEMS&&HIDDEN_STEMS[branch])||[],weights=stems.length===1?[1]:(stems.length===2?[.7,.3]:[.6,.25,.15]);return stems.map(function(stem,i){var tenGod=a_tenGodForStem(profile&&profile.dayStem,stem),el=STEM_EL[stem];return{stem:stem,el:el,weight:weights[i]||0,tenGod:tenGod,role:a_roleFamilyForTenGod(tenGod),score:profile&&el?zForEl(profile,el):60};});}
  function a_flowElementProfile(profile,gz){gz=String(gz||'');var stem=gz.charAt(0),branch=gz.charAt(1),stemEl=STEM_EL[stem],branchEl=BRANCH_EL[branch]||stemEl,hiddenProfile=a_hiddenStemProfile(profile,branch),hiddenEls=hiddenProfile.map(function(x){return x.el;}).filter(Boolean),dayEl=profile&&profile.dayElement,tenGod=a_tenGodForStem(profile&&profile.dayStem,stem),weightedHiddenScore=hiddenProfile.length?Math.round(hiddenProfile.reduce(function(a,x){return a+x.score*x.weight;},0)):60;return{gz:gz,stem:stem,branch:branch,stemEl:stemEl,branchEl:branchEl,tenGod:tenGod,stemRole:a_roleFamilyForTenGod(tenGod),branchRole:a_roleForElement(dayEl,branchEl),hiddenProfile:hiddenProfile,hiddenEls:hiddenEls,hiddenRoles:hiddenProfile.map(function(x){return x.role;}),weightedHiddenScore:weightedHiddenScore};}
  function a_seasonalAdjustment(profile,flow){if(!profile||!flow||!flow.stemEl)return{adjust:0,note:''};return tiaohouAdjustFor(profile,flow.stemEl);}
  function a_rootAndReveal(profile,flow){var stems=(profile&&profile.pillars||[]).map(function(p){return p.stem;}),branches=(profile&&profile.pillars||[]).map(function(p){return p.branch;}),root=branches.some(function(b){return a_hiddenStemElements(b).indexOf(flow.stemEl)>=0;}),reveal=stems.indexOf(flow.stem)>=0,adjust=(root?3:0)+(reveal?2:0),notes=[];if(root)notes.push('通根');if(reveal)notes.push('透干');return{root:root,reveal:reveal,adjust:adjust,note:notes.join('、')};}
  function a_branchInteractions(profile,gz){var extras=arguments[2]||[];return analyzeFlowInteractions(profile,gz,extras);}
  function a_branchInteraction(profile,gz){var all=a_branchInteractions(profile,gz,arguments[2]||[]),main=all.items[0];if(!main)return{label:'无明显互动',adjust:0,penalty:0,note:'',branchInteractions:all};return{label:(main.pillar||'命支')+main.label,adjust:all.adjust,penalty:all.penalty,note:all.note||'',branchInteractions:all};}
  function a_professionalFactors(profile,flow){var extras=arguments[2]||[];var seasonal=a_seasonalAdjustment(profile,flow),root=a_rootAndReveal(profile,flow),interactions=a_branchInteractions(profile,flow&&flow.gz,extras);return{seasonalAdjust:seasonal.adjust,rootAdjust:root.adjust,interactionAdjust:interactions.adjust,professionalAdjust:seasonal.adjust+root.adjust+interactions.adjust,seasonal:seasonal,root:root,branchInteractions:interactions};}
  function dailyReadFull(profile,today){if(!profile||!today)return null;var flow=a_flowElementProfile(profile,today.day),dayStem=profile.dayStem,cat=profile.strength.category,liuStem=flow.stem,liuEl=flow.stemEl;if(!liuEl)return null;var role=flow.stemRole,tenGod=flow.tenGod,strong=(cat==='偏强'||cat==='太强'),weak=(cat==='偏弱'||cat==='太弱'),stemScore=zForEl(profile,flow.stemEl),branchScore=zForEl(profile,flow.branchEl),hiddenScore=flow.hiddenProfile.length?flow.weightedHiddenScore:branchScore;var dyGz=(profile.currentDayunIdx>=0&&profile.daYun&&profile.daYun[profile.currentDayunIdx])?profile.daYun[profile.currentDayunIdx].pillar:null;var flowExtras=[];if(dyGz&&dyGz!==today.day)flowExtras.push({gz:dyGz,tag:'大运'});if(today.year)flowExtras.push({gz:today.year,tag:'流年'});if(today.month)flowExtras.push({gz:today.month,tag:'流月'});var interaction=a_branchInteraction(profile,flow.gz,flowExtras),pro=a_professionalFactors(profile,flow,flowExtras);var specials=(today.year&&detectCycleSpecials)?detectCycleSpecials(profile,{yearGz:today.year,dayunGz:dyGz}):{items:[],penalty:0,note:''};var zScore=a_clampScore(stemScore*.48+branchScore*.28+hiddenScore*.18+pro.seasonalAdjust+pro.rootAdjust+interaction.adjust*.6-specials.penalty*.5,34,88),zLabel=zScore>=70?'顺势':(zScore<=50?'谨慎':'平稳');var hiddenHasCai=flow.branchRole==='财'||flow.hiddenRoles.indexOf('财')>=0,hiddenHasBi=flow.branchRole==='比劫'||flow.hiddenRoles.indexOf('比劫')>=0;var cScore,cLabel,cWarn='';if(role==='财'){if(strong){cScore=82;cLabel=tenGod+'旺·担得起';}else if(weak){cScore=40;cLabel=tenGod+'多身弱';cWarn='看得到赚不到，忌追高/加杠杆'+(tenGod==='偏财'?'，偏财投机尤须克制':'');}else{cScore=68;cLabel=tenGod+'可担·宜节制';}}else if(role==='食伤'){cScore=strong?75:(weak?46:62);cLabel=tenGod+'生财';if(weak)cWarn='泄身耗神，宜轻仓';}else if(role==='比劫'){if(weak){cScore=58;cLabel=tenGod+'帮身';}else{cScore=38;cLabel=tenGod+'劫财';cWarn='争财/冲动加仓/被借钱，防破财';}}else if(role==='印'){cScore=weak?64:48;cLabel=tenGod+'护身';if(strong)cWarn='偏保守，易错失';}else if(role==='官杀'){cScore=strong?60:40;cLabel=tenGod+'克身';if(!strong)cWarn='压力大，宜观望';}else{cScore=55;cLabel='—';}if(hiddenHasCai&&role!=='财')cScore+=strong?6:(weak?-2:4);if(hiddenHasBi&&strong)cScore-=5;if(pro.root.root&&role==='财'&&strong)cScore+=4;if(pro.seasonalAdjust<0)cScore-=2;if(interaction.penalty)cScore-=Math.min(7,interaction.penalty);cScore=a_clampScore(cScore,34,90);var extraNotes=[pro.seasonal.note,pro.root.note,interaction.note,specials.note].concat(interaction.ganNotes||[]).filter(Boolean).join('；');var advice;if(cWarn)advice=cWarn;else if(interaction.penalty>=4)advice='四柱互动较多、变数偏大，轻仓确认';else if(zScore>=70&&cScore>=70)advice='综合与财运俱佳，可按计划执行获利';else if(zScore>=70&&cScore<55)advice='盘感顺但财气弱，别勉强追单';else if(zScore<55&&cScore>=70)advice='盘面一般但财运旺，适合获利了结';else advice='中性，控制仓位、随机应变';return {liuStem:liuStem,liuEl:liuEl,role:role,tenGod:tenGod,branchRole:flow.branchRole,hiddenRoles:flow.hiddenRoles,hiddenProfile:flow.hiddenProfile,flowProfile:flow,stemScore:stemScore,branchScore:branchScore,hiddenScore:hiddenScore,weightedHiddenScore:flow.weightedHiddenScore,interaction:interaction,interactionPenalty:interaction.penalty,branchInteractions:pro.branchInteractions,seasonalAdjust:pro.seasonalAdjust,rootAdjust:pro.rootAdjust,professionalAdjust:pro.professionalAdjust,professionalFactors:pro,professionalNote:extraNotes,specials:specials,specialsPenalty:specials.penalty,specialsNote:specials.note,kongWang:!!interaction.kongWang,zScore:zScore,zLabel:zLabel,cScore:cScore,cLabel:cLabel,cWarn:cWarn,advice:advice};}
  function foundationRead(profile,today){function layer(nm,gz){if(!gz)return{nm:nm,html:'<span style="color:var(--text-3)">尚未起运</span>',z:60,gz:''};var r=dailyReadFull(profile,{day:gz});if(!r)return{nm:nm,html:gz,z:60,gz:gz};var el=STEM_EL[gz.charAt(0)];var color=r.zLabel==='顺势'?'#4ade80':(r.zLabel==='谨慎'?'#f87171':'var(--text-2)');return{nm:nm,gz:gz,html:'<b style="color:var(--accent)">'+gz+'</b> · '+el+' — '+r.role+' · <span style="color:'+color+'">'+r.zLabel+'</span>',z:r.zScore};}var dyGz=(profile.currentDayunIdx>=0&&profile.daYun&&profile.daYun[profile.currentDayunIdx])?profile.daYun[profile.currentDayunIdx].pillar:null;var L=[layer('大运',dyGz),layer('流年',today.year),layer('流月',today.month),layer('流日',today.day)];var score=Math.round(L[0].z*0.2+L[1].z*0.25+L[2].z*0.25+L[3].z*0.3);var label=score>=66?'顺势':(score<=50?'谨慎':'中性');return{score:score,label:label,layers:L,day:L[3]};}
  function a_calibrateActionScore(raw,mode,context){context=context||{};var score=raw,center=Number.isFinite(context.center)?context.center:60;if(mode==='month'){score=center+(raw-center)*.86;score=a_clampScore(score,34,86);}else if(mode==='day'){score=60+(raw-60)*.92;score=a_clampScore(score,34,90);}else if(mode==='hour'){var day=Number.isFinite(context.dayScore)?context.dayScore:60,span=day<=44?16:(day<=56?18:(day<=70?22:24));score=day+(raw-day)*.88;score=a_clampScore(score,Math.max(34,day-span),Math.min(90,day+span));}else{score=a_clampScore(raw,0,100);}return{score:score,rawScore:raw,mode:mode,center:center};}
  function a_trendScoreLabel(score){return score>=82?'强顺势':(score>=70?'顺势':(score>=56?'中性':(score>=44?'谨慎':'高风险')));}
  function actionScore(profile,today,dr,foundation){dr=dr||dailyReadFull(profile,{day:today.day});foundation=foundation||foundationRead(profile,today);var triggerScore=Math.round(dr.zScore*0.65+chartScore(profile,today.day)*0.35),flowLabel=triggerScore>=70?'顺势':(triggerScore<=50?'谨慎':'中性');var interactionPenalty=dr&&dr.interactionPenalty?dr.interactionPenalty:0,seasonRisk=dr&&dr.seasonalAdjust<0?2:0,specialsPenalty=dr&&dr.specialsPenalty?dr.specialsPenalty:0,riskPenalty=Math.min(18,(dr&&dr.cWarn?8:0)+interactionPenalty+seasonRisk+specialsPenalty),raw=60+(triggerScore-60)*0.75+(dr.cScore-55)*0.35+(foundation.score-60)*0.25+(dr.rootAdjust||0)*.25-riskPenalty,cal=a_calibrateActionScore(raw,'day',{foundationScore:foundation.score,triggerScore:triggerScore,wealthScore:dr.cScore,riskPenalty:riskPenalty,interactionPenalty:interactionPenalty,professionalAdjust:dr.professionalAdjust});var cap;if(foundation.score<=45)cap=64;else if(foundation.score<=55)cap=72;else if(foundation.score<=66)cap=84;else cap=92;if(riskPenalty)cap=Math.min(cap,76);var score=a_clampScore(cal.score,34,Math.min(90,cap));var label=a_trendScoreLabel(score);var position=score>=82?'80%':(score>=70?'60%':(score>=56?'40%':(score>=44?'20%':'观望')));return{score:score,label:label,position:position,foundation:foundation,flow:dr,flowScore:triggerScore,flowLabel:flowLabel,stemScore:dr.stemScore,branchScore:dr.branchScore,hiddenScore:dr.hiddenScore,weightedHiddenScore:dr.weightedHiddenScore,wealthScore:dr.cScore,riskPenalty:riskPenalty,interactionPenalty:interactionPenalty,interaction:dr.interaction,branchInteractions:dr.branchInteractions,seasonalAdjust:dr.seasonalAdjust,rootAdjust:dr.rootAdjust,professionalAdjust:dr.professionalAdjust,professionalNote:dr.professionalNote,flowProfile:dr.flowProfile,tenGod:dr.tenGod,cap:cap,raw:Math.round(raw),rawScore:Math.round(raw),displayScore:score};}
  function trendGzForDate(dt){if(typeof global.Solar==='undefined')return{year:'',month:gzMonth(dt.getFullYear(),dt.getMonth()+1),day:gzDayD(dt)};var lunar=global.Solar.fromYmdHms(dt.getFullYear(),dt.getMonth()+1,dt.getDate(),12,0,0).getLunar(),ec=lunar.getEightChar();return{year:ec.getYear(),month:ec.getMonth(),day:ec.getDay()};}
  function monthActionDetail(profile,dt){var mid=new Date(dt.getFullYear(),dt.getMonth(),15),gz=trendGzForDate(mid),dyGz=(profile.currentDayunIdx>=0&&profile.daYun&&profile.daYun[profile.currentDayunIdx])?profile.daYun[profile.currentDayunIdx].pillar:null;function layerScore(g){if(!g)return 60;var r=dailyReadFull(profile,{day:g});return r?r.zScore:60;}var monthRead=dailyReadFull(profile,{day:gz.month});var monthScore=chartScore(profile,gz.month);var wealth=monthRead?monthRead.cScore:55;var trigger=Math.round((monthRead?monthRead.zScore:60)*0.48+monthScore*0.34+wealth*0.18);var base=Math.round(layerScore(dyGz)*0.22+layerScore(gz.year)*0.28+layerScore(gz.month)*0.5);var riskPenalty=Math.min(10,(monthRead&&monthRead.cWarn?5:0)+(monthRead&&monthRead.interactionPenalty?Math.round(monthRead.interactionPenalty*.6):0)+(monthRead&&monthRead.seasonalAdjust<0?2:0));var raw=60+(trigger-60)*.82+(wealth-55)*.25+(base-60)*.18+(monthRead&&monthRead.rootAdjust?monthRead.rootAdjust*.15:0)-riskPenalty;var center=base<=50?52:(base<=66?58:63),cal=a_calibrateActionScore(raw,'month',{center:center,base:base,triggerScore:trigger,wealthScore:wealth,riskPenalty:riskPenalty});return{score:cal.score,rawScore:Math.round(raw),base:base,trigger:trigger,wealth:wealth,riskPenalty:riskPenalty,branchScore:monthRead&&monthRead.branchScore,hiddenScore:monthRead&&monthRead.hiddenScore,weightedHiddenScore:monthRead&&monthRead.weightedHiddenScore,interaction:monthRead&&monthRead.interaction,branchInteractions:monthRead&&monthRead.branchInteractions,seasonalAdjust:monthRead&&monthRead.seasonalAdjust,rootAdjust:monthRead&&monthRead.rootAdjust,professionalAdjust:monthRead&&monthRead.professionalAdjust,professionalNote:monthRead&&monthRead.professionalNote,tenGod:monthRead&&monthRead.tenGod,gz:gz.month,label:a_trendScoreLabel(cal.score),mode:'month'};}
  function monthActionScore(profile,dt){return monthActionDetail(profile,dt).score;}

  global.MadeshedBazi = {
    STEM_EL:STEM_EL,BRANCH_EL:BRANCH_EL,STEM_EN:STEM_EN,BRANCH_EN:BRANCH_EN,EL_CN:EL_CN,CN_TO_EN:CN_TO_EN,
    DEFAULT_CITY:DEFAULT_CITY,HIDDEN_STEMS:HIDDEN_STEMS,relation:relation,
    convertLunarToSolarYmd:convertLunarToSolarYmd,calcTrueSolarOffsetMinutes:calcTrueSolarOffsetMinutes,
    applyTrueSolarTime:applyTrueSolarTime,adjustForZiPolicy:adjustForZiPolicy,normalizeBirthInput:normalizeBirthInput,
    solarFromBirthInput:solarFromBirthInput,calcStrength:calcStrength,calcYongShen:calcYongShen,
    calcWealth:calcWealth,calcBaziCore:calcBaziCore,dailyRead:dailyRead,zForEl:zForEl,
    gzMonth:gzMonth,gzDayD:gzDayD,gzHour:gzHour,chartScore:chartScore,getTodayGZ:getTodayGZ,
    /* v2 专业能力 */
    SILING:SILING,TIAOHOU:TIAOHOU,WUHE:WUHE,SANHE:SANHE,SANHUI:SANHUI,LIUHE:LIUHE,
    siLingStem:siLingStem,tiaohouFor:tiaohouFor,tenGodFor:tenGodFor,
    detectCombos:detectCombos,stemCombos:stemCombos,
    dayMasterRootScore:dayMasterRootScore,detectSpecialStructure:detectSpecialStructure,
    analyzeFlowInteractions:analyzeFlowInteractions,detectCycleSpecials:detectCycleSpecials,
    tiaohouAdjustFor:tiaohouAdjustFor,readDayEnhanced:readDayEnhanced,
    /* v3 统一行动指数管道：全站唯一分数源 */
    dailyReadFull:dailyReadFull,foundationRead:foundationRead,actionScore:actionScore,
    monthActionDetail:monthActionDetail,monthActionScore:monthActionScore,trendGzForDate:trendGzForDate,
    calibrateActionScore:a_calibrateActionScore,trendScoreLabel:a_trendScoreLabel,clampScore:a_clampScore,
    flowElementProfile:a_flowElementProfile,professionalFactors:a_professionalFactors,branchInteraction:a_branchInteraction,
    roleForElement:a_roleForElement,roleFamilyForTenGod:a_roleFamilyForTenGod,tenGodForStem:a_tenGodForStem,
    hiddenStemProfile:a_hiddenStemProfile,hiddenStemElements:a_hiddenStemElements
  };
})(window);
