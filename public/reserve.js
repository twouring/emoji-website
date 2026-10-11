(function(){
  'use strict';
  var form=document.getElementById('reserveForm');
  if(!form)return;
  var status=document.getElementById('reserveStatus');
  var done=document.getElementById('reserveDone');
  var summary=document.getElementById('reserveSummary');
  var submit=form.querySelector('button[type="submit"]');
  var date=form.elements.date;
  var today=new Date();
  today.setHours(0,0,0,0);
  date.min=today.toISOString().slice(0,10);
  date.value=date.min;
  function msg(text,kind){status.textContent=text;status.className='status '+kind;}
  function val(name){return String(form.elements[name]?.value||'').trim();}
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
    var data={date:val('date'),time:val('time'),period:val('period'),party_size:Number(val('party_size')),name:val('name'),phone:val('phone'),note:val('note'),source:new URLSearchParams(location.search).get('utm_source')||document.referrer||'direct'};
    submit.disabled=true;msg('送出中，請稍候…','ok');
    try{
      var res=await fetch('/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
      var body=await res.json().catch(function(){return {};});
      if(!res.ok)throw new Error(body.error||'送出失敗，請稍後再試。');
      form.style.display='none';done.style.display='block';
      summary.textContent='';
      addLine('申請編號：',body.request_id||'');
      addLine('日期時間：',data.date+' '+data.time+'（'+data.period+'）');
      addLine('人數：',data.party_size+' 位');
      addLine('姓名：',data.name);
      addLine('手機：',data.phone);
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(error){msg(error.message||'送出失敗，請稍後再試。','err');submit.disabled=false;}
  });
})();
