(function(){
  'use strict';
  /* 線上訂位（/reserve、/en/reserve、/ja/reserve）：照客人腦中的順序——想做什麼（目的）→ 哪天 → 幾點 → 幾位。
     目的決定店別（白天在咖啡／晚上三點水）；日期列只亮「這個目的在那天還訂得到」的日子；時段依時間帶分組。
     日期一律是「營業日」：選 11/7 的深夜 01:00＝11/8 凌晨，送出時日期自動換成 11/8（資料庫存日曆日）。
     DOM 一律用 createElement＋textContent 組。 */
  var form=document.getElementById('reserveForm');
  if(!form)return;
  var status=document.getElementById('reserveStatus');
  var done=document.getElementById('reserveDone');
  var summary=document.getElementById('reserveSummary');
  var slotHost=document.getElementById('slotGroups');
  var purposeHost=document.getElementById('purposeChips');
  var dateHost=document.getElementById('dateChips');
  var venueInfo=document.getElementById('venueInfo');
  var submit=form.querySelector('button[type="submit"]');
  var date=form.elements.date;
  var HOLD_MINUTES=10;
  var DAYS_AHEAD=7;

  // 語系跟著頁面 <html lang>：/reserve＝zh-Hant、/en/reserve＝en、/ja/reserve＝ja
  var htmlLang=String(document.documentElement.lang||'zh').toLowerCase();
  var LANG=htmlLang.indexOf('zh')===0?'zh':htmlLang.slice(0,2);
  var DICT={
    zh:{cafe:'在咖啡',bar:'三點水',closedDay:'這天沒有可訂的時段，請改選其他日期。',jumped:'今天已沒有可訂時段，已幫你換到最近可訂的日期。',noneAll:'接下來 7 天都沒有可訂時段，請用日曆選更後面的日期，或來電詢問。',wd:['日','一','二','三','四','五','六'],today:'今天',tomorrow:'明天',pick:'請點選一個時段。',sending:'送出中，請稍候…',fail:'送出失敗，請稍後再試。',id:'訂位編號：',time:'時間：',guests:'人數：',purpose:'目的：',unit:' 位',hold:'座位保留至：',mail:'確認信：',po:'（',pc:'）',
      p:{coffee:'咖啡・早午餐',work:'工作・讀書',meal:'晚餐・聚餐',drinks:'小酌・宵夜',celebrate:'慶生・紀念日',any:'都可以'},
      parts:{morning:'早上',noon:'中午',afternoon:'下午',evening:'晚餐',night:'晚上',late:'深夜'},
      lateOf:function(d){return '（'+d+' 凌晨）';},
      cafeInfo:'在咖啡・白天 08:00–17:00',barInfo:'三點水・晚上 17:00–03:00',bothInfo:'白天在咖啡、晚上三點水都能訂。',
      celebrateInfo:'白天在咖啡、晚上三點水都能訂。壽星名字、蛋糕或其他安排請寫在備註。',workInfo:'在咖啡・白天 08:00–17:00，有插座與 Wi-Fi。',
      barRule:function(per,d){return d+' 低消每人 NT$'+per+'，另收 10% 服務費。';},
      submitWith:function(s){return '確認訂位・'+s;},guestsN:function(n){return n+' 位';},ics:'加入行事曆',icsTitle:'言文字訂位'},
    en:{cafe:'at cafe',bar:'3AM',closedDay:'No bookable slots on this day. Please pick another date.',jumped:'No slots left today. We moved you to the next available date.',noneAll:'No slots in the next 7 days. Pick a later date from the calendar, or call us.',wd:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],today:'Today',tomorrow:'Tmrw',pick:'Please choose a time slot.',sending:'Sending…',fail:'Something went wrong. Please try again.',id:'Booking no.: ',time:'Time: ',guests:'Guests: ',purpose:'Occasion: ',unit:'',hold:'Table held until: ',mail:'Confirmation sent to: ',po:' (',pc:')',
      p:{coffee:'Coffee & brunch',work:'Work & study',meal:'Dinner & groups',drinks:'Drinks & late bites',celebrate:'Celebration',any:'Anything'},
      parts:{morning:'Morning',noon:'Lunch',afternoon:'Afternoon',evening:'Dinner',night:'Evening',late:'Late night'},
      lateOf:function(d){return ' (early hours of '+d+')';},
      cafeInfo:'at cafe · daytime 08:00–17:00',barInfo:'3AM · evenings 17:00–03:00',bothInfo:'Book at cafe by day or 3AM by night.',
      celebrateInfo:'Book at cafe by day or 3AM by night. Add the name, cake or anything we should prepare in the note.',workInfo:'at cafe · daytime 08:00–17:00, with power outlets and Wi-Fi.',
      barRule:function(per,d){return d+': minimum spend NT$'+per+' per person, plus 10% service charge.';},
      submitWith:function(s){return 'Book · '+s;},guestsN:function(n){return n+(n===1?' guest':' guests');},ics:'Add to calendar',icsTitle:'Table at emoji'},
    ja:{cafe:'在咖啡 at cafe',bar:'三點水 3AM',closedDay:'この日はご予約枠がありません。別の日をお選びください。',jumped:'本日は予約枠がないため、直近の予約可能日に切り替えました。',noneAll:'今後7日間は予約枠がありません。カレンダーで先の日付を選ぶか、お電話ください。',wd:['日','月','火','水','木','金','土'],today:'今日',tomorrow:'明日',pick:'時間枠を選んでください。',sending:'送信中…',fail:'送信に失敗しました。しばらくしてからもう一度お試しください。',id:'予約番号：',time:'日時：',guests:'人数：',purpose:'ご利用目的：',unit:' 名',hold:'お席の確保：',mail:'確認メール：',po:'（',pc:'）',
      p:{coffee:'コーヒー・ブランチ',work:'作業・読書',meal:'ディナー・会食',drinks:'一杯・夜食',celebrate:'お祝い・記念日',any:'指定なし'},
      parts:{morning:'朝',noon:'昼',afternoon:'午後',evening:'ディナー',night:'夜',late:'深夜'},
      lateOf:function(d){return '（'+d+' 未明）';},
      cafeInfo:'在咖啡・昼 08:00–17:00',barInfo:'三點水・夜 17:00–03:00',bothInfo:'昼は在咖啡、夜は三點水をご予約いただけます。',
      celebrateInfo:'昼は在咖啡、夜は三點水をご予約いただけます。主役のお名前やケーキなどのご要望は備考へ。',workInfo:'在咖啡・昼 08:00–17:00、電源とWi-Fiあり。',
      barRule:function(per,d){return d+' の最低利用額はお一人様 NT$'+per+'、別途サービス料10%。';},
      submitWith:function(s){return '予約する・'+s;},guestsN:function(n){return n+' 名';},ics:'カレンダーに追加',icsTitle:'言文字 ご予約'}
  };
  var T=DICT[LANG]||DICT.zh;

  // 目的 → 店別（''＝兩店都可）。key 送到伺服器，伺服器把中文標籤寫進備註給店內看（lib/reservations.js PURPOSES）
  var PURPOSES=[{k:'coffee',v:'CAFE'},{k:'work',v:'CAFE'},{k:'meal',v:'BAR'},{k:'drinks',v:'BAR'},{k:'celebrate',v:''},{k:'any',v:''}];

  // 時段：每 30 分鐘一格，依時間帶分組。在咖啡 08:00–17:00；三點水 17:00–03:00（00:00–02:30＝所選營業日的隔天凌晨）
  function pad(n){return (n<10?'0':'')+n;}
  function slots(startMin,endMin){var out=[];for(var m=startMin;m<endMin;m+=30)out.push(pad(Math.floor(m/60))+':'+pad(m%60));return out;}
  var PARTS=[
    {k:'morning',v:'CAFE',times:slots(8*60,11*60)},
    {k:'noon',v:'CAFE',times:slots(11*60,14*60)},
    {k:'afternoon',v:'CAFE',times:slots(14*60,17*60)},
    {k:'evening',v:'BAR',times:slots(17*60,21*60)},
    {k:'night',v:'BAR',times:slots(21*60,24*60)},
    {k:'late',v:'BAR',times:slots(0,3*60)}
  ];
  var VENUE_NAME={CAFE:T.cafe,BAR:T.bar};

  // 以台北時間判斷「今天」與「現在」，避免手機時區不同。凌晨 03:00 前仍算前一個營業日
  function taipeiNow(){var p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()),o={};p.forEach(function(x){o[x.type]=x.value;});return {date:o.year+'-'+o.month+'-'+o.day,minutes:Number(o.hour==='24'?0:o.hour)*60+Number(o.minute)};}
  function addDays(iso,n){var t=new Date(iso+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
  var cal=taipeiNow();
  var now=cal.minutes<180?{date:addDays(cal.date,-1),minutes:cal.minutes+1440}:cal;   // 營業日＋從營業日 00:00 起算的分鐘
  function dow(iso){return new Date(iso+'T12:00:00Z').getUTCDay();}
  function md(iso){var t=new Date(iso+'T12:00:00Z');return (t.getUTCMonth()+1)+'/'+t.getUTCDate();}
  function dayLabel(iso){return md(iso)+(LANG==='en'?' ('+T.wd[dow(iso)]+')':'（'+T.wd[dow(iso)]+'）');}
  function mins(t){return Number(t.slice(0,2))*60+Number(t.slice(3));}
  function absMins(t){var m=mins(t);return m<180?m+1440:m;}   // 凌晨時段排在營業日最後
  function isLate(t){return mins(t)<180;}

  var params=new URLSearchParams(location.search);
  var P='',V='';     // 目的 key、店別篩選（''｜CAFE｜BAR）
  (function(){
    var pp=params.get('purpose'),vv=String(params.get('venue')||'').toLowerCase();
    PURPOSES.forEach(function(x){if(x.k===pp){P=x.k;V=x.v;}});
    if(!P&&(vv==='cafe'||vv==='atcafe'))V='CAFE';
    if(!P&&(vv==='bar'||vv==='3am'))V='BAR';
  })();
  date.min=now.date;
  date.max=addDays(now.date,119);
  var qd=params.get('date');
  date.value=qd&&/^\d{4}-\d{2}-\d{2}$/.test(qd)&&qd>=now.date?qd:now.date;

  // 店家「不可訂位設定」：date（營業日）→ 開放時段；undefined＝還沒抓、null＝抓不到（當全開，送出時伺服器把關）
  var OPEN={};
  function fetchSlots(d){
    if(OPEN[d]!==undefined)return Promise.resolve(OPEN[d]);
    return fetch('/api/reservations/slots?date='+encodeURIComponent(d),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){var s=j&&Array.isArray(j.slots)?j.slots:null;OPEN[d]=s;return s;}).catch(function(){OPEN[d]=null;return null;});
  }
  function partsFor(d){
    var open=OPEN[d],isToday=d===now.date;
    return PARTS.filter(function(g){return !V||g.v===V;}).map(function(g){
      return {k:g.k,v:g.v,times:g.times.filter(function(t){
        if(Array.isArray(open)&&open.indexOf(t)<0)return false;
        if(isToday&&absMins(t)<=now.minutes+30)return false;   // 今天已過（含 30 分鐘準備）的不列
        return true;
      })};
    }).filter(function(g){return g.times.length;});
  }
  function hasSlots(d){return partsFor(d).length>0;}

  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function chip(name,value,text,checked,disabled,sub){
    var label=el('label','chip');
    var input=el('input');input.type='radio';input.name=name;input.value=value;input.checked=!!checked;
    if(disabled)input.disabled=true;
    var span=el('span',null,text);
    if(sub)span.appendChild(el('small',null,sub));
    label.appendChild(input);label.appendChild(span);return label;
  }

  function renderPurposes(){
    purposeHost.textContent='';
    PURPOSES.forEach(function(x){purposeHost.appendChild(chip('purpose',x.k,T.p[x.k],P===x.k,false));});
  }
  function renderVenueInfo(){
    venueInfo.textContent='';
    var lines=[P==='work'?T.workInfo:V==='CAFE'?T.cafeInfo:V==='BAR'?T.barInfo:P==='celebrate'?T.celebrateInfo:T.bothInfo];
    // 三點水低消依所選營業日的星期，週五、週六較高（數字取自 MenuLib，與 POS 同一份）
    var ML=window.MenuLib;
    if(V==='BAR'&&ML&&ML.MIN_SPEND){var w=dow(date.value),wk=w===5||w===6;lines.push(T.barRule(wk?ML.MIN_SPEND.weekend:ML.MIN_SPEND.weekday,dayLabel(date.value)));}
    lines.forEach(function(s,i){if(i)venueInfo.appendChild(document.createElement('br'));venueInfo.appendChild(document.createTextNode(s));});
  }
  function renderDates(){
    dateHost.textContent='';
    for(var i=0;i<DAYS_AHEAD;i++){
      var d=addDays(now.date,i);
      var head=i===0?T.today:i===1?T.tomorrow:(LANG==='zh'?'週'+T.wd[dow(d)]:T.wd[dow(d)]);
      dateHost.appendChild(chip('date_pick',d,head,date.value===d,OPEN[d]!==undefined&&!hasSlots(d),md(d)));
    }
  }
  function renderSlots(){
    var keep=(form.querySelector('input[name="time"]:checked')||{}).value;
    slotHost.textContent='';
    var any=false;
    partsFor(date.value).forEach(function(g){
      var sec=el('div','slot-group');
      var h=el('h3',null,T.parts[g.k]+(g.k==='late'?T.lateOf(md(addDays(date.value,1))):''));
      if(!V)h.appendChild(el('small',null,VENUE_NAME[g.v]));
      sec.appendChild(h);
      var grid=el('div','chips');
      g.times.forEach(function(t){
        var c=chip('time',t,t,keep===t,false),input=c.querySelector('input');
        input.required=true;input.dataset.label=VENUE_NAME[g.v];
        grid.appendChild(c);any=true;
      });
      sec.appendChild(grid);slotHost.appendChild(sec);
    });
    if(!any)slotHost.appendChild(el('p','hint',T.closedDay));
    updateSubmit();
    return any;
  }
  function updateSubmit(){
    var t=form.querySelector('input[name="time"]:checked'),n=Number((form.querySelector('input[name="party_size"]:checked')||{}).value||0);
    var base=submit.dataset.base||(submit.dataset.base=submit.textContent);
    submit.textContent=t?T.submitWith(dayLabel(isLate(t.value)?addDays(date.value,1):date.value)+' '+t.value+(n?' · '+T.guestsN(n):'')):base;
  }
  function note(text){if(text)slotHost.insertBefore(el('p','hint',text),slotHost.firstChild);}
  // 選的日期在目前目的下沒位子：只有「今天」會自動跳到最近可訂日（避免客人以為整個系統壞了）
  function autoJump(){
    if(hasSlots(date.value)||date.value!==now.date)return '';
    for(var i=1;i<DAYS_AHEAD;i++){var d=addDays(now.date,i);if(hasSlots(d)){date.value=d;return T.jumped;}}
    return T.noneAll;
  }
  function refresh(jump){renderVenueInfo();var n=jump?autoJump():'';renderVenueInfo();renderDates();renderSlots();note(n);}

  purposeHost.addEventListener('change',function(e){
    var x=PURPOSES.filter(function(p){return p.k===e.target.value;})[0];if(!x)return;
    P=x.k;V=x.v;refresh(true);
  });
  dateHost.addEventListener('change',function(e){if(e.target.name==='date_pick'){date.value=e.target.value;refresh(false);}});
  date.addEventListener('change',function(){if(!date.value)return;refresh(false);fetchSlots(date.value).then(function(){refresh(false);});});
  slotHost.addEventListener('change',updateSubmit);
  form.addEventListener('change',function(e){if(e.target.name==='party_size')updateSubmit();});

  renderPurposes();refresh(false);
  // 先抓 7 天的開放時段，日期列才知道哪天能訂
  var ds=[];for(var i=0;i<DAYS_AHEAD;i++)ds.push(addDays(now.date,i));
  if(ds.indexOf(date.value)<0)ds.push(date.value);
  Promise.all(ds.map(fetchSlots)).then(function(){refresh(true);});

  function msg(text,kind){status.textContent=text;status.className='status '+kind;}
  function val(name){return String(form.elements[name]&&form.elements[name].value||'').trim();}
  function holdUntil(t){var m=(mins(t)+HOLD_MINUTES)%1440;return pad(Math.floor(m/60))+':'+pad(m%60);}
  function addLine(label,value){
    var line=el('div'),b=el('strong',null,label);
    line.appendChild(b);line.appendChild(document.createTextNode(String(value||'')));
    summary.appendChild(line);
  }
  // 行事曆檔（.ics）：台北時間換成 UTC，預留 90 分鐘
  function icsLink(calDate,time,venue,party,requestId){
    var start=new Date(calDate+'T'+time+':00+08:00'),end=new Date(start.getTime()+90*60000);
    var f=function(x){return x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');};
    var ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//emoji.tw//reserve//'+LANG,'BEGIN:VEVENT','UID:'+(requestId||Date.now())+'@emoji.tw','DTSTAMP:'+f(new Date()),'DTSTART:'+f(start),'DTEND:'+f(end),'SUMMARY:'+T.icsTitle+' '+venue+' · '+T.guestsN(party),'LOCATION:No. 11, Sec. 1, Chongqing S. Rd., Zhongzheng Dist., Taipei','DESCRIPTION:'+T.id+(requestId||''),'END:VEVENT','END:VCALENDAR'].join('\r\n');
    var a=el('a','btn btn-ghost',T.ics);
    a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));
    a.download='emoji-reservation.ics';
    return a;
  }
  form.addEventListener('submit',async function(e){
    e.preventDefault();
    var picked=form.querySelector('input[name="time"]:checked');
    if(!picked){msg(T.pick,'err');slotHost.scrollIntoView({behavior:'smooth',block:'center'});return;}
    if(!form.reportValidity())return;
    var bizDate=val('date'),calDate=isLate(picked.value)?addDays(bizDate,1):bizDate;
    var data={lang:LANG,purpose:P&&P!=='any'?P:'',date:calDate,time:picked.value,party_size:Number(val('party_size')),name:val('name'),phone:val('phone'),email:val('email'),note:val('note'),source:params.get('utm_source')||document.referrer||'direct'};
    submit.disabled=true;msg(T.sending,'ok');
    try{
      var res=await fetch('/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
      var body=await res.json().catch(function(){return {};});
      if(!res.ok)throw new Error(body.error||T.fail);
      form.style.display='none';done.style.display='block';
      summary.textContent='';
      addLine(T.id,body.request_id||'');
      addLine(T.time,dayLabel(calDate)+' '+data.time+T.po+picked.dataset.label+T.pc);
      addLine(T.guests,T.guestsN(data.party_size));
      if(data.purpose)addLine(T.purpose,T.p[data.purpose]);
      addLine(T.hold,body.hold_until||holdUntil(data.time));
      addLine(T.mail,data.email);
      var acts=done.querySelector('.actions');
      if(acts)acts.appendChild(icsLink(calDate,data.time,picked.dataset.label,data.party_size,body.request_id));
      if(body.line_url){
        var L={zh:'用 LINE 收通知（前一天提醒、可直接取消）',en:'Get reminders on LINE (cancel in one tap)',ja:'LINEでリマインドを受け取る'}[LANG]||'';
        var a=el('a','btn btn-primary',L);a.href=body.line_url;a.style.marginTop='12px';a.style.display='inline-block';
        summary.appendChild(a);
      }
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(error){msg(error.message||T.fail,'err');submit.disabled=false;}
  });
})();
