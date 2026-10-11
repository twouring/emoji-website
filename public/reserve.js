(function(){
  'use strict';
  var form=document.getElementById('reserveForm');
  if(!form)return;
  var status=document.getElementById('reserveStatus');
  var done=document.getElementById('reserveDone');
  var summary=document.getElementById('reserveSummary');
  var slotHost=document.getElementById('slotGroups');
  var submit=form.querySelector('button[type="submit"]');
  var date=form.elements.date;
  var HOLD_MINUTES=10;

  // 語系跟著頁面 <html lang>：/reserve＝zh-Hant、/en/reserve＝en、/ja/reserve＝ja
  var htmlLang=String(document.documentElement.lang||'zh').toLowerCase();
  var LANG=htmlLang.indexOf('zh')===0?'zh':htmlLang.slice(0,2);
  var DICT={
    zh:{cafe:'在咖啡',bar:'三點水',cafeHours:'08:00–17:00',barHours:'17:00–03:00',allPast:'今天的時段都已過，請改選明天或之後的日期。',pick:'請點選一個時段。',sending:'送出中，請稍候…',fail:'送出失敗，請稍後再試。',id:'訂位編號：',time:'時間：',guests:'人數：',unit:' 位',hold:'座位保留至：',mail:'確認信：',po:'（',pc:'）'},
    en:{cafe:'at cafe',bar:'3AM',cafeHours:'café · 08:00–17:00',barHours:'bar · 17:00–03:00',allPast:'All of today’s slots have passed. Please pick tomorrow or later.',pick:'Please choose a time slot.',sending:'Sending…',fail:'Something went wrong. Please try again.',id:'Booking no.: ',time:'Time: ',guests:'Guests: ',unit:'',hold:'Table held until: ',mail:'Confirmation sent to: ',po:' (',pc:')'},
    ja:{cafe:'在咖啡 at cafe',bar:'三點水 3AM',cafeHours:'カフェ · 08:00–17:00',barHours:'バー · 17:00–03:00',allPast:'本日の枠はすべて終了しました。明日以降の日付をお選びください。',pick:'時間枠を選んでください。',sending:'送信中…',fail:'送信に失敗しました。しばらくしてからもう一度お試しください。',id:'予約番号：',time:'日時：',guests:'人数：',unit:' 名',hold:'お席の確保：',mail:'確認メール：',po:'（',pc:'）'}
  };
  var T=DICT[LANG]||DICT.zh;

  // 時段：每 30 分鐘一格。在咖啡 08:00–17:00；三點水 17:00–03:00（00:00–02:30 為該日清晨）
  function pad(n){return (n<10?'0':'')+n;}
  function slots(startMin,endMin){var out=[];for(var m=startMin;m<endMin;m+=30)out.push(pad(Math.floor(m/60))+':'+pad(m%60));return out;}
  var GROUPS=[
    {name:T.cafe,hours:T.cafeHours,times:slots(8*60,17*60)},
    {name:T.bar,hours:T.barHours,times:slots(17*60,24*60).concat(slots(0,3*60))}
  ];

  // 以台北時間判斷「今天」與「現在」，避免手機時區不同
  function taipeiNow(){var p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()),o={};p.forEach(function(x){o[x.type]=x.value;});return {date:o.year+'-'+o.month+'-'+o.day,minutes:Number(o.hour==='24'?0:o.hour)*60+Number(o.minute)};}
  var now=taipeiNow();
  date.min=now.date;
  date.value=now.date;

  function render(){
    slotHost.textContent='';
    var isToday=date.value===now.date;
    var anyEnabled=false;
    GROUPS.forEach(function(g){
      var sec=document.createElement('div');sec.className='slot-group';
      var h=document.createElement('h3');h.textContent=g.name;var small=document.createElement('small');small.textContent=g.hours;h.appendChild(small);sec.appendChild(h);
      var grid=document.createElement('div');grid.className='chips';
      g.times.forEach(function(t){
        var label=document.createElement('label');label.className='chip';
        var input=document.createElement('input');input.type='radio';input.name='time';input.value=t;input.required=true;input.dataset.label=g.name;
        var mins=Number(t.slice(0,2))*60+Number(t.slice(3));
        // 今天：已過的時段不可選（至少保留 30 分鐘準備）
        if(isToday&&mins<=now.minutes+30)input.disabled=true;else anyEnabled=true;
        var span=document.createElement('span');span.textContent=t;
        label.appendChild(input);label.appendChild(span);grid.appendChild(label);
      });
      sec.appendChild(grid);slotHost.appendChild(sec);
    });
    if(isToday&&!anyEnabled){var p=document.createElement('p');p.className='hint';p.textContent=T.allPast;slotHost.appendChild(p);}
  }
  date.addEventListener('change',render);
  render();

  function msg(text,kind){status.textContent=text;status.className='status '+kind;}
  function val(name){return String(form.elements[name]?.value||'').trim();}
  function holdUntil(t){var m=(Number(t.slice(0,2))*60+Number(t.slice(3))+HOLD_MINUTES)%1440;return pad(Math.floor(m/60))+':'+pad(m%60);}
  function addLine(label,value){
    var line=document.createElement('div');
    var b=document.createElement('strong');
    b.textContent=label;
    line.appendChild(b);
    line.appendChild(document.createTextNode(String(value||'')));
    summary.appendChild(line);
  }
  form.addEventListener('submit',async function(e){
    e.preventDefault();
    if(!form.reportValidity())return;
    var picked=form.querySelector('input[name="time"]:checked');
    if(!picked){msg(T.pick,'err');return;}
    var data={lang:LANG,date:val('date'),time:picked.value,party_size:Number(val('party_size')),name:val('name'),phone:val('phone'),email:val('email'),note:val('note'),source:new URLSearchParams(location.search).get('utm_source')||document.referrer||'direct'};
    submit.disabled=true;msg(T.sending,'ok');
    try{
      var res=await fetch('/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
      var body=await res.json().catch(function(){return {};});
      if(!res.ok)throw new Error(body.error||T.fail);
      form.style.display='none';done.style.display='block';
      summary.textContent='';
      addLine(T.id,body.request_id||'');
      addLine(T.time,data.date+' '+data.time+T.po+picked.dataset.label+T.pc);
      addLine(T.guests,data.party_size+T.unit);
      addLine(T.hold,body.hold_until||holdUntil(data.time));
      addLine(T.mail,data.email);
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(error){msg(error.message||T.fail,'err');submit.disabled=false;}
  });
})();
