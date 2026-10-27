/* 餐飲營運共用腳本：出餐看板（品項標類別、列印、作廢）、暫停點餐、櫃檯結帳（POS）＋桌況、估清、訂位、查單、日結＋交班、桌號 QR。
   /admin（admin.html）與平板 POS 子站（pos.emoji.tw → pos.html）共同載入；本檔只管畫面與 API 呼叫。
   宿主頁須先定義：esc、num、NT、api、toast、applicationTime、downloadCSV、opsHref(tab)、SCOPE、TAB、DATA、MENU_DOC、BRAND_LABEL，
   並載入 /menu-lib.js（MenuLib）與 /vendor/qrcode.min.js（QRCode）。
   安全：所有 innerHTML／insertAdjacentHTML／列印 document.write 的動態內容一律經 esc()，沒有未跳脫的使用者輸入進到 HTML（test-security.mjs 有掃）。 */
function tabOrders(){ return '<div class="a-sec" id="orders-body"></div>'; }
function tabPos(){ return '<div id="pos-body"></div>'; }
function tabReservations(){ return '<div class="a-sec" id="resv-body"></div>'; }
function tabSales(){ return '<div class="a-sec" id="sales-body"></div>'; }
function tabHistory(){ return '<div class="a-sec" id="history-body"></div>'; }
function tabLogs(){ return '<div class="a-sec" id="logs-body"></div>'; }
let POS_OPT=null,POS_MENU_SCROLL=0,POS_LEFT_SCROLL=0,POS_CATS_LEFT=0;
let ORDERS_TIMER=null,ORDERS_SEEN=null,PAYREQ_SEEN=null,POS_PAYREQ=null,POS_AA=null,POS_TIMER=null,POS_DATA=null,POS_TABLE='',POS_PICK=null,POS_QTY={},POS_SPLIT={},POS_MEMBER=false,POS_YAN={phone:'',name:'',balance:null},POS_INVOICE={mode:'paper'},POS_METHOD='cash',POS_CAT='',POS_DISCOUNT=null,POS_DISC_OPEN=false,POS_SVC_WAIVE=null,POS_SVC_OPEN=false,POS_RECEIVED='',RESV_FROM='',RESV_DAYS=7,RESV_EDIT=null,RESV_HOURS=null,RESV_HOURS_ERR='',RESV_HOURS_OPEN=false,RESV_ADD_OPEN=false,SALES_DAY='',HIST_DAY='',HIST_Q='',HIST_OPEN=new Set(),REG_DATA=null,REG_CASH_OPEN=false,REG_CLOSE_OPEN=false,REG_COUNT_OPEN=false,REG_OPEN_FORM='',CLOCK_PIN='',CLOCK_MSG=null,SHIFT_WEEK='',SHIFT_FORM={},ATT_FROM='',ATT_TO='',STAFF_EDIT=null;
const CHECKOUT_TIP='<b>這桌的帳</b><br>品項依點餐人分組；勾選左邊決定這次結哪些，組頭「只結這組」＝各付各的，「依人數分次收款」＝平均分攤；可分多次收款，全部結清自動清桌。數量旁「−／＋」改份數，品項有「本次結」可只結幾份。<br>'
 +'<b>＋ 加點</b>：展開菜單點品項，備註可點常用的。送單後會出現在「出餐」。<br>'
 +'<b>換桌／併桌、清桌</b>：搬到別桌或合併；客人走了、沒有未結帳的品項才清桌。<br>'
 +'<b>會員</b>：輸入手機按「查會員」或「掃會員」；手機還不是會員會自動新增並累點。有效會籍（掃會員）自動套聚落價；點數用品項旁的「點數兌換」。<br>'
 +'<b>折扣</b>：按「加折扣」選折％或折抵金額，原因必填。<br>'
 +'<b>付款</b>：選方式；現金輸入實收會算找零；「混合付款」每種方式各填金額，合計要等於應收。<br>'
 +'<b>電子發票</b>：預設不開立，可選紙本、統編、手機載具、自然人憑證、捐贈。<br>'
 +'<b>列印</b>：送單時自動印出餐單給現場（餐點單黑底橫幅、飲品單斜線橫幅，分兩張出），三點水內用再多印一張「點餐明細」夾帳本夾給客人（加點也會補印，送餐時劃掉）；「列印收據明細」是結帳用；收款後會自動出單並開錢櫃；日結核對現金時也會自動開錢櫃。<br>'
 +'<b>QR</b>：顯示這桌的點餐 QR 給客人掃。<br>下方「這桌已結帳的單」可補印、補開發票或作廢。';
const REG_DENOMS=[1000,500,100,50,10,5,1];
const PAY_LABEL={cash:'現金',card:'信用卡',linepay:'LINE Pay',transfer:'轉帳',taishin:'信用卡',other:'其他',tappay:'線上刷卡',mixed:'混合付款'};
const PAY_ICON={cash:`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/></svg>`,linepay:`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H11l-4.5 4v-4H4z"/><path d="M8 10h8"/></svg>`,transfer:`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10l9-6 9 6z"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/></svg>`,taishin:`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>`,other:`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/></svg>`,card:`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/></svg>`};
const PAY_SHORT={taishin:'信用卡'};
const INV_LABEL={paper:'紙本',company:'統編',mobile:'手機載具',citizen:'自然人憑證',donate:'捐贈'};
// 操作說明一律是標題後方的「?」圖示，點一下才顯示浮層（再點、點別處、按 Esc 關閉）；現場畫面不攤開任何說明文字。
// 浮層是掛在 body 的單一元素，所以出餐／桌況每 10 秒重繪也不會把打開的說明洗掉。html 與過去一樣由呼叫端負責 esc()。
const tipIcon=html=>`<button type="button" class="tip-q" aria-label="操作說明" aria-expanded="false" data-tip="${String(html).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}"></button>`;
const opsHelp=tipIcon;
(function(){
  if(typeof document==='undefined'||typeof window==='undefined'||window.__posTip)return;window.__posTip=1;
  let pop=null,cur=null;
  const shut=()=>{if(pop){pop.remove();pop=null;}if(cur&&cur.isConnected)cur.setAttribute('aria-expanded','false');cur=null;};
  const place=()=>{if(!pop||!cur||!cur.isConnected)return shut();const r=cur.getBoundingClientRect(),w=Math.min(360,innerWidth-24);pop.style.width=w+'px';let l=Math.max(12,Math.min(r.left+r.width/2-w/2,innerWidth-w-12));pop.style.left=l+'px';const h=pop.offsetHeight;let t=r.bottom+8;if(t+h>innerHeight-12&&r.top-8-h>12)t=r.top-8-h;pop.style.top=Math.max(12,t)+'px';};
  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('.tip-q');
    if(b){e.preventDefault();e.stopPropagation();const same=cur===b||(cur&&!cur.isConnected&&pop&&pop.dataset.src===b.dataset.tip);shut();if(same)return;cur=b;b.setAttribute('aria-expanded','true');pop=document.createElement('div');pop.className='tip-pop';pop.setAttribute('role','tooltip');pop.dataset.src=b.dataset.tip;pop.innerHTML=b.dataset.tip;document.body.appendChild(pop);place();return;}
    if(pop&&!pop.contains(e.target))shut();
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')shut();});
  window.addEventListener('resize',place);
  document.addEventListener('scroll',e=>{if(pop&&!pop.contains(e.target))shut();},true);
})();
// 標題與操作說明同一列（.ops-head：標題靠左、說明鍵靠右），不另佔一列；展開時說明文字換到整列寬
/* 原因預設選項：現場不打字——每個要填原因的地方先列常見原因，一按就送；真的選不到才在「其他」手動填寫。
   覆蓋式（作廢整張單／作廢品項／取消品項／贈送／出勤修正）用 pickReason()，表單內嵌欄位（折扣／臨時收支／關帳說明／小結說明／台新差異）用 reasonChips()+bindReasonChips()。 */
const REASON_PRESETS={
  void_order:['客人取消','點錯單','重複結帳','金額錯誤','付款失敗'],
  void_line:['點錯品項','客人取消','重複點餐','今日估清'],
  cancel_item:['做不出來／估清','客人退菜','點錯品項','重複點餐','等太久'],
  comp:['招待','生日','補償（出錯／等太久）','員工餐','試吃','熟客'],
  discount:['熟客','活動優惠','員工','會員活動','補償'],
  cash_move:['買食材','補零錢','雜費','代墊','運費'],
  close_note:['找錯錢','點鈔誤差','臨時支出忘了記','小費','交接事項'],
  count_note:['午班交接','晚班交接','中途點驗'],
  taishin:['客人自行轉帳','重複刷卡','退刷','機器離線補刷'],
  attendance_fix:['忘了打卡','打錯時間','臨時換班','系統問題'],
  resv_confirm:['已安排靠窗','已安排包廂','到店請找店長','已電話確認'],
  resv_cancel:['當天客滿','公休日','時段不開放','人數超過上限'],
};
// 確認對話框：取代瀏覽器原生 confirm 對話框（iPad 上樣式／按鈕字樣都不受控、而且會擋住整個 WebView）。與 pickReason 同一套 .op-overlay／.op-card；
//   訊息／標題／按鈕字樣全部經 esc() 再進 innerHTML（本檔慣例，test-security 有掃）。ok／cancel 可帶動作字樣（「清桌」「退現金並開錢櫃」）讓按鈕自己說明後果，不必在內文寫「確定＝…／取消＝…」；danger=true 主鍵改實心紅。回傳 Promise<boolean>
function posConfirm(message,{title='',ok='確定',cancel='取消',danger=false}={}){
  return new Promise(resolve=>{
    const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
    const finish=v=>{if(ov.parentNode)ov.parentNode.removeChild(ov);resolve(v);};
    const lines=String(message??'').split('\n');
    ov.innerHTML=`<div class="op-card pos-confirm" role="alertdialog" aria-label="${esc(title||lines[0])}">${title?`<h2>${esc(title)}</h2>`:''}<p class="pos-confirm-msg">${lines.map(esc).join('<br>')}</p>
      <div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>${esc(cancel)}</button><button type="button" class="btn btn--solid${danger?' btn--danger':''}" data-ok>${esc(ok)}</button></div></div>`;
    ov.querySelector('[data-cancel]').onclick=()=>finish(false);
    ov.querySelector('[data-ok]').onclick=()=>finish(true);
  });
}
// 覆蓋式原因選單：回傳 Promise<string|null>（null＝取消）。按膠囊鍵立刻送出；手動填寫按「確定」或 Enter
function pickReason({title,presets=[],placeholder='其他原因',maxlength=80,initial='',required=true}){
  return new Promise(resolve=>{
    const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
    const finish=v=>{if(ov.parentNode)ov.parentNode.removeChild(ov);resolve(v);};
    ov.innerHTML=`<div class="op-card pos-reason" role="dialog" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
      <div class="reason-chips">${presets.map(p=>`<button type="button" data-reason="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <label class="reason-other"><span>${required?'選不到？手動填寫':'其他說明（選填）'}</span><input id="pos-reason-input" maxlength="${Number(maxlength)||80}" placeholder="${esc(placeholder)}" value="${esc(initial)}"></label>
      <div class="op-card-actions"><button type="button" class="btn btn--ghost" id="pos-reason-cancel">取消</button><button type="button" class="btn btn--solid" id="pos-reason-ok">確定</button></div></div>`;
    const inp=ov.querySelector('#pos-reason-input');
    ov.querySelectorAll('[data-reason]').forEach(b=>b.onclick=()=>finish(b.dataset.reason));
    const ok=()=>{const v=inp.value.trim();if(required&&!v){toast('請選一個原因，或手動填寫');inp.focus();return;}finish(v);};
    ov.querySelector('#pos-reason-ok').onclick=ok;
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();ok();}};
    ov.querySelector('#pos-reason-cancel').onclick=()=>finish(null);
  });
}
// 表單內嵌：在原因輸入欄旁列膠囊鍵，按一下填入該欄（再按一次清掉），仍可自己打字
const reasonChips=(forId,presets)=>`<div class="reason-chips reason-chips--inline" data-for="${esc(forId)}" role="group" aria-label="常見原因">${presets.map(p=>`<button type="button" data-reason="${esc(p)}">${esc(p)}</button>`).join('')}</div>`;
function bindReasonChips(host){
  host.querySelectorAll('.reason-chips[data-for]').forEach(box=>{
    if(box.dataset.bound)return;const inp=host.querySelector('#'+box.dataset.for);if(!inp)return;box.dataset.bound='1';
    const sync=()=>box.querySelectorAll('[data-reason]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reason===inp.value.trim())));
    box.querySelectorAll('[data-reason]').forEach(b=>b.onclick=()=>{inp.value=inp.value.trim()===b.dataset.reason?'':b.dataset.reason;inp.dispatchEvent(new Event('input'));sync();});
    inp.addEventListener('input',sync);sync();
  });
}
/* ===== 現場輸入一律「選」不「打」：共用面板與膠囊鍵（結帳、訂位、錢櫃、出勤都用這一套）
 * pickFrom：從已知清單點一個（桌號、發票類型…），清單外才走 other（不用瀏覽器 prompt）
 * pickTableNo：加開桌號＝先點區（A–F）再點號碼
 * pickAmount：金額／數字用大鍵盤＋常用面額；digits 模式給統編這類固定位數
 * pickNote：備註＝常用詞可複選＋一欄補充
 * noteChips／fillChips：表單內嵌，按一下填進旁邊欄位（備註可複選、數值直接帶入） */
const NOTE_PRESETS=['去冰（有小碎冰）','少冰','熱的','不要蔥','不要香菜','不辣','加辣','醬另放','分開裝','打包','先上'];
const RESV_NOTE_PRESETS=['靠窗','嬰兒椅','慶生','素食','輪椅','安靜位','商務聚會','包場洽詢'];
const PAUSE_PRESETS=['今日最後點餐 22:30','廚房忙碌，暫停加點 15 分鐘','包場活動中，暫停點餐'];
const TABLE_ZONES=['A','B','C','D','E','F'];
const BREAK_PRESETS=[[0,'沒休息'],[30,'30 分'],[45,'45 分'],[60,'60 分'],[90,'90 分']];
// 備註以「、」串接的多選：再按一次移除
function toggleToken(value,token){const parts=String(value||'').split(/[、,，]/).map(s=>s.trim()).filter(Boolean);const i=parts.indexOf(token);if(i>=0)parts.splice(i,1);else parts.push(token);return parts.join('、');}
const noteChips=(forId,presets)=>`<div class="reason-chips reason-chips--inline note-chips" data-note-for="${esc(forId)}" role="group" aria-label="常用備註">${presets.map(p=>`<button type="button" data-note="${esc(p)}">${esc(p)}</button>`).join('')}</div>`;
function bindNoteChips(host){
  host.querySelectorAll('.note-chips[data-note-for]').forEach(box=>{
    if(box.dataset.bound)return;const inp=host.querySelector('#'+box.dataset.noteFor);if(!inp)return;box.dataset.bound='1';
    const has=t=>String(inp.value||'').split(/[、,，]/).map(s=>s.trim()).includes(t);
    const sync=()=>box.querySelectorAll('[data-note]').forEach(b=>b.setAttribute('aria-pressed',String(has(b.dataset.note))));
    box.querySelectorAll('[data-note]').forEach(b=>b.onclick=()=>{const max=Number(inp.maxLength)>0?Number(inp.maxLength):160;inp.value=toggleToken(inp.value,b.dataset.note).slice(0,max);inp.dispatchEvent(new Event('input'));sync();});
    inp.addEventListener('input',sync);sync();
  });
}
// 數值膠囊：按一下把值填進欄位（日期、人數、面額、休息分鐘），觸發 input／change 讓原本的即時計算跟著動
const fillChips=(forId,presets)=>`<div class="reason-chips reason-chips--inline fill-chips" data-fill-for="${esc(forId)}" role="group">${presets.map(([v,l])=>`<button type="button" data-fill="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
function bindFillChips(host){
  host.querySelectorAll('.fill-chips[data-fill-for]').forEach(box=>{
    if(box.dataset.bound)return;const inp=host.querySelector('#'+box.dataset.fillFor);if(!inp)return;box.dataset.bound='1';
    const sync=()=>box.querySelectorAll('[data-fill]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.fill===String(inp.value))));
    box.querySelectorAll('[data-fill]').forEach(b=>b.onclick=()=>{inp.value=b.dataset.fill;inp.dispatchEvent(new Event('input'));inp.dispatchEvent(new Event('change'));sync();});
    inp.addEventListener('input',sync);sync();
  });
}
function pickOverlay(html,label){const ov=document.createElement('div');ov.className='pos-move-ov';ov.innerHTML=`<div class="pos-move-box" role="dialog" aria-label="${esc(label)}">${html}</div>`;document.body.appendChild(ov);const close=()=>{if(ov.parentNode)ov.parentNode.removeChild(ov);};return {ov,close};}
// 從清單點一個：options [{value,label,sub,busy}]；other={label,pick:async()=>value} 給「其他…」；回傳 Promise<string|null>
function pickFrom({title,hint='',options=[],other=null,cols=4}){
  return new Promise(resolve=>{
    const {ov,close}=pickOverlay(`<h3>${esc(title)}${hint?tipIcon(esc(hint)):''}</h3><div class="pos-move-grid" style="grid-template-columns:repeat(${Number(cols)||4},1fr)">${options.map(o=>`<button type="button" class="pos-move-opt ${o.busy?'busy':''}" data-pick="${esc(o.value)}"><b>${esc(o.label??o.value)}</b>${o.sub?`<small>${esc(o.sub)}</small>`:''}</button>`).join('')}</div><div class="pos-move-foot">${other?`<button type="button" class="btn btn--ghost" data-other>${esc(other.label||'其他…')}</button>`:'<span></span>'}<button type="button" class="btn btn--ghost" data-cancel>取消</button></div>`,title);
    const done=v=>{close();resolve(v);};
    ov.onclick=e=>{if(e.target===ov)done(null);};
    ov.querySelector('[data-cancel]').onclick=()=>done(null);
    ov.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>done(b.dataset.pick));
    const ob=ov.querySelector('[data-other]');if(ob)ob.onclick=async()=>{close();resolve(await other.pick());};
  });
}
// 加開桌號：先點區再點號碼（固定桌號在桌況格直接點）；exclude＝不能選的桌（自己）
function pickTableNo({title='開哪一桌？',hint='',exclude=[]}={}){
  return new Promise(resolve=>{
    let zone=TABLE_ZONES[0],no='';
    const {ov,close}=pickOverlay(`<h3>${esc(title)}${hint?tipIcon(esc(hint)):''}</h3><div class="pos-tno"><b id="pos-tno-show">—</b></div><div class="reason-chips pos-tno-zones" role="group" aria-label="區">${TABLE_ZONES.map(z=>`<button type="button" data-zone="${z}">${z} 區</button>`).join('')}</div><div class="clock-keys pos-tno-keys">${['1','2','3','4','5','6','7','8','9','⌫','0','確定'].map(k=>`<button type="button" class="clock-key" data-key="${k}">${k}</button>`).join('')}</div><div class="pos-move-foot"><span></span><button type="button" class="btn btn--ghost" data-cancel>取消</button></div>`,title);
    const done=v=>{close();resolve(v);};
    ov.onclick=e=>{if(e.target===ov)done(null);};
    const paint=()=>{ov.querySelector('#pos-tno-show').textContent=zone+(no||'—');ov.querySelectorAll('[data-zone]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.zone===zone)));};
    ov.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{zone=b.dataset.zone;paint();});
    ov.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;
      if(k==='⌫')no=no.slice(0,-1);
      else if(k==='確定'){if(!no){toast('請點桌號數字');return;}const t=zone+no;if(exclude.includes(t)){toast(`${t} 就是這一桌`);return;}done(t);return;}
      else if(no.length<3)no+=k;
      paint();});
    ov.querySelector('[data-cancel]').onclick=()=>done(null);
    paint();
  });
}
// 金額鍵盤：常用面額一鍵送出、或按數字後確定；digits=N 改為固定 N 位數字（統編），回傳字串；否則回傳 number；取消＝null
function pickAmount({title,hint='',presets=[],initial='',min=0,max=100000,unit='NT$',digits=0}){
  return new Promise(resolve=>{
    const D=Number(digits)||0;let v=String(initial??'').replace(/\D/g,'');
    const keys=D?['1','2','3','4','5','6','7','8','9','⌫','0','確定']:['1','2','3','4','5','6','7','8','9','00','0','⌫'];
    const {ov,close}=pickOverlay(`<h3>${esc(title)}${hint?tipIcon(esc(hint)):''}</h3><div class="pos-amt">${unit?`<span>${esc(unit)}</span>`:''}<b id="pos-amt-show">0</b></div>${presets.length?`<div class="reason-chips pos-amt-presets" role="group" aria-label="常用金額">${presets.map(p=>`<button type="button" data-preset="${p}">${esc(unit)}${num(p)}</button>`).join('')}</div>`:''}<div class="clock-keys pos-amt-keys">${keys.map(k=>`<button type="button" class="clock-key" data-key="${k}">${k}</button>`).join('')}</div><div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>取消</button>${D?'':'<button type="button" class="btn btn--solid" data-ok>確定</button>'}</div>`,title);
    const done=x=>{close();resolve(x);};
    ov.onclick=e=>{if(e.target===ov)done(null);};
    const paint=()=>{ov.querySelector('#pos-amt-show').textContent=D?(v||'—'):(v?num(Number(v)):'0');};
    const ok=()=>{if(D){if(v.length!==D){toast(`請輸入 ${D} 位數字`);return;}done(v);return;}const n=v===''?NaN:Number(v);if(!Number.isFinite(n)||n<min||n>max){toast(`請輸入 ${num(min)}–${num(max)} 的金額`);return;}done(n);};
    ov.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>done(Number(b.dataset.preset)));
    ov.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;
      if(k==='⌫')v=v.slice(0,-1);
      else if(k==='確定'){ok();return;}
      else if(D){if(v.length<D)v+=k;}
      else if((v+k).length<=7)v=(v+k).replace(/^0+(?=\d)/,'');
      paint();});
    ov.querySelector('[data-cancel]').onclick=()=>done(null);
    const okBtn=ov.querySelector('[data-ok]');if(okBtn)okBtn.onclick=ok;
    paint();
  });
}
// 備註面板：常用詞可複選、再補一句；回傳 Promise<string|null>（空字串＝清除備註）
function pickNote({title,presets=NOTE_PRESETS,initial='',maxlength=160,placeholder='其他補充（選填）'}){
  return new Promise(resolve=>{
    const {ov,close}=pickOverlay(`<h3>${esc(title)}${tipIcon('點常用備註（可複選），有需要再補字。')}</h3>${noteChips('pos-note-pick',presets)}<label class="reason-other"><span>其他補充</span><input id="pos-note-pick" maxlength="${Number(maxlength)||160}" placeholder="${esc(placeholder)}" value="${esc(initial)}"></label><div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>取消</button><button type="button" class="btn btn--solid" data-ok>確定</button></div>`,title);
    const done=x=>{close();resolve(x);};
    ov.onclick=e=>{if(e.target===ov)done(null);};
    bindNoteChips(ov);
    const inp=ov.querySelector('#pos-note-pick');
    ov.querySelector('[data-cancel]').onclick=()=>done(null);
    ov.querySelector('[data-ok]').onclick=()=>done(inp.value.trim());
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();done(inp.value.trim());}};
  });
}
// 補開發票：與結帳同樣五種（紙本／統編／手機載具／自然人憑證／捐贈）；回傳 invoice 物件，null＝取消，格式錯誤會提示後回 null
async function askInvoice(){
  const kind=await pickFrom({title:'補開發票',hint:'一般客人開紙本；公司報帳選統編；會員載具或捐贈也可補開。',options:[{value:'paper',label:'紙本',sub:'不需統編'},{value:'company',label:'統編',sub:'公司報帳'},{value:'mobile',label:'手機載具',sub:'/ 開頭 8 碼'},{value:'citizen',label:'自然人憑證',sub:'2 英文＋14 數字'},{value:'donate',label:'捐贈',sub:'愛心碼'}],cols:3});
  if(kind===null)return null;
  if(kind==='paper')return {mode:'paper'};
  if(kind==='company'){
    const v=await pickAmount({title:'統編 8 碼',hint:'對照客人提供的統一編號',unit:'',digits:8});
    if(v===null)return null;const ubn=String(v).trim();
    if(!/^\d{8}$/.test(ubn)){toast('統編請輸入 8 碼數字');return null;}
    return {mode:'company',buyer_ubn:ubn};
  }
  if(kind==='donate'){
    const v=await pickReason({title:'捐贈愛心碼',presets:[],placeholder:'3–7 碼數字',maxlength:20});
    if(v===null)return null;const val=v.trim();
    if(!/^\d{3,7}$/.test(val)){toast('愛心碼請輸入 3–7 碼數字');return null;}
    return {mode:'donate',love_code:val};
  }
  const val=kind==='mobile'?await scanMobileCarrier():await pickCarrier(kind);if(val===null)return null;
  if(kind==='mobile'&&!/^\/[A-Z0-9.+-]{7}$/.test(val)){toast('手機條碼需為 / 開頭共 8 碼');return null;}
  if(kind==='citizen'&&!/^[A-Z]{2}\d{14}$/.test(val)){toast('自然人憑證條碼格式不正確');return null;}
  return {mode:kind,carrier_num:val};
}
// 載具條碼：相機掃描（與結帳同一套辨識）或手動輸入；掃到就直接送出。回傳大寫條碼字串，null＝取消
function pickCarrier(kind){
  const cfg=kind==='mobile'?{title:'手機載具條碼',placeholder:'例：/ABC+123（共 8 碼）'}:{title:'自然人憑證條碼',placeholder:'例：AB12345678901234'};
  return new Promise(resolve=>{
    const {ov,close}=pickOverlay(`<h3>${esc(cfg.title)}${tipIcon('按「掃描」用相機對準條碼，或直接手動輸入。')}</h3><div class="pos-inv-scan-row"><input id="pos-carrier-input" maxlength="20" autocapitalize="characters" autocomplete="off" placeholder="${esc(cfg.placeholder)}"><button type="button" class="btn btn--ghost" id="pos-carrier-scan">📷 掃描</button></div><video id="pos-carrier-video" playsinline muted></video><div class="pos-move-foot"><span></span><span><button type="button" class="btn btn--ghost" data-cancel>取消</button> <button type="button" class="btn btn--solid" data-ok>確定</button></span></div>`,cfg.title);
    const inp=ov.querySelector('#pos-carrier-input'),video=ov.querySelector('#pos-carrier-video');
    const done=v=>{stopPosInvoiceScanner(video);close();resolve(v);};
    ov.onclick=e=>{if(e.target===ov)done(null);};
    ov.querySelector('[data-cancel]').onclick=()=>done(null);
    ov.querySelector('[data-ok]').onclick=()=>done(inp.value.trim().toUpperCase());
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();done(inp.value.trim().toUpperCase());}};
    ov.querySelector('#pos-carrier-scan').onclick=()=>startInvoiceScan(video,v=>{inp.value=v;done(v);});
    inp.focus();
  });
}
// 手機載具：全螢幕彈窗直接開相機掃客人手機上的載具條碼；只收「/ 開頭 8 碼」，其他條碼略過繼續掃。也可手打或用掃描槍。回傳條碼，null＝取消
const MOBILE_CARRIER_RE=/^\/[A-Z0-9.+-]{7}$/;
function scanMobileCarrier(initial=''){
  return new Promise(resolve=>{
    const ov=document.createElement('div');ov.className='pos-scan-full';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','掃描手機載具');
    ov.innerHTML=`<div class="pos-scan-full-head"><b>掃描手機載具</b><button type="button" class="btn btn--ghost" data-cancel>關閉</button></div><div class="pos-scan-full-cam"><video id="pos-carrier-full-video" playsinline muted></video><div class="pos-scan-full-frame" aria-hidden="true"></div></div><p class="pos-scan-full-hint" role="status">請客人打開手機載具條碼，對準框內</p><div class="pos-scan-full-foot"><input id="pos-carrier-full-input" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="或手動輸入 /ABC+123" value="${esc(initial)}"><button type="button" class="btn btn--solid" data-ok>確定</button></div>`;
    document.body.appendChild(ov);
    const video=ov.querySelector('video'),inp=ov.querySelector('input'),hint=ov.querySelector('.pos-scan-full-hint');
    let closed=false;
    const done=v=>{if(closed)return;closed=true;stopPosInvoiceScanner(video);ov.remove();document.removeEventListener('keydown',esc_);resolve(v);};
    const esc_=e=>{if(e.key==='Escape'){e.preventDefault();done(null);}};document.addEventListener('keydown',esc_);
    const submit=()=>{const v=inp.value.trim().toUpperCase();if(!MOBILE_CARRIER_RE.test(v)){hint.textContent='手機條碼需為 / 開頭共 8 碼';inp.focus();return;}done(v);};
    ov.querySelector('[data-cancel]').onclick=()=>done(null);
    ov.querySelector('[data-ok]').onclick=submit;
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit();}};
    startInvoiceScan(video,v=>done(v),{accept:v=>MOBILE_CARRIER_RE.test(v)}).then(ok=>{if(!ok&&!closed){hint.textContent='相機無法使用，請手動輸入或用掃描槍';inp.focus();}});
  });
}
// 發票證明聯只給紙本與統編；手機載具、自然人憑證、捐贈不印（ezPay PrintFlag 同規則）。舊資料沒有 mode 視為可印
const invoicePrintable=inv=>inv?.status==='issued'&&(!inv.mode||inv.mode==='paper'||inv.mode==='company');
// 發票欄位（統編／載具／愛心碼／備註）存在這裡：結帳面板常被重畫（點收款金額、折扣、會員、其他桌有新單），只存在畫面上會被清空
let POS_INV_VALS={};
let POS_EDIT=false,POS_EDIT_POS=null;
let POS_INV_SCAN_STREAM=null,POS_INV_SCAN_FRAME=0;
// 發票各類型只顯示自己要填的欄位（點選後才出現），手機載具可用相機掃描條碼代替手打
function stopPosInvoiceScanner(video){
  cancelAnimationFrame(POS_INV_SCAN_FRAME);POS_INV_SCAN_FRAME=0;
  if(POS_INV_SCAN_STREAM)POS_INV_SCAN_STREAM.getTracks().forEach(t=>t.stop());
  POS_INV_SCAN_STREAM=null;
  for(const v of [video,document.getElementById('pos-invoice-video')])if(v){v.style.display='none';v.srcObject=null;}
}
// 相機條碼辨識：Chrome／Android 用瀏覽器內建 BarcodeDetector；Safari（iPhone／iPad 上所有瀏覽器都是 WebKit）至今沒開放這個 API，
// 改用同網域的 /vendor/zxing-reader.js（zxing-wasm），.wasm 也放本站 /vendor/，不連外部 CDN。
// 兩種都包成同一個 detect(video) 介面給掃描迴圈用。
let POS_BD_READY=false,POS_BD_CANVAS=null;
function barcodeDetectorClass(){
  if('BarcodeDetector' in window)return window.BarcodeDetector;
  const zx=window.ZXingWASM;if(!zx?.readBarcodes)return null;
  if(!POS_BD_READY){POS_BD_READY=true;try{zx.prepareZXingModule({overrides:{locateFile:(p,prefix)=>p.endsWith('.wasm')?'/vendor/zxing_reader.wasm':prefix+p},fireImmediately:true});}catch(e){}}
  // 手機載具是「標準」Code 39（「/」是字面字元）：一定要用 Code39Std，用 Code39（extended）會把 /A 譯成「!」掃出錯的載具號碼；
  // 這版 zxing-wasm 的 tryCode39ExtendedMode:false 不生效，只有換 format 才有用（.tmp/bd-polyfill/verify3.cjs 實測）
  const FMT={code_39:'Code39Std',code_128:'Code128',qr_code:'QRCode'};
  return class{
    constructor({formats=[]}={}){this.formats=formats.map(f=>FMT[f]).filter(Boolean);}
    async detect(video){
      const w=video.videoWidth,h=video.videoHeight;if(!w||!h)return[];
      const c=POS_BD_CANVAS||(POS_BD_CANVAS=document.createElement('canvas'));c.width=w;c.height=h;
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,w,h);
      const out=await zx.readBarcodes(ctx.getImageData(0,0,w,h),{formats:this.formats,textMode:'Plain',maxNumberOfSymbols:1});
      return out.filter(r=>r.text).map(r=>({rawValue:r.text,format:r.format}));
    }
  };
}
// 共用掃描迴圈：開相機→逐幀辨識→掃到就停、回呼、提示。結帳與補開發票都用這一個；video 是誰的就把畫面放誰那裡
async function startInvoiceScan(video,onCode,{raw:keepRaw=false,sensitive=false,accept=null}={}){
  const BD=barcodeDetectorClass();
  if(!BD||!navigator.mediaDevices?.getUserMedia){toast('此瀏覽器不支援相機掃碼，請直接輸入條碼。');return false;}
  try{
    stopPosInvoiceScanner();
    POS_INV_SCAN_STREAM=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
    video.srcObject=POS_INV_SCAN_STREAM;video.style.display='block';await video.play();
    const detector=new BD({formats:['code_39','code_128','qr_code']});
    const tick=async()=>{
      if(!POS_INV_SCAN_STREAM||video.srcObject!==POS_INV_SCAN_STREAM)return;
      const codes=await detector.detect(video).catch(()=>[]);
      const raw=codes[0]?.rawValue;
      if(raw&&(!accept||accept(keepRaw?raw.trim():raw.trim().toUpperCase()))){const v=keepRaw?raw.trim():raw.trim().toUpperCase();stopPosInvoiceScanner(video);onCode(v);toast(sensitive?'已掃到付款碼':'已掃到條碼：'+v);return;}
      POS_INV_SCAN_FRAME=requestAnimationFrame(tick);
    };
    tick();return true;
  }catch(e){stopPosInvoiceScanner(video);toast('無法開啟相機：'+e.message);return false;}
}
// 掃會員條碼：全螢幕彈窗，點「掃會員」即開相機掃 App「會員卡」QR；下方可用掃描槍／手動貼上。向後台換成會員資料；會員卡 QR 區分大小寫，不能轉大寫
function pickMemberCard(){
  return new Promise(resolve=>{
    const ov=document.createElement('div');ov.className='pos-scan-full';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','掃會員條碼');
    ov.innerHTML=`<div class="pos-scan-full-head"><b>掃會員條碼</b><button type="button" class="btn btn--ghost" data-cancel>關閉</button></div><div class="pos-scan-full-cam"><video id="pos-card-video" playsinline muted></video><div class="pos-scan-full-frame pos-scan-full-frame--qr" aria-hidden="true"></div></div><p class="pos-scan-full-hint" role="status">請客人打開 App「會員卡」，把 QR 對準框內</p><div class="pos-scan-full-foot"><input id="pos-card-input" autocomplete="off" spellcheck="false" placeholder="或用掃描槍／貼上會員條碼"><button type="button" class="btn btn--solid" data-ok>確定</button></div>`;
    document.body.appendChild(ov);
    const video=ov.querySelector('video'),inp=ov.querySelector('input'),hint=ov.querySelector('.pos-scan-full-hint');
    let closed=false;
    const done=v=>{if(closed)return;closed=true;stopPosInvoiceScanner(video);ov.remove();document.removeEventListener('keydown',esc_);resolve(v);};
    const esc_=e=>{if(e.key==='Escape'){e.preventDefault();done(null);}};document.addEventListener('keydown',esc_);
    const submit=()=>{const v=inp.value.trim();if(!v){hint.textContent='請掃描或貼上會員條碼';inp.focus();return;}done(v);};
    ov.querySelector('[data-cancel]').onclick=()=>done(null);
    ov.querySelector('[data-ok]').onclick=submit;
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit();}};
    startInvoiceScan(video,v=>done(v),{raw:true}).then(ok=>{if(!ok&&!closed){hint.textContent='相機無法使用，請用掃描槍或貼上會員條碼';inp.focus();}});
  });
}
function syncInvoiceBadge(host){
  const b=host.querySelector('.pos-invoice-head .pos-inv-badge');if(!b)return;
  b.textContent=POS_INVOICE.mode?INV_LABEL[POS_INVOICE.mode]:'不開立';b.dataset.off=POS_INVOICE.mode?'':'1';
}
function updateInvoiceFields(host){
  const box=host.querySelector('.pos-invoice');if(!box)return;
  const mode=POS_INVOICE.mode;
  box.querySelectorAll('[data-inv-modes]').forEach(el=>{el.hidden=!el.dataset.invModes.split(',').includes(mode);});
  if(mode!=='mobile'&&!document.querySelector?.('.pos-scan-full'))stopPosInvoiceScanner(); // 全螢幕掃會員／載具開著時不關相機
}
/* 收款帳戶：現金／刷卡／LINE Pay／轉帳內建在 PAY_LABEL；言文字管理員在系統設定另外新增的自訂收款帳戶放在 DATA.payment_methods（見 docs/API.md GET /api/state）*/
const payMethodLabel=code=>PAY_LABEL[code]||(DATA?.payment_methods||[]).find(m=>m.code===code)?.label||code;
// 信用卡同一台機器對帳，結帳選項合併成一個（代碼仍是 taishin）；歷史單據各自的 card／taishin 標籤不受影響，見 payMethodLabel
const payMethodsActive=()=>{const list=(DATA?.payment_methods||[]).filter(m=>m.active);return list.length?list:[['cash','現金'],['linepay','LINE Pay'],['transfer','轉帳'],['taishin','信用卡'],['other','其他']].map(([code,label])=>({code,label,builtin:true}));};
// 開放式餐吧不分吧檯／廚房；看板與出餐單改用菜單類別（咖啡、茶、日式主食…）讓現場一眼看出餐飲類型。API 的 stations 仍照舊回，這裡攤平後依類別排序。
const catLabel=c=>(typeof MenuLib!=='undefined'&&MenuLib.CAT_LABEL?.[c]?.zh)||c||'其他';
const catOrder=c=>{const i=typeof MenuLib!=='undefined'?MenuLib.CATS.indexOf(c):-1;return i<0?999:i;};
const byCat=lines=>lines.map((l,i)=>[l,i]).sort((a,b)=>catOrder(a[0].cat)-catOrder(b[0].cat)||a[1]-b[1]).map(([l])=>l);
const orderLines=o=>byCat(o.stations&&(o.stations.bar?.length||o.stations.kitchen?.length)?[...(o.stations.bar||[]),...(o.stations.kitchen||[])]:(o.items||[]).filter(l=>!l.prepay&&!l.credit_of));
const groupByCat=lines=>{const g=new Map();for(const l of byCat(lines)){const k=l.cat||'';if(!g.has(k))g.set(k,[]);g.get(k).push(l);}return [...g];};
// 規格：note 由桌邊／櫃檯加點寫成「溫度：熱；糖度：無糖；冰塊：去冰；自由文字」。拆成一顆顆標籤：預設值（正常冰、正常糖…）淡化、非預設值深色加粗、
// 沒有「標籤：」的自由需求標 ※ 琥珀底——現場看一眼就知道哪些要特別處理，減少做錯。預設值來自 order-lib 同一份規格定義（沒載到就全部當非預設）。
const specTone=label=>({溫度:'temperature',Temperature:'temperature','温度':'temperature',糖度:'sugar',Sweetness:'sugar','甘さ':'sugar',冰塊:'ice',Ice:'ice','氷':'ice',飯量:'rice','Rice amount':'rice','ご飯の量':'rice',麵量:'noodle','Noodle amount':'noodle','麺の量':'noodle'})[String(label||'')]||'custom';
function specParts(l){
  const defaults={};try{for(const g of (typeof OrderLib!=='undefined'&&OrderLib.optionGroups)?OrderLib.optionGroups({cat:l.cat,zh:l.zh},'zh'):[])defaults[g.label]=g.choices[0];}catch(e){}
  return String(l.note||'').split(/[；;]/).map(s=>s.trim()).filter(Boolean).flatMap(s=>{
    const m=s.match(/^([^：:]{1,6})[：:](.+)$/);
    if(!m)return s.split(/[、,，]/).map(t=>t.trim()).filter(Boolean).map(text=>({text,kind:'custom',tone:'custom'})); // 常用備註膠囊以「、」連接，一顆一籤
    const text=m[2].trim();return [{text,kind:defaults[m[1]]===text?'default':'option',tone:specTone(m[1])}];
  });
}
const TABLE_STATE={empty:['pill-draft','已開桌'],open:['pill-wait','點餐中'],ordered:['pill-wait','待出餐'],preparing:['pill-wait','準備中'],ready:['pill-ok','可取餐'],idle:['pill-draft','待清桌']};
// 現場固定桌位（跟桌牌印刷一致，見 table-cards-20261012）：桌況格一律先列出這些桌，不管有沒有開桌，方便現場人員直接點選開桌
const DEFAULT_TABLES=['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','B1','B2','C1','C2','C3','C4'];
const ORDER_STATE={placed:'待出餐',paid:'準備中',ready:'可取餐',done:'已取餐',void:'已作廢'};
const IDLE_WARN_MIN=10;
const idleWarn=s=>!s.takeout&&s.state==='empty'&&s.created_at&&(Date.now()-new Date(s.created_at))>=IDLE_WARN_MIN*60000;
// 桌況卡的詳細資訊：品項摘要、份數、出餐進度、開桌／最後動作時間、點餐人、開桌人員
const tableDetailHtml=s=>{
  const ls=(s.lines||[]).filter(l=>!l.credit_of&&!l.cancelled);
  if(!ls.length&&!s.created_at)return '';
  const qty=ls.reduce((a,l)=>a+(Number(l.qty)||0),0);
  const served=ls.filter(l=>l.served_at).reduce((a,l)=>a+(Number(l.qty)||0),0);
  const waiting=ls.filter(l=>l.placed_at&&!l.served_at).reduce((a,l)=>a+(Number(l.qty)||0),0);
  const unsent=qty-served-waiting;
  const names=ls.slice(0,4).map(l=>`${esc(l.zh)}×${l.qty}`).join('、')+(ls.length>4?` …等 ${ls.length} 項`:'');
  const who=[...new Set(ls.map(l=>l.by).filter(Boolean))];
  const prog=qty?[`共 ${qty} 份`,served?`已出 ${served}`:'',waiting?`待出 ${waiting}`:'',unsent>0?`未送單 ${unsent}`:''].filter(Boolean).join(' · '):'';
  const times=[s.created_at?`${s.takeout?'開單':'開桌'} ${clockText(s.created_at)}`:'',s.updated_at?`最後動作 ${clockText(s.updated_at)}`:''].filter(Boolean).join(' · ');
  return `<span class="pos-detail">${names?`<small class="pos-detail-items">${names}</small>`:''}${prog?`<small>${prog}</small>`:''}${s.party_size?`<small>來客 ${Number(s.party_size)} 位</small>`:''}${who.length?`<small>點餐：${who.map(esc).join('、')}</small>`:''}${times?`<small>${times}</small>`:''}${s.operator?`<small>開桌：${esc(s.operator)}</small>`:''}</span>`;
};
const elapsedShort=iso=>{const m=Math.max(0,Math.floor((Date.now()-new Date(iso))/60000));return m<60?`${m}分`:`${Math.floor(m/60)}時${m%60}分`;};
const elapsedText=iso=>{const m=Math.max(0,Math.floor((Date.now()-new Date(iso))/60000));return m<60?`${m} 分`:`${Math.floor(m/60)} 時 ${m%60} 分`;};
// 現場看板只顯示時刻（HH:MM），不佔欄寬；完整日期時間放 title 供滑鼠停留查看
const clockText=iso=>{const d=iso?new Date(iso):null;return d&&!isNaN(d)?d.toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit'}):'—';};
const todayTaipei=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
// 日期膠囊：今天起 7 天（含週幾），再遠的才用月曆；人數膠囊 1–8
const relDayText=date=>{const n=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(todayTaipei()+'T00:00:00Z'))/864e5);return n===0?'今天':n===1?'明天':n===2?'後天':n===-1?'昨天':n===-2?'前天':n>0?n+' 天後':-n+' 天前';};
const dayChoices=(from=todayTaipei(),n=7)=>Array.from({length:n},(_,i)=>{const d=addDaysStr(from,i);return [d,i===0?'今天':i===1?'明天':dayText(d)];});
const PARTY_CHOICES=[1,2,3,4,5,6,7,8].map(n=>[String(n),n+' 位']);
const scopeQuery=(extra='')=>{const p=[SCOPE?'venue='+SCOPE:'',extra].filter(Boolean).join('&');return p?'?'+p:'';};
const payText=o=>{const p=o.payer||{};if(Array.isArray(p.payments)&&p.payments.length)return '混合：'+p.payments.map(x=>`${payMethodLabel(x.method)} ${num(x.amount)}`).join('＋');const m=p.method;return m?payMethodLabel(m)+(p.prepay?'（部分付款）':''):(o.tappay?.rec_trade_id?PAY_LABEL.tappay:'—');};
// 這張單實際收了多少現金（整單現金＝全額；混合付款＝現金那幾筆）——退現金、開錢櫃都看這個
const cashPaidOf=o=>{const p=o?.payer||{},n=Math.max(0,Number(o?.amount)||0);if(p.method==='cash')return n;if(Array.isArray(p.payments))return Math.min(n,p.payments.filter(x=>x.method==='cash').reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0));return 0;};
const invoiceText=o=>{const inv=o.invoice||{};if(inv.status==='issued')return `發票 ${inv.number||'已開立'}`;if(inv.status==='failed')return `發票失敗：${inv.error||'待補開'}`;if(inv.status==='void')return `發票已作廢 ${inv.number||''}`;if(inv.requested)return '發票待補開';return '未開發票';};
// 表格用：發票異常（失敗／待補開）用色標，正常的只放灰字
const invoiceHtml=o=>{const inv=o.invoice||{};const fix=o.status==='void'?'':` <button type="button" class="btn btn--ghost btn-xs" data-invoice-issue="${esc(o.id)}">補開發票</button>`;if(inv.status==='failed')return `<span class="inv-fix"><span class="pill pill-bad" title="${esc(inv.error||'')}">發票失敗</span>${fix}</span>`;if(inv.requested&&!['issued','void'].includes(inv.status))return `<span class="inv-fix"><span class="pill pill-wait">發票待補開</span>${fix}</span>`;return `<span class="hint hint--tight">${esc(invoiceText(o))}</span>${!['issued','void'].includes(inv.status)?fix:''}`;};
const discountText=d=>d?`${d.type==='percent'?d.value+'％':'NT$'+num(d.value)}${d.reason?'・'+d.reason:''}`:'';
const isTakeoutNo=t=>/^W\d{2}$/.test(String(t||''));
function invoiceBody(host){
  const mode=host.querySelector('input[name=pos-invoice]:checked')?.value||'';POS_INVOICE.mode=mode;
  if(!mode)return {mode:''};
  const box=host.querySelector('.pos-invoice');
  return {mode,buyer_ubn:box.querySelector('[name=buyer_ubn]')?.value||'',buyer_name:mode==='company'?(box.querySelector('#pos-ubn-result')?.dataset.name||''):'',carrier_num:box.querySelector('[name=carrier_num]')?.value||'',love_code:box.querySelector('[name=love_code]')?.value||'',comment:box.querySelector('[name=comment]')?.value||''};
}
// 平板上正在操作的畫面不走 refresh() 整頁重繪，只重載該分頁
async function opsThen(fn,msg,reload){try{const out=await fn();toast(typeof msg==='function'?await msg(out):msg);if(reload)await reload(out);}catch(e){toast(e.message);}}
function ordersBeep(){try{const c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=660;g.gain.value=.2;o.start();o.stop(c.currentTime+.5);}catch(e){}}
// 80mm 出單機版型；列印視窗只放經 esc 的內容
const PRINT_CSS='body{font-family:sans-serif;width:72mm;margin:0;padding:4mm;font-size:16px;color:#000}h1{font-size:30px;margin:0 0 4px}h1.k{font-size:42px;letter-spacing:.04em;text-align:center;margin:2px 0 6px}h2{font-size:16px;margin:10px 0 4px;border-bottom:2px solid #000}.m{color:#333;margin-bottom:6px}.l{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #bbb}.l.k{font-size:20px;font-weight:700;border-bottom:1px solid #000;padding:6px 0}.n{color:#222;padding:0 0 4px 1em;font-weight:700}.t{display:flex;justify-content:space-between;font-weight:700;margin-top:8px;font-size:17px}.t.big{font-size:22px;border-top:2px solid #000;padding-top:6px}.c{text-align:center;margin-top:12px;color:#333}.sep{border:0;border-top:1px dashed #000;margin:8px 0}';
function printWindow(title,html,css=PRINT_CSS){const w=window.open('','_blank');if(!w){toast('瀏覽器擋下列印視窗，請允許彈出視窗');return false;}w.document.write(`<title>${esc(title)}</title><style>${css}</style>${html}`);w.document.close();w.focus();w.print();return true;}
// Star mPOP POP10CI（沒有藍牙）：iPad 用 USB-C 線接 mPOP，POS 在 Star webPRNT Browser 裡開，網頁經 localhost:8001 送列印／開錢櫃指令（SDK 在 /vendor/StarWebPrint*.js，只有 pos.html 載入）
const STAR_WEBPRNT_URL='https://localhost:8001/StarWebPRNT/SendMessage';
const QR_CLIP_TOP=200; // 桌號 QR 單上方留白 25mm，給帳本夾夾
const STAR_DOTS=384; // mPOP 58mm 紙、203dpi：可列印寬 48mm = 384 點
const inStarBrowser=()=>/StarWebPRNTBrowser/i.test(navigator.userAgent);
const starReady=()=>inStarBrowser()&&typeof StarWebPrintBuilder!=='undefined'&&typeof StarWebPrintTrader!=='undefined';
const starBrowserUrl=()=>'webprnt://starmicronics.com/open?url='+encodeURIComponent(location.href);
function starHint(){toast('要印發票／開錢櫃，請用 Star webPRNT Browser 開 POS（iPad 以 USB-C 線接 mPOP）');}
async function starOpenHere(){if(await posConfirm('印發票／開錢櫃要在 Star webPRNT Browser 裡操作（iPad 以 USB-C 線接 mPOP）。現在切換過去？',{ok:'切換過去'}))location.href=starBrowserUrl();}
// 組一份 webPRNT 請求送給 mPOP：canvas = 要印的點陣圖（可省略，只開錢櫃）；drawer = 先踢錢櫃
// Native SDK keys callbacks by URL, not job id. Never clear its pending slot on timeout:
// a late callback would otherwise be attributed to the next job. Fail closed until it drains.
let STAR_NATIVE_UNCERTAIN=null;
let STAR_PRINT_QUEUE=Promise.resolve();
function starSend(job={}){const result=STAR_PRINT_QUEUE.then(()=>starSendNow(job));STAR_PRINT_QUEUE=result.catch(()=>false);return result;}
function starSendNow({canvas=null,drawer=false}={}){
  if(!canvas&&!drawer)return Promise.resolve(false);
  if(!starReady())return Promise.resolve(false);
  if(STAR_NATIVE_UNCERTAIN){toast('mPOP 前一筆結果未明，暫停傳送；請確認錢櫃與單據，等待回應或重新啟動 Star Browser，勿重複收退款。');return Promise.resolve(false);}
  const b=new StarWebPrintBuilder();let req=b.createInitializationElement({reset:true,print:true});
  if(drawer)req+=b.createPeripheralElement({channel:1,on:200,off:200});
  if(canvas)req+=b.createAlignmentElement({position:'center'})+b.createBitImageElement({context:canvas.getContext('2d'),x:0,y:0,width:canvas.width,height:canvas.height})+b.createFeedElement({line:3})+b.createCutPaperElement({feed:true,type:'partial'});
  return new Promise(resolve=>{
    const t=new StarWebPrintTrader({url:STAR_WEBPRNT_URL,timeout:15000});
    let settled=false;
    const finish=ok=>{if(STAR_NATIVE_UNCERTAIN===t)STAR_NATIVE_UNCERTAIN=null;if(settled)return;settled=true;clearTimeout(deadline);resolve(ok);};
    const deadline=setTimeout(()=>{if(settled)return;if(typeof _handlerCallback!=='undefined'&&_handlerCallback[STAR_WEBPRNT_URL]===t)STAR_NATIVE_UNCERTAIN=t;settled=true;toast('mPOP 回應逾時，結果未明；請檢查錢櫃與單據，勿重複收退款。');resolve(false);},16000);
    t.onReceive=r=>{if(settled){finish(false);return;}if(r.traderSuccess==='true')return finish(true);toast(t.isPaperEnd(r)?'mPOP 沒紙了':t.isCoverOpen(r)?'mPOP 上蓋沒關':t.isOffLine(r)?'mPOP 離線：請確認 USB-C 線與電源':'mPOP 回報錯誤（'+r.traderCode+'）');finish(false);};
    t.onError=e=>{if(!settled)toast('連不到 mPOP（'+(e?.status||'')+'）：請確認 USB-C 線已接上、mPOP 已開機');finish(false);};
    t.onTimeout=()=>{if(!settled)toast('mPOP 沒有回應，請確認 USB-C 線與電源');finish(false);};
    try{t.sendMessage({request:req});}catch(e){toast('送出失敗：'+e.message);finish(false);}
  });
}
const DRAWER_ATTEMPTS=new Set(),CHECKOUT_BUSY=new Set();
async function runCheckoutOnce(id,fn){if(CHECKOUT_BUSY.has(id))return;CHECKOUT_BUSY.add(id);try{return await fn();}finally{CHECKOUT_BUSY.delete(id);}}
async function openCashDrawer({auto=false}={}){if(starReady()){const ok=await starSend({drawer:true});if(ok)toast('開櫃指令已送出');return ok;}if(auto)starHint();else starOpenHere();return false;}
async function claimCashDrawer(event){
  const out=await api('/admin/pos/drawer-events',{method:'POST',body:{...event,operator_id:OPERATOR?.id}});
  if(!out.claimed)return false;
  return await openCashDrawer({auto:true});
}
async function autoCashDrawer({kind,order_id,line,method,amount,payments,cash_refund=0}){
  const cash=method==='cash'?Number(amount):(payments||[]).filter(p=>p.method==='cash').reduce((s,p)=>s+Math.max(0,Number(p.amount)||0),0);
  if(!order_id||!(kind==='checkout'?cash>0:kind==='refund'&&Number(cash_refund)>0))return null;
  const event_key=kind+':'+order_id+(line?':'+line:'');
  if(DRAWER_ATTEMPTS.has(event_key))return false;DRAWER_ATTEMPTS.add(event_key);
  try{const ok=await claimCashDrawer({event_key,kind,order_id,line,reason:kind==='checkout'?'現金結帳':'確認退現金'});if(ok)return true;}catch(e){/* 已完成的交易不可因開櫃失敗而重送。 */}
  toast('交易已完成，未確認開櫃成功；請確認錢櫃，需要時按「錢櫃」重試，勿重複收退款。');return false;
}
// 開帳成功後自動開錢櫃放零用金：以帳本 id 去重（register:<id>），失敗只提示、不重送開帳
async function registerCashDrawer(register_id){
  if(!register_id)return null;
  const event_key='register:'+register_id;
  if(DRAWER_ATTEMPTS.has(event_key))return false;DRAWER_ATTEMPTS.add(event_key);
  try{if(await claimCashDrawer({event_key,kind:'register',register_id,reason:'開帳放零用金'}))return true;}catch(e){/* 開帳已完成，不因開櫃失敗重送。 */}
  return false;
}
async function manualCashDrawer(reason){
  if(!reason?.trim())return false;
  try{const ok=await claimCashDrawer({event_key:'manual:'+crypto.randomUUID(),kind:'manual',reason:reason.trim()});if(!ok)toast('未確認開櫃成功，請檢查連線與錢櫃後再試。');return ok;}catch(e){toast('開櫃未送出：'+e.message);return false;}
}
const c39={0:'101001101101',1:'110100101011',2:'101100101011',3:'110110010101',4:'101001101011',5:'110100110101',6:'101100110101',7:'101001011011',8:'110100101101',9:'101100101101',A:'110101001011',B:'101101001011',C:'110110100101',D:'101011001011',E:'110101100101',F:'101101100101',G:'101010011011',H:'110101001101',I:'101101001101',J:'101011001101',K:'110101010011',L:'101101010011',M:'110110101001',N:'101011010011',O:'110101101001',P:'101101101001',Q:'101010110011',R:'110101011001',S:'101101011001',T:'101011011001',U:'110010101011',V:'100110101011',W:'110011010101',X:'100101101011',Y:'110010110101',Z:'100110110101','-':'100101011011','.':'110010101101',' ':'100110101101','$':'100100100101','/':'100100101001','+':'100101001001','%':'101001001001','*':'100101101101'};
const invPick=(inv,...keys)=>{for(const k of keys){const v=inv?.[k]??inv?.result?.[k];if(v!==undefined&&v!==null&&String(v))return String(v);}return '';};
// 買方／賣方統編：先讀我們存的 buyer_ubn；舊發票沒存時，從左側 QR 內容解析（10 字發票號＋7 日期＋4 隨機碼＋8 銷售額＋8 總額＋8 買方＋8 賣方）
const SELLER_UBN='93537055';   // 言文字股份有限公司統一編號；QR 解析不到時的預設值
function invoiceParties(inv){
  const ql=invPick(inv,'QRcodeL','QRcode_Left','QRCodeL','QRCode_Left','QrCodeL');
  const buyerQr=ql.length>=53?ql.slice(37,45):'',sellerQr=ql.length>=53?ql.slice(45,53):'';
  const ubn=inv?.buyer_ubn||invPick(inv,'BuyerUBN')||(/^\d{8}$/.test(buyerQr)&&buyerQr!=='00000000'?buyerQr:'');
  const seller=/^\d{8}$/.test(sellerQr)?sellerQr:SELLER_UBN;
  return {ubn,seller};
}
// 期別：民國年＋雙月，例 2026-10 → 115年09-10月
function invoicePeriodText(inv){const d=new Date(inv?.issued_at||Date.now());const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',year:'numeric',month:'numeric'}).formatToParts(d);const y=+p.find(x=>x.type==='year').value,m=+p.find(x=>x.type==='month').value;const e=m%2?m+1:m;return `${y-1911}年${String(e-1).padStart(2,'0')}-${String(e).padStart(2,'0')}月`;}
function invoiceTimeText(inv){const d=new Date(inv?.issued_at||Date.now());return isNaN(d)?'':d.toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function invoiceDateText(inv){const d=new Date(inv?.issued_at||Date.now());return isNaN(d)?'':d.toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});}
// Code 39 直接畫在 canvas：窄線 1 點、寬線 3 點、字距 1 點；台灣發票條碼 19 碼＋頭尾「*」共 336 點，放得進 384 點寬
function drawCode39(g,text,x0,y,h){const value='*'+String(text||'').toUpperCase().replace(/[^0-9A-Z .\-$\/+%]/g,'').slice(0,38)+'*';let w=0;for(const ch of value){for(const bit of (c39[ch]||c39['-']))w+=bit==='1'?3:1;w+=1;}let x=x0+Math.max(0,Math.floor((STAR_DOTS-2*x0-w)/2));g.fillStyle='#000';for(const ch of value){const pat=c39[ch]||c39['-'];for(let i=0;i<pat.length;i++){const bw=pat[i]==='1'?3:1;if(i%2===0)g.fillRect(x,y,bw,h);x+=bw;}x+=1;}}
function qrCanvas(text,size){return new Promise(resolve=>{if(!text||typeof QRCode==='undefined'||!QRCode.toCanvas)return resolve(null);const c=document.createElement('canvas');QRCode.toCanvas(c,String(text),{margin:0,width:size},err=>resolve(err?null:c));});}
// 電子發票證明聯畫成 384 點寬的點陣圖（mPOP 58mm 紙）：店名、發票號碼、日期、隨機碼、總計、Code 39 條碼、左右 QR code
async function invoiceProofCanvas(o){
  const inv=o.invoice||{},no=inv.number||invPick(inv,'InvoiceNumber'),random=inv.random||invPick(inv,'RandomNum'),bar=invPick(inv,'BarCode','Barcode','barCode'),ql=invPick(inv,'QRcodeL','QRcode_Left','QRCodeL','QRCode_Left','QrCodeL'),qr=invPick(inv,'QRcodeR','QRcode_Right','QRCodeR','QRCode_Right','QrCodeR'),shop=BRAND_LABEL[o.items?.[0]?.venue]||BRAND_LABEL[SCOPE]||'言文字';
  const W=STAR_DOTS,c=document.createElement('canvas');c.width=W;c.height=1000;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,c.height);g.fillStyle='#000';g.textBaseline='top';let y=6;
  const center=(t,size,bold)=>{g.font=(bold?'bold ':'')+size+'px sans-serif';g.textAlign='center';g.fillText(t,W/2,y);y+=size+8;};
  const row=(l,r,size=22)=>{g.font=size+'px sans-serif';g.textAlign='left';g.fillText(l,8,y);g.textAlign='right';g.fillText(r,W-8,y);y+=size+8;};
  const {ubn,seller}=invoiceParties(inv);
  center('言文字股份有限公司',28,true);center(shop,22,true);center('電子發票證明聯',24,true);center(invoicePeriodText(inv),24,true);center(no?no.replace(/^([A-Z]{2})(\d{8})$/,'$1-$2'):'發票已開立',36,true);
  row('日期',invoiceDateText(inv));row('時間',invoiceTimeText(inv));row('隨機碼',random||'');
  if(seller)row('賣方統編',seller);
  if(ubn){row('買方統編',ubn);if(inv.buyer_name&&inv.buyer_name!=='買受人')center(inv.buyer_name,20);const total=Math.round(Number(o.amount)||0),amt=Math.round(total/1.05);row('銷售額','NT$'+num(amt));row('營業稅','NT$'+num(total-amt));}
  row('總計','NT$'+num(o.amount),28);y+=6;
  if(bar){drawCode39(g,bar,8,y,64);y+=70;g.font='18px monospace';g.textAlign='center';g.fillText(bar,W/2,y);y+=26;}
  const qrs=(await Promise.all([qrCanvas(ql,160),qrCanvas(qr,160)])).filter(Boolean);
  if(qrs.length){const size=160,gap=24,x0=Math.floor((W-(size*qrs.length+gap*(qrs.length-1)))/2);qrs.forEach((q,i)=>g.drawImage(q,x0+i*(size+gap),y,size,size));y+=size+10;}
  else{center('ezPay 未回傳 QR code；請以發票號碼查驗',18);}
  center(`${isTakeoutNo(o.table_no)?'外帶':'桌號'} ${o.table_no||''} · 單號 ${o.id||o.order_id||''}`,18);
  const out=document.createElement('canvas');out.width=W;out.height=Math.ceil(y+8);const og=out.getContext('2d');og.fillStyle='#fff';og.fillRect(0,0,W,out.height);og.drawImage(c,0,0);return out;
}
// 列印與開錢櫃完全分開，補印永遠不觸發開櫃。
async function printInvoiceProof(o,{auto=false}={}){
  if(!o?.invoice||o.invoice.status!=='issued'){toast('這筆沒有可列印的已開立發票');return;}
  if(starReady()){const canvas=await invoiceProofCanvas(o);const ok=await starSend({canvas});if(ok)toast('發票已印出');return ok;}
  if(auto)starHint();else starOpenHere();
}
// 出餐單／收據明細 58mm 點陣排版。出餐單給現場：桌號大字、依類別分段、品名×數量、備註（不印價錢）。收據明細給客人：品項金額、折扣、付款、發票。
const ticketGroups=o=>groupByCat(orderLines(o).filter(l=>!l.cancelled));
function ticketTableLabel(o){return `${isTakeoutNo(o.table_no)?'外帶':'桌號'} ${o.table_no||''}`;}
function ticketShop(o){return BRAND_LABEL[o.items?.[0]?.venue]||BRAND_LABEL[SCOPE]||'言文字';}
function ticketLineMark(l){return l.cancelled?'（已取消）':l.comp_reason?'（贈送）':l.redeem_points>0?'（點數兌換）':'';}
// 點數兌換：該行實收 0 元，收據／查單照原價列出，再另列「點數兌換 N 點　−原價」一列（像折扣）；小計＝實收＋折扣＋兌換折抵
function spaceRewards(){try{const v=DATA?.content?.yan_rewards;const j=typeof v==='string'&&v?JSON.parse(v):{};return {day_4h:Math.max(0,Math.floor(Number(j.day_4h))||0),day_12h:Math.max(0,Math.floor(Number(j.day_12h))||0)};}catch(e){return {day_4h:0,day_12h:0};}}
const lineShown=l=>l.redeem_points>0?(Number(l.regular_price)||0)*l.qty:l.price*l.qty;
function redeemOf(o){let points=0,value=0;for(const l of o.items||[])if(l.redeem_points>0&&!l.cancelled){points+=Number(l.redeem_points)||0;value+=(Number(l.regular_price)||0)*l.qty;}return {points,value};}
function wrapTicketText(g,text,maxW){
  const out=[];let row='';for(const ch of String(text??'')){if(ch==='\n'||(row&&g.measureText(row+ch).width>maxW)){out.push(row);row=ch==='\n'?'':ch;}else row+=ch;}if(row)out.push(row);return out.length?out:[''];
}
function ticketCanvas(spec){
  const W=STAR_DOTS,maxW=W-16,c=document.createElement('canvas');c.width=W;c.height=2400;const g=c.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,W,c.height);g.fillStyle='#000';g.textBaseline='top';let y=8;
  const setFont=(size,bold)=>{g.font=(bold?'bold ':'')+size+'px sans-serif';};
  const advance=size=>y+=size+6;
  const center=(t,size,bold)=>{setFont(size,bold);g.textAlign='center';g.fillText(t,W/2,y);advance(size);};
  const left=(t,size,bold)=>{setFont(size,bold);g.textAlign='left';g.fillText(t,8,y);advance(size);};
  const wrap=(t,size,bold)=>{setFont(size,bold);g.textAlign='left';for(const row of wrapTicketText(g,t,maxW)){g.fillText(row,8,y);advance(size);}};
  const row=(l,r,size,bold)=>{setFont(size,bold);const right=String(r??'');const rw=g.measureText(right).width;g.textAlign='right';g.fillText(right,W-8,y);g.textAlign='left';const leftMax=Math.max(40,maxW-rw-12);const lines=wrapTicketText(g,l,leftMax);lines.forEach((s,i)=>{g.fillText(s,8,y);if(i<lines.length-1)advance(size);});advance(size);};
  // 備註加框：每行文字包進同一個外框（廚房一眼看到客製重點）
  const box=(texts,size,bold)=>{setFont(size,bold);g.textAlign='left';const rows=texts.flatMap(t=>wrapTicketText(g,t,maxW-20));const top=y+2,h=rows.length*(size+6)+8;y=top+6;rows.forEach(r=>{g.fillText(r,14,y);y+=size+6;});g.lineWidth=2;g.strokeRect(9,top,W-18,h);g.lineWidth=1;y=top+h+8;};
  const rule=dashed=>{g.beginPath();if(dashed)g.setLineDash([4,4]);g.moveTo(8,y+4);g.lineTo(W-8,y+4);g.stroke();g.setLineDash([]);y+=12;};
  // 分單橫幅：solid＝整條黑底白字（餐點單）；hatch＝斜線底、中間白框黑字（飲品單）。熱感應紙只有黑白，靠底紋區分
  const banner=(t,size,style)=>{const h=size+28,top=y;setFont(size,true);g.textAlign='center';
    if(style==='hatch'){g.save();g.beginPath();g.rect(0,top,W,h);g.clip();g.lineWidth=5;for(let x=-h;x<W+h;x+=16){g.beginPath();g.moveTo(x,top+h);g.lineTo(x+h,top);g.stroke();}g.restore();g.lineWidth=1;const tw=g.measureText(t).width+28;g.fillStyle='#fff';g.fillRect((W-tw)/2,top+6,tw,h-12);g.fillStyle='#000';g.lineWidth=3;g.strokeRect((W-tw)/2,top+6,tw,h-12);g.lineWidth=1;g.fillText(t,W/2,top+14);}
    else{g.fillRect(0,top,W,h);g.fillStyle='#fff';g.fillText(t,W/2,top+14);g.fillStyle='#000';}
    y=top+h+10;};
  let edge=null;
  for(const cmd of spec||[]){
    if(cmd==='rule')rule(false);
    else if(cmd.kind==='banner')banner(cmd.text,cmd.size||36,cmd.style);
    else if(cmd.kind==='edge')edge=cmd.style;
    else if(cmd==='dash')rule(true);
    else if(cmd.kind==='center')center(cmd.text,cmd.size||22,!!cmd.bold);
    else if(cmd.kind==='left')left(cmd.text,cmd.size||22,!!cmd.bold);
    else if(cmd.kind==='wrap')wrap(cmd.text,cmd.size||22,!!cmd.bold);
    else if(cmd.kind==='box')box(cmd.texts,cmd.size||22,!!cmd.bold);
    else if(cmd.kind==='row')row(cmd.left,cmd.right,cmd.size||22,!!cmd.bold);
  }
  const out=document.createElement('canvas');out.width=W;out.height=Math.ceil(y+8);const og=out.getContext('2d');og.fillStyle='#fff';og.fillRect(0,0,W,out.height);og.drawImage(c,0,0);
  // 兩側邊條：餐點單整條實心、飲品單一格一格的虛線；一疊單子裡從側邊也看得出是哪一種
  if(edge){og.fillStyle='#000';const ew=4;if(edge==='solid'){og.fillRect(0,0,ew,out.height);og.fillRect(W-ew,0,ew,out.height);}else for(let yy=0;yy<out.height;yy+=20){og.fillRect(0,yy,ew,10);og.fillRect(W-ew,yy,ew,10);}}
  return out;
}
// 點餐人：每個品項旁標示（客人掃碼時填的名字；同桌多人各自點、一起送單時靠這個分）。櫃檯代點不標。
const ordererOf=l=>{const n=String(l.by||'').trim();return n&&n!=='櫃檯'?n:'';};
// 結帳頁品項依點餐人分組（各付各的時一組就是一個人的帳）：依第一次出現的順序；櫃檯代點自成一組；預收抵扣行放最後一組
const lineGroups=lines=>{const m=new Map();for(const l of lines){const key=l.credit_of?'credit':ordererOf(l)||(String(l.by||'').trim()==='櫃檯'?'櫃檯':'');if(!m.has(key))m.set(key,{key,label:key==='credit'?'已預收':key==='櫃檯'?'櫃檯點的':key||'客人',lines:[]});m.get(key).lines.push(l);}const gs=[...m.values()];return gs.filter(g=>g.key!=='credit').concat(gs.filter(g=>g.key==='credit'));};
// 出餐單分兩張：餐點單（廚房）與飲品單（吧檯），依 MenuLib.stationOf（BAR_CATS＝飲品／酒水）。
// 套餐拆開：主餐留在餐點單，套餐裡的飲品印到飲品單（標原套餐名）。只有一種就只印一張。
const isDrinkCat=cat=>typeof MenuLib!=='undefined'&&MenuLib.stationOf?MenuLib.stationOf({cat})==='bar':false;
const TICKET_KIND={food:{label:'餐 點',name:'餐點單',banner:'solid'},drink:{label:'飲 品',name:'飲品單',banner:'hatch'}};
function splitTicketLines(lines){
  const food=[],drink=[];
  for(const l of lines){
    const parts=partsOf(l);
    if(parts.length){const dp=parts.filter(p=>isDrinkCat(p.cat)),fp=parts.filter(p=>!isDrinkCat(p.cat));
      if(isDrinkCat(l.cat)){drink.push(l);continue;}
      if(fp.length||!dp.length)food.push(dp.length?{...l,parts:fp}:l);
      if(dp.length)drink.push({...l,parts:dp,note:fp.length?'':l.note});
      continue;}
    (isDrinkCat(l.cat)?drink:food).push(l);
  }
  return {food,drink};
}
// 回 [{kind:'food'|'drink',order}]：每張只帶自己那一半品項；沒有品項的那張不印
function ticketParts(o){
  const s=splitTicketLines(orderLines(o).filter(l=>!l.cancelled));
  const kinds=['food','drink'].filter(k=>s[k].length);
  return kinds.map(k=>({kind:k,total:kinds.length,order:{...o,stations:null,items:s[k]}}));
}
function kitchenTicketSpec(o,kind,total=1){
  const takeout=isTakeoutNo(o.table_no),K=TICKET_KIND[kind];
  const spec=K?[{kind:'edge',style:K.banner},{kind:'center',text:'出餐單',size:22,bold:true},{kind:'banner',text:K.label,size:40,style:K.banner}]:[{kind:'center',text:'出餐單',size:22,bold:true}];
  spec.push({kind:'center',text:takeout?'外帶':'桌號',size:20},{kind:'center',text:String(o.table_no||''),size:54,bold:true},{kind:'center',text:applicationTime(o.paid_at||o.placed_at),size:18});
  spec.push('rule');
  let count=0;
  for(const [cat,lines] of ticketGroups(o)){
    spec.push({kind:'left',text:'【'+catLabel(cat)+'】',size:22,bold:true});
    for(const l of lines){
      spec.push({kind:'row',left:`${l.zh}${l.comp_reason?'（贈）':''}`,right:'×'+l.qty,size:52,bold:true});
      if(ordererOf(l))spec.push({kind:'left',text:'　'+ordererOf(l),size:16});
      for(const p of partsOf(l)){spec.push({kind:'wrap',text:'　'+partText(p),size:34,bold:true});if(p.note)spec.push({kind:'wrap',text:'　　'+p.note.replace(/；/g,'／'),size:26});}
      // 品名 52 號大字；規格一行（熱／無糖／去冰）、自由需求各自一行加 ※，整組備註加框；點餐人弱化成小字
      const parts=specParts(l),opts=parts.filter(p=>p.kind!=='custom').map(p=>p.text),custom=parts.filter(p=>p.kind==='custom').map(p=>p.text);
      const notes=[...(opts.length?[opts.join('／')]:[]),...custom.map(t=>'※ '+t)];
      if(notes.length)spec.push({kind:'box',texts:notes,size:24,bold:true});
      count+=l.qty;
    }
  }
  spec.push('rule');
  spec.push({kind:'center',text:K?`${K.name} 共 ${count} 件`:`共 ${count} 件`,size:20,bold:true});
  if(K&&total>1)spec.push({kind:'center',text:`同單另有${TICKET_KIND[kind==='food'?'drink':'food'].name}`,size:18});
  spec.push({kind:'center',text:'單號 '+(o.id||o.order_id||''),size:16});
  if(K)spec.push({kind:'banner',text:K.name,size:22,style:K.banner});
  return spec;
}
// 點餐明細（夾帳本夾給客人）：這次送出的品項、單價與小計，每項前面留 □ 給外場送餐時劃掉；不是收據、不含付款，結帳時另印收據明細
function orderSlipSpec(o){
  const lines=orderLines(o).filter(l=>!l.cancelled);
  const spec=[{kind:'center',text:'點餐明細',size:26,bold:true},{kind:'center',text:ticketShop(o),size:20,bold:true},{kind:'center',text:ticketTableLabel(o),size:30,bold:true},{kind:'center',text:applicationTime(o.placed_at||o.paid_at),size:16},'dash'];
  let total=0,count=0;
  for(const l of lines){
    const amt=(l.comp_reason?0:Number(l.price)||0)*l.qty;total+=amt;count+=l.qty;
    spec.push({kind:'row',left:`□ ${l.zh} ×${l.qty}${l.comp_reason?'（贈）':''}`,right:num(amt),size:24,bold:true});
    for(const p of partsOf(l))spec.push({kind:'wrap',text:'　　'+partText(p),size:18});
    const opts=specParts(l).filter(p=>p.kind!=='default').map(p=>p.text);
    if(opts.length)spec.push({kind:'wrap',text:'　　'+opts.join('／'),size:18});
  }
  spec.push('dash');
  spec.push({kind:'row',left:`本次 ${count} 件`,right:'NT$'+num(total),size:22,bold:true});
  const svc=MenuLib.serviceCharge?MenuLib.serviceCharge(lines.map(l=>l.comp_reason?{...l,price:0}:l),{takeout:isTakeoutNo(o.table_no)}):null;
  if(svc)spec.push({kind:'left',text:'三點水另加 10% 服務費，結帳時計算',size:16});
  spec.push({kind:'center',text:'送到一項劃一項；加點會再印一張',size:16});
  spec.push({kind:'center',text:'用餐完請到櫃檯結帳，謝謝',size:18,bold:true});
  return spec;
}
function receiptTicketSpec(o){
  const p=o.payer||{},d=p.discount,sc=p.service_charge,svcAmt=Number(sc?.amount)||0,inv=o.invoice||{},rd=redeemOf(o),sub=Number(o.amount)+(d?Number(d.amount)||0:0)+rd.value-svcAmt;
  const spec=[{kind:'center',text:'收據明細',size:24,bold:true},{kind:'center',text:ticketShop(o),size:22,bold:true},{kind:'center',text:'言文字｜台灣人才聚落',size:16},{kind:'center',text:ticketTableLabel(o),size:22,bold:true},{kind:'center',text:applicationTime(o.paid_at||o.placed_at),size:16},'dash'];
  for(const l of o.items||[]){
    spec.push({kind:'row',left:`${l.zh} ×${l.qty}${ticketLineMark(l)}`,right:num(lineShown(l)),size:20});
    for(const p of partsOf(l))spec.push({kind:'wrap',text:'　'+partText(p)+(p.note?'（'+p.note+'）':''),size:16});
    if(l.note)spec.push({kind:'wrap',text:'　'+l.note,size:16});
    if(l.cancelled&&l.cancel_reason)spec.push({kind:'wrap',text:'　取消：'+l.cancel_reason,size:16});
  }
  spec.push('dash');
  if(d||rd.points||sc){spec.push({kind:'row',left:'小計',right:num(sub),size:20});if(d)spec.push({kind:'row',left:'折扣 '+discountText(d),right:'−'+num(d.amount),size:20});if(rd.points)spec.push({kind:'row',left:`點數兌換 ${num(rd.points)} 點`,right:'−'+num(rd.value),size:20});if(sc)spec.push({kind:'row',left:sc.waived?'服務費 10%（免收）':'服務費 10%',right:sc.waived?'0':'+'+num(svcAmt),size:20});}
  spec.push({kind:'row',left:'合計',right:'NT$'+num(o.amount),size:26,bold:true});
  spec.push({kind:'left',text:payText(o)+(p.member?' · 聚落價':''),size:18});
  if(p.received!=null)spec.push({kind:'row',left:'實收 '+num(p.received),right:'找零 '+num(p.change),size:20});
  if(inv.number)spec.push({kind:'left',text:'發票 '+inv.number+(inv.random?' 隨機碼 '+inv.random:''),size:16});
  {const pt=invoiceParties(inv);if(pt.seller)spec.push({kind:'left',text:'賣方統編 '+pt.seller,size:16});if(pt.ubn)spec.push({kind:'left',text:'買受人統編 '+pt.ubn,size:16});}
  if(o.status==='void')spec.push({kind:'center',text:'【此單已作廢】',size:22,bold:true});
  if(o.preview)spec.push({kind:'center',text:'【尚未結帳・僅供核對】',size:20,bold:true});
  spec.push({kind:'center',text:'單號 '+(o.id||o.order_id||''),size:16});
  spec.push({kind:'center',text:'謝謝光臨',size:16});
  return spec;
}
// Independent of active tab. Claims are durable attempted commands, never leases:
// a lost HTTP response or hardware timeout must not cause an automatic replay.
let KITCHEN_PRINT_TIMER=null,KITCHEN_PRINT_BUSY=false,KITCHEN_PRINT_PAUSED=false;
async function resumeKitchenPrinting(){
  if(!KITCHEN_PRINT_PAUSED)return false;
  // 只在暫停時出現，且要再確認一次：恢復前要先檢查紙張並補印結果不明的那張，不會自動重印。回傳是否真的恢復了
  if(!await posConfirm('已檢查印表機、紙張，並補印結果不明的出餐單了嗎？\n恢復後只印新單，不重印前一張。',{ok:'恢復自動出單'}))return false;
  KITCHEN_PRINT_PAUSED=false;toast('已恢復新單自動列印；前一張結果不明的單請檢查後手動補印。');return true;
}
const KITCHEN_PRINT_UNKNOWN=new Set();
// 結帳頁狀態列：運行中（Star Browser＋mPOP SDK 就緒、未暫停）／已暫停（只有這時才有恢復鍵）／未自動出單（一般瀏覽器或結果未明）
function kitchenPrintStatus(){
  if(KITCHEN_PRINT_PAUSED)return {state:'paused'};
  if(!starReady()||STAR_NATIVE_UNCERTAIN)return {state:'unavailable'};
  return {state:'running'};
}
function kitchenPrintStatusHtml(){
  const st=kitchenPrintStatus().state;
  if(st==='paused')return `<div class="a-toolbar pos-print-status pos-print-paused"><span class="pill pill-bad">自動出單已暫停</span><span class="hint hint--tight">檢查紙張、補印後</span><button type="button" class="btn btn--ghost btn-xs" id="pos-print-resume">恢復自動出單</button></div>`;
  if(st==='running')return `<div class="a-toolbar pos-print-status"><span class="pill pill-ok">自動出單運行中</span><span class="hint hint--tight">已接 mPOP：送單後自動印紙本出餐單，這頁只做查看與補印</span><button type="button" class="btn btn--ghost btn-xs" id="pos-print-test">測試列印</button></div>`;
  return `<div class="a-toolbar pos-print-status"><span class="pill pill-draft">這台未自動出單</span><span class="hint hint--tight">沒接 mPOP：用這頁出餐；要印紙本出餐單，請用 Star webPRNT Browser 開 POS 並接上 mPOP</span></div>`;
}
async function printTestTicket(){
  if(!starReady()){starHint();return false;}
  const spec=[{kind:'center',text:'測試列印',size:22,bold:true},{kind:'center',text:'mPOP 連線正常',size:20},{kind:'center',text:applicationTime(new Date().toISOString()),size:18},{kind:'center',text:'這張不是出餐單，可直接丟棄',size:18}];
  const ok=await starSend({canvas:ticketCanvas(spec)});toast(ok?'測試列印已送出，請看 mPOP 是否出紙':'測試列印失敗，請檢查 USB-C 線與 mPOP 電源');return ok;
}
function bindPrintStatus(host,repaint){
  const resume=host.querySelector('#pos-print-resume');if(resume)resume.onclick=async()=>{if(!await resumeKitchenPrinting())return;repaint();return pollKitchenPrinting();};
  const test=host.querySelector('#pos-print-test');if(test)test.onclick=async()=>{if(test.disabled)return;test.disabled=true;try{await printTestTicket();}finally{test.disabled=false;}};
}
function startKitchenPrinting(){
  if(KITCHEN_PRINT_TIMER!==null)return;
  KITCHEN_PRINT_TIMER=setTimeout(async function tick(){
    try{await pollKitchenPrinting();}finally{KITCHEN_PRINT_TIMER=setTimeout(tick,5000);}
  },0);
}
// 收到新單：跳出置中提示（點一下關閉，8 秒後自動消失）並響三聲；iPad 需先點過畫面才允許出聲，所以第一次點擊時先解鎖音訊
let POS_AUDIO=null;
function posAudio(){try{if(!POS_AUDIO)POS_AUDIO=new (window.AudioContext||window.webkitAudioContext)();if(POS_AUDIO.state==='suspended')POS_AUDIO.resume();return POS_AUDIO;}catch(e){return null;}}
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('pointerdown',()=>{posAudio();},{once:true,capture:true});
function newTicketChime(){const c=posAudio();if(!c)return;[0,.3,.6].forEach((d,i)=>{try{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+d;o.type='sine';o.frequency.value=i===2?988:784;o.connect(g);g.connect(c.destination);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.6,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.25);o.start(t);o.stop(t+.27);}catch(e){}});}
function notifyNewTickets(jobs){
  if(!jobs.length||typeof document==='undefined'||!document.body)return;
  newTicketChime();
  const tables=[...new Set(jobs.map(j=>ticketTableLabel(j)))].join('、');
  let box=document.getElementById('pos-new-ticket');
  if(!box){box=document.createElement('div');box.id='pos-new-ticket';box.setAttribute('role','alert');box.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;background:#FFDE34;color:#111;border:3px solid #111;border-radius:14px;padding:16px 28px;font-size:22px;font-weight:800;box-shadow:0 8px 28px rgba(0,0,0,.35);cursor:pointer;text-align:center;max-width:90vw';box.onclick=()=>box.remove();document.body.appendChild(box);}
  box.textContent='🔔 收到新單 '+(jobs.length>1?jobs.length+' 張：':'：')+tables+'，出單中';
  clearTimeout(box._t);box._t=setTimeout(()=>box.remove(),8000);
}
async function pollKitchenPrinting(){
  if(KITCHEN_PRINT_BUSY||KITCHEN_PRINT_PAUSED||!DATA||!starReady()||STAR_NATIVE_UNCERTAIN)return;
  KITCHEN_PRINT_BUSY=true;
  try{
    const out=await api('/admin/orders/kitchen-print-jobs'+scopeQuery());
    notifyNewTickets((out.jobs||[]).filter(j=>!KITCHEN_PRINT_UNKNOWN.has(j.id)));
    for(const job of out.jobs||[]){
      if(KITCHEN_PRINT_UNKNOWN.has(job.id))continue;
      KITCHEN_PRINT_UNKNOWN.add(job.id);
      try{
        const claim=await api('/admin/orders/kitchen-print-jobs/'+encodeURIComponent(job.id)+'/claim',{method:'POST',body:{operator_id:OPERATOR?.id}});
        if(!claim.claimed)continue;
        const ok=await printOrder(claim.job,{auto:true,slip:true});
        if(!ok)throw Error('未確認印表機成功');
      }catch(e){KITCHEN_PRINT_PAUSED=true;toast('出餐單 '+job.id+' 未確認列印：'+e.message+'；已暫停自動列印，請檢查紙張並手動補印，再到出餐頁按「恢復自動出單」。');if(typeof document!=='undefined'){const ob=document.getElementById?.('orders-body');if(ob?.querySelector?.('.kds-grid')){ob.dataset.sig='';loadOrders();}}break;}
    }
  }catch(e){/* 尚未領取的工作留在伺服器；不重送已領取的工作。 */}
  finally{KITCHEN_PRINT_BUSY=false;}
}
async function printCheckoutOrder(order){
  // 結帳只印發票與明細；出餐單由送單工作佇列處理，不隨收款重印。
  try{if(invoicePrintable(order.invoice))await printInvoiceProof(order,{auto:true});}catch(e){toast('已收款，發票列印失敗，請到查單補印：'+e.message);}
  try{await printReceipt(order,{auto:true});}catch(e){toast('已收款，明細列印失敗，請到查單補印：'+e.message);}
}
// 收款成功後，開錢櫃與列印在背景依序執行：畫面立刻顯示已收款並重載，不等 mPOP（每步最多 16 秒）。
// 硬體失敗只提示，不重送收款。
let CHECKOUT_HW=Promise.resolve();
function checkoutHardware(drawer,order,paidText){
  const run=async()=>{
    let ok=null;try{ok=await autoCashDrawer(drawer);}catch(e){ok=false;}
    if(ok===false)toast(paidText+'。未確認開櫃成功，請確認錢櫃並按「錢櫃」重試，勿重複收款。');
    await printCheckoutOrder(order);
  };
  CHECKOUT_HW=CHECKOUT_HW.then(run,run).catch(()=>{});
  return CHECKOUT_HW;
}
// 出餐單（給現場）：桌號大字、依類別分段列品項與備註；不印價錢與付款，避免出餐時分心。
// 餐點與飲品分兩張印（餐點單黑底橫幅＋實心邊條、飲品單斜線橫幅＋虛線邊條）；任一張失敗就回 false，交給自動出單暫停流程
async function printOrder(o,{auto=false,slip=false}={}){
  const tickets=ticketParts(o);
  if(starReady()){
    if(!tickets.length)return true;
    let ok=true;
    for(const t of tickets){const r=await starSend({canvas:ticketCanvas(kitchenTicketSpec(t.order,t.kind,t.total))});if(!r){toast(TICKET_KIND[t.kind].name+'未印出，請到查單補印');ok=false;break;}}
    // 帳本夾（10/19 員工大會 K4）：每次送單（含加點）多印一張點餐明細給客人，送餐時在上面劃掉已送的品項
    // 只給三點水內用：白天在咖啡走自助（只送餐），外帶沒有帳本夾
    if(ok&&slip&&!isTakeoutNo(o.table_no)&&(o.items||[]).some(l=>l.venue==='BAR')){const r=await starSend({canvas:ticketCanvas(orderSlipSpec(o))});if(!r){toast('點餐明細未印出，請到查單補印');ok=false;}}
    return ok;
  }
  if(auto){starHint();return false;}
  const html=tickets.map(t=>{const K=TICKET_KIND[t.kind];return `<section class="tk tk-${t.kind}"><div class="c">出餐單</div><div class="bn bn-${t.kind}"><span>${K.label}</span></div>${kitchenTicketHtml(t.order)}<div class="c"><b>${K.name}</b></div></section>`;}).join('');
  printWindow(`出餐單 ${ticketTableLabel(o)}`,html,PRINT_CSS+'.tk{break-after:page;page-break-after:always}.tk:last-child{break-after:auto;page-break-after:auto}.tk-food{border-left:6px solid #000;border-right:6px solid #000;padding:0 2mm}.tk-drink{border-left:6px dashed #000;border-right:6px dashed #000;padding:0 2mm}.bn{text-align:center;font-size:34px;font-weight:800;padding:6px 0;margin:6px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.bn-food{background:#000;color:#fff}.bn-drink{background:repeating-linear-gradient(45deg,#000 0 5px,#fff 5px 14px)}.bn-drink span{background:#fff;border:3px solid #000;padding:0 14px}');
  return true;
}
function kitchenTicketHtml(o){
  const sections=ticketGroups(o).map(([cat,lines])=>`<h2>${esc(catLabel(cat))}</h2>`+lines.map(l=>{const parts=specParts(l),opts=parts.filter(p=>p.kind!=='custom').map(p=>p.text),custom=parts.filter(p=>p.kind==='custom').map(p=>p.text);return `<div class="l k"><span>${esc(l.zh)}${l.comp_reason?'（贈）':''}</span><span>×${l.qty}</span></div>${partsOf(l).map(p=>`<div class="l k"><span>　${esc(partText(p))}</span></div>${p.note?`<div class="n">　${esc(p.note)}</div>`:''}`).join('')}${ordererOf(l)?`<div class="n">${esc(ordererOf(l))}</div>`:''}${opts.length?`<div class="n">${esc(opts.join('／'))}</div>`:''}${custom.map(t=>`<div class="n">※ ${esc(t)}</div>`).join('')}`;}).join('')).join('');
  const count=(o.items||[]).filter(l=>!l.cancelled).reduce((a,l)=>a+l.qty,0);
  return `<h1 class="k">${isTakeoutNo(o.table_no)?'外帶':'桌號'} ${esc(o.table_no)}</h1><div class="m c">${esc(applicationTime(o.paid_at||o.placed_at))}</div>${sections}<hr class="sep"><div class="c">共 ${count} 件<br>單號 ${esc(o.id||o.order_id||'')}</div>`;
}
// 客人收據明細：店名、品項、小計／折扣／合計、付款方式、實收找零、發票號碼、單號（查單可重印）
async function printReceipt(o,{auto=false}={}){
  if(starReady()){const ok=await starSend({canvas:ticketCanvas(receiptTicketSpec(o))});if(!ok)toast('收據明細未印出，請再補印');return ok;}
  if(auto){starHint();return false;}
  const p=o.payer||{},d=p.discount,sc=p.service_charge,svcAmt=Number(sc?.amount)||0,inv=o.invoice||{},rd=redeemOf(o),sub=Number(o.amount)+(d?Number(d.amount)||0:0)+rd.value-svcAmt;
  const shop=ticketShop(o);
  const lines=(o.items||[]).map(l=>`<div class="l"><span>${esc(l.zh)} ×${l.qty}${l.cancelled?'（已取消'+(l.cancel_reason?'：'+esc(l.cancel_reason):'')+'）':l.comp_reason?'（贈送）':l.redeem_points>0?'（點數兌換）':''}</span><span>${num(lineShown(l))}</span></div>${l.note?`<div class="n">${esc(l.note)}</div>`:''}`).join('');
  printWindow(`收據明細 ${o.table_no}`,`<h1>${esc(shop)}</h1><div class="c">收據明細</div><div class="m">言文字｜台灣人才聚落</div><div class="m">${esc(ticketTableLabel(o))} · ${esc(applicationTime(o.paid_at))}</div>${lines}
    ${d||rd.points||sc?`<div class="t"><span>小計</span><span>${num(sub)}</span></div>${d?`<div class="l"><span>折扣 ${esc(discountText(d))}</span><span>−${num(d.amount)}</span></div>`:''}${rd.points?`<div class="l"><span>點數兌換 ${num(rd.points)} 點</span><span>−${num(rd.value)}</span></div>`:''}${sc?`<div class="l"><span>服務費 10%${sc.waived?'（免收）':''}</span><span>${sc.waived?'0':'+'+num(svcAmt)}</span></div>`:''}`:''}
    <div class="t big"><span>合計</span><span>NT$${num(o.amount)}</span></div>
    <div class="l"><span>${esc(payText(o))}${p.member?' · 聚落價':''}</span><span>${p.received!=null?`實收 ${num(p.received)}　找零 ${num(p.change)}`:''}</span></div>
    ${inv.number?`<div class="m" style="margin-top:6px">發票 ${esc(inv.number)}${inv.random?` 隨機碼 ${esc(inv.random)}`:''}</div>`:''}
    ${invoiceParties(inv).seller?`<div class="m">賣方統編 ${esc(invoiceParties(inv).seller)}</div>`:''}${invoiceParties(inv).ubn?`<div class="m">買受人統編 ${esc(invoiceParties(inv).ubn)}</div>`:''}
    ${o.preview?'<div class="t">【尚未結帳・僅供核對】</div>':''}${o.status==='void'?'<div class="t">【此單已作廢】</div>':''}
    <div class="c">單號 ${esc(o.id)}<br>謝謝光臨</div>`);
}
async function voidOrderPrompt(id,reload,order){
  const reason=await pickReason({title:'作廢原因（會記在日結與操作紀錄）',presets:REASON_PRESETS.void_order});if(reason===null)return;
  const refundCash=cashPaidOf(order)>0&&await posConfirm('這次作廢要退現金給客人嗎？',{ok:'退現金並開錢櫃',cancel:'只更正帳務'});
  return ensureOperator(()=>opsThen(()=>api('/admin/orders/'+id+'/void',{method:'POST',body:{reason,refund_cash:refundCash,operator_id:OPERATOR?.id}}),async out=>{const ok=await autoCashDrawer({kind:'refund',order_id:id,cash_refund:out.cash_refund});return '已作廢，品項退回未結帳'+(out.cash_refund>0?`；請退現金 NT$${num(out.cash_refund)}`:'')+(ok===false?'；未確認開櫃成功，請按「錢櫃」重試':'');},reload));
}
// 已結帳單取消單一品項（做不出來／客人退菜），不必整張作廢；金額從這張單扣除
async function cancelOrderItemPrompt(orderId,line,name,reload,order){
  const reason=await pickReason({title:`取消「${name}」的原因（會記在日結與收據）`,presets:REASON_PRESETS.cancel_item});if(reason===null)return;
  const refundCash=cashPaidOf(order)>0&&await posConfirm('取消品項要退現金給客人嗎？',{ok:'退現金並開錢櫃',cancel:'只更正帳務'});
  return ensureOperator(()=>opsThen(()=>api(`/admin/orders/${orderId}/items/${line}/void`,{method:'POST',body:{reason,refund_cash:refundCash,operator_id:OPERATOR?.id}}),async out=>{const ok=await autoCashDrawer({kind:'refund',order_id:orderId,line,cash_refund:out.cash_refund});return `已取消，帳務扣除 NT$${num(out.refund)}`+(out.cash_refund>0?`；請退現金 NT$${num(out.cash_refund)}`:'')+(ok===false?'；未確認開櫃成功，請按「錢櫃」重試':'');},reload));
}
async function issueOrderInvoice(o,reload){
  if(!o||o.status==='void')return;
  let invoice;
  if(o.invoice?.requested)invoice=o.invoice;
  else{
    invoice=await askInvoice();
    if(!invoice)return;
  }
  const detail=invoice.mode==='company'?'統編 '+invoice.buyer_ubn:invoice.mode==='mobile'||invoice.mode==='citizen'?(INV_LABEL[invoice.mode]||'')+' '+(invoice.carrier_num||''):invoice.mode==='donate'?'捐贈 '+(invoice.love_code||''):'紙本';
  if(!await posConfirm(`補開${detail}發票，金額 NT$${num(o.amount)}？`,{ok:'補開發票'}))return;
  await opsThen(()=>api('/admin/orders/'+o.id+'/invoice/issue',{method:'POST',body:{invoice}}),async out=>{if(invoicePrintable(out.invoice))await printInvoiceProof({...o,invoice:out.invoice},{auto:true});return `已補開發票 ${out.invoice?.number||''}`;},reload);
}
// 更正付款方式：現場點錯時改成正確的（只限當個營業日、不動金額與發票）；現金實收／找零會一併重算
function pickPayMethod(current){
  return new Promise(resolve=>{
    const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
    const finish=v=>{if(ov.parentNode)ov.parentNode.removeChild(ov);resolve(v);};
    ov.innerHTML=`<div class="op-card pos-confirm" role="dialog" aria-label="更正付款方式"><h2>更正付款方式</h2><p class="pos-confirm-msg">目前：${esc(current)}<br>改成：</p><div class="pos-methods">${payMethodsActive().map(pm=>`<button type="button" class="btn btn--ghost" data-pm="${esc(pm.code)}">${esc(pm.label)}</button>`).join('')}</div><div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>取消</button></div></div>`;
    ov.querySelector('[data-cancel]').onclick=()=>finish(null);
    ov.querySelectorAll('[data-pm]').forEach(b=>b.onclick=()=>finish(b.dataset.pm));
  });
}
async function changePayMethodPrompt(o,reload){
  if(!o)return;
  const code=await pickPayMethod(payText(o));if(!code)return;
  if(!await posConfirm(`這張單 NT$${num(o.amount)} 的付款方式\n${payText(o)} → ${payMethodLabel(code)}？`,{ok:'確認更正'}))return;
  return ensureOperator(()=>opsThen(()=>api('/admin/orders/'+o.id+'/pay-method',{method:'POST',body:{method:code,operator_id:OPERATOR?.id}}),'已更正付款方式為 '+payMethodLabel(code),reload));
}
function bindOrderButtons(host,orders,reload){
  host.querySelectorAll('[data-print]').forEach(b=>b.onclick=()=>{const o=orders.find(x=>x.id===b.dataset.print);if(o)printOrder(o);});
  host.querySelectorAll('[data-receipt]').forEach(b=>b.onclick=()=>{const o=orders.find(x=>x.id===b.dataset.receipt);if(o)printReceipt(o);});
  host.querySelectorAll('[data-invoice-print]').forEach(b=>b.onclick=()=>{const o=orders.find(x=>x.id===b.dataset.invoicePrint);if(o)printInvoiceProof(o);});
  host.querySelectorAll('[data-paymethod]').forEach(b=>b.onclick=()=>changePayMethodPrompt(orders.find(o=>o.id===b.dataset.paymethod),reload));
  host.querySelectorAll('[data-void]').forEach(b=>b.onclick=()=>voidOrderPrompt(b.dataset.void,reload,orders.find(o=>o.id===b.dataset.void)));
  host.querySelectorAll('[data-invoice-issue]').forEach(b=>b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await issueOrderInvoice(orders.find(x=>x.id===b.dataset.invoiceIssue),reload);}finally{b.disabled=false;}});
}
// 已結帳單的操作列（櫃檯「這桌已結帳的單」與查單共用）：發票證明聯只在 ezPay 已開立時顯示；作廢固定紅字
const orderActions=(o,{allowVoid=true}={})=>`<div class="ops-btns">${allowVoid&&o.status!=='void'&&!o.payer?.prepay&&!o.tappay?.rec_trade_id?`<button class="btn btn--ghost btn-sm" data-paymethod="${esc(o.id)}">改付款方式</button>`:''}<button class="btn btn--ghost btn-sm" data-receipt="${esc(o.id)}">補印收據明細</button>${invoicePrintable(o.invoice)?`<button class="btn btn--ghost btn-sm" data-invoice-print="${esc(o.id)}">補印發票</button>`:''}${o.status==='void'?'':`<button class="btn btn--ghost btn-sm" data-print="${esc(o.id)}">出餐單</button>${allowVoid?`<button class="btn btn--ghost btn--danger btn-sm" data-void="${esc(o.id)}">作廢</button>`:''}`}</div>`;

async function loadOrders(){
  const host=document.getElementById('orders-body');if(!host)return;
  clearTimeout(ORDERS_TIMER);
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<h2>出餐</h2><p class="hint">載入中…</p>';}
  let d;try{d=await api('/admin/orders'+scopeQuery());}catch(e){if(host.querySelector('.kds-grid'))toast('更新失敗：'+e.message);else host.innerHTML=`<h2>出餐</h2><p class="a-empty">載入失敗：${esc(e.message)}</p>`;ORDERS_TIMER=setTimeout(()=>{if(document.getElementById('orders-body')&&TAB==='orders')loadOrders();},10000);return;}
  // 看板＝桌邊送單（客人按「送出點餐」，未結帳）＋已結帳的出餐單，依時間排；新單（含送單）響一聲
  const board=[...(d.tickets||[]).map(t=>({...t,at:t.placed_at})),...d.orders.map(o=>({...o,at:o.paid_at}))].sort((a,b)=>a.at<b.at?-1:1);
  const ids=new Set(board.map(o=>o.id));if(ORDERS_SEEN&&[...ids].some(id=>!ORDERS_SEEN.has(id)))ordersBeep();ORDERS_SEEN=ids;
  // 資料沒變就不重繪，避免自動更新時把正要按的按鈕換掉（經過時間每分鐘更新一次）
  const sig=JSON.stringify([board.map(o=>[o.id,o.status,o.push_count,o.items.length,o.served||0]),Math.floor(Date.now()/60000),kitchenPrintStatus().state]);
  const again=()=>{ORDERS_TIMER=setTimeout(()=>{if(document.getElementById('orders-body')&&TAB==='orders')loadOrders();},10000);};
  if(host.dataset.sig===sig&&host.querySelector('#qr-tables')){again();return;}
  host.dataset.sig=sig;
    const cancelBtn=(o,l)=>o.status!=='placed'?` <button type="button" class="btn btn--ghost btn-xs" data-cancel-item="${esc(o.id)}" data-cancel-line="${esc(l.line)}" data-cancel-name="${esc(l.zh)}">取消</button>`:'';
  // 桌邊送單每一道各自出餐：沒出的有「出餐」鍵，出過的劃線；整張都出完才從看板消失
  const serveLineBtn=(o,l)=>o.status!=='placed'||l.served_at?'':` <button type="button" class="btn btn--ghost btn-xs" data-serve-line="${esc(l.line)}" data-serve-ticket="${esc(o.ticket)}" data-session="${esc(o.session_id)}" aria-label="出餐 ${esc(l.zh)}">出餐</button>`;
  // 每一道一個區塊：類別籤靠左、品名加粗放大、數量 ×2 以上反白（最常見的錯是做少）、規格拆成標籤（預設淡、非預設深、自由需求 ※ 琥珀）、出餐／取消鍵靠右
  const specHtml=l=>{const parts=specParts(l);return parts.length?`<div class="ops-specs">${parts.map(p=>`<span class="ops-spec ops-spec-${p.kind} ops-spec-${p.tone}">${p.kind==='custom'?'※ ':''}${esc(p.text)}</span>`).join('')}</div>`:'';};
  const lineHtml=(o,l)=>l.cancelled?`<div class="ops-line-top"><span class="ops-name line-cancelled">${esc(l.zh)} ×${l.qty}</span><span class="hint hint--tight">已取消${l.cancel_reason?'：'+esc(l.cancel_reason):''}</span></div>`
    :o.status==='placed'&&l.served_at?`<div class="ops-line-top"><span class="ops-name line-served">${esc(l.zh)} ×${l.qty}</span><span class="hint hint--tight">已出 ${esc(clockText(l.served_at))}</span></div>`
    :`<div class="ops-line-top"><b class="ops-name">${esc(l.zh)}</b><b class="ops-qty${l.qty>1?' many':''}">×${l.qty}</b>${l.comp_reason?'<span class="hint hint--tight">贈送</span>':''}<span class="ops-line-btns">${cancelBtn(o,l)}${serveLineBtn(o,l)}</span></div>${partsHtml(l)}${specHtml(l)}`;
  const linesHtml=o=>`<div class="ops-lines">${orderLines(o).map(l=>`<div class="ops-line${l.cancelled||(o.status==='placed'&&l.served_at)?' done':''}"><span class="ops-cat">${esc(catLabel(l.cat))}</span><div class="ops-line-body">${lineHtml(o,l)}</div></div>`).join('')}</div>`;
  // 卡片看板（參考市售 KDS：Toast／Square／iCHEF 出餐確認）：一張單一張卡、舊單在前；卡頭＝桌號大字＋等候分鐘（8 分轉琥珀、15 分轉紅），不放金額／付款；卡尾一顆主鍵
  const ageClass=at=>{const m=(Date.now()-new Date(at))/60000;return m>=15?' kds-late':m>=8?' kds-warn':'';};
  // 卡頭／卡尾用 div 不用 header/footer：全站 style.css 的 footer{background:var(--ink-surface)} 會把卡尾染黑、主鍵看不見
  const cardHead=(o,at,state)=>`<div class="kds-head"><b class="kds-table">${isTakeoutNo(o.table_no)?'<small>外帶</small>':''}${esc(o.table_no)}</b>${state?`<span class="kds-state">${state}</span>`:''}<span class="kds-age" title="${esc(applicationTime(at))}">${elapsedText(at)}</span></div>`;
  const card=(o,at,state,btns)=>`<article class="kds-card${o.status==='placed'?' ops-placed':o.status==='ready'?' ops-ready':''}${o.status==='ready'?'':ageClass(at)}" data-kds="${esc(o.id)}">${cardHead(o,at,state)}${linesHtml(o)}<div class="kds-foot">${btns}</div></article>`;
  const printBtn=o=>`<button class="btn btn--ghost btn-sm" data-print="${esc(o.id)}">列印</button>`;
  const cards=board.map(o=>o.status==='placed'
    ?card(o,o.placed_at,o.served?`部分出餐 ${o.served}/${o.items.length}`:'',`<button class="btn btn--solid" data-serve="${esc(o.ticket)}" data-session="${esc(o.session_id)}">整筆出餐</button>${printBtn(o)}`)
    :card(o,o.paid_at,o.status==='ready'?'可取餐':'已結帳',o.status==='paid'?`<button class="btn btn--solid" data-order="${esc(o.id)}" data-status="ready">出餐並通知</button>${printBtn(o)}`:`<button class="btn btn--ghost" data-order="${esc(o.id)}" data-status="done">已取餐</button>`)).join('')||'<p class="a-empty kds-empty">目前沒有待出餐的單</p>';
  const pending=board.filter(o=>o.status!=='ready').length;
  host.innerHTML=`<div class="ops-head"><h2>出餐${pending?` <span class="kds-count">${pending}</span>`:''}</h2>${opsHelp(`客人掃帳本夾裡的本桌 QR 點餐，按「送出點餐」後會直接出現在這裡；做好一道按那一道的「出餐」，全部好了按「整筆出餐」，客人手機會跳通知；用餐完到 <a href="${opsHref('pos')}" data-tab="pos">櫃檯結帳</a>。櫃檯先收款的單（外帶、先結後做）也在這裡，按「出餐並通知」會推播給客人到櫃檯取餐。卡頭的分鐘數＝等候時間，8 分轉黃、15 分轉紅；深色規格＝客人有改、※＝自由需求。每 10 秒自動更新，有新單會響一聲。`)}</div>${document.getElementById('p-nav')?kitchenPrintStatusHtml():''}
    <div class="kds-grid">${cards}</div>`;
  const reload=()=>{host.dataset.sig='';return loadOrders();};bindPrintStatus(host,reload);
  host.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>opsThen(()=>api('/admin/orders/'+b.dataset.order+'/status',{method:'POST',body:{status:b.dataset.status}}),out=>out.status==='ready'?`已出餐，推播 ${out.notified} 台裝置`:'已標記取餐',reload));
  host.querySelectorAll('[data-serve]').forEach(b=>b.onclick=()=>opsThen(()=>api('/admin/orders/sessions/'+b.dataset.session+'/tickets/'+b.dataset.serve+'/serve',{method:'POST',body:{}}),'整筆已出餐，客人用餐完再到櫃檯結帳',reload));
  host.querySelectorAll('[data-serve-line]').forEach(b=>b.onclick=()=>opsThen(()=>api('/admin/orders/sessions/'+b.dataset.session+'/tickets/'+b.dataset.serveTicket+'/serve',{method:'POST',body:{lines:[b.dataset.serveLine]}}),out=>{const left=(out.items||[]).filter(l=>l.ticket===b.dataset.serveTicket&&!l.served_at&&!l.order_id).length;return left?`已出餐，這張還有 ${left} 道`:'這張送單全部出完';},reload));
  bindOrderButtons(host,board,reload);bindReasonChips(host);
  host.querySelectorAll('[data-cancel-item]').forEach(b=>b.onclick=()=>cancelOrderItemPrompt(b.dataset.cancelItem,b.dataset.cancelLine,b.dataset.cancelName,reload,d.orders.find(o=>o.id===b.dataset.cancelItem)));
  again();
}

/* 櫃檯結帳：桌況格 → 點桌號 → 未結帳品項（數量±、贈送、作廢、勾選分帳）→ 點選菜單加點 → 折扣／付款方式／聚落價／現金實收找零 → 收款；也能換桌併桌、清桌 */
// 結帳頁頂端：暫停點餐＝每個店別一顆按鈕（按下選文案才暫停；暫停中再按一下恢復）、桌號 QR＝按鈕開面板
function posPauseHtml(pause){
  const multi=Object.keys(pause||{}).length>1;
  return Object.entries(pause||{}).map(([v,p])=>{const nm=multi?'・'+esc(BRAND_LABEL[v]||v):'';return `<button type="button" class="btn ${p.paused?'btn--solid':'btn--ghost'} btn-sm pos-pause-btn ${p.paused?'on':''}" data-pause-venue="${esc(v)}" data-paused="${p.paused?'1':''}" data-pause-msg="${esc(p.message||'')}" aria-pressed="${p.paused?'true':'false'}">${p.paused?'⏸ 暫停中'+nm+'・按此恢復':'暫停點餐'+nm}</button>`;}).join('');
}
function bindPosPause(host,reload){
  host.querySelectorAll('[data-pause-venue]').forEach(b=>b.onclick=async()=>{
    const venue=b.dataset.pauseVenue,label=BRAND_LABEL[venue]||venue;
    if(b.dataset.paused){if(!await posConfirm(`恢復 ${label} 點餐？客人掃碼就能再加菜。`,{ok:'恢復點餐'}))return;return opsThen(()=>api('/admin/orders/pause',{method:'POST',body:{venue,paused:false,message:b.dataset.pauseMsg||''}}),'已恢復點餐',reload);}
    const message=await pickReason({title:`暫停 ${label} 點餐`,presets:PAUSE_PRESETS,placeholder:'給客人看的文案',maxlength:80});
    if(message===null)return;
    opsThen(()=>api('/admin/orders/pause',{method:'POST',body:{venue,paused:true,message}}),'已暫停點餐，客人掃碼會看到你的文案',reload);
  });
}
// 本桌點餐 QR（單次）：開桌時伺服器發一張綁這一場的 QR，結帳清桌後失效；一個帳本夾配一張，按桌送餐
async function openOneTableQr(table){
  const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
  const close=()=>{if(ov.parentNode)ov.parentNode.removeChild(ov);};
  ov.innerHTML=`<div class="op-card" role="dialog" aria-label="桌號 ${esc(table)} QR" style="text-align:center"><h2>桌號 ${esc(table)}</h2>
    <div id="qr-one" class="qr-grid" style="grid-template-columns:minmax(0,360px);justify-content:center"></div>
    <p class="hint">本次用餐專用，結帳清桌後失效。請夾進帳本，帶客人入座。</p>
    <div class="op-card-actions"><button type="button" class="btn btn--ghost" id="qr-close">關閉</button><button type="button" class="btn btn--solid" id="qr-print1" hidden>列印</button></div></div>`;
  ov.querySelector('#qr-close').onclick=close;ov.addEventListener('click',e=>{if(e.target===ov)close();});
  try{
    const out=await api('/admin/tables/qr?tables='+encodeURIComponent(table));const t=out.tables?.[0];if(!t)throw Error('找不到這桌');
    const img=await new Promise((ok,no)=>QRCode.toDataURL(t.url,{width:360,margin:1},(e,u)=>e?no(e):ok(u)));
    ov.querySelector('#qr-one').innerHTML=`<div class="qr-card"><img src="${img}" alt="桌號 ${esc(t.table)}"><small>掃碼點餐 Scan to order · 用餐完請到櫃檯結帳 Pay at the counter</small></div>`;
    const pb=ov.querySelector('#qr-print1');pb.hidden=false;
    pb.onclick=async()=>{if(pb.disabled)return;pb.disabled=true;try{await printTableQr(t.table,t.url);}catch(e){toast('桌號 QR 列印失敗：'+e.message);}finally{pb.disabled=false;}};
  }catch(e){toast(e.message);}
}
// 單一桌號 QR：只顯示該桌，列印走 mPOP（58mm 點陣圖）
async function printTableQr(table,url){
  if(!starReady()){await starOpenHere();return false;}
  const q=await new Promise(resolve=>{if(!url||typeof QRCode==='undefined'||!QRCode.toCanvas)return resolve(null);const c=document.createElement('canvas');QRCode.toCanvas(c,String(url),{width:300,margin:4},err=>resolve(err?null:c));});
  if(!q){toast('QR 產生失敗');return false;}
  // 中英雙語，外國客人也看得懂；鼓勵小語印在這張（發票證明聯不印）
  // 上方留白給帳本夾夾住，不壓到店名與 QR（203dpi：8 點＝1mm）
  const W=STAR_DOTS,c=document.createElement('canvas');c.width=W;c.height=1400;const g=c.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,W,c.height);g.fillStyle='#000';g.textBaseline='top';g.textAlign='center';let y=QR_CLIP_TOP;
  const line=(t,size,bold,gap=8)=>{g.font=(bold?'bold ':'')+size+'px sans-serif';g.fillText(t,W/2,y);y+=size+gap;};
  // 自動換行：英文以單字切、中文以字切
  const wrap=(t,size,bold)=>{g.font=(bold?'bold ':'')+size+'px sans-serif';const parts=/\s/.test(t)?t.split(/(\s+)/):[...t];let cur='';const fit=s=>!g.measureText||g.measureText(s).width<=W-16;for(const p of parts){if(cur&&!fit(cur+p)){line(cur.trim(),size,bold);cur=p.trimStart();}else cur+=p;}if(cur.trim())line(cur.trim(),size,bold);};
  line('在咖啡、三點水',26,true,10);  // 桌子兩個品牌共用，印兩個店名（不印母公司言文字）
  g.drawImage(q,(W-300)/2,y,300,300);y+=308;
  line('桌號 '+table,44,true,4);line('Table '+table,24,true,14);
  line('掃碼點餐',26,true,4);line('Scan to order',20,false,12);
  wrap('用餐完請到櫃檯結帳',20);wrap('Please pay at the counter after your meal',18);
  const enc=typeof PosEncouragement!=='undefined'&&PosEncouragement.pick?PosEncouragement.pick():null;
  if(enc){y+=6;g.fillRect(40,y,W-80,2);y+=14;
    // moji 吉祥物插圖：每句配一個場景（pos-moji.js），沒載入或不支援 Path2D 就只印文字
    if(enc.m&&typeof PosMoji!=='undefined'&&PosMoji.draw){const mw=200,mh=Math.round(mw*PosMoji.ratio);if(PosMoji.draw(g,enc.m,(W-mw)/2,y,mw))y+=mh+10;}
    wrap(enc.zh,22);wrap(enc.en,18);}
  const out=document.createElement('canvas');out.width=W;out.height=Math.ceil(y+12);const og=out.getContext('2d');og.fillStyle='#fff';og.fillRect(0,0,W,out.height);og.drawImage(c,0,0);
  const ok=await starSend({canvas:out});toast(ok?'桌號 QR 已送出列印':'桌號 QR 列印失敗');return ok;
}
// 開桌後自動出 QR：在 Star webPRNT Browser 裡直接印；不在（電腦／一般瀏覽器）就開面板顯示，可拿平板給客人掃或再按列印
async function printOpenedQr(table,url){
  if(!url)return false;
  if(starReady()){try{if(await printTableQr(table,url))return true;}catch(e){toast('桌號 QR 列印失敗：'+e.message);}}
  await openOneTableQr(table);return false;
}
function openTableQr(table){return openOneTableQr(String(table));}
// 一次開多桌（大組分桌）：勾選空桌 → 一次認人 → 逐桌開桌並各印一張 QR（一個帳本夾一張）
function pickTables({title,options}){
  return new Promise(resolve=>{
    const sel=new Set();
    const {ov,close}=pickOverlay(`<h3>${esc(title)}${tipIcon('點選要開的桌，可多選。每桌各印一張點餐 QR，一個帳本夾一張，按桌送餐。')}</h3><div class="pos-move-grid" style="grid-template-columns:repeat(4,1fr)">${options.map(t=>`<button type="button" class="pos-move-opt" data-mt="${esc(t)}" aria-pressed="false"><b>${esc(t)}</b></button>`).join('')}</div><div class="pos-move-foot"><button type="button" class="btn btn--ghost" data-cancel>取消</button><button type="button" class="btn btn--solid" data-ok disabled>開桌並印 QR</button></div>`,'一次開多桌');
    const done=v=>{close();resolve(v);};
    ov.onclick=e=>{if(e.target===ov)done(null);};
    const ok=ov.querySelector('[data-ok]');
    ov.querySelectorAll('[data-mt]').forEach(b=>b.onclick=()=>{const t=b.dataset.mt;sel.has(t)?sel.delete(t):sel.add(t);b.setAttribute('aria-pressed',String(sel.has(t)));b.classList.toggle('busy',sel.has(t));ok.disabled=!sel.size;ok.textContent=sel.size?`開 ${sel.size} 桌並印 QR`:'開桌並印 QR';});
    ov.querySelector('[data-cancel]').onclick=()=>done(null);
    ok.onclick=()=>{if(sel.size)done(options.filter(t=>sel.has(t)));};
  });
}
async function openManyTables(empty,reload){
  if(!empty.length){toast('目前沒有空桌');return;}
  const tables=await pickTables({title:'一次開多桌',options:empty});if(!tables)return;
  await ensureOperator(async()=>{
    const opened=[];
    for(const t of tables){
      try{const out=await api('/admin/orders/sessions',{method:'POST',body:{table_no:t,operator_id:OPERATOR?.id}});opened.push(out);}
      catch(e){toast(`${t} 開桌失敗：${e.message}`);}
    }
    if(!opened.length)return;
    toast(`已開桌 ${opened.map(o=>o.table).join('、')}`);
    POS_TABLE='';await reload();
    for(const o of opened){if(!starReady()){await openOneTableQr(o.table);break;}await printTableQr(o.table,o.qr_url);}   // 沒接 mPOP 時只顯示第一桌，其餘到各桌按 QR 補
  });
}
async function loadPos(){
  const host=document.getElementById('pos-body');if(!host)return;
  clearTimeout(POS_TIMER);
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<div class="a-sec"><h2>櫃檯結帳</h2><p class="hint">載入中…</p></div>';}
  try{[POS_DATA,REG_DATA]=await Promise.all([api('/admin/orders'+scopeQuery('all=1')),api('/admin/registers'+scopeQuery()).catch(()=>null)]);}catch(e){if(host.querySelector('.pos-grid'))toast('更新失敗：'+e.message);else host.innerHTML=`<div class="a-sec"><h2>櫃檯結帳</h2><p class="a-empty">載入失敗：${esc(e.message)}</p></div>`;POS_TIMER=setTimeout(()=>{if(document.getElementById('pos-body')&&TAB==='pos')loadPos();},15000);return;}
  // 後台系統設定新增／停用自訂收款帳戶後，這台 POS 不用重新整理頁面，最慢 15 秒內跟著這支輪詢更新
  if(POS_DATA.payment_methods)DATA.payment_methods=POS_DATA.payment_methods;
  applyLiveStock(POS_DATA.stock);
  const sig=JSON.stringify([POS_DATA.stock,POS_DATA.table_layout,POS_DATA.linepay,POS_DATA.pause,POS_DATA.sessions.map(s=>[s.id,s.linepay,s.unpaid,s.unpaid_amount,s.state,s.lines.map(l=>[l.line,l.qty,l.price,l.comp_reason||'',l.placed_at||'']),(s.pay_requests||[]).map(r=>[r.id,r.amount,r.count])]),POS_DATA.orders.map(o=>[o.id,o.status,o.invoice?.status]),Object.entries(POS_DATA.reservations||{}).map(([t,rs])=>[t,rs.map(r=>[r.id,r.time,r.status])]),REG_DATA&&Object.entries(REG_DATA.current||{}).map(([v,r])=>[v,r?.id,r?.closed_at]),(DATA.payment_methods||[]).map(m=>[m.code,m.label,m.active])]);
  // 客人手機按「通知櫃檯我要結帳」：第一次看到的需求響一聲（和新單同一個音）
  const reqIds=new Set(POS_DATA.sessions.flatMap(s=>(s.pay_requests||[]).map(r=>r.id)));if(PAYREQ_SEEN&&[...reqIds].some(id=>!PAYREQ_SEEN.has(id)))ordersBeep();PAYREQ_SEEN=reqIds;
  // 開帳表單打開時不要被 15 秒自動刷新重畫（會清掉正在填的張數）
  if(POS_EDIT&&host.querySelector('.pos-floor-edit')){POS_TIMER=setTimeout(()=>{if(document.getElementById('pos-body')&&TAB==='pos')loadPos();},15000);return;}
  if(!CHECKOUT_BUSY.size&&((host.dataset.sig!==sig&&!(REG_OPEN_FORM&&host.querySelector('.reg-open-form')))||!host.querySelector('.pos-grid'))){host.dataset.sig=sig;paintPos();}
  POS_TIMER=setTimeout(()=>{if(document.getElementById('pos-body')&&TAB==='pos')loadPos();},15000);
}
// 品項縮圖：有圖顯示圖，沒圖或載入失敗用品名首字佔位，POS 磚與已點品項共用
const itemThumb=(it,cls)=>{const ch=esc(Array.from((it&&it.zh)||'')[0]||'');const ph=`<span class="${cls} ${cls}--ph" aria-hidden="true">${ch}</span>`;return it&&it.image?`<img class="${cls}" src="${esc(it.image)}" alt="" loading="lazy" decoding="async" data-ch="${ch}" data-cls="${cls}">`:ph;};
if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('error',e=>{const im=e.target;if(!im||im.tagName!=='IMG'||!im.dataset||!im.dataset.cls)return;const sp=document.createElement('span');sp.className=im.dataset.cls+' '+im.dataset.cls+'--ph';sp.setAttribute('aria-hidden','true');sp.textContent=im.dataset.ch||'';im.replaceWith(sp);},true);
// 結帳金額（與伺服器同一套算法：會員價 → 整單折扣）；伺服器仍會重算，這裡只給畫面即時顯示
function posTotals(cur){
  const menuById=new Map((MENU_DOC?.items||[]).map(it=>[it.id,it]));
  const redeemSet=POS_YAN.id&&POS_YAN.redeemSet?POS_YAN.redeemSet:null;
  const priceOf=l=>{if(l.comp_reason)return 0;const it=menuById.get(l.item_id);if(redeemSet&&redeemSet.has(l.line)&&it&&it.points>0)return 0;if(!POS_MEMBER||!it)return l.price;const mp=MenuLib.memberPrice(it,l.price);return mp>0&&mp<l.price?mp:l.price;};
  const picked=cur.lines.filter(l=>!POS_PICK||POS_PICK.has(l.line)).map(l=>POS_QTY[l.line]>0&&POS_QTY[l.line]<l.qty?{...l,qty:POS_QTY[l.line],full_qty:l.qty}:l);
  const regular=picked.reduce((a,l)=>a+(l.comp_reason?0:l.price)*l.qty,0);
  const subtotal=picked.reduce((a,l)=>a+priceOf(l)*l.qty,0);
  let discount=0;if(POS_DISCOUNT){discount=POS_DISCOUNT.type==='percent'?Math.round(subtotal*POS_DISCOUNT.value/100):Math.min(subtotal,POS_DISCOUNT.value);}
  // 三點水服務費 10%（11/1 起；外帶、在咖啡不收）：跟伺服器同一套 MenuLib.serviceCharge；客訴免收時 svc 記原本該收多少
  const svcCalc=MenuLib.serviceCharge?MenuLib.serviceCharge(picked.map(l=>({...l,price:priceOf(l)})),{takeout:cur.takeout,discount}):null;
  const svc=svcCalc?(POS_SVC_WAIVE?{...svcCalc,would:svcCalc.amount,amount:0,waived:true,reason:POS_SVC_WAIVE.reason}:svcCalc):null;
  const pts=redeemSet?picked.reduce((a,l)=>{const it=menuById.get(l.item_id);return a+(redeemSet.has(l.line)&&!l.comp_reason&&it&&it.points>0?it.points*l.qty:0);},0):0;
  return {priceOf,picked,regular,subtotal,discount,svc,pts,menuById,total:subtotal-discount+(svc?svc.amount:0)};
}
// 低消（三點水 11/1 起，每人平日 300／假日 600）：看整桌三點水品項（不含贈送／取消／預收），人數用 POS 設定的來客人數；只提醒、不自動補收
function minSpendState(cur){
  if(!MenuLib.minSpendOf||cur.takeout)return null;
  const goods=cur.lines.filter(l=>!l.credit_of&&!l.prepay&&!l.cancelled&&l.venue==='BAR');
  if(!goods.length)return null;
  const spent=goods.reduce((a,l)=>a+(l.comp_reason?0:l.price)*l.qty,0);
  if(!MenuLib.barPolicyActive())return null;
  const m=MenuLib.minSpendOf(cur.party_size);
  if(!m)return {needParty:true,spent};
  return {...m,spent,short:Math.max(0,m.total-spent)};
}
function minSpendHtml(ms){
  if(!ms)return '';
  if(ms.needParty)return `<div class="pos-sum-min"><span><span class="pill pill-wait">低消</span> 請先按「設定人數」，才能核對低消</span><span></span></div>`;
  return `<div class="pos-sum-min ${ms.short?'short':''}"><span><span class="pill ${ms.short?'pill-bad':'pill-ok'}">低消</span> ${ms.weekend?'假日':'平日'}每人 ${num(ms.per)} × ${ms.people} 位＝${num(ms.total)}${ms.short?`，還差 NT$${num(ms.short)}`:'，已達'}</span><span></span></div>`;
}
// 進入平均分攤：全桌一起算（取消勾選與份數）、清掉折扣（分攤不套折扣）；人數記在 POS_AA，第幾人由桌上的抵扣行數推算
function startAA(people){POS_AA={people};POS_PICK=null;POS_QTY={};POS_DISCOUNT=null;POS_SVC_WAIVE=null;POS_SVC_OPEN=false;POS_DISC_OPEN=false;POS_RECEIVED='';POS_SPLIT={};}
/* 水平滑動手勢：垂直捲動不受影響（touch-action:pan-y）；超過 min 像素且橫向大於縱向才算滑動 */
function bindSwipe(el,{dir='right',min=100,follow=false,onSwipe}){
  if(!el||!el.dataset||!el.addEventListener||el.dataset.swipe)return;el.dataset.swipe='1';if(el.style)el.style.touchAction='pan-y';
  // touch-action 對 <tr> 不生效（CSS 規格排除表格列），橫向手勢會被當成捲動而 pointercancel；改設在儲存格上
  if(el.querySelectorAll)el.querySelectorAll('td,th').forEach(c=>{if(c.style)c.style.touchAction='pan-y';});
  let x0=0,y0=0,id=null,moved=false,sup=0;
  el.addEventListener('click',e=>{if(!el._prog&&Date.now()-sup<500){e.stopImmediatePropagation();e.preventDefault();}},true);
  const reset=()=>{if(follow){el.style.transition='transform .15s';el.style.transform='';}};
  el.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;if(e.target.closest('input,select,textarea,summary,.ops-btns,.pos-qty'))return;id=e.pointerId;x0=e.clientX;y0=e.clientY;moved=false;el.style.transition='';});
  el.addEventListener('pointermove',e=>{if(e.pointerId!==id)return;const dx=e.clientX-x0,dy=e.clientY-y0;if(Math.abs(dy)>Math.abs(dx)&&!moved)return;if(Math.abs(dx)>10)moved=true;if(follow&&moved&&(dir==='both'||dx>0))el.style.transform=`translateX(${Math.max(-min,Math.min(dx,min))}px)`;});
  const end=e=>{if(e.pointerId!==id)return;id=null;const dx=e.clientX-x0,dy=e.clientY-y0;reset();if(moved)sup=Date.now();if(Math.abs(dx)>=min&&Math.abs(dx)>Math.abs(dy)*1.5&&(dir==='both'||(dir==='right'?dx>0:dx<0))){onSwipe(el,dx);}};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',e=>{if(e.pointerId===id){id=null;reset();}});
}
function bindCashDrawerButton(drawerBtn){if(drawerBtn)drawerBtn.onclick=()=>ensureOperator(async()=>{const reason=await pickReason({title:'開錢櫃原因（記錄操作人員與時間）',presets:['開班放零用金','換鈔','交班點鈔','交易已完成，重試開櫃']});if(!reason||drawerBtn.disabled)return;drawerBtn.disabled=true;try{await manualCashDrawer(reason);}finally{drawerBtn.disabled=false;}});}
// 外帶區也是一個拖放目標（[data-slot]）；桌號只允許英數字與 -，「外帶」不會撞到真的桌號
const TAKEOUT_SLOT='外帶';
// 內用單移到外帶區：伺服器自動取 W01–W99 最小空號，品項／已結帳的單一起搬
function moveToTakeout(id,then){return opsThen(()=>api('/admin/orders/sessions/'+id+'/move',{method:'POST',body:{takeout:true}}),out=>`已移到外帶 ${out.table}`,then);}
// 桌況拖單：單卡（[data-pos-table]）拖到桌位格（[data-slot]）。拖曳後會吃掉緊接著的 click，不會誤開帳單
let LAST_DRAG=0;
// 座席時間每 30 秒就地更新（桌況只在資料變動時重畫，不能靠重畫刷新分鐘數）
if(typeof document!=='undefined'&&typeof setInterval==='function'&&!globalThis.__posDwellTick)globalThis.__posDwellTick=setInterval(()=>{for(const e of document.querySelectorAll?.('.tk-dwell[data-since]')||[])e.textContent=elapsedShort(e.dataset.since);},30000);
function bindOrderDrag(host,onDrop){
  // 綁在桌況＋外帶欄的共同外層，外帶單也能拖回桌位（轉內用）
  const board=host.querySelector('.pos-tables-row')||host.querySelector('.pos-board');if(!board||typeof board.addEventListener!=='function'||board.dataset.dragBound)return;board.dataset.dragBound='1';
  let st=null;
  board.addEventListener('click',e=>{if(Date.now()-LAST_DRAG<600){e.stopPropagation();e.preventDefault();}},true);
  const clear=()=>{if(!st)return;clearTimeout(st.timer);st.ghost&&st.ghost.remove();document.querySelectorAll('.drop-ok').forEach(e=>e.classList.remove('drop-ok'));st.card.classList.remove('dragging-src');st=null;};
  const slotAt=(x,y)=>{const e=document.elementFromPoint(x,y);return e&&e.closest?e.closest('[data-slot]'):null;};
  const begin=()=>{if(!st||st.on)return;st.on=true;const r=st.card.getBoundingClientRect();const g=st.card.cloneNode(true);g.classList.add('pos-ghost');g.style.width=r.width+'px';g.style.left=r.left+'px';g.style.top=r.top+'px';document.body.appendChild(g);st.ghost=g;st.dx=st.x0-r.left;st.dy=st.y0-r.top;st.card.classList.add('dragging-src');try{st.card.setPointerCapture(st.id);}catch(e){}};
  board.addEventListener('pointerdown',ev=>{
    const card=ev.target.closest('.pos-table[data-pos-table]');if(!card||ev.button>0)return;
    clear();
    st={card,id:ev.pointerId,x0:ev.clientX,y0:ev.clientY,touch:ev.pointerType==='touch',on:false};
    if(st.touch)st.timer=setTimeout(begin,300);
  });
  board.addEventListener('pointermove',ev=>{
    if(!st||ev.pointerId!==st.id)return;
    if(!st.on){const far=Math.hypot(ev.clientX-st.x0,ev.clientY-st.y0)>6;if(!far)return;if(st.touch){clear();return;}begin();}
    st.ghost.style.left=(ev.clientX-st.dx)+'px';st.ghost.style.top=(ev.clientY-st.dy)+'px';
    document.querySelectorAll('.drop-ok').forEach(e=>e.classList.remove('drop-ok'));
    const sl=slotAt(ev.clientX,ev.clientY);if(sl&&sl.dataset.slot!==st.card.dataset.posTable)sl.classList.add('drop-ok');
  });
  board.addEventListener('touchmove',ev=>{if(st&&st.on)ev.preventDefault();},{passive:false});
  const end=ev=>{
    if(!st||ev.pointerId!==st.id)return;
    const was=st.on,from=st.card.dataset.posTable,sl=was&&ev.type==='pointerup'?slotAt(ev.clientX,ev.clientY):null;
    const sess=(POS_DATA?.sessions||[]).find(x=>x.table===from);
    clear();
    if(was)LAST_DRAG=Date.now();
    if(was&&sl&&sess&&sl.dataset.slot!==from)onDrop(sess.id,from,sl.dataset.slot);
  };
  board.addEventListener('pointerup',end);board.addEventListener('pointercancel',end);
  board.addEventListener('contextmenu',e=>{if(st&&st.on)e.preventDefault();});
}
function bindTableDrag(host){
  const floor=host.querySelector('.pos-floor-edit');if(!floor)return;
  const pct=n=>Math.max(0,Math.min(100,Math.round(n/2)*2)); // 吸附 2% 格，擺起來比較整齊
  const read=()=>{const o={};for(const e of floor.querySelectorAll('[data-drag-table]'))o[e.dataset.dragTable]=e.dataset.w?[Number(e.dataset.x),Number(e.dataset.y),Number(e.dataset.w),Number(e.dataset.h)]:[Number(e.dataset.x),Number(e.dataset.y)];return o;};
  const exit=()=>{POS_EDIT=false;POS_EDIT_POS=null;host.dataset.sig='';paintPos();loadPos();};
  let drag=null;
  floor.addEventListener('pointerdown',ev=>{
    const el=ev.target.closest('[data-drag-table]');if(!el||ev.button>0)return;
    ev.preventDefault();el.setPointerCapture(ev.pointerId);
    const r=el.getBoundingClientRect();
    if(ev.target.closest('[data-rz]')){drag={el,id:ev.pointerId,rz:true,left:r.left,top:r.top};el.classList.add('dragging');return;}
    drag={el,id:ev.pointerId,dx:ev.clientX-r.left,dy:ev.clientY-r.top};el.classList.add('dragging');
  });
  floor.addEventListener('pointermove',ev=>{
    if(!drag||ev.pointerId!==drag.id)return;
    const f=floor.getBoundingClientRect(),r=drag.el.getBoundingClientRect();
    if(drag.rz){ // 拖右下角調整大小：寬高存畫布百分比，吸附 2%
      const x=Number(drag.el.dataset.x),y=Number(drag.el.dataset.y);
      const w=Math.max(10,Math.min(60,100-x,Math.round((ev.clientX-drag.left)/f.width*100/2)*2));
      const h=Math.max(8,Math.min(60,100-y,Math.round((ev.clientY-drag.top)/f.height*100/2)*2));
      drag.el.dataset.w=w;drag.el.dataset.h=h;drag.el.style.width=w+'%';drag.el.style.height=h+'%';return;
    }
    const maxX=100-r.width/f.width*100,maxY=100-r.height/f.height*100;
    const x=Math.min(pct((ev.clientX-drag.dx-f.left)/f.width*100),Math.floor(Math.max(0,maxX)));
    const y=Math.min(pct((ev.clientY-drag.dy-f.top)/f.height*100),Math.floor(Math.max(0,maxY)));
    drag.el.dataset.x=x;drag.el.dataset.y=y;drag.el.style.left=x+'%';drag.el.style.top=y+'%';
  });
  const end=ev=>{if(!drag||ev.pointerId!==drag.id)return;drag.el.classList.remove('dragging');drag=null;POS_EDIT_POS=read();};
  floor.addEventListener('pointerup',end);floor.addEventListener('pointercancel',end);
  host.querySelector('#pos-edit-cancel').onclick=exit;
  host.querySelector('#pos-edit-reset').onclick=async()=>{if(!await posConfirm('還原成預設的排排站格子？目前擺的位置會清掉。',{ok:'還原'}))return;POS_EDIT_POS={};paintPos();};
  host.querySelector('#pos-edit-done').onclick=async()=>{
    const btn=host.querySelector('#pos-edit-done');btn.disabled=true;
    const pos=POS_EDIT_POS&&Object.keys(POS_EDIT_POS).length?POS_EDIT_POS:(POS_EDIT_POS?{}:read());
    try{await api('/admin/orders/table-layout',{method:'POST',body:{pos}});if(POS_DATA)POS_DATA.table_layout={pos};toast('桌位擺放已儲存');exit();}
    catch(e){btn.disabled=false;toast('儲存失敗：'+e.message);}
  };
}
// 沒擺過位置的桌，編輯時先照順序排成格子（4 欄），再讓人拖去現場位置
function defaultTablePos(names,pos){const out={...pos};const rows=Math.max(4,Math.ceil(names.length/4));const at=i=>[1+(i%4)*25,Math.round(Math.floor(i/4)*76/(rows-1))];let i=0;for(const t of names){if(out[t])continue;while(Object.values(out).some(([x,y])=>x===at(i)[0]&&y===at(i)[1]))i++;out[t]=at(i++);}return out;}
function linepayPanelHtml(cur,config){
  const a=cur.linepay,pending=!!a,enabled=!!config?.enabled&&!cur.mixed;
  const hint=pending?`原交易 ${a.id}：${a.state==='prepared'?'尚未送出，可繼續掃碼或取消':'結果待確認；禁止改用其他方式收款'}`:(cur.mixed?'跨品牌整桌帳單請由言文字管理員處理':config?.blockers?.join('；')||'整桌原價單一付款；付款時邀請加入 @338ymhys，由客人自行選擇');
  return `<details class="a-sec pos-lp" ${pending||enabled?'open':''}><summary><b>LINE Pay API 收款＋加好友</b>${pending||enabled?'':' <span class="hint hint--tight">未啟用</span>'}</summary><p class="hint">${esc(hint)}</p><button type="button" class="btn btn--ghost" id="pos-linepay-api" ${(!pending&&!enabled)||CHECKOUT_BUSY.has(cur.id)?'disabled':''}>${pending&&a.state!=='prepared'?'查詢原 LINE Pay 交易':'掃客人付款碼（API 實收）'}</button>${a?.state==='prepared'?'<button type="button" class="btn btn--ghost" id="pos-linepay-cancel">取消尚未送出的交易</button>':''}</details>`;
}
function pickLinepayCode(amount){
  return new Promise(resolve=>{
    const {ov,close}=pickOverlay(`<h3>LINE Pay API 實收 NT$${num(amount)}</h3><p class="hint">請客人出示 LINE Pay「我的條碼」；掃描或用掃描槍輸入 18 碼。不會儲存付款碼。</p><div class="pos-inv-scan-row"><input data-code inputmode="numeric" autocomplete="off" maxlength="18" aria-label="LINE Pay 付款碼"><button type="button" class="btn btn--ghost" data-scan>相機掃描</button></div><video playsinline muted></video><div class="pos-move-foot"><button type="button" class="btn btn--ghost" data-cancel>取消</button><button type="button" class="btn btn--solid" data-next>確認付款碼</button></div>`,'LINE Pay API 收款');
    const input=ov.querySelector('[data-code]'),video=ov.querySelector('video');
    const done=value=>{stopPosInvoiceScanner(video);input.value='';close();resolve(value);};
    const accept=raw=>{if(!/^\d{18}$/.test(raw)){toast('請掃描 18 碼 LINE Pay 付款碼，不是會員卡或店家 QR');return;}done(raw);};
    ov.querySelector('[data-scan]').onclick=()=>startInvoiceScan(video,accept,{raw:true,sensitive:true});
    ov.querySelector('[data-next]').onclick=()=>accept(input.value.trim());
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();accept(input.value.trim());}};
    ov.querySelector('[data-cancel]').onclick=()=>done(null);input.focus();
  });
}
async function linepayCheckout(cur,host){
  return runCheckoutOnce(cur.id,async()=>{
    const path='/admin/orders/sessions/'+cur.id+'/linepay/';
    let a=cur.linepay;
    try{
      if(!a){
        if(POS_AA||POS_PICK||Object.keys(POS_QTY).length||POS_MEMBER||POS_YAN.id||POS_DISCOUNT||POS_METHOD==='mixed'){toast('API 收款限整桌原價，請先清除分帳、會員、點數、折扣及混合付款選項');return;}
        a=await api(path+'prepare',{method:'POST',body:{operator_id:OPERATOR?.id,invoice:invoiceBody(host)}});cur.linepay=a;
      }
      if(a.state==='review'){toast('此交易需管理員核對 LINE Pay 實收／退款，不能解除鎖定或重新收款。原交易：'+a.id);return;}
      let out;
      if(a.state==='prepared'){
        const oneTimeKey=await pickLinepayCode(a.amount);
        if(!oneTimeKey){await api(path+'cancel',{method:'POST',body:{attempt_id:a.id}});cur.linepay=null;return;}
        if(!await posConfirm(`將向客人實際收取 NT$${num(a.amount)}（全桌原價）。付款時邀請加入 @338ymhys，是否加入由客人選擇。`,{title:'LINE Pay API 實際扣款',ok:'送出實際扣款'})){await api(path+'cancel',{method:'POST',body:{attempt_id:a.id}});cur.linepay=null;return;}
        cur.linepay={...a,state:'unknown'};
        out=await api(path+'pay',{method:'POST',body:{attempt_id:a.id,oneTimeKey}});
      }else out=await api(path+'check',{method:'POST',body:{attempt_id:a.id}});
      cur.linepay=out;
      if(out.state==='settled'){
        toast(`LINE Pay 已確認實收 NT$${num(out.amount)}${out.result?.closed?'，已自動清桌':''}。列印失敗請重印，不可重新收款。`);
        POS_PICK=null;POS_QTY={};POS_SPLIT={};POS_MEMBER=false;POS_YAN={phone:'',name:'',balance:null};POS_DISCOUNT=null;POS_SVC_WAIVE=null;POS_SVC_OPEN=false;POS_RECEIVED='';
        if(out.order)await printCheckoutOrder(out.order);
      }else if(out.state==='failed'){cur.linepay=null;toast('LINE Pay 拒絕付款（'+(out.code||'FAIL')+'），未登記實收；請確認客人付款狀態後再選付款方式。');}
      else toast('原交易 '+out.id+' 結果尚未確認，帳單保持鎖定；請按「查詢原 LINE Pay 交易」，勿重新扣款或改收現金。');
    }catch(e){toast('LINE Pay：'+e.message+'；如已送出，請查詢原交易，勿重新收款。');}
  }).finally(()=>loadPos());
}
function memberStatusText(){ if(POS_YAN.id)return POS_MEMBER?'有效會籍 · 已套聚落價':'註冊會員 · 無有效會籍，不適用聚落價'; return POS_YAN.created?'新會員 · 已用手機建立，結帳累點':POS_YAN.name?'手機會員 · 結帳累點':POS_YAN.phone?'結帳時查會員，沒有就自動新增並累點':''; }
// 會員彈窗：查詢、掃描、移除與完整會籍／點數資訊都在這裡；結帳主畫面只留一個精簡入口
function openMemberDialog(cur){
  const {ov,close}=pickOverlay('','會員');ov.classList.add('pos-member-ov');
  const box=ov.querySelector('.pos-move-box'),same=()=>POS_TABLE===cur.table;
  ov.onclick=e=>{if(e.target===ov)close();};
  const render=()=>{
    box.innerHTML=`<h3>會員${tipIcon('輸入手機查會員，還不是會員會自動新增；或掃會員 App 的條碼。有效會籍自動套聚落價。')}</h3>${POS_YAN.name||POS_YAN.phone?`<div class="pos-member-who"><b>${esc(POS_YAN.name||POS_YAN.phone)}</b><br>${esc(memberStatusText())}${POS_YAN.id?`<br>點數 ${num(POS_YAN.balance||0)} 點（點品項「⋯」的「點數兌換」換餐飲或服務，不折抵金額）`:''}</div>`:'<p class="hint">還沒選會員。輸入客人手機，不是會員會自動新增；或掃描會員條碼。</p>'}<div class="pos-member-bar"><input id="pos-yan-phone" inputmode="tel" maxlength="20" placeholder="客人手機 09…" value="${esc(POS_YAN.phone||'')}" aria-label="客人手機"><button type="button" class="btn btn--ghost btn-xs" id="pos-yan-lookup">查會員</button><button type="button" class="btn btn--ghost btn-xs" id="pos-yan-scan">掃會員</button>${POS_YAN.id||POS_YAN.phone?'<button type="button" class="btn btn--ghost btn-xs" id="pos-yan-clear">移除</button>':''}</div><div class="pos-move-foot"><button type="button" class="btn btn--solid" data-done>完成</button></div>`;
    const phone=box.querySelector('#pos-yan-phone');
    phone.onchange=e=>{POS_YAN={phone:e.target.value.trim(),name:'',balance:null,sessionId:cur.id};POS_MEMBER=false;};
    const after=()=>{paintPos();render();};
    const lookup=()=>{const p=(phone.value||'').trim();if(!p){toast('請輸入手機');return;}const pending=POS_YAN={phone:p,name:'',balance:null,sessionId:cur.id};POS_MEMBER=false;return opsThen(()=>api('/admin/yan/lookup',{method:'POST',body:{phone:p}}),out=>{if(POS_YAN!==pending||!same())return '已切換帳單，未綁定會員';POS_YAN={phone:p,name:out.member?.name||'',balance:out.balance||0,created:!!out.created,sessionId:cur.id};return out.created?`已新增會員 ${p}，結帳後累點`:`${out.member?.name||'會員'} · ${out.balance||0} 點`;},after);};
    box.querySelector('#pos-yan-lookup').onclick=lookup;
    phone.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();lookup();}};
    box.querySelector('#pos-yan-scan').onclick=async()=>{const pending=POS_YAN;const token=await pickMemberCard();if(!token||POS_YAN!==pending||!same())return;return opsThen(()=>api('/admin/yan/lookup',{method:'POST',body:{token}}),out=>{if(POS_YAN!==pending||!same())return '已切換帳單，未綁定會員';POS_YAN={id:out.member?.id||'',phone:out.member?.phone||'',name:out.member?.name||'',balance:out.balance||0,active:!!out.active,sessionId:cur.id,redeemSet:new Set()};POS_MEMBER=!!out.active;return `${out.member?.name||'會員'} · ${out.active?'有效會籍，已套聚落價':'註冊會員，不適用聚落價'}（${out.balance||0} 點）`;},after);};
    const clr=box.querySelector('#pos-yan-clear');if(clr)clr.onclick=()=>{POS_YAN={phone:'',name:'',balance:null};POS_MEMBER=false;after();};
    box.querySelector('[data-done]').onclick=close;
  };
  render();
}
function paintPos(){
  const host=document.getElementById('pos-body'),d=POS_DATA;if(!host||!d)return;
  if(!document.querySelector?.('.pos-scan-full'))stopPosInvoiceScanner(); // 全螢幕掃載具開著時，背景輪詢重繪不能把相機關掉
  {const m=host.querySelector('.pos-menu');if(m&&typeof m.scrollTop==='number')POS_MENU_SCROLL=m.scrollTop;const c=host.querySelector('.pos-cats');if(c&&typeof c.scrollLeft==='number')POS_CATS_LEFT=c.scrollLeft;const l=host.querySelector('.pos-mid');if(l&&typeof l.scrollTop==='number'&&POS_LEFT_SCROLL!==1e9)POS_LEFT_SCROLL=l.scrollTop;}
  const sessions=d.sessions;
  if(POS_TABLE&&!sessions.find(s=>s.table===POS_TABLE))POS_TABLE='';
  const cur=sessions.find(s=>s.table===POS_TABLE)||null;
  if(POS_YAN.sessionId&&POS_YAN.sessionId!==cur?.id){POS_YAN={phone:'',name:'',balance:null};POS_MEMBER=false;}
  // 桌況格固定先列出現場的 16 桌（不管有沒有開桌，方便現場人員直接點選開桌），已開桌/外帶但不在固定桌號清單裡的（例如外帶、加開的桌）排在後面
  const byTable=new Map(sessions.filter(s=>!s.takeout).map(s=>[s.table,s]));
  const baseNames=[...DEFAULT_TABLES,...sessions.filter(s=>!s.takeout&&!DEFAULT_TABLES.includes(s.table)).map(s=>s.table)];
  // 桌位擺放（平面圖）：有座標的桌畫在畫布上，沒座標的桌與外帶單排在畫布下面；沒人擺過就是原本的格子
  const layoutPos=(POS_EDIT&&POS_EDIT_POS)?POS_EDIT_POS:((d.table_layout&&!Array.isArray(d.table_layout)&&d.table_layout.pos)||{});
  const legacyOrder=Array.isArray(d.table_layout)?d.table_layout:(d.table_layout?.order||[]);baseNames.sort((a,b)=>{const rank=t=>legacyOrder.includes(t)?legacyOrder.indexOf(t):1e6;return rank(a)-rank(b);});
  const placed=baseNames.filter(t=>Array.isArray(layoutPos[t])).sort((a,b)=>(layoutPos[a][1]-layoutPos[b][1])||(layoutPos[a][0]-layoutPos[b][0]));
  const slots=[...placed.map(t=>({...(byTable.get(t)||{table:t,empty:true}),placed:true})),...baseNames.filter(t=>!layoutPos[t]).map(t=>byTable.get(t)||{table:t,empty:true}),...sessions.filter(s=>s.takeout)];
  // 今天這桌有排的訂位（訂位頁填了桌號）：空桌與使用中的桌都標出來，提醒現場人員這桌有人預約；只是提示，不會自動開桌
  const resvOf=t=>(d.reservations||{})[t]||[];
  const resvHtml=t=>resvOf(t).map(r=>`<small class="pos-resv"><span class="pos-resv-tag">預約</span> ${esc(r.time)} ${esc(r.name)} ${r.party_size} 位${r.status==='new'?'（待確認）':''}</small>`).join('');
  const cardHtml=s=>{
    if(s.empty)return `<button type="button" class="pos-table empty ${s.placed?'is-placed':''} ${resvOf(s.table).length?'reserved':''}" data-open-table="${esc(s.table)}" aria-label="${esc(s.table)} 空桌，點一下開桌"><b>${esc(s.table)}</b><span class="tk-open">＋ 開桌</span>${resvHtml(s.table)}</button>`;
    const [cls,label]=TABLE_STATE[s.state]||TABLE_STATE.open;
    // 單子只顯示時間：座席經過時間；預約取餐的外帶單顯示取餐時刻。狀態、金額、要結帳都進帳單看；要結帳／久未點餐只用底色提示
    // 單子主角＝座席時間（開桌到現在幾分），不另列開桌時刻（KK 2026-10-18）；預約取餐的外帶單主角改成取餐時刻
    const at=s.pickup_at||s.created_at;
    // 點餐人：客人掃碼點餐時填的名字（櫃檯代點不算），最多列 3 個，其餘「等 N 人」
    const who=[...new Set((s.lines||[]).filter(l=>!l.credit_of&&!l.cancelled).map(ordererOf).filter(Boolean))];
    return `<button type="button" class="pos-table pos-ticket ${s.placed?'is-placed':''} ${s.table===POS_TABLE?'on':''} ${s.takeout?'takeout':''} ${s.pay_requests?.length?'payreq':''} ${idleWarn(s)?'idlewarn':''}" data-pos-table="${esc(s.table)}" aria-label="${s.takeout?'外帶 ':''}${esc(s.table)}${s.pay_requests?.length?'，要結帳':''}" title="${esc(applicationTime(at||''))}"><span class="tk-head">${s.takeout?`<b>${esc(s.table)}</b>`:''}<span class="pill ${cls}">${label}</span>${s.party_size?`<span class="tk-party">${Number(s.party_size)} 位</span>`:''}</span><span class="tk-time pos-order-time">${s.pickup_at?`取餐 ${esc(clockText(at))}`:s.created_at?`<span class="tk-dwell" data-since="${esc(s.created_at)}">${elapsedShort(s.created_at)}</span>`:'—'}</span>${who.length?`<span class="tk-who" title="${esc(who.join('、'))}">${who.slice(0,3).map(n=>`<span class="tk-who-pill">${esc(n)}</span>`).join('')}${who.length>3?`<span class="tk-who-pill tk-who-more">+${who.length-3}</span>`:''}</span>`:''}</button>`;
  };
  // 桌位固定：每桌一格（桌號在格頭、不會動）；單卡放在格子裡，可以拖到別的桌位（目標桌有單＝併桌）。外帶單沒有桌位，排在右側直欄
  const slotHtml=t=>`<div class="pos-slot ${layoutPos[t]?'is-placed':''}" data-slot="${esc(t)}"><span class="pos-slot-name">${esc(t)}</span>${cardHtml(byTable.get(t)||{table:t,empty:true})}${byTable.get(t)?`<span class="pos-slot-resv">${resvHtml(t)}</span>`:''}</div>`;
  const takeouts=sessions.filter(s=>s.takeout);
  const grid=baseNames.map(slotHtml).join('');
  const floor=placed.length?`<div class="pos-floor">${placed.map(t=>`<div class="pos-floor-slot${layoutPos[t][2]?' is-sized':''}" style="left:${layoutPos[t][0]}%;top:${layoutPos[t][1]}%${layoutPos[t][2]?`;width:${layoutPos[t][2]}%;min-height:${layoutPos[t][3]}%`:''}">${slotHtml(t)}</div>`).join('')}</div>`:'';

  if(POS_EDIT){
    const pos=defaultTablePos(baseNames,layoutPos);
    const cards=baseNames.map(t=>{const s=byTable.get(t);const [x,y,w,h]=pos[t];return `<div class="pos-table pos-drag" data-drag-table="${esc(t)}" data-x="${x}" data-y="${y}" ${w?`data-w="${w}" data-h="${h}"`:''} style="left:${x}%;top:${y}%${w?`;width:${w}%;height:${h}%`:''}" role="listitem" aria-label="桌 ${esc(t)}，按住拖到現場位置，拖右下角調整大小"><b>${esc(t)}</b><span class="pill ${s?'pill-wait':'pill-draft'}">${s?'使用中':'空桌'}</span><i class="pos-rz" data-rz aria-label="拖曳調整大小"></i></div>`;}).join('');
    host.innerHTML=`<div class="pos-layout"><div class="a-sec pos-tables pos-editing"><div class="ops-head"><h2>編輯桌位擺放</h2></div><p class="hint">按住桌號自由拖到跟現場一樣的位置（可以不排排站）；完成後全店 iPad 都會套用。</p><div class="pos-floor pos-floor-edit" style="min-height:${Math.max(520,Math.ceil(baseNames.length/4)*130)}px" role="list">${cards}</div><div class="pos-open"><button type="button" class="btn btn--solid" id="pos-edit-done">完成</button><button type="button" class="btn btn--ghost" id="pos-edit-reset">還原預設格子</button><button type="button" class="btn btn--ghost" id="pos-edit-cancel">取消</button></div></div></div>`;
    bindTableDrag(host);return;
  }
  // 櫃檯開桌／外帶：加開固定清單以外的桌號、或外帶單
  // 空桌直接點桌況格就開桌；「加開桌號」＝桌牌上沒有的桌號（點區＋數字鍵）；都不打字
  const opener=`<div class="pos-open"><button type="button" class="btn btn--solid" id="pos-takeout">＋ 外帶</button><button type="button" class="btn btn--ghost" id="pos-open-many">＋ 一次開多桌</button><button type="button" class="btn btn--ghost" id="pos-open-extra">＋ 加開桌號</button><button type="button" class="btn btn--ghost" id="pos-edit-tables">編輯桌位</button></div>`;
  let panel='',picked=[],subtotal=0,total=0,priceOf=l=>l.price,mixed=false,splitList=[],splitLeft=0,cashDue=0,cash=false,aa=null;
  const reload=()=>{host.dataset.sig='';return loadPos();};
  if(cur){
    if(POS_PICK)POS_PICK=new Set([...POS_PICK].filter(l=>cur.lines.some(x=>x.line===l)));
    for(const k of Object.keys(POS_QTY)){const x=cur.lines.find(l=>l.line===k);if(!x||POS_QTY[k]>=x.qty||POS_QTY[k]<1)delete POS_QTY[k];}
    const t=posTotals(cur);picked=t.picked;subtotal=t.subtotal;total=t.total;priceOf=t.priceOf;const {discount,regular,pts,svc}=t;const ms=minSpendState(cur);const memberSaving=regular-subtotal;
    // 平均分攤：全桌原價 ÷ 人數，前 N−1 人各收一份（走預收單，桌上留抵扣行），最後一人收剩餘（自動扣掉前面收的）。第幾人＝桌上已有幾行抵扣＋1
    aa=POS_AA?(()=>{const people=POS_AA.people,index=cur.lines.filter(l=>l.credit_of).length+1,goods=cur.lines.filter(l=>!l.credit_of).map(l=>l.comp_reason?{...l,price:0}:l),sv=MenuLib.serviceCharge?MenuLib.serviceCharge(goods,{takeout:cur.takeout}):null,gross=goods.reduce((a,l)=>a+l.price*l.qty,0)+(sv?sv.amount:0),each=Math.floor(gross/people);return {people,index,gross,each,last:index>=people};})():null;
    if(aa&&!aa.last)total=aa.each;
    const rowOf=l=>l.credit_of?`<tr class="pos-credit"><td><input type="checkbox" data-pick="${esc(l.line)}" ${!POS_PICK||POS_PICK.has(l.line)?'checked':''} aria-label="選取 ${esc(l.zh)}"></td><td class="ops-item"><b>已預收</b> <span class="pill pill-ok">部分付款</span><br><span class="hint hint--tight">${esc(clockText(l.added_at))} 先收，這次結帳自動抵扣；要取消請到查單作廢那張「部分付款」單</span></td><td class="pos-qty-col"></td><td class="num">−${num(-l.price)}</td><td class="ops-actions"></td></tr>`:`<tr class="${l.comp_reason?'pos-comp':''}${POS_OPT?.line===l.line?' is-editing':''}" data-edit-line="${esc(l.line)}"><td><input type="checkbox" data-pick="${esc(l.line)}" ${!POS_PICK||POS_PICK.has(l.line)?'checked':''} aria-label="選取 ${esc(l.zh)}"></td><td class="ops-item">${itemThumb((MENU_DOC?.items||[]).find(x=>x.id===l.item_id)||{zh:l.zh},'pos-line__img')}<b>${esc(l.zh)}</b>${l.comp_reason?` <span class="pill pill-ok">贈送</span>`:''}${POS_YAN.redeemSet?.has(l.line)?` <span class="pill pill-ok">點數兌換</span>`:''}${l.served_at?' <span class="pill pill-draft">已出餐</span>':l.placed_at?' <span class="pill pill-wait">待出餐</span>':''}${partsOf(l).length?`<br><span class="pos-line-parts">${partsOf(l).map(p=>esc(partText(p)+(p.note?'（'+p.note+'）':''))).join('<br>')}</span>`:''}${l.note?`<br><span class="pos-line-note">${esc(l.note)}</span>`:''}${l.by||l.comp_reason?`<br><span class="hint hint--tight">${[l.by?'由 '+esc(l.by)+' 點':'',l.comp_reason?esc(l.comp_reason):''].filter(Boolean).join(' · ')}</span>`:''}</td><td class="pos-qty-col"><div class="pos-qty"><button type="button" data-qty="${esc(l.line)}" data-delta="-1" aria-label="減少">−</button><b>${l.qty}</b><button type="button" data-qty="${esc(l.line)}" data-delta="1" aria-label="增加">＋</button></div>${l.qty>1&&(!POS_PICK||POS_PICK.has(l.line))?`<div class="pos-part-wrap"><span class="pos-part-lbl">這次只結（共 ${l.qty} 份）</span><div class="pos-qty pos-part" title="這次只結幾份"><button type="button" data-part="${esc(l.line)}" data-delta="-1" aria-label="少結一份">−</button><b>${POS_QTY[l.line]||l.qty}</b><button type="button" data-part="${esc(l.line)}" data-delta="1" aria-label="多結一份">＋</button></div></div>`:''}</td><td class="num pos-amt"><b>${num(priceOf(l)*l.qty)}</b>${l.qty>1?`<br><span class="hint hint--tight">${num(priceOf(l))} × ${l.qty}</span>`:''}${priceOf(l)!==l.price||l.comp_reason?`<br><span class="hint hint--tight"><s>${num((l.regular_price||l.price)*l.qty)}</s></span>`:''}</td><td class="ops-actions"><details class="ops-more"><summary class="btn btn--ghost btn-sm" aria-label="更多操作">⋯</summary><div class="ops-btns">${(()=>{const it=POS_YAN.id&&!l.comp_reason&&!l.credit_of?(MENU_DOC?.items||[]).find(x=>x.id===l.item_id):null;return it&&it.points>0?`<button class="btn btn--sm ${POS_YAN.redeemSet?.has(l.line)?'btn--solid':'btn--ghost'}" data-redeem="${esc(l.line)}" data-pts="${it.points*l.qty}">${POS_YAN.redeemSet?.has(l.line)?'取消兌換':'點數兌換 '+it.points*l.qty+' 點'}</button>`:'';})()}<button class="btn btn--ghost btn-sm" data-comp="${esc(l.line)}" data-on="${l.comp_reason?'0':'1'}">${l.comp_reason?'取消贈送':'贈送'}</button><button class="btn btn--ghost btn-sm" data-note-edit="${esc(l.line)}">${l.note?'改備註':'備註'}</button><button class="btn btn--ghost btn--danger btn-sm" data-void-line="${esc(l.line)}">作廢</button></div></details></td></tr>`;
    // 品項依點餐人分組（同桌各自掃碼點的名字）：組頭列出稱呼、幾項、小計與「只結這組」；只有一個人點的就不加組頭
    const groups=lineGroups(cur.lines),multi=groups.filter(g=>g.key!=='credit').length>1;
    const lineRows=groups.map(g=>{const ids=g.lines.map(l=>l.line);const on=!!POS_PICK&&POS_PICK.size===ids.length&&ids.every(id=>POS_PICK.has(id));const sub=g.lines.reduce((a,l)=>a+priceOf(l)*l.qty,0);const head=multi?`<tr class="pos-group ${on?'on':''}"><td colspan="5"><div class="pos-group-wrap"><span class="pos-group-name">${esc(g.label)}</span><span class="pos-group-meta">${g.lines.length} 項 · NT$${g.key==='credit'?'−'+num(-sub):num(sub)}</span>${g.key!=='credit'?`<button type="button" class="btn btn--ghost btn-xs" data-pick-group="${esc(g.key)}">${on?'已選這組':'只結這組'}</button>`:''}</div></td></tr>`:'';return head+g.lines.map(rowOf).join('');}).join('')||'<tr><td colspan="5" class="a-empty">尚未加入餐點，請從中間菜單選擇</td></tr>';
    const menuItems=MenuLib.sortItems((MENU_DOC?.items||[]).filter(it=>it.published&&(!SCOPE||it.venue===SCOPE)));
    if(POS_OPT&&(POS_OPT.table!==cur.table||(POS_OPT.line&&!cur.lines.some(l=>l.line===POS_OPT.line))))POS_OPT=null;
    const cats=[...new Set(menuItems.map(it=>it.cat))];if(POS_CAT&&!cats.includes(POS_CAT))POS_CAT='';
    const catChips=`<div class="pos-cats" role="tablist" aria-label="分類"><button type="button" data-cat="" aria-pressed="${!POS_CAT}">全部</button>${cats.map(c=>`<button type="button" data-cat="${esc(c)}" aria-pressed="${c===POS_CAT}">${esc(MenuLib.CAT_LABEL[c]?.zh||c)}</button>`).join('')}</div>`;
    const tiles=menuItems.filter(it=>!POS_CAT||it.cat===POS_CAT).map(it=>{const off=MenuLib.soldOutToday(it);return `<button type="button" class="pos-item ${off?'off':''}" data-add="${esc(it.id)}">${itemThumb(it,'pos-item__img')}<b>${esc(it.zh)}</b><span>${it.custom_price?'現場輸入金額':'NT$'+num(it.price)}${SCOPE?'':' · '+esc(BRAND_LABEL[it.venue]||it.venue)}</span>${off?'<small>今日估清</small>':MenuLib.stockLeft(it)!==null?`<small class="pos-item__left">剩 ${MenuLib.stockLeft(it)} 份</small>`:''}</button>`;}).join('')||'<p class="a-empty">沒有已發布的菜單項目</p>';
    const live=d.orders.filter(o=>o.session_id===cur.id);
    const liveRows=live.map(o=>`<tr class="${o.status==='void'?'resv-off':''}"><td class="ops-item"><b>${o.items.map(l=>`${esc(l.zh)} ×${l.qty}${l.cancelled?'（已取消）':''}`).join('、')}</b>${o.payer?.discount?` <span class="hint hint--tight">折扣 ${esc(discountText(o.payer.discount))}</span>`:''}<br><span class="hint a-mono hint--tight" title="${esc(applicationTime(o.paid_at))}">${esc(clockText(o.paid_at))}</span> ${o.status==='void'?`<span class="pill pill-bad">已作廢</span> <span class="hint hint--tight">${esc(o.void_reason||'')}</span>`:`<span class="pill ${o.status==='done'?'pill-ok':'pill-wait'}">${esc(ORDER_STATE[o.status]||o.status)}</span>`}</td><td class="ops-pay">${esc(payText(o))}${o.payer?.member?' · 聚落價':''}${o.payer?.operator_name?' · 👤 '+esc(o.payer.operator_name):''}<br>${invoiceHtml(o)}</td><td class="num">${num(o.amount)}</td><td class="ops-actions">${orderActions(o)}</td></tr>`).join('');
    if(POS_METHOD==='mixed')POS_METHOD='cash';mixed=false;
    splitList=mixed?payMethodsActive().map(pm=>({...pm,amount:Math.max(0,Number(POS_SPLIT[pm.code])||0)})):[];
    const splitSum=splitList.reduce((a,p)=>a+p.amount,0);splitLeft=total-splitSum;
    // 要找零的現金：整單現金＝應收全額；混合付款＝現金那一筆
    cashDue=mixed?(splitList.find(p=>p.code==='cash')?.amount||0):total;
    cash=POS_METHOD==='cash'||(mixed&&cashDue>0);
    const received=POS_RECEIVED===''?null:Number(POS_RECEIVED);
    const change=received!=null&&received>=cashDue?received-cashDue:null;
    const quick=[...new Set([cashDue,Math.ceil(cashDue/100)*100,Math.ceil(cashDue/500)*500,Math.ceil(cashDue/1000)*1000].filter(n=>n>=cashDue&&n>0))].slice(0,4);
    const splitUI=mixed?`<div class="pos-split" id="pos-split"><div class="hint hint--row">每種方式各收多少，合計要等於應收 NT$${num(total)}</div>${splitList.map(p=>`<label class="pos-split-row"><span>${esc(p.label)}</span><input type="number" inputmode="numeric" min="0" step="1" data-split="${esc(p.code)}" value="${p.amount||''}" placeholder="0" aria-label="${esc(p.label)} 金額"><button type="button" class="btn btn--ghost btn-xs" data-split-rest="${esc(p.code)}">餘額</button></label>`).join('')}<div class="pos-split-left ${splitLeft===0?'ok':''}"><span>${splitLeft>0?'還差':splitLeft<0?'超收':'合計正確'}</span><b id="pos-split-left">${splitLeft?'NT$'+num(Math.abs(splitLeft)):'✓'}</b></div></div>`:'';
    const discountUI=POS_DISC_OPEN?`<div class="pos-discount-form" id="pos-disc-form"><select id="pos-disc-type" aria-label="折扣類型"><option value="percent" ${POS_DISCOUNT?.type!=='amount'?'selected':''}>折 ％</option><option value="amount" ${POS_DISCOUNT?.type==='amount'?'selected':''}>折抵 NT$</option></select><input id="pos-disc-value" type="number" inputmode="numeric" min="1" step="1" placeholder="數字" value="${POS_DISCOUNT?esc(POS_DISCOUNT.value):''}" aria-label="折扣數值"><input id="pos-disc-reason" maxlength="40" placeholder="原因（必填）選下面或自己填" value="${POS_DISCOUNT?esc(POS_DISCOUNT.reason):''}" aria-label="折扣原因"><button type="button" class="btn btn--solid btn-sm" id="pos-disc-apply">套用</button><button type="button" class="btn btn--ghost btn-sm" id="pos-disc-cancel">取消</button><div class="reason-chips reason-chips--inline" role="group" aria-label="常用折扣">${[['percent',10,'9 折'],['percent',15,'85 折'],['percent',20,'8 折'],['percent',30,'7 折'],['amount',50,'折 $50'],['amount',100,'折 $100']].map(([t,v,l])=>`<button type="button" data-disc-quick="${t}:${v}">${l}</button>`).join('')}</div>${reasonChips('pos-disc-reason',REASON_PRESETS.discount)}</div>`:'';    panel=`<div class="a-sec pos-panel"><div class="pos-panel-scroll">
      <h2><button type="button" class="btn btn--ghost btn-sm pos-back" id="pos-back">← 桌況</button>${cur.takeout?'外帶':'桌號'} ${esc(cur.table)} ${cur.takeout?'':'<button type="button" class="btn btn--ghost btn-xs pos-qr-btn" id="pos-table-qr" aria-label="這桌的點餐 QR">QR</button>'}<span class="pill ${TABLE_STATE[cur.state]?.[0]||''}">${TABLE_STATE[cur.state]?.[1]||''}</span>${cur.pickup_at?`<span class="pill pill-draft">預約取餐 ${esc(clockText(cur.pickup_at))}</span>`:''}${tipIcon(CHECKOUT_TIP)}<span class="hint hint--end">${cur.created_at&&!cur.takeout?`⏱ 已用餐 ${elapsedText(cur.created_at)} · `:''}最後動作 ${esc(clockText(cur.updated_at))}</span></h2>
      ${cur.mixed?'<p class="hint"><span class="pill pill-bad">混桌</span> 這桌含其他品牌的品項：只能結自己店別的，清桌請由言文字管理員處理。</p>':''}
      ${cur.pay_requests?.length?`<div class="pos-payreqs">${cur.pay_requests.map(r=>`<div class="pos-payreq ${POS_PAYREQ===r.id?'on':''}"><button type="button" class="pos-payreq-apply" data-payreq="${esc(r.id)}"><span class="pill pill-wait">要結帳</span><b>${esc(r.name)}</b><span>${r.scope==='split'?`平均分攤 ${r.people} 人 · 每人 NT$${num(r.each||0)}`:r.scope==='mine'?'各付各的':'全部付款'} · ${r.count} 項 · NT$${num(r.amount)}</span><small>${esc(clockText(r.at))}</small></button><button type="button" class="btn btn--ghost btn-xs" data-payreq-dismiss="${esc(r.id)}" aria-label="關閉 ${esc(r.name)} 的結帳需求">✕</button></div>`).join('')}</div>`:''}
      <div class="pos-left">
      <div class="pos-mid">
      <div class="a-wrap2 pos-lines-wrap"><table class="a-tbl pos-lines"><thead><tr><th aria-label="分帳選取"></th><th>品項</th><th class="pos-qty-col">點了幾份</th><th class="num">小計（元）</th><th class="ops-th">操作</th></tr></thead><tbody>${lineRows}</tbody></table></div>
      ${live.length?`<h3>這桌已結帳的單</h3><div class="a-wrap2"><table class="a-tbl pos-paid"><thead><tr><th>品項 · 時間 · 狀態</th><th>付款</th><th class="num">金額</th><th class="ops-th">操作</th></tr></thead><tbody>${liveRows}</tbody></table></div>`:''}
      </div>
      <div class="pos-table-actions"><button class="btn btn--ghost" id="pos-place" ${cur.lines.some(l=>!l.credit_of)?'':'disabled'} title="有還沒送出的品項就先送單再印；都送過了就整桌重印">列印出餐單</button>${cur.takeout?'':`<button class="btn btn--ghost" id="pos-party">${cur.party_size?`人數 ${Number(cur.party_size)} 位`:'設定人數'}</button>`}<button class="btn btn--ghost" id="pos-move">${cur.takeout?'轉內用':'換桌／併桌'}</button><button class="btn btn--ghost btn--danger" id="pos-close">${cur.takeout?'收掉外帶單':'清桌'}</button></div>
      </div>
      <div class="pos-menu-box"><div class="pos-menu-body">${POS_OPT?optionPaneHtml(POS_OPT):catChips+`<div class="pos-menu">${tiles}</div>`}</div></div>
      <div class="pos-pay">
        <button type="button" class="pos-member-entry ${POS_YAN.name||POS_YAN.phone?'has':''}" id="pos-member-open" aria-haspopup="dialog">${POS_YAN.name||POS_YAN.phone?`<span><b>${esc(POS_YAN.name||POS_YAN.phone)}</b><small>${esc(POS_YAN.id?(POS_MEMBER?'有效會籍 · 聚落價':'註冊會員 · 無聚落價'):POS_YAN.created?'新會員 · 累點':'手機 · 累點')}${POS_YAN.id?' · '+num(POS_YAN.balance||0)+' 點':''}</small></span>`:'<span><b>會員</b><small>輸入手機累點，不是會員自動新增</small></span>'}<i aria-hidden="true">›</i></button>
        <div class="pos-methods" role="radiogroup" aria-label="付款方式">${payMethodsActive().map(pm=>`<label class="pos-method" title="${esc(pm.label)}"><input type="radio" name="pos-method" value="${esc(pm.code)}" aria-label="${esc(pm.label)}" ${pm.code===POS_METHOD?'checked':''}><span><i aria-hidden="true">${PAY_ICON[pm.code]||PAY_ICON.card}</i><b>${esc(PAY_SHORT[pm.code]||pm.label)}</b></span></label>`).join('')}</div>${splitUI}
        <div class="pos-sum">
          <div class="pos-sum-sub" ${(POS_PICK&&POS_PICK.size<cur.lines.length)||Object.keys(POS_QTY).length||memberSaving>0||discount||svc?'':'hidden'}><span>${(POS_PICK&&POS_PICK.size<cur.lines.length)||Object.keys(POS_QTY).length?`部分結帳 ${picked.length}／${cur.lines.length} 項`:memberSaving>0?'小計（原價）':'小計'}</span><span>NT$${num(regular)}</span></div>
          ${POS_YAN.id||memberSaving>0?`<div class="pos-sum-member"><span>${POS_YAN.id?(POS_MEMBER?'<span class="pill pill-ok">有效會籍</span> 已套聚落價':'<span class="pill pill-wait">註冊會員</span> 無有效會籍，不適用聚落價'):'聚落價'}</span><span>${POS_MEMBER&&memberSaving?'−'+num(memberSaving):'—'}</span></div>`:''}

          ${aa?`<div class="pos-sum-aa"><span><span class="pill pill-wait">平均分攤</span> ${aa.people} 人 · 每人 NT$${num(aa.each)}${aa.gross%aa.people?`，尾差 NT$${num(aa.gross%aa.people)} 併入最後一人`:''}</span><span><b>${aa.last?'最後一人':`第 ${aa.index}／${aa.people} 人`}</b> <button type="button" class="btn btn--ghost btn-xs" id="pos-aa-clear">取消分攤</button></span></div>`:`<div class="pos-sum-aa"><span>平均分攤</span><button type="button" class="btn btn--ghost btn-xs" id="pos-aa-open" ${cur.lines.some(l=>!l.credit_of)?'':'disabled'}>分次收款</button></div>`}
          <div class="pos-sum-disc" ${aa?'hidden':''}><span>折扣 ${POS_DISCOUNT?`<span class="pill pill-ok">${esc(discountText(POS_DISCOUNT))}</span> <button type="button" class="btn btn--ghost btn-xs" id="pos-disc-clear">移除</button>`:`<button type="button" class="btn btn--ghost btn-xs" id="pos-disc-open">${POS_DISC_OPEN?'收起':'加折扣'}</button>`}</span><span>${discount?'−'+num(discount):'—'}</span></div>
          ${discountUI}
          ${svc&&!aa?`<div class="pos-sum-svc"><span>服務費 10% ${svc.waived?`<span class="pill pill-wait">免收：${esc(svc.reason)}</span> <button type="button" class="btn btn--ghost btn-xs" id="pos-svc-restore">恢復收取</button>`:`<button type="button" class="btn btn--ghost btn-xs" id="pos-svc-open">${POS_SVC_OPEN?'收起':'免收（客訴）'}</button>`}</span><span>${svc.waived?`<s>${num(svc.would)}</s> 0`:'+'+num(svc.amount)}</span></div>${POS_SVC_OPEN&&!svc.waived?`<div class="pos-discount-form" id="pos-svc-form"><input id="pos-svc-reason" maxlength="40" placeholder="免收原因（例如：客訴、上菜太慢）" aria-label="免收服務費原因"><button type="button" class="btn btn--solid btn-sm" id="pos-svc-apply">免收服務費</button></div>`:''}`:svc&&aa?`<div class="pos-sum-svc"><span>服務費 10%</span><span>已含在分攤金額</span></div>`:''}
          ${minSpendHtml(ms)}
                    ${cash?`<div class="pos-cash"><label>${mixed?'現金實收':'實收'}<input id="pos-received" type="number" inputmode="numeric" min="0" step="1" placeholder="客人給的現金" value="${esc(POS_RECEIVED)}" aria-label="實收金額"></label><div class="pos-cash-quick">${quick.map(n=>`<button type="button" data-received="${n}">${n===cashDue?'剛好':'$'+num(n)}</button>`).join('')}</div></div>`:''}
        </div>
        <div class="pos-invoice"><div class="pos-invoice-head"><b>電子發票</b> <span class="pos-inv-badge hint hint--tight" data-off="${POS_INVOICE.mode?'':'1'}">${POS_INVOICE.mode?INV_LABEL[POS_INVOICE.mode]:'不開立'}</span>${DATA?.invoice?.configured?'':'<span class="pos-inv-warn">ezPay 尚未設定，先記為待補開</span>'}</div><div class="pos-invoice-body"><div class="pos-invoice-types">${[['paper','紙本'],['company','統編'],['mobile','手機載具'],['citizen','自然人憑證'],['donate','捐贈'],['','不開立']].map(([m,l])=>`<label><input type="radio" name="pos-invoice" value="${m}" ${POS_INVOICE.mode===m?'checked':''}><span>${l}</span></label>`).join('')}</div><div class="pos-invoice-fields"><div class="pos-inv-row" data-inv-modes="company"><input name="buyer_ubn" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="統編 8 碼" value="${esc(POS_INV_VALS.buyer_ubn||'')}"><div class="pos-ubn-result hint" id="pos-ubn-result" aria-live="polite" data-name="${esc(POS_INV_VALS.ubn_name||'')}" data-state="${esc(POS_INV_VALS.ubn_state||'')}">${esc(POS_INV_VALS.ubn_text||'')}</div></div><div class="pos-inv-row" data-inv-modes="mobile,citizen"><div class="pos-inv-scan-row"><input name="carrier_num" autocapitalize="characters" maxlength="64" placeholder="手機條碼 /ABC1234" value="${esc(POS_INV_VALS.carrier_num||'')}"><button type="button" class="btn btn--ghost btn-xs" id="pos-invoice-scan" data-inv-modes="mobile">📷 掃描</button></div><video id="pos-invoice-video" playsinline muted></video></div><div class="pos-inv-row" data-inv-modes="donate"><input name="love_code" inputmode="numeric" pattern="[0-9]*" maxlength="20" placeholder="愛心碼" value="${esc(POS_INV_VALS.love_code||'')}"></div><div class="pos-inv-row" data-inv-modes="paper,company,mobile,citizen,donate"><input name="comment" maxlength="80" placeholder="發票備註（選填）" value="${esc(POS_INV_VALS.comment||'')}"></div></div></div></div>
        ${cur.linepay||(d.linepay?.enabled&&!cur.mixed)?linepayPanelHtml(cur,d.linepay):''}
      </div>
      <div class="pos-dock">${cash?`<div class="pos-change pos-dock-change ${change?'has':''}"><span>找零</span><b>${change!=null?'NT$'+num(change):'—'}</b></div>`:`<div class="pos-dock-due"><span>應收</span><b>NT$${num(total)}</b></div>`}<button class="btn btn--ghost" id="pos-print-receipt" ${cur.lines.some(l=>!l.credit_of)?'':'disabled'}>列印明細</button><button class="btn btn--solid" id="pos-checkout" ${picked.length?'':'disabled'}>${aa?(aa.last?'收最後一人':`收第 ${aa.index}／${aa.people} 人`)+' ':'收款 '}NT$${num(total)}</button></div>
      </div>
    </div>`;
  }
  host.innerHTML=`<div class="pos-layout ${cur?'has-panel':''}"><div class="a-sec pos-tables"><div class="pos-tables-row"><div class="pos-tables-main"><div class="ops-head"><h2>櫃檯結帳</h2>${opsHelp('客人進門時點空桌開桌，會自動印出這桌的點餐 QR（本次用餐專用、結帳後失效），夾進帳本帶位；大組分桌按「＋ 一次開多桌」，一個帳本夾一張 QR。點該桌看帳、結帳；外帶按「＋ 外帶」。印發票／開錢櫃：iPad 用 USB-C 線接 mPOP，並用 Star webPRNT Browser 開這個網址。')}</div><div class="pos-board">${floor}<div class="pos-grid">${grid}</div></div></div><aside class="pos-takeouts" aria-label="外帶單" data-slot="${TAKEOUT_SLOT}"><div class="ops-head"><h2>外帶${takeouts.length?` <span class="kds-count">${takeouts.length}</span>`:''}</h2></div><div class="pos-takeout-list">${takeouts.length?takeouts.map(cardHtml).join(''):'<p class="hint">沒有外帶單</p>'}</div></aside></div>${opener}<div class="pos-sub">${document.getElementById('p-drawer')?'':'<div class="a-toolbar"><button type="button" class="btn btn--ghost btn-sm" id="pos-cash-drawer">錢櫃</button></div>'}</div></div>${panel}</div>`;
  {const m=host.querySelector('.pos-menu');if(m&&POS_MENU_SCROLL)m.scrollTop=POS_MENU_SCROLL;const c=host.querySelector('.pos-cats');if(c&&POS_CATS_LEFT)c.scrollLeft=POS_CATS_LEFT;const l=host.querySelector('.pos-mid');if(l&&POS_LEFT_SCROLL){l.scrollTop=POS_LEFT_SCROLL;if(POS_LEFT_SCROLL===1e9)POS_LEFT_SCROLL=l.scrollTop;}}
  if(!document.getElementById('p-drawer'))bindCashDrawerButton(host.querySelector('#pos-cash-drawer'));
  host.querySelectorAll('[data-pos-table]').forEach(b=>b.onclick=()=>{POS_TABLE=b.dataset.posTable;POS_OPT=null;POS_MENU_SCROLL=0;POS_LEFT_SCROLL=0;POS_PICK=null;POS_QTY={};POS_PAYREQ=null;POS_YAN={phone:'',name:'',balance:null};POS_MEMBER=false;POS_SPLIT={};POS_DISCOUNT=null;POS_SVC_WAIVE=null;POS_SVC_OPEN=false;POS_DISC_OPEN=false;POS_INV_VALS={};POS_RECEIVED='';POS_AA=null;paintPos();});
  // 開桌／外帶：每次都先輸入 PIN 認人，記這桌是誰開的（與結帳、作廢、開錢櫃一致）
  const openSession=body=>ensureOperator(()=>opsThen(()=>api('/admin/orders/sessions',{method:'POST',body:{...body,operator_id:OPERATOR?.id}}),out=>out.takeout?`外帶單 ${out.table} 已開，請加入品項`:out.created?`已開桌 ${out.table}`:`桌號 ${out.table} 已在使用中`,async out=>{POS_TABLE=out.table;POS_PICK=null;POS_DISCOUNT=null;POS_SVC_WAIVE=null;POS_SVC_OPEN=false;POS_RECEIVED='';await reload();if(out.created&&out.qr_url)await printOpenedQr(out.table,out.qr_url);}));
  // 空桌格：直接點就開桌，不用再打字輸入桌號；這桌有已確認的訂位時，開桌後順手問要不要把訂位標成「已到」（訂位頁就不用再點一次）
  host.querySelectorAll('[data-open-table]').forEach(b=>b.onclick=async()=>{
    const table=b.dataset.openTable,r=((POS_DATA?.reservations||{})[table]||[]).find(x=>x.status==='confirmed');
    if(!r)return openSession({table_no:table});
    const arrive=await posConfirm(`${table} 有訂位：${r.time} ${r.name} ${r.party_size} 位。\n開桌並把這筆訂位標成「已到」？`,{ok:'已到，開桌',cancel:'只開桌'});
    ensureOperator(()=>opsThen(()=>api('/admin/orders/sessions',{method:'POST',body:{table_no:table,operator_id:OPERATOR?.id}}),out=>out.created?`已開桌 ${out.table}`:`桌號 ${out.table} 已在使用中`,async out=>{
      POS_TABLE=out.table;POS_PICK=null;POS_DISCOUNT=null;POS_SVC_WAIVE=null;POS_SVC_OPEN=false;POS_RECEIVED='';
      if(arrive){try{await api('/admin/reservations/'+r.id+'/status',{method:'POST',body:{status:'arrived',notify:false}});toast(`訂位 ${r.name} 已標記「已到」`);}catch(e){toast('訂位狀態沒更新：'+e.message);}}
      await reload();if(out.created&&out.qr_url)await printOpenedQr(out.table,out.qr_url);
    }));
  });
  // 拖單換桌：按住單卡拖到別的桌位放開（滑鼠移動 6px 起拖；觸控長按 0.3 秒起拖，才不會跟捲動打架）；目標桌有單＝併桌，先問一次
  bindOrderDrag(host,async(id,from,to)=>{
    const src=(POS_DATA?.sessions||[]).find(x=>x.id===id);
    if(to===TAKEOUT_SLOT){if(src?.takeout)return;return moveToTakeout(id,()=>{POS_TABLE='';return reload();});}
    const busy=byTable.get(to);
    if(busy&&!await posConfirm(`${to} 已有單，把 ${from} 併到 ${to}？兩桌的品項會合在一起。`,{ok:'併桌'}))return;
    await opsThen(()=>api('/admin/orders/sessions/'+id+'/move',{method:'POST',body:{table_no:to}}),out=>out.merged?`已併到 ${out.table}`:`已換到 ${out.table}`,()=>{POS_TABLE='';return reload();});
  });
  host.querySelector('#pos-edit-tables').onclick=()=>{POS_EDIT=true;POS_EDIT_POS=null;paintPos();};
  // 平面圖固定在畫面高度內（不捲動、不拉高）：每個桌位框最高只到下面那桌／畫布底；單子放不下就逐級精簡（縮時間字→藏點餐人→藏開桌時刻→再縮），一律不超出桌位框
  const fl=host.querySelector('.pos-floor');if(fl&&typeof fl.getBoundingClientRect==='function'){const fit=()=>{const fr=fl.getBoundingClientRect();if(!fr.height)return;
    const sl=[...fl.children].map(c=>({c,top:parseFloat(c.style.top)||0,left:parseFloat(c.style.left)||0,w:c.getBoundingClientRect().width/fr.width*100}));
    for(const a of sl){let lim=100-a.top;for(const b of sl){if(b===a||b.top<=a.top)continue;if(b.left>=a.left+a.w-0.5||a.left>=b.left+b.w-0.5)continue;lim=Math.min(lim,b.top-a.top);}
      const px=Math.max(56,Math.floor(lim/100*fr.height)-6);if(a.c.dataset.mh===undefined)a.c.dataset.mh=a.c.style.minHeight||'';a.c.style.minHeight=a.c.dataset.mh?`min(${a.c.dataset.mh},${px}px)`:'';a.c.style.maxHeight=px+'px';const slot=a.c.firstElementChild;if(!slot)continue;
      // 量內容實際底部（桌位框本身 min-height:100% 會撐高，不能用 scrollHeight）
      const need=()=>{const st=slot.getBoundingClientRect().top;let b=0;for(const k of slot.children){const r=k.getBoundingClientRect();if(r.height)b=Math.max(b,r.bottom-st);}return b+6;};
      a.c.classList.remove('tk-c1','tk-c2','tk-c3','tk-c4');for(const k of ['tk-c1','tk-c2','tk-c3','tk-c4']){if(need()<=px+1)break;a.c.classList.add(k);}}};
    fit();if(typeof requestAnimationFrame==='function')requestAnimationFrame(fit);if(typeof ResizeObserver==='function'){let w=0;new ResizeObserver(()=>{const x=fl.getBoundingClientRect();const k=x.width+'x'+x.height;if(k!==w){w=k;fit();}}).observe(fl);}}
  // 加開桌號：點區＋號碼，不打字（桌牌上有的桌號直接點桌況格或「開桌」）
  host.querySelector('#pos-open-extra').onclick=async()=>{const t=await pickTableNo({title:'加開桌號',hint:'桌牌上沒有的桌號、戶外或臨時桌才用這裡；已開著的桌會直接切過去。'});if(t)openSession({table_no:t});};
  host.querySelector('#pos-takeout').onclick=()=>openSession({takeout:true});
  host.querySelector('#pos-open-many').onclick=()=>openManyTables(slots.filter(x=>x.empty&&!x.takeout).map(x=>x.table),reload);
  // 桌號 QR／暫停點餐在工具列，沒選桌也要能按，所以綁在 if(!cur)return 之前
  if(!cur)return;
  // 這桌的點餐 QR：桌號旁的「QR」鈕，開面板直接顯示這桌（要印全部桌還是按面板裡的「全部固定桌」）
  const qrBtn=host.querySelector('#pos-table-qr');if(qrBtn)qrBtn.onclick=()=>openTableQr(cur.table);
  host.querySelector('#pos-back').onclick=()=>{POS_TABLE='';POS_OPT=null;POS_PICK=null;POS_QTY={};POS_PAYREQ=null;POS_SPLIT={};POS_DISCOUNT=null;POS_SVC_WAIVE=null;POS_SVC_OPEN=false;POS_DISC_OPEN=false;POS_INV_VALS={};POS_RECEIVED='';POS_AA=null;paintPos();};
  // 客人送來的結帳需求：點一下把那幾項勾好（其餘取消勾選），再照一般流程選付款方式收款；✕＝關掉這筆（品項不動）
  host.querySelectorAll('[data-payreq]').forEach(b=>b.onclick=()=>{const r=(cur.pay_requests||[]).find(x=>x.id===b.dataset.payreq);if(!r)return;if(r.scope==='split'&&r.people){startAA(r.people);POS_PAYREQ=r.id;paintPos();return;}const set=new Set(r.lines.filter(l=>cur.lines.some(x=>x.line===l)));POS_PICK=set.size===cur.lines.length?null:set;POS_QTY={};POS_PAYREQ=r.id;paintPos();toast(`已選取 ${r.name} 要付的 ${set.size} 項`);});
  host.querySelectorAll('[data-payreq-dismiss]').forEach(b=>b.onclick=()=>opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/pay-requests/'+b.dataset.payreqDismiss,{method:'DELETE'}),'已關閉這筆結帳需求',()=>{if(POS_PAYREQ===b.dataset.payreqDismiss)POS_PAYREQ=null;return reload();}));
  host.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>{const l=cur.lines.find(x=>x.line===b.dataset.part);if(!l)return;const n=Math.min(l.qty,Math.max(1,(POS_QTY[l.line]||l.qty)+Number(b.dataset.delta)));if(n>=l.qty)delete POS_QTY[l.line];else POS_QTY[l.line]=n;paintPos();});
  host.querySelectorAll('[data-pick]').forEach(c=>c.onchange=()=>{const all=[...host.querySelectorAll('[data-pick]')],on=all.filter(x=>x.checked).map(x=>x.dataset.pick);POS_PICK=on.length===all.length?null:new Set(on);paintPos();});
  // 組頭「只結這組」＝各付各的：只勾這個人點的，再照一般流程收款；收完這組剩下的還在桌上，接著收下一組，全部結清伺服器自動清桌
  host.querySelectorAll('[data-pick-group]').forEach(b=>b.onclick=()=>{const g=lineGroups(cur.lines).find(x=>x.key===b.dataset.pickGroup);if(!g)return;const ids=g.lines.map(l=>l.line);POS_PICK=ids.length===cur.lines.length?null:new Set(ids);POS_QTY={};POS_PAYREQ=null;POS_AA=null;paintPos();toast(`已選 ${g.label} 的 ${ids.length} 項，收款就是各付各的`);});
  const memberOpen=host.querySelector('#pos-member-open');if(memberOpen)memberOpen.onclick=()=>openMemberDialog(cur);
  host.querySelectorAll('[data-redeem]').forEach(b=>b.onclick=()=>{const set=new Set(POS_YAN.redeemSet||[]);const id=b.dataset.redeem;if(set.has(id))set.delete(id);else{const need=Number(b.dataset.pts)||0;const used=cur.lines.reduce((a,l)=>{const it=(MENU_DOC?.items||[]).find(x=>x.id===l.item_id);return a+(set.has(l.line)&&it?it.points*l.qty:0);},0);if((POS_YAN.balance||0)<used+need){toast(`點數不足（還差 ${used+need-(POS_YAN.balance||0)} 點）`);return;}set.add(id);}POS_YAN={...POS_YAN,redeemSet:set};paintPos();});
  host.querySelectorAll('input[name=pos-method]').forEach(r=>r.onchange=()=>{if(r.checked){POS_METHOD=r.value;paintPos();}});
  // 改數量：− 到 0 視同作廢（要原因）
  host.querySelectorAll('[data-qty]').forEach(b=>b.onclick=()=>{const l=cur.lines.find(x=>x.line===b.dataset.qty);if(!l)return;const next=l.qty+Number(b.dataset.delta);
    if(next<1){pickReason({title:`數量減到 0＝作廢「${l.zh}」，原因`,presets:REASON_PRESETS.void_line}).then(reason=>{if(reason===null)return;opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items/'+l.line,{method:'DELETE',body:{reason}}),'已作廢品項',reload);});return;}
    if(next>20){toast('數量最多 20');return;}
    opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items/'+l.line,{method:'PATCH',body:{qty:next}}),`${l.zh} ×${next}`,reload);});
  host.querySelectorAll('[data-comp]').forEach(b=>b.onclick=async()=>{const on=b.dataset.on==='1';let reason='';if(on){reason=await pickReason({title:'贈送原因（會記在日結）',presets:REASON_PRESETS.comp});if(reason===null)return;}
    opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items/'+b.dataset.comp,{method:'PATCH',body:{free:on,reason}}),on?'已標記贈送（單價 0）':'已取消贈送',reload);});
  host.querySelectorAll('[data-void-line]').forEach(b=>b.onclick=async()=>{const ln=cur.lines.find(x=>x.line===b.dataset.voidLine);const reason=await pickReason({title:`作廢「${ln?ln.zh:'這個品項'}」的原因`,presets:REASON_PRESETS.void_line});if(reason===null)return;opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items/'+b.dataset.voidLine,{method:'DELETE',body:{reason}}),'已作廢品項',reload);});
  // 備註：任何品項（不限加點當下）都能補／改特別需求，留空按確定＝清除備註
  host.querySelectorAll('[data-note-edit]').forEach(b=>b.onclick=async()=>{const ln=cur.lines.find(x=>x.line===b.dataset.noteEdit);const note=await pickNote({title:`「${ln?ln.zh:''}」的備註`,initial:ln?.note||'',maxlength:160,placeholder:'其他補充；全部清空按確定＝清除備註'});if(note===null)return;opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items/'+b.dataset.noteEdit,{method:'PATCH',body:{note}}),'已更新備註',reload);});
  host.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{POS_CAT=b.dataset.cat;POS_MENU_SCROLL=0;paintPos();});
  // 加點：有冰熱／甜度／飯量／麵量等選項的品項先跳選項面板（跟桌邊點餐同一套規格），沒選項的直接加（櫃檯才快）
  host.querySelectorAll('[data-add]').forEach(b=>b.onclick=async()=>{const note='';const it=(MENU_DOC?.items||[]).find(x=>x.id===b.dataset.add);
    // 客製價格品項（例：其他）：先用金額鍵盤問金額（常用面額一鍵），取消就整個放棄；問完才照原本流程（有選項先跳面板、沒有就直接送）
    let price;
    if(it?.custom_price){
      const raw=await pickAmount({title:`「${it.zh}」要收多少？`,presets:[50,100,150,200,300,500],min:0,max:100000});
      if(raw===null)return;
      const n=Number(raw);
      if(!Number.isFinite(n)||n<0||n>100000){toast('金額不正確，請輸入 0–100000 的數字');return;}
      price=Math.round(n);
    }
    const send=body=>opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items',{method:'POST',body:price===undefined?body:{...body,price}}),`已加 ${it?it.zh:''}${body.qty>1?' ×'+body.qty:''}`,()=>{POS_LEFT_SCROLL=1e9;return reload();});
    const groups=itemOptionGroups(it);
    if(!groups.length)return send({item_id:b.dataset.add,qty:1,note});
    openItemOptions(it,groups,note,send);});
  // 點左欄已點餐點：中欄切到該筆的細項編輯（帶入數量、規格、備註）；確定只更新這一筆，取消不動原項目
  host.querySelectorAll('[data-edit-line]').forEach(tr=>tr.addEventListener('click',e=>{
    if(e.target.closest&&e.target.closest('button,input,details,summary,a,label'))return;
    const l=cur.lines.find(x=>x.line===tr.dataset.editLine);if(!l||l.credit_of)return;
    if(partsOf(l).length){toast('套餐內容不能直接改：請作廢這筆再重點一次；只想加備註請按「⋯」→備註');return;}
    const it=(MENU_DOC?.items||[]).find(x=>x.id===l.item_id)||{id:l.item_id,zh:l.zh,price:l.price};
    const groups=itemOptionGroups(it),parsed=itemOptionParse(groups,l.note);
    openItemOptions(it,groups,'',body=>opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items/'+l.line,{method:'PATCH',body:{qty:body.qty,note:body.note}}),`已更新 ${l.zh}`,reload),{line:l.line,qty:l.qty,picks:parsed.picks,extra:parsed.extra});
  }));
  bindOptionPane(host);
  bindReasonChips(host);bindNoteChips(host);
  // 常用折扣：一鍵帶入類型與數值，原因仍要選（按「套用」才生效）
  host.querySelectorAll('[data-disc-quick]').forEach(b=>b.onclick=()=>{const [t,v]=b.dataset.discQuick.split(':');host.querySelector('#pos-disc-type').value=t;host.querySelector('#pos-disc-value').value=v;host.querySelectorAll('[data-disc-quick]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  const discOpen=host.querySelector('#pos-disc-open');if(discOpen)discOpen.onclick=()=>{POS_DISC_OPEN=!POS_DISC_OPEN;paintPos();host.querySelector('#pos-disc-value')?.focus();};
  const svcOpen=host.querySelector('#pos-svc-open');if(svcOpen)svcOpen.onclick=()=>{POS_SVC_OPEN=!POS_SVC_OPEN;paintPos();host.querySelector('#pos-svc-reason')?.focus();};
  const svcRestore=host.querySelector('#pos-svc-restore');if(svcRestore)svcRestore.onclick=()=>{POS_SVC_WAIVE=null;POS_SVC_OPEN=false;paintPos();};
  const svcApply=host.querySelector('#pos-svc-apply');if(svcApply)svcApply.onclick=()=>{const reason=host.querySelector('#pos-svc-reason').value.trim();if(!reason){toast('請填寫免收服務費的原因');host.querySelector('#pos-svc-reason').focus();return;}POS_SVC_WAIVE={reason};POS_SVC_OPEN=false;paintPos();};
  const discClear=host.querySelector('#pos-disc-clear');if(discClear)discClear.onclick=()=>{POS_DISCOUNT=null;POS_SVC_WAIVE=null;POS_SVC_OPEN=false;POS_DISC_OPEN=false;paintPos();};
  const discCancel=host.querySelector('#pos-disc-cancel');if(discCancel)discCancel.onclick=()=>{POS_DISC_OPEN=false;paintPos();};
  const discApply=host.querySelector('#pos-disc-apply');if(discApply)discApply.onclick=()=>{const type=host.querySelector('#pos-disc-type').value,value=Number(host.querySelector('#pos-disc-value').value),reason=host.querySelector('#pos-disc-reason').value.trim();
    if(!Number.isInteger(value)||value<1||(type==='percent'&&value>100)){toast(type==='percent'?'折扣％須為 1–100':'折抵金額須為正整數');return;}
    if(type==='amount'&&value>subtotal){toast('折抵金額不可超過小計');return;}
    if(!reason){toast('請填寫折扣原因');host.querySelector('#pos-disc-reason').focus();return;}
    POS_DISCOUNT={type,value,reason};POS_DISC_OPEN=false;paintPos();};
  const recv=host.querySelector('#pos-received');if(recv){recv.oninput=()=>{POS_RECEIVED=recv.value.replace(/\D/g,'');const r=POS_RECEIVED===''?null:Number(POS_RECEIVED);const ok=r!=null&&r>=cashDue;const txt=ok?'NT$'+num(r-cashDue):'—';const has=ok&&r>cashDue;host.querySelectorAll('.pos-change,.pos-dock-change').forEach(ch=>{const b=ch.querySelector('b');if(b)b.textContent=txt;ch.classList.toggle('has',has);});};}
  host.querySelectorAll('[data-received]').forEach(b=>b.onclick=()=>{POS_RECEIVED=String(b.dataset.received);paintPos();});
  // 混合付款：打字時只更新「還差」，不重畫（重畫會把正在打的數字弄掉）；離開欄位或按「餘額」才重畫（現金那筆變動會影響找零區）
  const splitLeftEl=host.querySelector('#pos-split-left');
  host.querySelectorAll('[data-split]').forEach(i=>{i.oninput=()=>{POS_SPLIT[i.dataset.split]=Number(i.value.replace(/\D/g,''))||0;const left=total-Object.values(POS_SPLIT).reduce((a,n)=>a+Math.max(0,n),0);if(splitLeftEl){splitLeftEl.textContent=left?'NT$'+num(Math.abs(left)):'✓';splitLeftEl.previousElementSibling.textContent=left>0?'還差':left<0?'超收':'合計正確';splitLeftEl.parentElement.classList.toggle('ok',left===0);}};i.onchange=()=>paintPos();});
  host.querySelectorAll('[data-split-rest]').forEach(b=>b.onclick=()=>{const code=b.dataset.splitRest;const others=Object.entries(POS_SPLIT).filter(([c])=>c!==code).reduce((a,[,n])=>a+Math.max(0,n),0);POS_SPLIT[code]=Math.max(0,total-others);paintPos();});
  updateInvoiceFields(host);
  host.querySelectorAll('input[name=pos-invoice]').forEach(r=>r.onchange=()=>{POS_INVOICE.mode=r.checked?r.value:POS_INVOICE.mode;syncInvoiceBadge(host);updateInvoiceFields(host);});
  const ubnIn=host.querySelector('.pos-invoice [name=buyer_ubn]'),ubnOut=host.querySelector('#pos-ubn-result');
  host.querySelectorAll('.pos-invoice [name=buyer_ubn],.pos-invoice [name=carrier_num],.pos-invoice [name=love_code],.pos-invoice [name=comment]').forEach(i=>i.addEventListener?.('input',()=>{POS_INV_VALS[i.name]=i.value;}));
  if(ubnIn?.addEventListener&&ubnOut){let seq=0;const keepUbn=()=>{POS_INV_VALS.ubn_name=ubnOut.dataset.name||'';POS_INV_VALS.ubn_state=ubnOut.dataset.state||'';POS_INV_VALS.ubn_text=ubnOut.textContent;};ubnIn.addEventListener('input',async()=>{
    const v=ubnIn.value.replace(/\D/g,'');ubnOut.dataset.name='';ubnOut.dataset.state='';ubnOut.textContent='';keepUbn();
    if(v.length!==8)return;
    const my=++seq;ubnOut.textContent='查詢中…';
    let out=null;try{out=await api('/admin/orders/company-lookup/'+v);}catch{}
    if(my!==seq||(POS_INV_VALS.buyer_ubn||'').replace(/\D/g,'')!==v)return;
    // 查詢期間面板可能被重畫：寫回目前畫面上的那一格
    const o=host.querySelector('#pos-ubn-result')||ubnOut;
    if(out?.found){o.dataset.name=out.name;o.dataset.state='ok';o.textContent=out.name+(out.status&&!/核准|營業中/.test(out.status)?'（'+out.status+'）':'');}
    else{o.dataset.state='warn';o.textContent=out?.error?'暫時查不到抬頭，仍可開立':'查無此統編的公司抬頭，請與客人確認；仍可開立';}
    POS_INV_VALS.ubn_name=o.dataset.name||'';POS_INV_VALS.ubn_state=o.dataset.state||'';POS_INV_VALS.ubn_text=o.textContent;
  });}
  const invScan=host.querySelector('#pos-invoice-scan');
  // 手機載具：點選或按「掃描」都直接跳全螢幕相機；掃到填回欄位（自然人憑證仍手打）
  // 掃描期間背景輪詢可能整區重繪，回填時要重新抓欄位，不能用開窗前抓的舊節點
  const openCarrierScan=async()=>{const raw=await scanMobileCarrier(host.querySelector('.pos-invoice [name=carrier_num]')?.value||'');const carrierIn=host.querySelector('.pos-invoice [name=carrier_num]');if(raw!==null){POS_INV_VALS.carrier_num=raw;if(carrierIn)carrierIn.value=raw;}};
  if(invScan)invScan.onclick=openCarrierScan;
  const mobileRadio=host.querySelector('input[name=pos-invoice][value=mobile]');
  mobileRadio?.addEventListener?.('change',()=>{if(mobileRadio.checked&&!MOBILE_CARRIER_RE.test((host.querySelector('.pos-invoice [name=carrier_num]')?.value||'').trim().toUpperCase()))openCarrierScan();});
  // 平均分攤：人數用數字鍵盤選（2–20）；進入分攤時全桌一起算、不勾選品項、不套折扣
  const aaOpen=host.querySelector('#pos-aa-open');if(aaOpen)aaOpen.onclick=async()=>{if(aaOpen.disabled)return;const raw=await pickAmount({title:'平均分攤：幾個人？',hint:'全桌金額平均分，一人一張單、各自選付款方式',presets:[2,3,4,5,6],min:2,max:20,unit:'',initial:''});if(raw===null)return;const n=Number(raw);if(!Number.isInteger(n)||n<2||n>20){toast('分攤人數須為 2–20 人');return;}startAA(n);paintPos();};
  const aaClear=host.querySelector('#pos-aa-clear');if(aaClear)aaClear.onclick=()=>{POS_AA=null;POS_RECEIVED='';POS_SPLIT={};paintPos();toast(cur.lines.some(l=>l.credit_of)?'已離開分攤模式；前面已收的款仍記在桌上，最後結帳會自動抵扣':'已取消平均分攤');};
  const linepayBtn=host.querySelector('#pos-linepay-api');
  if(linepayBtn)linepayBtn.onclick=()=>ensureOperator(()=>linepayCheckout(cur,host));
  const linepayCancel=host.querySelector('#pos-linepay-cancel');
  if(linepayCancel)linepayCancel.onclick=()=>ensureOperator(()=>runCheckoutOnce(cur.id,async()=>{try{await api('/admin/orders/sessions/'+cur.id+'/linepay/cancel',{method:'POST',body:{attempt_id:cur.linepay.id}});cur.linepay=null;}catch(e){toast(e.message);}}).finally(()=>loadPos()));
  if(cur.linepay)host.querySelector('#pos-checkout').disabled=true;
  /* 平板滑動操作（參考 iChef）：收款鈕向右滑＝收款；品項列左滑＝展開「⋯」更多操作、右滑收合。點擊照舊可用 */
  bindSwipe(host.querySelector('#pos-checkout'),{dir:'right',min:120,follow:true,onSwipe:el=>{if(el.disabled)return;el._prog=1;try{el.click();}finally{el._prog=0;}}});
  host.querySelectorAll('.pos-lines tbody tr').forEach(tr=>{const d=tr.querySelector('details.ops-more');if(!d)return;bindSwipe(tr,{dir:'both',min:70,follow:true,onSwipe:(el,dx)=>{d.open=dx<0;}});});
  host.querySelector('#pos-checkout').onclick=async()=>{
    const method=POS_METHOD;
    if(!picked.length)return;
    if(aa&&!aa.last){
      // 前 N−1 人：每人收 each，開一張「平均分攤 第 k／N 人」預收單，桌上留抵扣行；混合付款與現金找零照一般規則
      if(aa.each<1){toast('每人金額不足 NT$1，請減少人數');return;}
      const payments=mixed?splitList.filter(p=>p.amount>0).map(p=>({method:p.code,amount:p.amount})):undefined;
      if(mixed&&(!payments.length||splitLeft!==0)){toast(splitLeft>0?`混合付款還差 NT$${num(splitLeft)}`:splitLeft<0?`混合付款超收 NT$${num(-splitLeft)}`:'請填各付款方式的金額');return;}
      if(mixed&&payments.length===1){toast('只有一種付款方式，請直接選那個方式');return;}
      const rec=cash&&POS_RECEIVED!==''?Number(POS_RECEIVED):undefined;
      if(rec!==undefined&&rec<cashDue){toast('實收不能少於應收的現金');return;}
      if(!await posConfirm(`${cur.takeout?'外帶':'桌號'} ${cur.table}：平均分攤第 ${aa.index}／${aa.people} 人，收 NT$${num(aa.each)}（${mixed?'混合付款':payMethodLabel(method)}${POS_INVOICE.mode?'，'+INV_LABEL[POS_INVOICE.mode]+'發票':''}）？`,{ok:'收這一人'}))return;
      const zh=`平均分攤 第 ${aa.index}／${aa.people} 人`;
      return ensureOperator(()=>runCheckoutOnce(cur.id,async()=>{const checkout=host.querySelector('#pos-checkout');checkout.disabled=true;try{return await opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/checkout',{method:'POST',body:{prepay:aa.each,split:{people:aa.people,index:aa.index},method,payments,invoice:invoiceBody(host),received:rec,operator_id:OPERATOR?.id}}),async out=>{const order={id:out.order_id,order_id:out.order_id,table_no:cur.table,items:[{zh,qty:1,price:out.amount}],amount:out.amount,invoice:out.invoice,paid_at:new Date().toISOString(),payer:{method,payments:out.payments,prepay:true,received:rec,change:out.change}};const nextIdx=aa.index+1;const text=`已收第 ${aa.index}／${aa.people} 人 NT$${num(out.amount)}${out.change?`，找零 NT$${num(out.change)}`:''}${out.invoice?.status==='issued'?`，發票 ${out.invoice.number||'已開立'}`:''}；${nextIdx>=aa.people?`最後一人收 NT$${num(out.remaining)}`:`第 ${nextIdx} 人請接著收`}`;checkoutHardware({kind:'checkout',order_id:out.order_id,method:out.method||method,amount:out.amount,payments:out.payments},order,text);return text;},()=>{POS_SPLIT={};POS_RECEIVED='';POS_INV_VALS={};POS_INVOICE.mode='paper';return reload();});}finally{checkout.disabled=false;}}));
    }
    const payments=mixed?splitList.filter(p=>p.amount>0).map(p=>({method:p.code,amount:p.amount})):undefined;
    if(mixed&&(!payments.length||splitLeft!==0)){toast(splitLeft>0?`混合付款還差 NT$${num(splitLeft)}`:splitLeft<0?`混合付款超收 NT$${num(-splitLeft)}`:'請填各付款方式的金額');return;}
    if(mixed&&payments.length===1){toast('只有一種付款方式，請直接選那個方式');return;}
    const rec=cash&&POS_RECEIVED!==''?Number(POS_RECEIVED):undefined;
    if(rec!==undefined&&rec<cashDue){toast('實收不能少於應收的現金');return;}
    // 收款前先確認餐點都上齊了；還沒標「已出餐」的品項會列出來提醒
    const unserved=picked.filter(l=>!l.credit_of&&!l.served_at);
    if(!await posConfirm(`${cur.takeout?'外帶':'桌號'} ${cur.table}：${aa?`平均分攤最後一人，收剩餘 NT$${num(total)}。`:''}餐點都到齊了嗎？${unserved.length?`\n尚未出餐：${unserved.map(l=>`${l.zh}×${POS_QTY[l.line]||l.qty}`).join('、')}`:''}`,{ok:'已到齊，收款'}))return;
    // 收款前一定要先認人（沒選過操作人員會先跳鍵盤），讓每一筆單都記得是誰經手
    return ensureOperator(()=>runCheckoutOnce(cur.id,async()=>{const checkout=host.querySelector('#pos-checkout');checkout.disabled=true;try{const member_id=POS_YAN.id||undefined;const member_phone=member_id?undefined:((host.querySelector('#pos-yan-phone')?.value||POS_YAN.phone||'').trim()||undefined);return await opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/checkout',{method:'POST',body:{method,payments,member:POS_MEMBER,member_id,member_phone,redeem_lines:(member_id&&POS_YAN.redeemSet?.size)?picked.filter(l=>POS_YAN.redeemSet.has(l.line)).map(l=>l.part_of||l.line):undefined,redeem_lines:(member_id&&POS_YAN.redeemSet?.size)?picked.filter(l=>POS_YAN.redeemSet.has(l.line)).map(l=>l.part_of||l.line):undefined,lines:POS_PICK?[...POS_PICK]:Object.keys(POS_QTY).length?cur.lines.map(l=>l.line):[],quantities:Object.keys(POS_QTY).length?{...POS_QTY}:undefined,invoice:invoiceBody(host),discount:POS_DISCOUNT||undefined,service_waive:POS_SVC_WAIVE||undefined,received:rec,operator_id:OPERATOR?.id}}),async out=>{const order={id:out.order_id,order_id:out.order_id,table_no:cur.table,items:picked.map(l=>{const rs=POS_YAN.redeemSet?.has(l.line)&&priceOf(l)===0&&!l.comp_reason;const it=rs?(MENU_DOC?.items||[]).find(x=>x.id===l.item_id):null;return rs&&it?{...l,price:0,regular_price:l.price,redeem_points:it.points*l.qty}:{...l,price:priceOf(l)};}),amount:out.amount,invoice:out.invoice,paid_at:new Date().toISOString(),payer:{method,payments:out.payments,member:POS_MEMBER,discount:out.discount||POS_DISCOUNT,service_charge:out.service_charge,received:rec,change:out.change}};const text=`已收款 NT$${num(out.amount)}${out.change?`，找零 NT$${num(out.change)}`:''}${out.member_created?'，已新增會員':''}${out.yan?.earned?`，累積 ${out.yan.earned} 點（餘 ${out.yan.balance}）`:''}${out.invoice?.status==='issued'?`，發票 ${out.invoice.number||'已開立'}`:out.invoice?.status==='failed'?`，發票開立失敗可補開` : ''}${out.remaining?`，這桌還有 NT$${num(out.remaining)} 未結`:out.closed?'，已自動清桌':'，這桌已結清'}${out.warning?`。${out.warning}`:''}`;checkoutHardware({kind:'checkout',order_id:out.order_id,method:out.method||method,amount:out.amount,payments:out.payments},order,text);return text;},()=>{POS_PICK=null;POS_QTY={};POS_SPLIT={};POS_MEMBER=false;POS_YAN={phone:'',name:'',balance:null};POS_DISCOUNT=null;POS_SVC_WAIVE=null;POS_SVC_OPEN=false;POS_RECEIVED='';POS_INV_VALS={};POS_INVOICE.mode='paper';POS_AA=null;return reload();});}finally{checkout.disabled=false;}}));
  };
  // 結帳前直接從這桌列印：出餐單＝整桌品項；收據明細＝目前帳單（含會員價／折扣試算，標「尚未結帳」）。不開錢櫃、不影響帳務。
  const tableTicket=()=>{const t=posTotals({...cur,lines:cur.lines.filter(l=>!l.credit_of)});const items=cur.lines.filter(l=>!l.credit_of&&!l.cancelled).map(l=>({...l,price:t.priceOf(l)}));const gross=items.reduce((a,l)=>a+l.price*l.qty,0);const disc=POS_DISCOUNT?(POS_DISCOUNT.type==='percent'?Math.round(gross*POS_DISCOUNT.value/100):Math.min(gross,POS_DISCOUNT.value)):0;const sv=MenuLib.serviceCharge?MenuLib.serviceCharge(items,{takeout:cur.takeout,discount:disc}):null,svc=sv?(POS_SVC_WAIVE?{...sv,would:sv.amount,amount:0,waived:true,reason:POS_SVC_WAIVE.reason}:sv):null;return {id:cur.id,table_no:cur.table,placed_at:new Date().toISOString(),amount:gross-disc+(svc?svc.amount:0),items,preview:true,payer:{...(disc?{discount:{type:POS_DISCOUNT.type,value:POS_DISCOUNT.value,reason:POS_DISCOUNT.reason,amount:disc}}:{}),...(svc?{service_charge:svc}:{})}};};
  const pr=host.querySelector('#pos-print-receipt');if(pr)pr.onclick=async()=>{if(pr.disabled)return;pr.disabled=true;try{await printReceipt(tableTicket());}finally{pr.disabled=false;}};
  // 列印出餐單＝送單＋印：還有沒送出的品項就先送單（進出餐看板、自動出單只印新送的那張）；全都送過了就整桌重印一張
  const place=host.querySelector('#pos-place');if(place)place.onclick=async()=>{if(place.disabled)return;place.disabled=true;try{
    if(cur.lines.some(l=>!l.placed_at))await opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/place',{method:'POST',body:{}}),async()=>{await pollKitchenPrinting();return starReady()?'已送出點餐並列印出餐單':'已送出點餐，出餐單由連接印表機的 Star Browser 自動列印';},reload);
    else await printOrder(tableTicket());
  }finally{place.disabled=false;}};
  // 來客人數：客人端不填，統一由現場人員在這裡攤開 1–20 點選，點一下就存
  const pty=host.querySelector('#pos-party');if(pty)pty.onclick=()=>{
    const ov=document.createElement('div');ov.className='pos-move-ov';
    ov.innerHTML=`<div class="pos-move-box" role="dialog" aria-label="來客人數"><h3>${esc(cur.table)} 來客人數</h3><div class="pos-move-grid pos-party-grid">${Array.from({length:20},(_,i)=>i+1).map(n=>`<button type="button" class="pos-move-opt ${n===Number(cur.party_size)?'on':''}" data-party="${n}"><b>${n}</b><small>位</small></button>`).join('')}</div><div class="pos-move-foot"><span></span><button type="button" class="btn btn--ghost" data-cancel>取消</button></div></div>`;
    const done=()=>ov.remove();
    ov.onclick=e=>{if(e.target===ov)done();};
    ov.querySelector('[data-cancel]').onclick=done;
    ov.querySelectorAll('[data-party]').forEach(b=>b.onclick=()=>{done();opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/party',{method:'POST',body:{party_size:Number(b.dataset.party)}}),out=>`${cur.table} 已改為 ${out.party_size} 位`,reload);});
    document.body.appendChild(ov);
  };
  const mv=host.querySelector('#pos-move');if(mv)mv.onclick=()=>{
    const doMove=table=>opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/move',{method:'POST',body:{table_no:table}}),out=>out.merged?`已併到 ${out.table}`:`已換到 ${out.table}`,out=>{POS_TABLE=out.table;POS_PICK=null;return reload();});
    // 用選的：固定桌號＋目前已開的加開桌，點一下就換桌（目標桌已開＝併桌）；真的要別的桌號才用「其他桌號」打字
    const names=[...DEFAULT_TABLES,...sessions.filter(s=>!s.takeout&&!DEFAULT_TABLES.includes(s.table)).map(s=>s.table)].filter(t=>t!==cur.table);
    const ov=document.createElement('div');ov.className='pos-move-ov';
    ov.innerHTML=`<div class="pos-move-box" role="dialog" aria-label="${cur.takeout?'轉內用':'換桌／併桌'}"><h3>${cur.takeout?`外帶 ${esc(cur.table)} 轉內用，`:`${esc(cur.table)} `}要去哪一桌？${tipIcon(cur.takeout?'點空桌＝改成這桌內用；點已開的桌＝併進那桌。也可以在桌況直接把外帶單拖到桌位。':'空桌＝換桌（整桌搬過去）；已開的桌＝併桌（兩桌的品項合在一起）；「移到外帶」＝改成外帶單，自動給 W 號。也可以在桌況直接把單子拖到右邊外帶區。')}</h3><div class="pos-move-grid">${names.map(t=>{const o=byTable.get(t);return `<button type="button" class="pos-move-opt ${o?'busy':''}" data-to="${esc(t)}"><b>${esc(t)}</b><small>${o?'併桌':'換桌'}</small></button>`;}).join('')}</div><div class="pos-move-foot"><span>${cur.takeout?'':'<button type="button" class="btn btn--solid" data-takeout>移到外帶</button> '}<button type="button" class="btn btn--ghost" data-other>其他桌號…</button></span><button type="button" class="btn btn--ghost" data-cancel>取消</button></div></div>`;
    const done=()=>ov.remove();
    const tk=ov.querySelector('[data-takeout]');if(tk)tk.onclick=()=>{done();moveToTakeout(cur.id,out=>{POS_TABLE=out.table;POS_PICK=null;return reload();});};
    ov.onclick=e=>{if(e.target===ov)done();};
    ov.querySelector('[data-cancel]').onclick=done;
    ov.querySelector('[data-other]').onclick=async()=>{done();const table=await pickTableNo({title:`${cur.table} 換到哪一桌？`,hint:'目標桌已開著會併桌',exclude:[cur.table]});if(table)doMove(table);};
    ov.querySelectorAll('[data-to]').forEach(b=>b.onclick=()=>{done();doMove(b.dataset.to);});
    document.body.appendChild(ov);
  };
  host.querySelector('#pos-close').onclick=async()=>{
    if(!await posConfirm(cur.takeout?`收掉外帶單 ${cur.table}？`:`清桌 ${cur.table}？未取餐的單會標記已取餐，下一組客人掃碼會開新的一桌。`,{ok:cur.takeout?'收掉':'清桌',danger:true}))return;
    try{await api('/admin/orders/sessions/'+cur.id+'/close',{method:'POST',body:{}});toast('已清桌');POS_TABLE='';await reload();}
    catch(e){
      // 有未結帳品項：子帳號要先結帳或逐項作廢；言文字管理員可強制清桌（作廢全部未結）
      if(e.status===409&&DATA&&!DATA.brands&&await posConfirm(e.message+'\n以言文字管理員身分強制清桌並作廢這些品項？',{ok:'強制清桌',danger:true})){try{await api('/admin/orders/sessions/'+cur.id+'/close',{method:'POST',body:{force:true}});toast('已強制清桌');POS_TABLE='';await reload();}catch(e2){toast(e2.message);}}
      else toast(e.message);
    }
  };
  bindOrderButtons(host,d.orders,reload);
}

/* 查單：某營業日全部的單（含作廢），桌號／金額／發票號碼搜尋；重印收據明細、出餐單、補開發票、作廢（限當個營業日） */
/* POS 紀錄分頁：依營業日列出現場操作（人員、動作、內容）；可用關鍵字篩選
   只有店長能看：進分頁先輸入店長的 4 位數識別碼。識別碼只留在記憶體（LOGS_PIN），離開分頁即清空，下次進來要重輸 */
let LOGS_DAY='',LOGS_Q='',LOGS_PIN='',LOGS_PAD='',LOGS_MSG='';
function paintLogsGate(host){
  const dots=[0,1,2,3].map(i=>`<i class="${i<LOGS_PAD.length?'on':''}"></i>`).join('');
  const keys=['1','2','3','4','5','6','7','8','9','⌫','0','清除'].map(k=>`<button type="button" class="clock-key" data-key="${esc(k)}">${esc(k)}</button>`).join('');
  host.innerHTML=`<div class="ops-head"><h2>紀錄</h2></div><p class="hint">只有店長可以查看，請輸入店長識別碼。</p>
    <div class="clock-pad"><div class="clock-pin" aria-label="店長識別碼">${dots}</div><div class="clock-keys">${keys}</div></div>
    ${LOGS_MSG?`<div class="clock-msg bad" role="status">${esc(LOGS_MSG)}</div>`:''}`;
  host.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;if(k==='⌫')LOGS_PAD=LOGS_PAD.slice(0,-1);else if(k==='清除')LOGS_PAD='';else if(LOGS_PAD.length<4)LOGS_PAD+=k;LOGS_MSG='';
    if(LOGS_PAD.length===4){LOGS_PIN=LOGS_PAD;LOGS_PAD='';loadLogs();}else paintLogsGate(host);});
}
async function loadLogs(){
  const host=document.getElementById('logs-body');if(!host)return;
  if(!LOGS_PIN){paintLogsGate(host);return;}
  host.innerHTML='<div class="ops-head"><h2>紀錄</h2></div><p class="hint">載入中…</p>';
  let d;
  try{d=await api('/admin/pos-logs?limit=500'+(LOGS_DAY?'&day='+encodeURIComponent(LOGS_DAY):'')+(LOGS_Q?'&q='+encodeURIComponent(LOGS_Q):'')+(SCOPE?'&venue='+SCOPE:''),{headers:{'X-Manager-Pin':LOGS_PIN}});}
  catch(e){if(e.status===403){LOGS_PIN='';LOGS_MSG=e.message;paintLogsGate(host);return;}
    host.innerHTML=`<div class="ops-head"><h2>紀錄</h2></div><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  const rows=(d.logs||[]).map(l=>`<tr><td class="a-mono">${esc(clockText(l.created_at))}</td><td>${esc(l.operator_name||l.actor||'')}</td><td><b>${esc(l.action)}</b></td><td>${esc(l.detail||'')}</td></tr>`).join('')||'<tr><td colspan="4" class="a-empty">這個營業日沒有紀錄</td></tr>';
  host.innerHTML=`<div class="ops-head"><h2>紀錄</h2></div><div class="a-toolbar"><label>營業日 <input type="date" id="logs-day" value="${esc(d.day||'')}"></label><input type="search" id="logs-q" placeholder="人員、動作或內容" value="${esc(LOGS_Q)}" aria-label="篩選紀錄"><button type="button" class="btn btn--ghost btn-sm" id="logs-go">查詢</button><span class="hint hint--tight">${(d.logs||[]).length} 筆</span></div><div class="a-wrap2"><table class="a-tbl"><thead><tr><th>時間</th><th>人員</th><th>動作</th><th>內容</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const runLogs=()=>{LOGS_DAY=host.querySelector('#logs-day').value;LOGS_Q=host.querySelector('#logs-q').value.trim();loadLogs();};
  host.querySelector('#logs-go').onclick=runLogs;host.querySelector('#logs-day').onchange=runLogs;host.querySelector('#logs-q').onkeydown=e=>{if(e.key==='Enter')runLogs();};
}
async function loadHistory(){
  const host=document.getElementById('history-body');if(!host)return;
  if(!HIST_DAY)HIST_DAY=MenuLib.businessDay();
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<h2>查單</h2><p class="hint">載入中…</p>';}
  let d;try{d=await api(`/admin/orders/history?day=${encodeURIComponent(HIST_DAY)}&q=${encodeURIComponent(HIST_Q)}`+(SCOPE?'&venue='+SCOPE:''));}catch(e){host.innerHTML=`<h2>查單</h2><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  const today=MenuLib.businessDay();
  // 查單＝確認訂單狀態：一單一列的摘要表（時間／桌號／單號／品項／付款／發票／金額／狀態），點一列才展開詳情與操作鍵；展開狀態記在 HIST_OPEN，操作後重載仍保持展開
  const histState=o=>{const p=o.payer||{};if(o.status==='void')return `<span class="pill pill-bad">已作廢</span>`;if(p.prepay)return `<span class="pill pill-wait">部分付款</span>`;return `<span class="pill pill-ok">已結帳</span>`;};
  const histInvShort=o=>{const inv=o.invoice||{};if(inv.status==='failed')return '<span class="pill pill-bad">發票失敗</span>';if(inv.requested&&!['issued','void'].includes(inv.status))return '<span class="pill pill-wait">待補開</span>';if(inv.status==='issued')return `<span class="a-mono">${esc(inv.number||'已開立')}</span>`;if(inv.status==='void')return '<span class="hint hint--tight">已作廢</span>';return '<span class="hint hint--tight">未開</span>';};
  const histLine=(l,multiBy)=>{const tags=specParts(l).map(t=>`<span class="ops-spec ops-spec-${t.kind} ops-spec-${t.tone}">${t.kind==='custom'?'※ ':''}${esc(t.text)}</span>`).join('');const flag=l.cancelled?'已取消':l.comp_reason?'贈送':l.redeem_points>0?'點數兌換':'';const sub=Number.isFinite(Number(l.price))?(l.cancelled?`<s>${num(Number(l.price)*l.qty)}</s>`:num(Number(l.price)*l.qty)):'';return `<li class="hist-line${l.cancelled?' is-off':''}"><span class="hist-qty${l.qty>1?' many':''}">×${l.qty}</span><span class="hist-name"><b>${esc(l.zh)}</b>${flag?` <span class="pill pill-draft">${flag}</span>`:''}${partsOf(l).length?partsHtml(l):''}${tags?`<span class="ops-specs">${tags}</span>`:''}${multiBy&&l.by?`<span class="hint hint--tight">由 ${esc(l.by)} 點</span>`:''}</span><span class="hist-sub">${sub}</span></li>`;};
  const histActions=(o,allowVoid)=>{const canPay=allowVoid&&o.status!=='void'&&!o.payer?.prepay&&!o.tappay?.rec_trade_id;return `<div class="hist-actions"><button class="btn btn--solid btn-sm" data-receipt="${esc(o.id)}">補印收據明細</button>${invoicePrintable(o.invoice)?`<button class="btn btn--ghost btn-sm" data-invoice-print="${esc(o.id)}">補印發票</button>`:''}${o.status==='void'?'':`<button class="btn btn--ghost btn-sm" data-print="${esc(o.id)}">補印出餐單</button>`}${canPay?`<button class="btn btn--ghost btn-sm" data-paymethod="${esc(o.id)}">改付款方式</button>`:''}${o.status!=='void'&&allowVoid?`<button class="btn btn--ghost btn--danger btn-sm" data-void="${esc(o.id)}">作廢</button>`:''}</div>`;};
  const rows=d.orders.map(o=>{
    const lines=(o.items||[]).filter(l=>!l.prepay&&!l.credit_of);
    const live=lines.filter(l=>!l.cancelled);
    const bys=[...new Set(lines.map(l=>l.by).filter(Boolean))];
    const red=redeemOf(o),p=o.payer||{};
    const flow=o.status==='void'?'':ORDER_STATE[o.status]?`出餐：${ORDER_STATE[o.status]}`:'';
    const meta=[bys.length?`點餐 ${bys.map(esc).join('、')}`:'',p.operator_name?`收銀 ${esc(p.operator_name)}`:'',flow].filter(Boolean).join(' · ');
    const summary=live.length?live.slice(0,2).map(l=>`${esc(l.zh)}×${l.qty}`).join('、')+(live.length>2?` 等 ${live.length} 項`:''):'（無品項）';
    const open=HIST_OPEN.has(o.id),id=esc(o.id);
    return `<tr class="hist-row${o.status==='void'?' is-void':''}${open?' is-open':''}" data-hist-row="${id}" tabindex="0" role="button" aria-expanded="${open}">
      <td class="hist-time a-mono" title="${esc(applicationTime(o.paid_at))}">${esc(clockText(o.paid_at))}</td>
      <td class="hist-table">${isTakeoutNo(o.table_no)?'<small>外帶</small>':''}<b>${esc(o.table_no)}</b></td>
      <td class="hist-id a-mono">#${esc(String(o.id).slice(-4).toUpperCase())}</td>
      <td class="hist-items">${summary}</td>
      <td class="hist-paycol">${esc(payText(o))}</td>
      <td class="hist-invcol">${histInvShort(o)}</td>
      <td class="hist-amount">${num(o.amount)}</td>
      <td class="hist-state">${histState(o)}<span class="hist-chev" aria-hidden="true"></span></td></tr>
      <tr class="hist-detail" data-hist-detail="${id}"${open?'':' hidden'}><td colspan="8"><div class="hist-card${o.status==='void'?' is-void':''}">
      <ul class="hist-lines">${lines.map(l=>histLine(l,bys.length>1)).join('')||'<li class="hint">（無品項）</li>'}</ul>
      ${p.discount?`<div class="hint hint--tight">折扣 ${esc(discountText(p.discount))}</div>`:''}${red.points?`<div class="hint hint--tight">點數兌換 ${num(red.points)} 點　折抵 −${num(red.value)}</div>`:''}
      ${o.status==='void'?`<div class="hist-void">作廢原因：${esc(o.void_reason||'未填')}${o.voided_by?' · '+esc(o.voided_by):''}</div>`:''}
      <div class="hist-pay"><span>${esc(payText(o))}${p.member?' · 聚落價':''}${p.received!=null?`　實收 ${num(p.received)}　找零 ${num(p.change)}`:''}</span><span class="hist-inv">${invoiceHtml(o)}</span></div>
      <div class="hint hint--tight hist-meta">${[esc(applicationTime(o.paid_at)),`單號 ${id}`,meta].filter(Boolean).join(' · ')}</div>
      ${histActions(o,MenuLib.businessDay(o.paid_at)===today)}</div></td></tr>`;}).join('');
  const table=rows?`<table class="hist-sheet"><thead><tr><th>時間</th><th>桌號</th><th>單號</th><th>品項</th><th>付款</th><th>發票</th><th class="hist-amount">金額</th><th>狀態</th></tr></thead><tbody>${rows}</tbody></table>`:'<p class="a-empty">這天沒有符合的單</p>';
  host.innerHTML=`<div class="ops-head"><h2>查單</h2>${opsHelp('確認每一筆單的狀態：一單一列，點一下展開品項與操作（補印收據明細、補開發票、改付款方式、作廢退款；只能改／作廢當個營業日的單，作廢後品項退回該桌未結帳）。')}</div>
    <div class="a-toolbar"><label>營業日 <input type="date" id="hist-day" value="${esc(d.day)}"></label><button class="btn btn--ghost btn-sm" id="hist-today">今天</button><input id="hist-q" placeholder="桌號／金額／發票號碼" value="${esc(HIST_Q)}" style="min-width:200px" aria-label="搜尋"><button class="btn btn--solid btn-sm" id="hist-go">搜尋</button><button type="button" class="btn btn--ghost btn-sm" id="hist-scan">掃發票找單／作廢</button><span class="hint hint--end">${num(d.count)} 單</span></div>
    <div class="hist-list">${table}</div>`;
  const toggle=tr=>{const id=tr.dataset.histRow,det=host.querySelector(`[data-hist-detail="${CSS.escape(id)}"]`);const open=!HIST_OPEN.has(id);if(open)HIST_OPEN.add(id);else HIST_OPEN.delete(id);tr.classList.toggle('is-open',open);tr.setAttribute('aria-expanded',String(open));if(det)det.hidden=!open;};
  host.querySelectorAll('[data-hist-row]').forEach(tr=>{tr.onclick=()=>toggle(tr);tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(tr);}};});
  host.querySelector('#hist-day').onchange=e=>{HIST_OPEN.clear();HIST_DAY=e.target.value||MenuLib.businessDay();loadHistory();};
  host.querySelector('#hist-today').onclick=()=>{HIST_DAY=MenuLib.businessDay();loadHistory();};
  const search=()=>{const raw=host.querySelector('#hist-q').value.trim();HIST_Q=PosInvoiceScan.parse(raw)||raw;loadHistory();};
  host.querySelector('#hist-go').onclick=search;
  host.querySelector('#hist-scan').onclick=()=>PosInvoiceScan.open({onScan:number=>{HIST_Q=number;HIST_DAY=MenuLib.businessDay();loadHistory();}});
  host.querySelector('#hist-q').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search();}};
  bindOrderButtons(host,d.orders,loadHistory);
}


/* 不可訂位設定：關掉客人端（/reserve、會員 App）某些時段。每週固定＋特定日期（含公休）；櫃檯登記不受限。
 * 資料仍存「開放時段」（site_content.reservation_hours），畫面上一律以「不可訂位」呈現與點選 */
function hoursPanel(){
  const H=RESV_HOURS;if(!H)return RESV_HOURS_ERR?`<p class="hint">不可訂位設定載入失敗：${esc(RESV_HOURS_ERR)}</p>`:'';
  const WD=['日','一','二','三','四','五','六'],ALL=H.all||[];
  const dates=Object.keys(H.dates||{}).sort();
  const blocked=l=>ALL.filter(t=>!l.includes(t));
  const range=b=>{const r=[];let s=null,p=-2;b.forEach(t=>{const i=ALL.indexOf(t);if(i!==p+1){if(s)r.push([s,ALL[p]]);s=t;}p=i;});if(s)r.push([s,ALL[p]]);return r.map(([x,y])=>x===y?x:`${x}–${y}`).join('、');};
  const brief=l=>{const b=blocked(l);return b.length===0?'無限制':b.length===ALL.length?'全天':range(b);};
  const weekRows=WD.map((n,i)=>{const l=H.weekly[i];return `<button type="button" class="rh-week${l?' is-off':''}" data-rh-edit="w${i}"><b>週${n}</b><small>${esc(l?brief(l):'無限制')}</small></button>`;}).join('');
  return `<div class="resv-panel" id="resv-hours"${RESV_HOURS_OPEN?'':' hidden'}>
    <p class="hint">點選的時段客人就不能從網站／會員 App 訂位；櫃檯登記不受限。特定日期的設定優先於每週設定；沒設定＝全部可訂。</p>
    <p class="rh-h">特定日期<span class="hint hint--tight">公休、包場、活動</span></p>
    <div class="rh-add"><label>日期<input type="date" id="rh-newdate" min="${esc(todayTaipei())}"></label><button type="button" class="btn btn--ghost" id="rh-adddate">設定這天</button></div>
    <p class="rh-h">每週固定</p>
    <div class="rh-weeks">${weekRows}</div></div>`;
}
/* 不可訂位時段一覽：不用展開設定就看得到（特定日期＋每週限制），點一下編輯、× 移除該日期 */
function hoursStrip(){
  const H=RESV_HOURS;if(!H)return '';
  const WD=['日','一','二','三','四','五','六'],ALL=H.all||[];
  const blocked=l=>ALL.filter(t=>!l.includes(t));
  const range=b=>{const r=[];let s=null,p=-2;b.forEach(t=>{const i=ALL.indexOf(t);if(i!==p+1){if(s)r.push([s,ALL[p]]);s=t;}p=i;});if(s)r.push([s,ALL[p]]);return r.map(([x,y])=>x===y?x:`${x}–${y}`).join('、');};
  const brief=l=>{const b=blocked(l);return b.length===ALL.length?'全天不可訂位（公休）':b.length?range(b):'全部可訂（覆蓋每週設定）';};
  const today=todayTaipei();
  const dates=Object.keys(H.dates||{}).filter(k=>k>=today).sort();
  const dateRows=dates.map(k=>`<span class="rh-date${blocked(H.dates[k]).length?' is-off':''}"><button type="button" data-rh-edit="d${esc(k)}"><b>${esc(k.slice(5).replace('-','/'))}（${WD[new Date(k+'T12:00:00Z').getUTCDay()]}）${k===today?' 今天':''}</b> ${esc(brief(H.dates[k]))}</button><button type="button" class="rh-x" data-rh-del="d${esc(k)}" aria-label="移除 ${esc(k)} 的設定">×</button></span>`).join('');
  const weekRows=WD.map((n,i)=>{const l=H.weekly[i];return l&&blocked(l).length?`<span class="rh-date is-off is-week"><button type="button" data-rh-edit="w${i}"><b>每週${n}</b> ${esc(brief(l))}</button></span>`:'';}).join('');
  return `<div class="rh-strip"><div class="rh-strip-h">不可訂位時段</div><div class="rh-dates">${dateRows+weekRows||'<span class="hint hint--tight">目前沒有不可訂位時段，所有時段客人都能線上訂位。</span>'}</div></div>`;
}
function bindHoursPanel(host){
  const H=RESV_HOURS;if(!H)return;
  const ALL=H.all||[],WD=['日','一','二','三','四','五','六'];
  if(!host.querySelector('#resv-hours'))return;
  const closeRh=()=>document.querySelectorAll('.op-overlay.rh-ov').forEach(n=>n.remove());
  const save=next=>{
    const body={weekly:{...H.weekly},dates:{...H.dates}};
    next(body);
    opsThen(()=>api('/admin/reservation-hours',{method:'PUT',body}),'已更新不可訂位設定',()=>{RESV_HOURS_OPEN=true;closeRh();return loadReservations();});
  };
  const open=key=>{
    closeRh();
    const isW=key[0]==='w',id=key.slice(1);
    const openList=isW?(H.weekly[id]||ALL):(H.dates[id]||H.weekly[new Date(id+'T12:00:00Z').getUTCDay()]||ALL);
    const off=new Set(ALL.filter(t=>!openList.includes(t)));   // off＝不可訂位
    const title=isW?`每週${WD[id]}`:`${id}（${WD[new Date(id+'T12:00:00Z').getUTCDay()]}）`;
    const cafe=ALL.filter(t=>t>='08:00'&&t<'17:00'),bar=ALL.filter(t=>!(t>='08:00'&&t<'17:00'));
    const chip=t=>`<button type="button" class="rh-chip" data-t="${t}" aria-pressed="${off.has(t)}">${t}</button>`;
    const ov=document.createElement('div');ov.className='op-overlay rh-ov';
    ov.innerHTML=`<div class="op-card rh-card" role="dialog" aria-label="${esc(title)}">
      <div class="rh-card-body">
        <p class="rh-card-title"><b>${esc(title)}</b><span class="rh-legend"><i class="on"></i>不可訂位</span><span class="rh-legend"><i></i>可訂</span></p>
        <p class="hint hint--tight">點選不可訂位的時段（紅色＝不可訂位）</p>
        <div class="rh-presets"><button type="button" class="btn btn--ghost btn-sm" data-rh-set="none">全部可訂</button><button type="button" class="btn btn--ghost btn-sm" data-rh-set="all">整天不可訂（公休）</button><button type="button" class="btn btn--ghost btn-sm" data-rh-set="cafe">在咖啡不可訂</button><button type="button" class="btn btn--ghost btn-sm" data-rh-set="bar">三點水不可訂</button></div>
        <div class="rh-group"><div class="rh-group-h">在咖啡 <span>08:00–16:30</span></div><div class="rh-slots" id="rh-cafe">${cafe.map(chip).join('')}</div></div>
        <div class="rh-group"><div class="rh-group-h">三點水 <span>17:00–02:30</span></div><div class="rh-slots" id="rh-bar">${bar.map(chip).join('')}</div></div>
      </div>
      <div class="rh-card-actions"><button type="button" class="btn btn--solid" id="rh-save">儲存</button> <button type="button" class="btn btn--ghost" id="rh-cancel">取消</button> ${isW?'<button type="button" class="btn btn--ghost" id="rh-reset">改回無限制</button>':'<button type="button" class="btn btn--ghost btn--danger" id="rh-del">移除這天的設定</button>'}</div>
    </div>`;
    document.body.appendChild(ov);
    const eq=(a,fn)=>a.every(fn);
    const paint=()=>{
      ov.querySelectorAll('.rh-chip').forEach(b=>b.setAttribute('aria-pressed',off.has(b.dataset.t)));
      ov.querySelectorAll('[data-rh-set]').forEach(b=>{
        const k=b.dataset.rhSet,on=k==='none'?off.size===0:k==='all'?off.size===ALL.length:k==='cafe'?eq(cafe,t=>off.has(t))&&eq(bar,t=>!off.has(t)):eq(bar,t=>off.has(t))&&eq(cafe,t=>!off.has(t));
        b.setAttribute('aria-pressed',on);
      });
    };
    paint();
    ov.onclick=e=>{
      const c=e.target.closest('.rh-chip');if(c){const t=c.dataset.t;off.has(t)?off.delete(t):off.add(t);paint();return;}
      const st=e.target.closest('[data-rh-set]');if(st){off.clear();({all:ALL,none:[],cafe,bar})[st.dataset.rhSet].forEach(t=>off.add(t));paint();}
    };
    ov.querySelector('#rh-save').onclick=()=>save(b=>{const l=ALL.filter(t=>!off.has(t));if(isW)b.weekly[id]=l;else b.dates[id]=l;});
    ov.querySelector('#rh-cancel').onclick=closeRh;
    const rs=ov.querySelector('#rh-reset');if(rs)rs.onclick=()=>save(b=>{delete b.weekly[id];});
    const dl=ov.querySelector('#rh-del');if(dl)dl.onclick=()=>save(b=>{delete b.dates[id];});
    ov.addEventListener('keydown',e=>{if(e.key==='Escape')closeRh();});
    ov.addEventListener('click',e=>{if(e.target===ov)closeRh();});
  };
  host.querySelectorAll('[data-rh-edit]').forEach(b=>b.onclick=()=>open(b.dataset.rhEdit));
  host.querySelectorAll('[data-rh-del]').forEach(b=>b.onclick=()=>{const id=b.dataset.rhDel.slice(1);save(body=>{delete body.dates[id];});});
  host.querySelector('#rh-adddate').onclick=()=>{const v=host.querySelector('#rh-newdate').value;if(!v)return toast('請先選日期');host.querySelector('#rh-adddate').blur();open('d'+v);};
}

/* 訂位：依日期列出、確認／婉拒（留 Email 的客人會收到信）、排桌、已到／未到 */
async function loadReservations(){
  const host=document.getElementById('resv-body');if(!host)return;
  if(!RESV_FROM)RESV_FROM=todayTaipei();
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<h2>訂位</h2><p class="hint">載入中…</p>';}
  let d;try{d=await api(`/admin/reservations?from=${encodeURIComponent(RESV_FROM)}&days=${RESV_DAYS}`);}catch(e){host.innerHTML=`<h2>訂位</h2><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  try{RESV_HOURS=await api('/admin/reservation-hours');RESV_HOURS_ERR='';}catch(e){RESV_HOURS=RESV_HOURS||null;RESV_HOURS_ERR=e.message||'載入失敗';}
  const L=d.labels||{},PILL={new:'pill-wait',confirmed:'pill-ok',arrived:'pill-ok',no_show:'pill-bad',cancelled:'pill-draft'};
  const FLOW={new:[['confirmed','確認並通知'],['cancelled','婉拒']],confirmed:[['arrived','已到'],['no_show','未到'],['cancelled','取消']],arrived:[['confirmed','改回已確認']],no_show:[['confirmed','改回已確認']],cancelled:[['confirmed','恢復並通知']]};
  const actions=r=>(FLOW[r.status]||[]).map(([s,l])=>`<button class="btn ${s==='confirmed'&&r.status==='new'?'btn--solid':'btn--ghost'} btn-sm" data-resv="${esc(r.id)}" data-resv-status="${s}">${l}</button>`).join(' ');
  const weekday=date=>['日','一','二','三','四','五','六'][new Date(date+'T12:00:00Z').getUTCDay()];
  let day='';
  const rows=d.reservations.map(r=>{
    const head=r.reserve_date!==day?(day=r.reserve_date,`<tr class="resv-day"><td colspan="7">${esc(r.reserve_date)}（${weekday(r.reserve_date)}）<span class="pill ${r.reserve_date===todayTaipei()?'pill-ok':'pill-wait'}" style="margin-left:8px">${relDayText(r.reserve_date)}</span></td></tr>`):'';
    return head+`<tr class="${r.status==='cancelled'?'resv-off':''}"><td class="a-mono"><b>${esc(r.reserve_time)}</b><br><span class="hint hint--tight">${esc(BRAND_LABEL[r.venue]||r.period)}</span></td><td><b>${esc(r.name)}</b> ${Number(r.party_size)} 位<br><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>${r.email?`<br><span class="hint hint--tight">${esc(r.email)}</span>`:'<br><span class="hint hint--tight">未留 Email，請電話聯繫</span>'}</td><td>${esc(r.note||'')}${r.staff_note?`<br><span class="hint hint--tight">店內：${esc(r.staff_note)}</span>`:''}</td><td><select data-resv-table="${esc(r.id)}" style="min-width:96px;min-height:44px" aria-label="桌號"><option value="">未排桌</option>${[...new Set([...DEFAULT_TABLES,...(r.table_no&&!DEFAULT_TABLES.includes(r.table_no)?[r.table_no]:[])])].map(t=>`<option value="${esc(t)}"${t===(r.table_no||'')?' selected':''}>${esc(t)}</option>`).join('')}</select></td><td><span class="pill ${PILL[r.status]||''}">${esc(L[r.status]||r.status)}</span>${r.handled_by?`<br><span class="hint hint--tight">${esc(r.handled_by)}</span>`:''}</td><td class="a-mono resv-id">${esc(r.request_id)}</td><td class="ops-actions" style="white-space:nowrap">${actions(r)} <button type="button" class="btn btn--ghost btn-sm" data-resv-edit="${esc(r.id)}">編輯</button> <button type="button" class="btn btn--ghost btn--danger btn-sm" data-resv-delete="${esc(r.id)}">刪除</button></td></tr>`;
  }).join('')||'<tr><td colspan="7" class="a-empty">這段期間沒有訂位申請</td></tr>';
  // 櫃檯登記（電話／現場）：時段依店別 30 分鐘一格；Email 可留空（留了才寄確認信）
  const slotOf=(from,to)=>{const o=[];for(let m=from;m<to;m+=30)o.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);return o;};
  const slotGroups=[['CAFE',slotOf(8*60,17*60)],['BAR',slotOf(17*60,24*60).concat(slotOf(0,3*60))]];   // 訂位不分店別，兩個時段都能登記
  const addForm=`<div class="resv-panel" id="resv-add"${RESV_ADD_OPEN?'':' hidden'}>
    <form class="a-form" id="resv-form" autocomplete="off">
      <label>日期<input name="date" id="resv-new-date" type="date" required value="${esc(RESV_FROM)}"></label>${fillChips('resv-new-date',dayChoices())}
      <label>時間<select name="time" required>${slotGroups.map(([v,ts])=>`<optgroup label="${esc(BRAND_LABEL[v])}">${ts.map(t=>`<option value="${t}">${t}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>人數<input name="party_size" id="resv-new-party" type="number" inputmode="numeric" min="1" max="50" value="2" required style="width:90px"></label>${fillChips('resv-new-party',PARTY_CHOICES)}
      <label>姓名<input name="name" required maxlength="80" placeholder="王小姐"></label>
      <label>手機<input name="phone" type="tel" inputmode="tel" required minlength="8" maxlength="32" placeholder="0912-345-678"></label>
      <label>Email（可空）<input name="email" type="email" maxlength="254" placeholder="留了會寄確認信"></label>
      <label>桌號<input name="table_no" id="resv-new-table" maxlength="8" autocapitalize="characters" placeholder="A3" style="width:100px"></label>${fillChips('resv-new-table',[['','不排'],...DEFAULT_TABLES.map(t=>[t,t])])}
      <label class="f-grow">備註<input name="note" id="resv-new-note" maxlength="500" placeholder="點常用的或自己填"></label>${noteChips('resv-new-note',RESV_NOTE_PRESETS)}
      <button class="btn btn--solid" type="submit">登記</button>
    </form></div>`;
  // 編輯訂位資訊：日期／時間／人數／姓名／電話／Email／備註（桌號、店內留言、狀態仍在各列操作）
  const editing=RESV_EDIT?d.reservations.find(x=>x.id===RESV_EDIT):null;
  const editForm=editing?`<div class="a-form resv-edit" id="resv-edit-form">
      <p class="hint hint--row">編輯 ${esc(editing.name)}（${esc(editing.reserve_date)} ${esc(editing.reserve_time)}）的訂位資訊。儲存後不會自動通知客人。</p>
      <label>日期<input id="re-date" type="date" required value="${esc(editing.reserve_date)}"></label>${fillChips('re-date',dayChoices())}
      <label>時間<select id="re-time" required>${slotGroups.map(([v,ts])=>`<optgroup label="${esc(BRAND_LABEL[v])}">${ts.map(t=>`<option value="${t}" ${t===editing.reserve_time?'selected':''}>${t}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>人數<input id="re-party" type="number" inputmode="numeric" min="1" max="50" value="${Number(editing.party_size)}" required style="width:90px"></label>${fillChips('re-party',PARTY_CHOICES)}
      <label>姓名<input id="re-name" required maxlength="80" value="${esc(editing.name)}"></label>
      <label>手機<input id="re-phone" type="tel" inputmode="tel" required minlength="8" maxlength="32" value="${esc(editing.phone)}"></label>
      <label>Email（可空）<input id="re-email" type="email" maxlength="254" value="${esc(editing.email||'')}"></label>
      <label class="f-grow">備註<input id="re-note" maxlength="500" value="${esc(editing.note||'')}"></label>${noteChips('re-note',RESV_NOTE_PRESETS)}
      <button type="button" class="btn btn--solid" id="re-save">儲存</button><button type="button" class="btn btn--ghost" id="re-cancel">取消</button>
    </div>`:'';
  host.innerHTML=`<div class="ops-head"><h2>訂位 ${d.pending?`<span class="badge">${d.pending} 待確認</span>`:''}</h2>${opsHelp('客人從 <a href="/reserve" target="_blank" rel="noopener">/reserve</a>（Google Maps／官方 LINE 連結）訂位，送出即成立、客人已收到確認信（座位保留至預約時間後 10 分鐘）。08:00–16:59 歸在咖啡、其餘歸三點水。這裡可填桌號、按「取消」寄婉拒信給客人（沒留 Email 的請電話聯繫）；當天到店按「已到」，沒來按「未到」。舊的「待確認」申請按「確認並通知」會補寄確認信。日期、時間、人數、姓名、電話、Email、備註打錯或客人來電更改，按該筆「編輯」修改。')}</div>
    <div class="resv-actions"><button type="button" class="btn ${RESV_ADD_OPEN?'btn--solid':'btn--ghost'}" id="resv-add-toggle" aria-expanded="${RESV_ADD_OPEN}" aria-controls="resv-add">＋ 登記訂位<span class="resv-act-sub">（電話／現場）</span></button><button type="button" class="btn ${RESV_HOURS_OPEN?'btn--solid':'btn--ghost'}" id="resv-hours-toggle" aria-expanded="${RESV_HOURS_OPEN}" aria-controls="resv-hours">不可訂位設定</button></div>
    ${hoursStrip()}
    ${addForm}
    ${hoursPanel()}
    ${editForm}
    <div class="a-toolbar"><label>從<input type="date" id="resv-from" value="${esc(RESV_FROM)}"></label><select id="resv-days" aria-label="顯示天數">${[[1,'只看這天'],[7,'7 天'],[30,'30 天'],[60,'60 天']].map(([n,l])=>`<option value="${n}" ${n===RESV_DAYS?'selected':''}>${l}</option>`).join('')}</select><button class="btn btn--ghost btn-sm" id="resv-today">今天</button><span class="hint hint--tight">${d.reservations.length} 筆</span></div>
    <div class="a-wrap2"><table class="a-tbl resv-tbl"><thead><tr><th>時間</th><th>客人</th><th>備註</th><th>桌號</th><th>狀態</th><th>編號</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  bindFillChips(host);bindNoteChips(host);bindHoursPanel(host);
  // 兩顆入口鍵同一列：各自開關下方面板，一次只開一個
  const paintPanels=()=>[['#resv-add-toggle','#resv-add',RESV_ADD_OPEN],['#resv-hours-toggle','#resv-hours',RESV_HOURS_OPEN]].forEach(([bi,pi,on])=>{const b=host.querySelector(bi),p=host.querySelector(pi);if(p)p.hidden=!on;if(b){b.classList.toggle('btn--solid',on);b.classList.toggle('btn--ghost',!on);b.setAttribute('aria-expanded',String(on));}});
  const addBtn=host.querySelector('#resv-add-toggle');if(addBtn)addBtn.onclick=()=>{RESV_ADD_OPEN=!RESV_ADD_OPEN;if(RESV_ADD_OPEN)RESV_HOURS_OPEN=false;paintPanels();};
  const hoursBtn=host.querySelector('#resv-hours-toggle');if(hoursBtn)hoursBtn.onclick=()=>{RESV_HOURS_OPEN=!RESV_HOURS_OPEN;if(RESV_HOURS_OPEN)RESV_ADD_OPEN=false;paintPanels();};
  host.querySelector('#resv-from').onchange=e=>{RESV_FROM=e.target.value||todayTaipei();loadReservations();};
  host.querySelector('#resv-days').onchange=e=>{RESV_DAYS=Number(e.target.value)||7;loadReservations();};
  host.querySelector('#resv-today').onclick=()=>{RESV_FROM=todayTaipei();loadReservations();};
  host.querySelector('#resv-form').onsubmit=e=>{
    e.preventDefault();const f=e.target,body=Object.fromEntries(new FormData(f));body.party_size=Number(body.party_size);
    opsThen(()=>api('/admin/reservations',{method:'POST',body}),out=>`已登記 ${out.request_id}${out.mailed?'，已寄確認信給客人':''}`,()=>{RESV_FROM=body.date;RESV_ADD_OPEN=false;return loadReservations();});
  };
  host.querySelectorAll('[data-resv]').forEach(b=>b.onclick=async()=>{
    const r=d.reservations.find(x=>x.id===b.dataset.resv),status=b.dataset.resvStatus;if(!r)return;
    const table_no=host.querySelector(`[data-resv-table="${CSS.escape(r.id)}"]`)?.value.trim()||'';
    let staff_note=r.staff_note||'';
    // 確認／婉拒：店內留言用膠囊鍵選（會附在信裡），可留空
    if(['confirmed','cancelled'].includes(status)){const v=await pickReason({title:`${status==='confirmed'?'確認':'婉拒'} ${r.name} ${r.reserve_date} ${r.reserve_time}（${r.party_size} 位）${r.email?'，會寄信通知客人':'，客人未留 Email，請另行電話聯繫'}`,presets:status==='confirmed'?REASON_PRESETS.resv_confirm:REASON_PRESETS.resv_cancel,placeholder:'店內留言（會附在信裡，可留空）',initial:staff_note,required:false,maxlength:200});if(v===null)return;staff_note=v;}
    opsThen(()=>api('/admin/reservations/'+r.id+'/status',{method:'POST',body:{status,table_no,staff_note}}),out=>`已更新為「${L[out.status]||out.status}」${out.mailed?'，已寄信通知客人':''}`,loadReservations);
  });
  host.querySelectorAll('[data-resv-edit]').forEach(b=>b.onclick=()=>{RESV_EDIT=b.dataset.resvEdit;loadReservations();});
  host.querySelectorAll('[data-resv-delete]').forEach(b=>b.onclick=async()=>{
    const r=d.reservations.find(x=>x.id===b.dataset.resvDelete);if(!r)return;
    if(!await posConfirm(`刪除 ${r.name}（${r.reserve_date} ${r.reserve_time}）這筆訂位？刪除後不再顯示，無法復原。`,{ok:'刪除',danger:true}))return;
    opsThen(()=>api('/admin/reservations/'+r.id,{method:'DELETE'}),'已刪除這筆訂位',loadReservations);
  });
  const reSave=host.querySelector('#re-save');
  if(reSave)reSave.onclick=()=>{
    const body={date:host.querySelector('#re-date').value,time:host.querySelector('#re-time').value,party_size:Number(host.querySelector('#re-party').value),name:host.querySelector('#re-name').value,phone:host.querySelector('#re-phone').value,email:host.querySelector('#re-email').value,note:host.querySelector('#re-note').value};
    opsThen(()=>api('/admin/reservations/'+editing.id,{method:'PATCH',body}),'已更新訂位資訊',()=>{RESV_EDIT=null;return loadReservations();});
  };
  const reCancel=host.querySelector('#re-cancel');
  if(reCancel)reCancel.onclick=()=>{RESV_EDIT=null;loadReservations();};
}

/* ===== 開關帳（帳本）：在咖啡／三點水各記一本，但共用同一個抽屜帳 → 同一時間只能一本開著（在咖啡關帳後三點水才能開）。
 * 結帳頁頂端一條狀態列（沒開帳→開帳鍵／等對方關帳；開著→應有現金＋關帳捷徑）；日結頁完整區塊 ===== */
// 另一品牌還開著 → 這個品牌現在不能開帳，顯示要等誰關帳；開帳零用金預設承接上一本的留存金
const regWait=v=>REG_DATA?.wait?.[v]||'';
const regWaitChip=v=>`<span class="pill pill-wait">等${esc(regWait(v))}關帳</span><span class="reg-exp">共用抽屜帳，${esc(regWait(v))}關帳後才能開${esc(BRAND_LABEL[v])}</span>`;
const regDefaultCash=()=>REG_DATA?.handover?Number(REG_DATA.handover.keep_cash)||0:3000;
// 這台平板現在要管的品牌：有鎖店別就是店別，否則依時段（08–17 在咖啡、其餘三點水）
const registerVenue=()=>SCOPE||REG_DATA?.active_venue||'CAFE';
const regOf=v=>REG_DATA?.current?.[v]||null;
const regState=r=>!r?'closed':r.closed_at?'done':'open';
// 面額格：開帳（零用金）與關帳（點鈔）共用；張數 × 面額合計，一張都沒填才用直接填的總額
const denomGrid=()=>`<div class="reg-denoms">${REG_DENOMS.map(f=>`<label><span>$${num(f)}</span><input type="number" inputmode="numeric" min="0" step="1" data-denom="${f}" placeholder="張"></label>`).join('')}</div>`;
function readCount(form,directSel){const denoms={};let d=0,invalid=false,any=false;form.querySelectorAll('[data-denom]').forEach(i=>{const text=i.value.trim();if(!text)return;any=true;if(!/^\d+$/.test(text))invalid=true;const n=Number(text);denoms[i.dataset.denom]=n;d+=Number(i.dataset.denom)*n;});const direct=form.querySelector(directSel).value.trim();const total=invalid?null:any?d:(/^\d+$/.test(direct)?Number(direct):null);return {total:total!==null&&Number.isSafeInteger(total)&&total<=10000000?total:null,denoms:any?denoms:undefined};}
function openRegisterForm(venue){
  const h=REG_DATA?.handover,def=regDefaultCash();
  return `<div class="reg-open-form" data-venue="${esc(venue)}"><div class="ops-head"><h4>${esc(BRAND_LABEL[venue]||venue)} 開帳</h4>${tipIcon('抽屜零用金（找零準備金）按面額填張數，或直接填總額。'+(h?`預設承接 ${esc(BRAND_LABEL[h.venue]||h.venue)} ${esc(clockText(h.closed_at))} 關帳的留存金 NT$${num(h.keep_cash)}，點過抽屜不符請改。`:''))}</div>${denomGrid()}
    <div class="a-form"><label>零用金總額<input id="reg-open-total" type="number" inputmode="numeric" min="0" step="1" placeholder="或直接填" value="${def}"></label>${fillChips('reg-open-total',[...new Set([Number(def)||0,2000,3000,5000,10000].filter(n=>n>0))].map(n=>[n,(n===Number(def)?'承接 ':'')+'$'+num(n)]))}</div>
    <div class="reg-close-sum"><span>零用金 <b id="reg-open-show">NT$${num(def)}</b></span></div>
    <div class="a-toolbar"><button type="button" class="btn btn--solid" id="reg-open-go">確認開帳</button><button type="button" class="btn btn--ghost" id="reg-open-cancel">取消</button></div></div>`;
}
function bindOpenForm(host,reload){
  host.querySelectorAll('[data-reg-open]').forEach(b=>b.onclick=()=>{REG_OPEN_FORM=b.dataset.regOpen;REG_CASH_OPEN=false;REG_CLOSE_OPEN=false;reload();});
  const form=host.querySelector('.reg-open-form');if(!form)return;
  const show=()=>{const {total}=readCount(form,'#reg-open-total');form.querySelector('#reg-open-show').textContent=total==null?'—':'NT$'+num(total);};
  form.querySelectorAll('[data-denom],#reg-open-total').forEach(i=>i.oninput=show);bindFillChips(form);
  form.querySelector('#reg-open-cancel').onclick=()=>{REG_OPEN_FORM='';reload();};
  form.querySelector('#reg-open-go').onclick=()=>{const {total,denoms}=readCount(form,'#reg-open-total');if(total==null){toast('零用金請按面額填張數，或填總額');return;}
    opsThen(()=>api('/admin/registers/open',{method:'POST',body:{venue:form.dataset.venue,opening_cash:total,denominations:denoms}}),async out=>{const ok=await registerCashDrawer(out.id);return `${BRAND_LABEL[out.venue]} 已開帳，零用金 NT$${num(out.opening_cash)}`+(ok===false?'；未確認開櫃成功，請按「錢櫃」開櫃放零用金':'');},()=>{REG_OPEN_FORM='';if(typeof refreshRegWarn==='function')refreshRegWarn();return reload();});};
}
// 小結單／關帳單（80mm）：現金帳 → 營收摘要 → 臨時收支；關帳有點鈔、短溢與留存金；小結有點驗過就印最近一次點鈔與差額
// 關帳單／小結單 58mm 點陣排版（mPOP）：內容與下方瀏覽器版一致
function registerReportSpec(rep,kind){
  const closed=!!rep.closed_at,n=v=>num(v),sp=[];
  const row=(l,r,bold,size=22)=>sp.push({kind:'row',left:l,right:String(r),size,bold:!!bold});
  const sec=t=>{sp.push('dash',{kind:'left',text:t,size:22,bold:true});};
  sp.push({kind:'center',text:BRAND_LABEL[rep.venue]||rep.venue,size:30,bold:true},{kind:'center',text:`${kind} · 營業日 ${rep.day}`,size:20},{kind:'left',text:`開帳 ${applicationTime(rep.opened_at)} ${rep.opened_by||''}`,size:18});
  if(closed)sp.push({kind:'left',text:`關帳 ${applicationTime(rep.closed_at)} ${rep.closed_by||''}`,size:18});
  else if(rep.counted_at)sp.push({kind:'left',text:`點驗 ${applicationTime(rep.counted_at)}`,size:18});
  sec('現金');row('零用金',n(rep.opening_cash));row('現金營收',n(rep.cash_sales));row('臨時收入','+'+n(rep.cash_in));row('臨時支出','−'+n(rep.cash_out));row('應有現金','NT$'+n(rep.expected_cash),true);
  if(rep.counted_cash!=null){
    row(closed?'點鈔現金':'點驗現金','NT$'+n(rep.counted_cash),true);row(rep.diff>0?'溢':rep.diff<0?'短':'差額',(rep.diff>0?'+':'')+n(rep.diff),true,28);
    if(closed){row('留存金（下一班）',n(rep.keep_cash));row('收走',n(rep.take_cash));}
    if(rep.note)sp.push({kind:'wrap',text:rep.note,size:20});
  }
  sec('營收');row('成立單數',n(rep.orders)+' 單');row('營收（折扣後）','NT$'+n(rep.amount),true);
  for(const [m,v] of Object.entries(rep.by_method||{}))row(payMethodLabel(m),n(v));
  if(rep.discount_amount)row('折扣合計','−'+n(rep.discount_amount));
  if(rep.service_amount||rep.service_waived)row('服務費（含在營收）',n(rep.service_amount||0)+(rep.service_waived?`（免收 ${rep.service_waived} 單）`:''));
  if(rep.redeem_points)row(`點數兌換 ${n(rep.redeem_count)} 單`,`${n(rep.redeem_points)} 點／−${n(rep.redeem_value)}`);
  if(rep.voided)row('作廢',`${n(rep.voided)} 單 ${n(rep.void_amount)}`);
  if(rep.accounts){
    sec('逐項帳戶核對');row('現金實收',n(rep.cash_actual));
    for(const [code,a] of Object.entries(rep.accounts)){
      sp.push({kind:'wrap',text:a.label||payMethodLabel(code),size:22,bold:true});
      row('POS／實收',n(a.pos)+'／'+n(a.actual));row('差異',(a.diff>0?'+':'')+n(a.diff));
      if(a.reason)sp.push({kind:'wrap',text:a.reason,size:20});
    }
    sec('最後核對總額');row('訂單總額',n(rep.total_pos));row('帳戶總額',n(rep.total_actual));row('總差異',(rep.total_diff>0?'+':'')+n(rep.total_diff),true);
    if(rep.total_reason)sp.push({kind:'wrap',text:'總差異原因：'+rep.total_reason,size:20});
  }
  sec('臨時收支');
  const moves=rep.moves||[];
  if(!moves.length)sp.push({kind:'left',text:'無',size:20});
  for(const m of moves)row(`${m.type==='in'?'收':'支'} ${m.reason}`,`${m.type==='in'?'+':'−'}${n(m.amount)}`);
  sp.push('dash',{kind:'center',text:`${kind}完成`,size:20});
  return sp;
}
// 有接 mPOP 就直接出紙；沒接就退回瀏覽器列印視窗。回傳 Promise<boolean>
async function printRegisterReport(rep,kind){
  if(starReady()){const ok=await starSend({canvas:ticketCanvas(registerReportSpec(rep,kind))});toast(ok?kind+'已印出':kind+'未印出，請按「重印關帳單」');return ok;}
  return printRegisterReportWindow(rep,kind);
}
function printRegisterReportWindow(rep,kind){
  const line=(k,v,cls='l')=>`<div class="${cls}"><span>${esc(k)}</span><span>${v}</span></div>`;
  const moves=(rep.moves||[]).map(m=>line(`${m.type==='in'?'收':'支'} ${m.reason}`,`${m.type==='in'?'+':'−'}${num(m.amount)}`)).join('')||'<div class="m">無</div>';
  const methods=Object.entries(rep.by_method||{}).map(([m,v])=>line(payMethodLabel(m),num(v))).join('');
  const closed=!!rep.closed_at;
  return printWindow(`${kind} ${rep.venue}`,`<h1>${esc(BRAND_LABEL[rep.venue]||rep.venue)}</h1><div class="m">${kind} · 營業日 ${esc(rep.day)}</div><div class="m">開帳 ${esc(applicationTime(rep.opened_at))} ${esc(rep.opened_by||'')}</div>${closed?`<div class="m">關帳 ${esc(applicationTime(rep.closed_at))} ${esc(rep.closed_by||'')}</div>`:rep.counted_at?`<div class="m">點驗 ${esc(applicationTime(rep.counted_at))}</div>`:''}
    <h2>現金</h2>${line('零用金',num(rep.opening_cash))}${line('現金營收',num(rep.cash_sales))}${line('臨時收入','+'+num(rep.cash_in))}${line('臨時支出','−'+num(rep.cash_out))}${line('應有現金','NT$'+num(rep.expected_cash),'t')}
    ${rep.counted_cash!=null?`${line(closed?'點鈔現金':'點驗現金','NT$'+num(rep.counted_cash),'t')}${line(rep.diff>0?'溢':rep.diff<0?'短':'差額',(rep.diff>0?'+':'')+num(rep.diff),'t big')}${closed?`${line('留存金（下一班）',num(rep.keep_cash))}${line('收走',num(rep.take_cash))}`:''}${rep.note?`<div class="n">${esc(rep.note)}</div>`:''}`:''}
    <h2>營收</h2>${line('成立單數',num(rep.orders)+' 單')}${line('營收（折扣後）','NT$'+num(rep.amount),'t')}${methods}${rep.discount_amount?line('折扣合計','−'+num(rep.discount_amount)):''}${rep.service_amount||rep.service_waived?line('服務費（含在營收）',num(rep.service_amount||0)+(rep.service_waived?`（免收 ${rep.service_waived} 單）`:'')):''}${rep.redeem_points?line(`點數兌換 ${num(rep.redeem_count)} 單`,`${num(rep.redeem_points)} 點／折抵 −${num(rep.redeem_value)}`):''}${rep.voided?line('作廢',`${num(rep.voided)} 單 ${num(rep.void_amount)}`):''}
    ${rep.accounts?`<h2>逐項帳戶核對</h2>${line('現金實收',num(rep.cash_actual))}${Object.entries(rep.accounts).map(([code,a])=>`${line(a.label||payMethodLabel(code),'POS '+num(a.pos)+'／實收 '+num(a.actual))}${line('差異',(a.diff>0?'+':'')+num(a.diff))}${a.reason?`<div class="n">${esc(a.reason)}</div>`:''}`).join('')}<h2>最後核對總額</h2>${line('訂單總額',num(rep.total_pos))}${line('帳戶總額',num(rep.total_actual))}${line('總差異',(rep.total_diff>0?'+':'')+num(rep.total_diff))}${rep.total_reason?`<div class="n">總差異原因：${esc(rep.total_reason)}</div>`:''}`:''}
    <h2>臨時收支</h2>${moves}<div class="c">${esc(kind)}完成</div>`);
}
// 日結只保留本次頁面記憶體草稿；切換帳本不共用實收或確認。
const REG_CLOSE_DRAFTS=new Map();
const regAccountLabel=(r,c)=>r.account_labels?.[c]||payMethodLabel(c);
const regCloseStamp=r=>JSON.stringify([r.expected,r.opening_cash,r.cash_in,r.cash_out,r.sales?.amount,r.reconciliation_accounts]);
/* 各帳戶確認：小結／關帳前，每個帳戶一顆按鈕，點開填實收（現金可按面額點鈔；LINE Pay 自動帶入後台同步實收）。
 * 應收≠實收必須填原因才能確認。確認結果留在本頁記憶體（ACCT_CONFIRMED），開「關帳」時自動帶入點鈔、各帳戶實收與原因；不直接寫帳務。 */
const ACCT_CONFIRMED=new Map();
const acctRows=r=>[['cash','現金',r.expected],...Object.entries(r.reconciliation_accounts||{}).sort(([a],[b])=>{const rk=c=>c==='linepay'?0:c==='taishin'?1:2;return rk(a)-rk(b);}).map(([c,x])=>[c,regAccountLabel(r,c),x])];
// LINE Pay 後台實收：單品牌頁直接用對帳結果；全店頁用 by_venue 依開關帳時間歸屬的分店金額
function acctLinepayActual(lp,venue){if(!lp||lp.configured===false||!lp.synced_at)return null;const v=lp.by_venue?.[venue];return Number(v?v.linepay.amount:lp.linepay?.amount)||0;}
function accountConfirmBlock(d,sales){
  const venues=SCOPE?[SCOPE]:Object.keys(BRAND_LABEL);
  const cards=venues.map(v=>{const r=d?.current?.[v];if(!r||r.closed_at)return '';
    const rows=acctRows(r),done=ACCT_CONFIRMED.get(r.id)||{},n=rows.filter(x=>done[x[0]]).length;
    return `<div class="reg-card" data-acct-card="${esc(r.id)}"><h4>${esc(BRAND_LABEL[v])} <span class="pill ${n===rows.length?'pill-ok':'pill-wait'}">${n}/${rows.length} 已確認</span></h4><div class="a-wrap2"><table class="a-tbl reg-acct"><thead><tr><th>帳戶</th><th class="num">應收</th><th class="num">實收</th><th class="num">差額</th><th></th></tr></thead><tbody>${rows.map(([c,nm,amt])=>{const a=done[c];return `<tr class="${a&&a.diff?'lp-diff':''}"><td>${esc(nm)}</td><td class="num">NT$${num(amt)}</td><td class="num">${a?'NT$'+num(a.actual):'—'}</td><td class="num">${a?(a.diff>0?'+':'')+num(a.diff):'—'}</td><td><button type="button" class="btn ${a?'btn--ghost':'btn--solid'} btn-sm" data-acct-open="${esc(c)}">${a?'✓ 已確認':'核對'}</button></td></tr>`;}).join('')}</tbody></table></div></div>`;}).join('');
  return cards?`<div class="ops-head"><h3>各帳戶確認</h3>${opsHelp('小結或關帳前，逐一按「核對」填入每個帳戶的實收：現金可按面額點鈔或直接填總額，LINE Pay 自動帶入後台同步的實收，信用卡與其他帳戶對照機台或後台填入。應收與實收不同時要填原因才能確認。確認結果會自動帶入關帳表單，但關帳前仍可修改。')}</div><div class="reg-cards">${cards}</div>`:'';
}
function acctDialog(r,code,sales){
  return new Promise(resolve=>{
    const [,label,expected]=acctRows(r).find(x=>x[0]===code),prev=(ACCT_CONFIRMED.get(r.id)||{})[code];
    const lpAuto=code==='linepay'?acctLinepayActual(sales?.linepay,r.venue):null;
    const cash=code==='cash';
    const {ov,close}=pickOverlay(`<h3>核對 ${esc(label)} · ${esc(BRAND_LABEL[r.venue])}</h3>
      <div class="reg-close-sum"><span>應收 <b>NT$${num(expected)}</b></span><span>實收 <b id="acct-actual-show">—</b></span><span>差額 <b id="acct-diff-show">—</b></span></div>
      ${cash?`<p class="hint">按面額填張數，或直接填總額。應收＝零用金＋現金營收＋臨時收入－臨時支出（整個錢櫃）。</p>${denomGrid()}`:code==='linepay'?`${sales?.linepay?.sync_error?`<p class="hint" role="alert" style="color:#c0392b;font-weight:600">⚠ LINE Pay 自動同步失敗：${esc(sales.linepay.sync_error)}</p>`:''}<p class="hint" id="acct-lp-hint">${lpAuto==null?'LINE Pay 後台尚未同步：按「同步 LINE Pay」自動帶入實收，或對照商家後台手動填入。':`已自動帶入 LINE Pay 後台同步實收（${esc(applicationTime(sales.linepay.synced_at))} 同步，退款已扣），可修改；有新交易可再同步。`}</p><div class="a-toolbar"><button type="button" class="btn btn--ghost btn-sm" id="acct-lp-sync" ${sales?.linepay?.configured===false?'disabled title="尚未設定 LINE Pay 商家後台帳密"':''}>同步 LINE Pay</button></div>`:`<p class="hint">實收預設等於應收，帳對了直接按確認；不同請對照收單機、商家後台或交接資料改填本品牌本營業日實收（退款已扣、手續費扣除前）。</p>`}
      <div class="a-form"><label>${cash?'實收總額':'實收'}<input id="acct-actual" type="number" inputmode="numeric" min="0" step="1" placeholder="${cash?'或直接填':'沒有收款請填 0'}" onfocus="this.select()" value="${prev?esc(prev.actual):lpAuto!=null?lpAuto:expected}"></label><label class="reg-note" id="acct-reason-label" hidden>差異原因（應收≠實收必填）<input id="acct-reason" maxlength="200" placeholder="差額非 0 必填" value="${esc(prev?.reason||'')}"></label></div><div id="acct-reason-options" hidden>${reasonChips('acct-reason',REASON_PRESETS.close_note)}</div>
      <div class="pos-move-foot"><button type="button" class="btn btn--ghost" data-cancel>取消</button><button type="button" class="btn btn--solid" data-ok disabled>確認</button></div>`,'核對 '+label);
    const box=ov.querySelector('.pos-move-box');bindReasonChips(box);
    if(cash&&prev?.denoms)for(const [f,n] of Object.entries(prev.denoms)){const i=box.querySelector(`[data-denom="${f}"]`);if(i)i.value=n;}
    const q=s=>box.querySelector(s),amount=()=>{const t=q('#acct-actual').value.trim();return /^\d+$/.test(t)&&Number(t)<=10000000?Number(t):null;};
    const read=()=>{if(cash){const c=readCount(box,'#acct-actual');return {actual:c.total,denoms:c.denoms};}return {actual:amount()};};
    const show=()=>{const {actual}=read(),diff=actual==null?null:actual-expected,reason=q('#acct-reason').value.trim();
      q('#acct-actual-show').textContent=actual==null?'—':'NT$'+num(actual);const ds=q('#acct-diff-show');ds.textContent=diff==null?'—':(diff>0?'+':'')+num(diff);ds.classList.toggle('reg-diff',!!diff);
      const needsReason=diff!==null&&diff!==0;q('#acct-reason-label').hidden=!needsReason;q('#acct-reason-options').hidden=!needsReason;
      q('[data-ok]').disabled=actual==null||(needsReason&&!reason);};
    box.addEventListener('input',show,true);box.addEventListener('change',show);
    // LINE Pay：對話框內直接同步後台（抓營業日前 3 天到隔天），重抓當日對帳結果帶入本店別實收；同步要等後台登入，約 20–60 秒
    const sb=q('#acct-lp-sync');if(sb)sb.onclick=async()=>{sb.disabled=true;sb.textContent='同步中…（約 1 分鐘）';
      const day=String(r.day||SALES_DAY||'').slice(0,10)||todayTaipei(),addDays=(d0,n)=>{const t=new Date(d0+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
      const start=addDays(day,-3),end=[addDays(day,1),todayTaipei()].sort()[0];
      try{const out=await api('/admin/sales/linepay/sync',{method:'POST',body:{start,end}});
        const fresh=await api(`/admin/sales?day=${encodeURIComponent(day)}`+(SCOPE?'&venue='+SCOPE:''));
        if(sales&&fresh?.linepay)sales.linepay=fresh.linepay;   // 同一頁再開其他帳戶／重開對話框都用新資料
        const v=acctLinepayActual(fresh?.linepay,r.venue);
        if(v!=null){q('#acct-actual').value=v;q('#acct-lp-hint').textContent=`已同步 ${out.count} 筆，帶入 LINE Pay 後台實收（${applicationTime(fresh.linepay.synced_at)} 同步，退款已扣），可修改。`;}
        else q('#acct-lp-hint').textContent='同步完成，但沒有本店別的實收資料，請對照商家後台手動填入。';
        show();toast(`已同步 ${out.start} ～ ${out.end}，${out.count} 筆`);}
      catch(e){toast(e.message||'同步失敗');}finally{sb.disabled=false;sb.textContent='同步 LINE Pay';}};
    const done=v=>{close();resolve(v);};
    q('[data-cancel]').onclick=()=>done(null);ov.addEventListener('click',e=>{if(e.target===ov)done(null);});
    q('[data-ok]').onclick=()=>{const {actual,denoms}=read();if(actual==null)return;const diff=actual-expected,reason=q('#acct-reason').value.trim();if(diff!==0&&!reason){toast('應收與實收不同，請填差異原因');q('#acct-reason').focus();return;}done({actual,diff,reason:diff?reason:'',denoms});};
    show();
  });
}
function bindAccountConfirm(host,sales,reload){
  host.querySelectorAll('[data-acct-card]').forEach(card=>{const id=card.dataset.acctCard,r=(REG_DATA?.registers||[]).find(x=>x.id===id);if(!r)return;
    card.querySelectorAll('[data-acct-open]').forEach(b=>b.onclick=async()=>{if(b.dataset.acctOpen==='cash'&&!b.dataset.drawerBusy){b.dataset.drawerBusy='1';try{await ensureOperator(()=>manualCashDrawer('日結核對現金'));}catch(e){}finally{delete b.dataset.drawerBusy;}}const out=await acctDialog(r,b.dataset.acctOpen,sales);if(!out)return;ACCT_CONFIRMED.set(id,{...(ACCT_CONFIRMED.get(id)||{}),[b.dataset.acctOpen]:out});toast(out.diff?`已確認，${out.diff>0?'溢':'短'} NT$${num(Math.abs(out.diff))}`:'已確認，帳對了');reload();});});
}
// 關帳表單不再重填一輪帳務：只檢查上方「各帳戶確認」是否每個帳戶都已核對，再填留存金就能關帳
function closeChecks(r){
  const done=ACCT_CONFIRMED.get(r.id)||{},rows=acctRows(r);
  const items=rows.map(([code,name,exp])=>{const a=done[code],diff=a?a.actual-exp:null;return {code,name,exp,a,diff,ok:!!a&&(diff===0||!!a.reason)};});
  const accounts=items.filter(x=>x.code!=='cash'),cash=items[0];
  const allOk=items.every(x=>x.ok);
  const actual=allOk?cash.a.actual-r.opening_cash-r.cash_in+r.cash_out+accounts.reduce((t,x)=>t+x.a.actual,0):null;
  return {items,allOk,actual,totalDiff:actual==null?null:actual-r.sales.amount};
}
function dailyCloseForm(r){
  const c=closeChecks(r),pending=c.items.filter(x=>!x.ok).map(x=>x.name);
  return `<div class="reg-close-form" data-register-id="${esc(r.id)}"><h4>確認關帳 · ${esc(BRAND_LABEL[r.venue])}</h4><p>訂單總額 <b>NT$${num(r.sales?.amount)}</b>（本品牌、同一營業日；非全店實收）</p>
    ${pending.length?`<p class="hint" id="reg-close-pending">上方「各帳戶確認」還有 ${esc(pending.join('、'))} 沒有核對，請先按「核對」完成後再關帳。</p>`:`<div class="a-wrap2"><table class="a-tbl reg-acct"><thead><tr><th>帳戶</th><th class="num">應收</th><th class="num">實收</th><th class="num">差額</th></tr></thead><tbody>${c.items.map(x=>`<tr class="${x.diff?'lp-diff':''}"><td>${esc(x.name)}</td><td class="num">NT$${num(x.exp)}</td><td class="num">NT$${num(x.a.actual)}</td><td class="num">${x.diff>0?'+':''}${num(x.diff)}</td></tr>`).join('')}</tbody></table></div>
    <div class="reg-close-sum"><span>訂單總額 <b>NT$${num(r.sales?.amount)}</b></span><span>帳戶總額 <b>NT$${num(c.actual)}</b></span><span>總差異 <b>${c.totalDiff>0?'+':''}${num(c.totalDiff)}</b></span></div>
    <div class="a-form"><label>留存金（下一班）<input id="reg-keep" type="number" inputmode="numeric" min="0" step="1" value="${esc(r.opening_cash)}"></label></div>${fillChips('reg-keep',[[r.opening_cash,'同零用金 $'+num(r.opening_cash)],[0,'全部收走'],[3000,'$3,000'],[5000,'$5,000']])}`}
    <p id="reg-close-status" role="status" aria-live="polite">${pending.length?'帳戶尚未全部核對。':'上方帳戶皆已核對，可以關帳。'}</p><div class="a-toolbar"><button type="button" class="btn btn--solid" id="reg-close-go" disabled>確認關帳</button><button type="button" class="btn btn--ghost" id="reg-close-cancel">取消</button></div></div>`;
}
function registerBlock(d){
  const venues=SCOPE?[SCOPE]:Object.keys(BRAND_LABEL);
  const cards=venues.map(v=>{const r=d?.current?.[v]||null,st=regState(r);
    if(st==='closed')return `<div class="reg-card reg-closed"><h4>${esc(BRAND_LABEL[v])}</h4>${regWait(v)?`<p class="hint">${regWaitChip(v)}</p>`:REG_OPEN_FORM===v?openRegisterForm(v):`<p class="hint">還沒開帳：放零用金後按開帳才能結帳。</p><button type="button" class="btn btn--solid" data-reg-open="${esc(v)}">開帳</button>`}</div>`;
    const moves=(r.moves||[]).map(m=>`<tr><td class="a-mono">${esc(clockText(m.created_at))}</td><td>${m.type==='in'?'<span class="pill pill-ok">收入</span>':'<span class="pill pill-wait">支出</span>'}</td><td>${esc(m.reason)}</td><td class="num">${m.type==='in'?'+':'−'}${num(m.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="a-empty">沒有臨時收支</td></tr>';
    const cashForm=REG_CASH_OPEN===r.id?`<div class="a-form reg-cash-form"><select id="reg-cash-type" aria-label="類型"><option value="out">臨時支出（從抽屜拿錢）</option><option value="in">臨時收入（放錢進抽屜）</option></select><input id="reg-cash-amount" type="number" inputmode="numeric" min="1" step="1" placeholder="金額"><input id="reg-cash-reason" maxlength="80" placeholder="原因（必填）選下面或自己填"><button type="button" class="btn btn--solid btn-sm" id="reg-cash-save">記錄</button><button type="button" class="btn btn--ghost btn-sm" id="reg-cash-cancel">取消</button>${fillChips('reg-cash-amount',[[100,'$100'],[200,'$200'],[500,'$500'],[1000,'$1,000'],[2000,'$2,000']])}${reasonChips('reg-cash-reason',REASON_PRESETS.cash_move)}</div>`:'';
    const closeForm=REG_CLOSE_OPEN===r.id?dailyCloseForm(r):'';
    // 小結點驗：營業中隨時核對抽屜現金，不關帳；差額只提示不卡，留痕後印小結單會帶上
    const countForm=REG_COUNT_OPEN===r.id?`<div class="reg-close-form reg-count-form"><div class="ops-head"><h4>小結點驗</h4>${tipIcon('按面額填張數，或直接填總額，核對抽屜現金是否等於應有現金。不會關帳，可以多次點驗。')}</div>${denomGrid()}
      <div class="a-form"><label>點鈔總額<input id="reg-count-total" type="number" inputmode="numeric" min="0" step="1" placeholder="或直接填"></label><label class="reg-note">說明<input id="reg-count-note" maxlength="200" placeholder="選填"></label></div>${reasonChips('reg-count-note',REASON_PRESETS.count_note)}
      <div class="reg-close-sum"><span>應有現金 <b>NT$${num(r.expected)}</b></span><span>點鈔 <b id="reg-count-show">—</b></span><span>差額 <b id="reg-count-diff">—</b></span></div>
      <div class="a-toolbar"><button type="button" class="btn btn--solid" id="reg-count-go">記錄點驗</button><button type="button" class="btn btn--ghost" id="reg-count-print">記錄並印小結單</button><button type="button" class="btn btn--ghost" id="reg-count-cancel">取消</button></div></div>`:'';
    const done=st==='done',lc=!done&&r.last_count;
    return `<div class="reg-card reg-${st}"><h4>${esc(BRAND_LABEL[v])} ${done?'<span class="pill pill-draft">已關帳</span>':'<span class="pill pill-ok">開帳中</span>'}<span class="hint hint--end">${esc(clockText(r.opened_at))} 開帳${done?` · ${esc(clockText(r.closed_at))} 關帳`:''}</span></h4>
      <div class="reg-cash"><div><span>零用金</span><b>${num(r.opening_cash)}</b></div><div><span>現金營收</span><b>${num(r.cash_sales)}</b></div><div><span>臨時收支</span><b>${r.cash_in-r.cash_out>=0?'+':'−'}${num(Math.abs(r.cash_in-r.cash_out))}</b></div><div class="reg-expected"><span>應有現金</span><b>NT$${num(r.expected)}</b></div>${done?`<div><span>點鈔</span><b>${num(r.counted_cash)}</b></div><div class="${r.diff?'reg-diff':''}"><span>${r.diff>0?'溢':r.diff<0?'短':'差額'}</span><b>${r.diff>0?'+':''}${num(r.diff)}</b></div>`:lc?`<div><span>${esc(clockText(lc.created_at))} 點驗</span><b>${num(lc.counted_cash)}</b></div><div class="${lc.diff?'reg-diff':''}"><span>${lc.diff>0?'溢':lc.diff<0?'短':'差額'}</span><b>${lc.diff>0?'+':''}${num(lc.diff)}</b></div>`:''}</div>
      ${done&&r.close_note?`<p class="hint">${esc(r.close_note)}</p>`:lc&&lc.note?`<p class="hint">點驗：${esc(lc.note)}</p>`:''}
      <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>時間</th><th>類型</th><th>原因</th><th class="num">金額</th></tr></thead><tbody>${moves}</tbody></table></div>
      ${cashForm}${countForm}${closeForm}
      ${!REG_CASH_OPEN&&!REG_CLOSE_OPEN&&!REG_COUNT_OPEN?`<div class="a-toolbar reg-actions">${done?`<button type="button" class="btn btn--ghost" data-reg-print="${esc(r.id)}" data-kind="關帳單">重印關帳單</button>${DATA?.super?`<button type="button" class="btn btn--ghost" data-reg-reopen="${esc(r.id)}">重開補單</button>`:''}`:`<button type="button" class="btn btn--ghost" data-reg-cash="${esc(r.id)}">＋ 臨時收支</button><button type="button" class="btn btn--ghost" data-reg-count="${esc(r.id)}">小結點驗</button><button type="button" class="btn btn--ghost" data-reg-print="${esc(r.id)}" data-kind="小結單">印小結單</button><button type="button" class="btn btn--solid" data-reg-close="${esc(r.id)}">關帳</button>`}</div>`:''}
    </div>`;}).join('');
  return `<div class="ops-head"><h3>開關帳</h3>${opsHelp('在咖啡與三點水共用同一個抽屜帳，各記一本但同一時間只能一本開著：在咖啡關帳後，三點水才能開帳（零用金預設承接上一本的留存金）。開店放零用金按「開帳」，營業中從抽屜拿錢要記「臨時收支」、交班或隨時可「小結點驗」核對現金，打烊點鈔按「關帳」；關帳後該品牌當天不能再結帳。應有現金＝零用金＋現金營收＋臨時收入－臨時支出。')}</div><div class="reg-cards">${cards}</div>`;
}
function bindRegisterBlock(host,reload){
  bindOpenForm(host,reload);bindReasonChips(host);bindFillChips(host);
  host.querySelectorAll('[data-reg-cash]').forEach(b=>b.onclick=()=>{REG_CASH_OPEN=b.dataset.regCash;REG_CLOSE_OPEN=false;REG_COUNT_OPEN=false;reload();});
  host.querySelectorAll('[data-reg-close]').forEach(b=>b.onclick=()=>{REG_CLOSE_OPEN=b.dataset.regClose;REG_CASH_OPEN=false;REG_COUNT_OPEN=false;reload();});
  host.querySelectorAll('[data-reg-count]').forEach(b=>b.onclick=()=>{REG_COUNT_OPEN=b.dataset.regCount;REG_CASH_OPEN=false;REG_CLOSE_OPEN=false;reload();});
  host.querySelectorAll('[data-reg-print]').forEach(b=>b.onclick=()=>{const r=(REG_DATA?.registers||[]).find(x=>x.id===b.dataset.regPrint);if(r)printRegisterReport(r.report,b.dataset.kind);});
  host.querySelectorAll('[data-reg-reopen]').forEach(b=>b.onclick=async()=>{if(!await posConfirm('重開這本帳補單？關帳紀錄會保留，另開一本接著記。',{ok:'重開帳'}))return;opsThen(()=>api('/admin/registers/'+b.dataset.regReopen+'/reopen',{method:'POST',body:{}}),'已重開帳',()=>{if(typeof refreshRegWarn==='function')refreshRegWarn();return reload();});});
  const cc=host.querySelector('#reg-cash-cancel');if(cc)cc.onclick=()=>{REG_CASH_OPEN=false;reload();};
  const cs=host.querySelector('#reg-cash-save');if(cs)cs.onclick=()=>{const amount=host.querySelector('#reg-cash-amount').value.trim(),reason=host.querySelector('#reg-cash-reason').value.trim(),type=host.querySelector('#reg-cash-type').value;
    if(!/^\d+$/.test(amount)||Number(amount)<1){toast('金額請輸入正整數');host.querySelector('#reg-cash-amount').focus();return;}
    if(!reason){toast('請填寫原因');host.querySelector('#reg-cash-reason').focus();return;}
    opsThen(()=>api('/admin/registers/'+REG_CASH_OPEN+'/cash',{method:'POST',body:{type,amount:Number(amount),reason}}),out=>`已記錄${out.type==='in'?'收入':'支出'} NT$${num(out.amount)}，應有現金 NT$${num(out.expected_cash)}`,()=>{REG_CASH_OPEN=false;return reload();});};
  const xc=host.querySelector('#reg-close-cancel');if(xc)xc.onclick=()=>{REG_CLOSE_OPEN=false;reload();};
  const cf=host.querySelector('.reg-count-form');
  if(cf){const r=(REG_DATA?.registers||[]).find(x=>x.id===REG_COUNT_OPEN);const expected=Number(r?.expected)||0;
    const show=()=>{const c=readCount(cf,'#reg-count-total').total;cf.querySelector('#reg-count-show').textContent=c==null?'—':'NT$'+num(c);const ds=cf.querySelector('#reg-count-diff');ds.textContent=c==null?'—':(c-expected>0?'+':'')+num(c-expected);ds.classList.toggle('reg-diff',c!=null&&c!==expected);};
    cf.querySelectorAll('[data-denom],#reg-count-total').forEach(i=>i.oninput=show);
    cf.querySelector('#reg-count-cancel').onclick=()=>{REG_COUNT_OPEN=false;reload();};
    const submitCount=print=>{const {total,denoms}=readCount(cf,'#reg-count-total');if(total==null){toast('請點鈔：按面額填張數或填總額');return;}
      const note=cf.querySelector('#reg-count-note').value.trim();
      opsThen(()=>api('/admin/registers/'+r.id+'/count',{method:'POST',body:{counted_cash:total,denominations:denoms,note}}),out=>{if(print)printRegisterReport(out.report,'小結單');return out.diff===0?'點驗完成，現金帳對了':`點驗完成，${out.diff>0?'溢':'短'} NT$${num(Math.abs(out.diff))}`;},()=>{REG_COUNT_OPEN=false;return reload();});};
    cf.querySelector('#reg-count-go').onclick=()=>submitCount(false);cf.querySelector('#reg-count-print').onclick=()=>submitCount(true);}
  const form=host.querySelector('.reg-close-form:not(.reg-count-form)');
  if(form){const r=(REG_DATA?.registers||[]).find(x=>x.id===REG_CLOSE_OPEN);bindDailyClose(form,r,reload);}
}
function bindDailyClose(form,r,reload){
  if(!r)return;
  let submitting=false;
  const q=s=>form.querySelector(s),c=closeChecks(r),stamp=regCloseStamp(r);
  const amount=i=>i&&/^\d+$/.test(i.value.trim())&&Number(i.value)<=10000000?Number(i.value):null;
  const read=()=>{
    const done=ACCT_CONFIRMED.get(r.id)||{},accounts={};
    for(const x of c.items.slice(1))accounts[x.code]={actual:x.a.actual,reason:x.a.reason||'',confirmed:true};
    const cash=done.cash;
    return {counted_cash:cash.actual,denominations:cash.denoms||{},cash_confirmed:true,keep_cash:amount(q('#reg-keep')),note:cash.reason||'',accounts,reconciliation_version:stamp};
  };
  const show=()=>{
    const go=q('#reg-close-go');if(!c.allOk){go.disabled=true;return false;}
    const b=read(),need=false;
    go.disabled=submitting||b.keep_cash===null||need;
    q('#reg-close-status').textContent=b.keep_cash===null?'請填留存金。':'上方帳戶皆已核對，可以關帳。';
    return !go.disabled;
  };
  form.addEventListener('input',show,true);form.addEventListener('change',show);
  q('#reg-close-go').onclick=async()=>{
    if(submitting||!show())return;
    const body=read();
    submitting=true;show();
    if(!await posConfirm(`關帳 ${BRAND_LABEL[r.venue]}：訂單總額 NT$${num(r.sales.amount)}，帳戶總額 NT$${num(c.actual)}。\n關帳後今天不能再結帳。`,{ok:'關帳'})){submitting=false;show();return;}
    return ensureOperator(()=>opsThen(async()=>{try{return await api('/admin/registers/'+r.id+'/close',{method:'POST',body:{...body,operator_id:OPERATOR?.id}});}catch(e){await reload();throw e;}},async out=>{try{const printed=await printRegisterReport(out.report,'關帳單');return printed===false?'日結關帳完成；列印未完成，請按「重印關帳單」':'日結關帳完成';}catch(e){return '日結關帳完成；列印失敗，請按「重印關帳單」';}},()=>{ACCT_CONFIRMED.delete(r.id);REG_CLOSE_DRAFTS.delete(r.id);REG_CLOSE_OPEN=false;if(typeof refreshRegWarn==='function')refreshRegWarn();return reload();}).finally(()=>{submitting=false;if(REG_CLOSE_OPEN===r.id)show();})).finally(()=>{submitting=false;if(REG_CLOSE_OPEN===r.id)show();});
  };
  show();
}

/* 日結：依營業日（03:00 起算）彙總；現金對帳走開關帳區塊；CSV 由 downloadCSV 產生（含公式注入防護） */
async function loadSales(){
  const host=document.getElementById('sales-body');if(!host)return;
  if(!SALES_DAY)SALES_DAY=MenuLib.businessDay();
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<h2>日結報表</h2><p class="hint">載入中…</p>';}
  let d;try{[d,REG_DATA]=await Promise.all([api(`/admin/sales?day=${encodeURIComponent(SALES_DAY)}`+(SCOPE?'&venue='+SCOPE:'')),api(`/admin/registers?day=${encodeURIComponent(SALES_DAY)}`+(SCOPE?'&venue='+SCOPE:'')).catch(()=>null)]);}catch(e){host.innerHTML=`<h2>日結報表</h2><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  const methods=Object.entries(d.by_method||{}).sort((a,b)=>b[1]-a[1]).map(([m,v])=>`<tr><td>${esc(payMethodLabel(m))}</td><td class="num">${num(v)}</td><td class="num">${d.amount?Math.round(v/d.amount*100):0}%</td></tr>`).join('')||'<tr><td colspan="3" class="a-empty">這天沒有營收</td></tr>';
  const hours=Object.entries(d.by_hour||{}).sort(),maxH=Math.max(1,...hours.map(h=>h[1]));
  const hourBars=hours.map(([h,v])=>`<div class="sales-bar"><span class="a-mono">${esc(h)}:00</span><i style="width:${Math.round(v/maxH*100)}%"></i><span class="num">${num(v)}</span></div>`).join('')||'<p class="a-empty">—</p>';
  const hasProducts=!!document.getElementById('analytics-body');   // POS 平板有「分析」分頁：品項銷量整合到那邊，日結只留捷徑
  const items=(d.items||[]).map(it=>`<tr><td>${esc(it.zh)}</td>${SCOPE?'':`<td>${esc(BRAND_LABEL[it.venue]||'')}</td>`}<td class="num">${it.qty}</td><td class="num">${num(it.amount)}</td></tr>`).join('')||`<tr><td colspan="${SCOPE?3:4}" class="a-empty">—</td></tr>`;
  // LINE Pay 對帳：LINE Pay 後台實收（每日 04:30 同步）vs POS 登記為 LINE Pay 的單；差額非 0 標紅
  const lp=d.linepay||{},lpPos=lp.pos||{},lpLp=lp.linepay||{},diff=Number(lp.diff)||0;
  const lpRows=(lp.rows||[]).map(t=>`<tr class="${t.amount<0?'lp-refund':''}"><td class="a-mono">${esc(clockText(t.paid_at))}</td><td>${esc(t.venue_label||'')}</td><td>${esc(t.type_label||t.type)}</td><td class="num">${num(t.amount)}</td><td>${esc(t.method_label||t.method)}${t.card_last4?` <span class="a-mono">…${esc(t.card_last4)}</span>`:''}</td><td class="a-mono">${esc(t.confirm_no||'')}</td></tr>`).join('')||`<tr><td colspan="6" class="a-empty">${lp.configured===false?'尚未設定 LINE Pay 商家後台帳密，請到後台「系統設定」填入':'這天沒有 LINE Pay 實收'}</td></tr>`;
  const lpStatus=diff===0?(lpLp.count||lpPos.count?'<span class="pill pill-ok">帳對了</span>':''):`<span class="pill pill-bad">差額 ${diff>0?'+':''}${num(diff)}</span>`;
  const lpVenues=Object.values(lp.by_venue||{}),lpVenueTable=!SCOPE&&lpVenues.length?`<div class="a-wrap2"><table class="a-tbl"><thead><tr><th>店別</th><th class="num">POS 登記</th><th class="num">LINE Pay 實收</th><th class="num">差額</th></tr></thead><tbody>${lpVenues.map(v=>`<tr class="${v.diff?'lp-diff':''}"><td>${esc(v.label)}</td><td class="num">${num(v.pos.amount)} <span class="hint">${num(v.pos.count)} 單</span></td><td class="num">${num(v.linepay.amount)} <span class="hint">${num(v.linepay.count)} 筆</span></td><td class="num">${v.diff>0?'+':''}${num(v.diff)}</td></tr>`).join('')}</tbody></table></div>`:'';
  // 背景同步失敗不寄信，直接顯示在畫面上（成功同步後自動消失）
  const lpSyncErr=x=>x&&x.sync_error?`<p class="hint lp-sync-err" role="alert" style="color:#c0392b;font-weight:600">⚠ LINE Pay 自動同步失敗${x.sync_failed_at?`（${esc(applicationTime(x.sync_failed_at))}）`:''}：${esc(x.sync_error)}。請按「同步 LINE Pay」重試；持續失敗請確認商家後台帳密。</p>`:'';
  const lpHint=diff>0?'LINE Pay 收到的比 POS 登記多：可能有單漏登、或登成現金／刷卡。':diff<0?'POS 登記的 LINE Pay 比實際收到多：可能客人未完成付款、或已在 LINE Pay 退款但 POS 沒作廢。':'';
  const lpBlock=`<div class="ops-head"><h3>LINE Pay 對帳 ${lpStatus}</h3>${opsHelp('左邊是 POS 結帳時選「LINE Pay」的成立單，右邊是 LINE Pay 商家後台同一營業日的實收（退款已扣）。LINE Pay 只有一個商店帳號，店別依當天開關帳時間歸屬：開帳到關帳之間的實收算該店，關帳後的實收一律算下一本帳（在咖啡關帳後算三點水、三點水關帳後算在咖啡）；還沒開過帳的日子才用 08:00–17:00／17:00 之後分。')}</div>${lp.synced_at||lpHint?`<p class="hint">${lp.synced_at?`上次同步 ${esc(applicationTime(lp.synced_at))}。`:''}${esc(lpHint)}</p>`:''}${lpSyncErr(lp)}
    <div class="a-kpis lp-kpis"><div class="a-kpi"><div class="kl">POS 登記 LINE Pay</div><div class="kv"><span class="u">NT$</span>${num(lpPos.amount)}</div><div class="ks">${num(lpPos.count)} 單</div></div><div class="a-kpi"><div class="kl">LINE Pay 實收</div><div class="kv"><span class="u">NT$</span>${num(lpLp.amount)}</div><div class="ks">${num(lpLp.count)} 筆${lpLp.refunds?` · 退 ${num(lpLp.refunds)} 筆 NT$${num(lpLp.refund_amount)}`:''}</div></div><div class="a-kpi ${diff?'lp-diff':''}"><div class="kl">差額</div><div class="kv"><span class="u">NT$</span>${diff>0?'+':''}${num(diff)}</div><div class="ks">${diff===0?'實收＝登記':'實收－POS 登記'}</div></div></div>
    ${lpVenueTable}
    <div class="a-toolbar"><button class="btn btn--ghost btn-sm" id="lp-sync" ${lp.configured===false?'disabled':''}>同步 LINE Pay</button><button class="btn btn--ghost btn-sm" id="lp-csv">匯出 LINE Pay CSV</button></div>
    <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>時間</th><th>店別</th><th>類型</th><th class="num">金額</th><th>付款方式</th><th>驗證碼</th></tr></thead><tbody>${lpRows}</tbody></table></div>`;
  // 信用卡對帳：兩者同一台台新收單機、沒有查詢 API，手動填一次實收總額；差額非 0 要填差異原因才能存（小結、關帳都看得到這塊）
  const ts=d.taishin||{},tsPos=ts.pos||{},tsManual=ts.manual||null,tsDiff=ts.diff;
  const tsStatus=SCOPE?'<span class="pill pill-draft">全店實收參考，非品牌對帳結果</span>':tsManual==null?'':tsDiff===0?'<span class="pill pill-ok">帳對了</span>':`<span class="pill pill-bad">差額 ${tsDiff>0?'+':''}${num(tsDiff)}</span>`;
  const tsBlock=`<div class="ops-head"><h3>信用卡對帳 ${tsStatus}</h3>${opsHelp('信用卡走同一台台新收單機，沒有提供實收總額查詢，請在「小結」「關帳」時對照台新商家後台或簡訊通知，手動填入今天的實收總額。左邊是 POS 結帳時選「信用卡」的成立單。')}</div><p class="hint">${tsManual?`上次填寫：${esc(applicationTime(tsManual.updated_at))}${tsManual.filled_by?' · '+esc(tsManual.filled_by):''}。`:'今天還沒有人填寫。'}</p>
    <div class="a-kpis"><div class="a-kpi"><div class="kl">POS 登記信用卡</div><div class="kv"><span class="u">NT$</span>${num(tsPos.amount)}</div><div class="ks">${num(tsPos.count)} 單</div></div><div class="a-kpi ${tsDiff?'lp-diff':''}"><div class="kl">差額</div><div class="kv"><span class="u">NT$</span>${tsManual==null?'—':(tsDiff>0?'+':'')+num(tsDiff)}</div><div class="ks">${tsManual==null?'尚未填寫':tsDiff===0?'實收＝登記':'實收－POS 登記'}</div></div></div>
    <form class="a-form" id="ts-form"><label>實收總額<input id="ts-amount" type="number" inputmode="numeric" min="0" step="1" value="${tsManual?Number(tsManual.amount):''}" placeholder="0" required style="width:140px"></label><label class="f-grow">差異原因（差額非 0 必填）<input id="ts-reason" maxlength="200" value="${esc(tsManual?.reason||'')}" placeholder="選下面或自己填"></label><button class="btn btn--solid" type="submit">儲存</button>${fillChips('ts-amount',[[Number(tsPos.amount)||0,'同 POS 登記 $'+num(tsPos.amount)]])}${reasonChips('ts-reason',REASON_PRESETS.taishin)}</form>`;
  host.innerHTML=`<div class="ops-head"><h2>日結報表</h2>${opsHelp('營業日從凌晨 03:00 起算到翌日 03:00（三點水深夜的單算前一天）。作廢的單不計營收、另列筆數；折扣與贈送已從營收扣除、另列金額。CSV 含每一筆品項明細、折扣與付款方式，可直接交會計。')}</div>
    <div class="a-toolbar"><label>營業日 <input type="date" id="sales-day" value="${esc(d.day)}"></label><button class="btn btn--ghost btn-sm" id="sales-prev">前一天</button><button class="btn btn--ghost btn-sm" id="sales-next">後一天</button><button class="btn btn--ghost btn-sm" id="sales-today">今天</button><button class="btn btn--solid btn-sm" id="sales-csv">匯出 CSV</button></div>
    <div class="a-kpis sales-kpis"><div class="a-kpi"><div class="kl">營收</div><div class="kv"><span class="u">NT$</span>${num(d.amount)}</div><div class="ks">折扣後實收</div></div><div class="a-kpi"><div class="kl">成立單數</div><div class="kv">${num(d.orders)}<span class="u"> 單</span></div><div class="ks">平均每單 NT$${num(d.orders?Math.round(d.amount/d.orders):0)}</div></div><div class="a-kpi"><div class="kl">折扣</div><div class="kv"><span class="u">NT$</span>${num(d.discount_amount)}</div><div class="ks">${num(d.discount_count)} 單${d.comp_count?` · 贈送 ${num(d.comp_count)} 項`:''}</div></div>${d.redeem_points?`<div class="a-kpi"><div class="kl">點數兌換</div><div class="kv">${num(d.redeem_points)}<span class="u"> 點</span></div><div class="ks">${num(d.redeem_count)} 單 · 折抵 NT$${num(d.redeem_value)}</div></div>`:''}<div class="a-kpi"><div class="kl">作廢</div><div class="kv">${num(d.voided)}<span class="u"> 單</span></div><div class="ks">NT$${num(d.void_amount)} 不計營收</div></div></div>
    ${REG_DATA?accountConfirmBlock(REG_DATA,d)+registerBlock(REG_DATA):''}
    <div class="sales-cols"><div><h3>付款方式</h3><div class="a-wrap2"><table class="a-tbl"><thead><tr><th>方式</th><th class="num">金額</th><th class="num">占比</th></tr></thead><tbody>${methods}</tbody></table></div></div><div><h3>時段分布</h3><div class="sales-bars">${hourBars}</div></div></div>
    ${hasProducts?`<div class="a-toolbar"><a class="btn btn--ghost btn-sm" id="sales-items-go" data-tab="analytics" href="${esc(opsHref('analytics'))}">品項銷量 → 分析（${esc(d.day)}）</a></div>`:`<h3>品項銷量</h3><div class="a-wrap2"><table class="a-tbl"><thead><tr><th>品項</th>${SCOPE?'':'<th>店別</th>'}<th class="num">數量</th><th class="num">金額</th></tr></thead><tbody>${items}</tbody></table></div>`}
    <details><summary>帳務參考（另行逐項確認）</summary><p class="hint">LINE Pay 依開關帳時間歸屬店別，台新手填紀錄為全店實收；請核對商家紀錄後，在上方關帳流程逐一填寫本品牌實收。</p>${lpBlock}${tsBlock}</details>`;
  bindAccountConfirm(host,d,loadSales);bindRegisterBlock(host,loadSales);bindReasonChips(host);bindFillChips(host);
  const shift=n=>{const t=new Date(SALES_DAY+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);SALES_DAY=t.toISOString().slice(0,10);REG_CASH_OPEN=false;REG_CLOSE_OPEN=false;REG_COUNT_OPEN=false;REG_OPEN_FORM='';loadSales();};
  // 同步：抓「這個營業日前後 3 天」，退款會回補到幾天前；按下去要等後台登入、約 20–60 秒
  host.querySelector('#lp-sync').onclick=e=>{const b=e.currentTarget;b.disabled=true;b.textContent='同步中…（約 1 分鐘）';
    const addDays=(day,n)=>{const t=new Date(day+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
    const start=addDays(d.day,-3),end=[addDays(d.day,1),todayTaipei()].sort()[0];
    opsThen(()=>api('/admin/sales/linepay/sync',{method:'POST',body:{start,end}}),out=>`已同步 ${out.start} ～ ${out.end}，${out.count} 筆`,loadSales).finally(()=>{b.disabled=false;b.textContent='同步 LINE Pay';});};
  host.querySelector('#lp-csv').onclick=()=>downloadCSV(`LINEPay_${d.day}.csv`,lp.csv||[]);
  host.querySelector('#ts-form').onsubmit=e=>{
    e.preventDefault();
    const amount=Number(host.querySelector('#ts-amount').value),reason=host.querySelector('#ts-reason').value.trim();
    if(!Number.isInteger(amount)||amount<0){toast('請輸入實收總額（0 以上整數）');return;}
    opsThen(()=>api('/admin/sales/taishin',{method:'POST',body:{day:d.day,amount,reason}}),'已儲存信用卡實收總額',loadSales);
  };
  host.querySelector('#sales-day').onchange=e=>{SALES_DAY=e.target.value||MenuLib.businessDay();loadSales();};
  host.querySelector('#sales-prev').onclick=()=>shift(-1);
  host.querySelector('#sales-next').onclick=()=>shift(1);
  host.querySelector('#sales-today').onclick=()=>{SALES_DAY=MenuLib.businessDay();loadSales();};
  const ig=host.querySelector('#sales-items-go');if(ig)ig.onclick=()=>{ANALYTICS_FROM=d.day;ANALYTICS_TO=d.day;ANALYTICS_KIND='products';};   // 宿主頁的 a[data-tab] 點擊處理會切到分析（銷量），帶這個營業日
  host.querySelector('#sales-csv').onclick=()=>downloadCSV(`日結_${d.day}${SCOPE?'_'+(BRAND_LABEL[SCOPE]||SCOPE):''}.csv`,d.csv||[]);
}

/* 估清：每格點開設定「今日估清／剩幾份／恢復不限量」，直接寫伺服器（只動 sold_out／stock_*）；送單自動扣份數，扣到 0＝售完；翌日 03:00 自動恢復 */
function tabSoldOut(){ return '<div class="a-sec" id="soldout-body"></div>'; }
let SO_PAUSE=null,SO_TIMER=null;
// 輪詢回來的即時估清／份數套進本機菜單（POS 不必重新整理就看到別台平板或客人送單扣掉的份數）
function applyLiveStock(list){
  if(!Array.isArray(list)||!MENU_DOC)return;
  const by=new Map(list.map(x=>[x.id,x]));
  MENU_DOC.items=MENU_DOC.items.map(it=>{const x=by.get(it.id);return x?{...it,sold_out:x.sold_out||'',stock_day:x.stock_day||'',stock_left:x.stock_left??null}:(it.sold_out||it.stock_day?{...it,sold_out:'',stock_day:'',stock_left:null}:it);});
}
function soState(it){
  const left=MenuLib.stockLeft(it);
  if(MenuLib.soldOutToday(it))return {cls:'off',text:left===0?'已賣完（剩 0 份）':'今日估清'};
  if(left!==null)return {cls:left<=3?'low':'limited',text:`剩 ${left} 份`};
  return {cls:'',text:'供應中'};
}
function soEdit(it){
  return new Promise(resolve=>{
    const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
    const finish=v=>{if(ov.parentNode)ov.parentNode.removeChild(ov);resolve(v);};
    const left=MenuLib.stockLeft(it);let val=left!==null&&left>0?String(left):'';
    ov.innerHTML=`<div class="op-card so-edit" role="dialog" aria-label="${esc(it.zh)} 供應設定">
      <div class="so-edit-head">${itemThumb(it,'so-edit__img')}<div><h2>${esc(it.zh)}</h2><p class="hint hint--tight">目前：${esc(soState(it).text)}</p></div></div>
      <p class="so-edit-label">今天剩幾份？<span class="hint hint--tight">客人送單自動扣，扣到 0 自動售完</span></p>
      <div class="so-edit-val" aria-live="polite"><b id="so-val"></b><span>份</span></div>
      <div class="so-quick">${[3,5,10,20].map(n=>`<button type="button" data-q="${n}">${n}</button>`).join('')}</div>
      <div class="so-pad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-k="${n}">${n}</button>`).join('')}<button type="button" data-k="clr" aria-label="清除">清除</button><button type="button" data-k="0">0</button><button type="button" data-k="del" aria-label="退格">⌫</button></div>
      <div class="op-card-actions so-edit-actions">
        <button type="button" class="btn btn--solid" data-act="set">設定份數</button>
        <button type="button" class="btn btn--ghost btn--danger" data-act="out">今日估清</button>
        <button type="button" class="btn btn--ghost" data-act="free">恢復不限量</button>
        <button type="button" class="btn btn--ghost" data-act="cancel">取消</button>
      </div></div>`;
    const show=()=>{ov.querySelector('#so-val').textContent=val===''?'—':val;ov.querySelector('[data-act="set"]').disabled=val==='';};show();
    ov.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k;if(k==='clr')val='';else if(k==='del')val=val.slice(0,-1);else if(val.length<4)val=(val==='0'?'':val)+k;show();});
    ov.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{val=b.dataset.q;show();});
    ov.querySelector('[data-act="set"]').onclick=()=>{if(val!=='')finish({left:Number(val)});};
    ov.querySelector('[data-act="out"]').onclick=()=>finish({sold_out:true});
    ov.querySelector('[data-act="free"]').onclick=()=>finish({free:true});
    ov.querySelector('[data-act="cancel"]').onclick=()=>finish(null);
  });
}
async function loadSoldOut(refresh){
  const host=document.getElementById('soldout-body');if(!host)return;
  clearTimeout(SO_TIMER);
  if(SO_PAUSE===null||refresh===true){try{SO_PAUSE=(await api('/admin/orders/pause'+scopeQuery())).pause||{};}catch(e){SO_PAUSE=SO_PAUSE||{};toast('暫停點餐狀態載入失敗：'+e.message);}}
  if(refresh!=='paint'){try{const d=await api('/admin/orders'+scopeQuery());applyLiveStock(d.stock);}catch(e){}}
  if(!document.getElementById('soldout-body'))return;
  const items=MenuLib.sortItems((MENU_DOC?.items||[]).filter(it=>it.published&&!it.pos_only&&(!SCOPE||it.venue===SCOPE)));   // 「其他」這類 POS 限定品項沒有估清的意義
  const groups=new Map();for(const it of items){if(!groups.has(it.cat))groups.set(it.cat,[]);groups.get(it.cat).push(it);}
  const cards=[...groups].map(([cat,list])=>`<h3>${esc(MenuLib.CAT_LABEL[cat]?.zh||cat)}</h3><div class="so-grid">${list.map(it=>{const st=soState(it),off=st.cls==='off';return `<button type="button" class="so-item ${st.cls}" data-so="${esc(it.id)}" aria-pressed="${off?'true':'false'}">${itemThumb(it,'so-item__img')}<b>${esc(it.zh)}</b><span>NT$${num(it.price)}${SCOPE?'':' · '+esc(BRAND_LABEL[it.venue]||it.venue)}</span><small>${esc(st.text)}</small></button>`;}).join('')}</div>`).join('')||'<p class="a-empty">沒有已發布的菜單項目，請先在後台「菜單」儲存菜單。</p>';
  const sig=JSON.stringify([SO_PAUSE,items.map(it=>[it.id,it.image,soState(it).text])]);
  if(host.dataset.sig!==sig){host.dataset.sig=sig;
    host.innerHTML=`<div class="ops-head"><h2>估清</h2>${opsHelp('點一下品項設定「今日估清」或「剩餘份數」：客人每送一份就自動扣，扣到 0 自動售完、客人掃碼點不到；翌日 03:00 自動恢復供應。櫃檯加點不受份數限制。')}</div><div class="a-toolbar pos-tools" id="so-pause">${posPauseHtml(SO_PAUSE)}</div>${cards}`;
    bindPosPause(host,()=>loadSoldOut(true));
    host.querySelectorAll('[data-so]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.so,it=(MENU_DOC?.items||[]).find(x=>x.id===id);if(!it)return;
      const pick=await soEdit(it);if(!pick)return;
      if(pick.left!==undefined)return opsThen(()=>api('/admin/menu/stock',{method:'POST',body:{item_id:id,left:pick.left}}),pick.left>0?`已設定今天剩 ${pick.left} 份`:'已設為 0 份（售完）',out=>{MENU_DOC.items=MENU_DOC.items.map(x=>x.id===id?{...x,sold_out:'',stock_day:out.stock_day,stock_left:out.stock_left}:x);loadSoldOut('paint');});
      const on=!!pick.sold_out;
      opsThen(()=>api('/admin/menu/sold-out',{method:'POST',body:{item_id:id,sold_out:on}}),on?'已標記今日估清，客人掃碼點不到':'已恢復供應（不限量）',()=>{MENU_DOC.items=MENU_DOC.items.map(x=>x.id===id?{...x,sold_out:on?MenuLib.businessDay():'',stock_day:'',stock_left:null}:x);loadSoldOut('paint');});
    });
  }
  SO_TIMER=setTimeout(()=>{if(document.getElementById('soldout-body'))loadSoldOut();},20000);
}

/* ===== 排班與打卡：員工用 4 位數識別碼在平板打卡（/pos/clock）；排班表以週為單位（/pos/shifts 與後台「排班打卡」共用）；員工名單與出勤報表在後台 ===== */
function tabClock(){ return '<div class="a-sec" id="clock-body"></div>'; }
function tabShifts(){ return '<div class="a-sec" id="shifts-body"></div>'; }
function tabStaff(){ return '<div class="a-sec" id="staff-body"></div>'; }
const VENUE_HOURS={CAFE:['08:00','17:00'],BAR:['17:00','03:00']};
const WEEKDAY=['一','二','三','四','五','六','日'];
const dayText=d=>{const t=new Date(d+'T12:00:00Z');return `${Number(d.slice(5,7))}/${Number(d.slice(8,10))}（${WEEKDAY[(t.getUTCDay()+6)%7]}）`;};
const addDaysStr=(day,n)=>{const t=new Date(day+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
const mondayOf=day=>addDaysStr(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
const hoursText=m=>m==null?'—':`${Math.floor(m/60)} 時${m%60?` ${m%60} 分`:''}`;
const localStamp=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('sv-SE',{timeZone:'Asia/Taipei',hour12:false}).slice(0,16);};
// 現在是哪家店在營業（08–17 在咖啡，其餘三點水）；有選店別就用店別
const venueNow=()=>{if(SCOPE)return SCOPE;const h=Number(new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit'}).slice(0,2));return h>=8&&h<17?'CAFE':'BAR';};

/* 打卡：大數字鍵盤輸入識別碼 → 上班／下班；結果用大字卡片顯示幾秒；下方列目前在班上的人 */
async function loadClock(){
  const host=document.getElementById('clock-body');if(!host)return;
  const today=MenuLib.businessDay();
  let working=[];try{working=(await api(`/admin/attendance?from=${today}&to=${today}`)).working||[];}catch(e){}
  paintClock(host,working);
}
function paintClock(host,working){
  const dots=[0,1,2,3].map(i=>`<i class="${i<CLOCK_PIN.length?'on':''}"></i>`).join('');
  const keys=['1','2','3','4','5','6','7','8','9','⌫','0','清除'].map(k=>`<button type="button" class="clock-key" data-key="${esc(k)}">${esc(k)}</button>`).join('');
  const msg=CLOCK_MSG?`<div class="clock-msg ${CLOCK_MSG.ok?'ok':'bad'}" role="status">${esc(CLOCK_MSG.text)}</div>`:'';
  // 上班中名單：休息中標示、連續工作滿 4 小時沒休息的標紅（勞基法第 35 條：連續工作 4 小時至少休息 30 分鐘）
  const list=working.map(w=>`<li class="${w.on_break?'on-break':w.needs_break?'needs-break':''}"><b>${esc(w.name)}</b><span>${esc(clockText(w.clock_in))} 上班${w.shift_end?` · 排到 ${esc(w.shift_end)}`:''}${w.break_minutes?` · 已休 ${esc(hoursText(w.break_minutes))}`:''}</span>${w.on_break?`<em>休息中（${esc(clockText(w.break_since))} 起）</em>`:w.needs_break?`<em>已連續工作 ${esc(hoursText(w.continuous_minutes))}，該休息了</em>`:''}</li>`).join('');
  host.innerHTML=`<div class="ops-head"><h2>打卡</h2>${opsHelp('輸入你的 4 位數識別碼，按「上班」「下班」或「開始休息」「結束休息」。連續工作 4 小時要休息至少 30 分鐘，休息時間不算工時。忘了打卡就按下方「補打卡」自己補（只能補自己、7 天內、要寫原因）；忘記識別碼請找店長。')}</div>
    <div class="clock-pad"><div class="clock-pin" aria-label="識別碼">${dots}</div><div class="clock-keys">${keys}</div>
      <div class="clock-go"><button type="button" class="btn btn--solid" id="clock-in">上班</button><button type="button" class="btn btn--ghost" id="clock-out">下班</button><button type="button" class="btn btn--ghost" id="clock-break-start">開始休息</button><button type="button" class="btn btn--ghost" id="clock-break-end">結束休息</button></div>
      <button type="button" class="clock-makeup" id="clock-makeup">忘了打卡？補打卡</button></div>
    ${msg}
    <h3>上班中</h3>${list?`<ul class="clock-list">${list}</ul>`:'<p class="a-empty">目前沒有人在班上</p>'}`;
  host.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;if(k==='⌫')CLOCK_PIN=CLOCK_PIN.slice(0,-1);else if(k==='清除')CLOCK_PIN='';else if(CLOCK_PIN.length<4)CLOCK_PIN+=k;CLOCK_MSG=null;paintClock(host,working);});
  // 識別碼只留在記憶體（CLOCK_PIN），送出即清空，不進 localStorage、不顯示數字（畫面只有 4 個點）
  const punch=type=>{if(CLOCK_PIN.length<4){CLOCK_MSG={ok:false,text:'請先輸入 4 位數識別碼'};paintClock(host,working);return;}
    const pin=CLOCK_PIN;CLOCK_PIN='';host.querySelectorAll('.clock-go .btn').forEach(b=>b.disabled=true);
    api('/admin/attendance/punch',{method:'POST',body:{pin,type}}).then(out=>{CLOCK_MSG={ok:!out.break_short,text:out.message};},e=>{CLOCK_MSG={ok:false,text:e.message};}).then(loadClock);};
  host.querySelector('#clock-in').onclick=()=>punch('in');host.querySelector('#clock-out').onclick=()=>punch('out');
  host.querySelector('#clock-break-start').onclick=()=>punch('break_start');host.querySelector('#clock-break-end').onclick=()=>punch('break_end');
  host.querySelector('#clock-makeup').onclick=()=>{if(CLOCK_PIN.length<4){CLOCK_MSG={ok:false,text:'請先輸入你的 4 位數識別碼，再按「補打卡」'};paintClock(host,working);return;}
    const pin=CLOCK_PIN;CLOCK_PIN='';paintClock(host,working);openMakeup(pin,()=>loadClock());};
}
/* 補打卡：忘了打上班／下班時，員工用自己的識別碼補登（只能補自己、過去 7 天內、要寫原因；後台出勤紀錄會標「補打卡」備註與補登人）。
   時間用 datetime-local（台北時間字串直接送，不經裝置時區換算）；識別碼只留在閉包、送出即丟，不進 localStorage／DOM。 */
/* 時間點選：datetime-local 欄位旁列「日期（今天起往前 7 天）」與「時間（每 30 分）」膠囊，點一下組成 YYYY-MM-DDTHH:mm；
 * 兩排各自記住選到的值，欄位本身仍可用系統選取器改分鐘。 */
const TIME_SLOTS=(()=>{const o=[];for(let m=0;m<24*60;m+=30)o.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);return o;})();
function stampChips(forId){const today=todayTaipei();const days=Array.from({length:7},(_,i)=>{const d=addDaysStr(today,-i);return [d,i===0?'今天':i===1?'昨天':dayText(d)];});
  return `<div class="stamp-chips" data-stamp-for="${esc(forId)}"><div class="reason-chips reason-chips--inline" role="group" aria-label="日期">${days.map(([v,l])=>`<button type="button" data-stamp-day="${v}">${esc(l)}</button>`).join('')}</div><div class="reason-chips reason-chips--inline stamp-times" role="group" aria-label="時間">${TIME_SLOTS.map(t=>`<button type="button" data-stamp-time="${t}">${t}</button>`).join('')}</div></div>`;}
function bindStampChips(host){
  host.querySelectorAll('.stamp-chips[data-stamp-for]').forEach(box=>{
    if(box.dataset.bound)return;const inp=host.querySelector('#'+box.dataset.stampFor);if(!inp)return;box.dataset.bound='1';
    const cur=()=>{const v=String(inp.value||'');return {day:v.slice(0,10),time:v.slice(11,16)};};
    // 選中的時段要在視野內：橫向捲動列自動捲到選中那格（沒選就捲到 08:00 附近，別停在凌晨）
    const sync=()=>{const c=cur();box.querySelectorAll('[data-stamp-day]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stampDay===c.day)));let target=null;box.querySelectorAll('[data-stamp-time]').forEach(b=>{const on=b.dataset.stampTime===c.time;b.setAttribute('aria-pressed',String(on));if(on||(!target&&!c.time&&b.dataset.stampTime==='08:00'))target=b;});if(target&&typeof target.scrollIntoView==='function')try{target.scrollIntoView({block:'nearest',inline:'center'});}catch(e){}};
    const set=(day,time)=>{inp.value=`${day}T${time}`;inp.dispatchEvent(new Event('input'));inp.dispatchEvent(new Event('change'));sync();};
    box.querySelectorAll('[data-stamp-day]').forEach(b=>b.onclick=()=>set(b.dataset.stampDay,cur().time||'09:00'));
    box.querySelectorAll('[data-stamp-time]').forEach(b=>b.onclick=()=>set(cur().day||todayTaipei(),b.dataset.stampTime));
    inp.addEventListener('input',sync);sync();
  });
}
function openMakeup(pin,done){
  const nowTp=localStamp(new Date().toISOString()).replace(' ','T'),minTp=localStamp(new Date(Date.now()-7*86400e3).toISOString()).replace(' ','T');
  const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
  const close=()=>{if(ov.parentNode)ov.parentNode.removeChild(ov);};
  const TYPES=[['both','整班（上班＋下班）'],['in','只補上班'],['out','只補下班']];
  const REASONS=['忘記打卡','平板當機','臨時支援'];
  ov.innerHTML=`<div class="op-card pos-opt" role="dialog" aria-label="補打卡"><div class="pos-opt-body">
    <h2>補打卡${tipIcon('只能補自己、過去 7 天內已經發生的時間；會記下「補打卡」與原因，店長看得到。')}</h2>
    <div class="pos-opt-group"><div class="pos-opt-title"><span>補哪一種</span></div><div class="pos-opt-choices mk-types">${TYPES.map(([v,t],i)=>`<label><input type="radio" name="mk_type" value="${v}" ${i===0?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div></div>
    <label class="pos-opt-group mk-field" data-mk="in,both"><div class="pos-opt-title"><span>上班時間</span><small class="hint hint--tight">點日期、再點時間</small></div><input type="datetime-local" id="mk-in" min="${minTp}" max="${nowTp}">${stampChips('mk-in')}</label>
    <label class="pos-opt-group mk-field" data-mk="out,both"><div class="pos-opt-title"><span>下班時間</span><small class="hint hint--tight">點日期、再點時間</small></div><input type="datetime-local" id="mk-out" min="${minTp}" max="${nowTp}" value="${nowTp}">${stampChips('mk-out')}</label>
    <label class="pos-opt-group mk-field" data-mk="out,both"><div class="pos-opt-title"><span>休息分鐘</span><small class="hint hint--tight">工時會扣掉；只補下班可留空＝用已記錄的休息</small></div><input type="number" id="mk-break" inputmode="numeric" min="0" max="600" step="1" placeholder="0">${fillChips('mk-break',BREAK_PRESETS.map(([v,l])=>[String(v),l]))}</label>
    <label class="pos-opt-group mk-field"><div class="pos-opt-title"><span>原因</span><small class="hint hint--tight">必填</small></div><input type="text" id="mk-reason" maxlength="80" placeholder="例如：忘記打卡"><div class="mk-presets">${REASONS.map(r=>`<button type="button" data-mk-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div></label>
    <div class="clock-msg bad" id="mk-err" role="alert" hidden></div>
  </div><div class="op-card-actions pos-opt-actions"><button type="button" class="btn btn--ghost" id="mk-cancel">取消</button><button type="button" class="btn btn--solid" id="mk-save">送出補打卡</button></div></div>`;
  const $=sel=>ov.querySelector(sel),type=()=>ov.querySelector('[name=mk_type]:checked').value;
  const sync=()=>{ov.querySelectorAll('[data-mk]').forEach(el=>{el.hidden=!el.dataset.mk.split(',').includes(type());});};
  ov.querySelectorAll('[name=mk_type]').forEach(r=>r.onchange=sync);sync();
  bindStampChips(ov);bindFillChips(ov);
  ov.querySelectorAll('[data-mk-reason]').forEach(b=>b.onclick=()=>{$('#mk-reason').value=b.dataset.mkReason;});
  $('#mk-cancel').onclick=close;
  $('#mk-save').onclick=()=>{const t=type(),err=$('#mk-err');err.hidden=true;
    const body={pin,reason:$('#mk-reason').value.trim()};
    if(t!=='out')body.clock_in=$('#mk-in').value;if(t!=='in')body.clock_out=$('#mk-out').value;if(t!=='in'&&$('#mk-break').value!=='')body.break_minutes=Number($('#mk-break').value);
    if(t!=='out'&&!body.clock_in){err.textContent='請填上班時間';err.hidden=false;return;}
    if(t!=='in'&&!body.clock_out){err.textContent='請填下班時間';err.hidden=false;return;}
    if(body.reason.length<2){err.textContent='請寫補打卡的原因';err.hidden=false;return;}
    $('#mk-save').disabled=true;
    api('/admin/attendance/makeup',{method:'POST',body}).then(out=>{close();CLOCK_MSG={ok:!out.break_short,text:out.message};done();},e=>{$('#mk-save').disabled=false;err.textContent=e.message;err.hidden=false;});};
}

/* ===== 加點選項：跟桌邊點餐同一套規格（order-lib.js 的 optionGroups：溫度／糖度／冰塊／飯量／麵量），備註格式也一樣
 * 「糖度：半糖；冰塊：去冰；其他需求」——出餐單、收據明細、查單看到的字串與客人自己掃碼點的一致。
 * 沒有選項的品項（甜點、單品）不跳面板直接加。order-lib.js 沒載到（舊快取）就退回直接加，不擋結帳。 */
function itemOptionGroups(it){ if(it&&it.cat==='COMBO')return (typeof OrderLib!=='undefined'&&OrderLib.comboGroups)?OrderLib.comboGroups(it,MENU_DOC?.items||[],'zh'):[]; return (it&&typeof OrderLib!=='undefined'&&OrderLib.optionGroups)?OrderLib.optionGroups(it,'zh'):[]; }
// 套餐內容（出餐單、看板、收據、查單共用）：每個選擇欄一行「飲品：拿鐵咖啡（溫度：熱；糖度：半糖）」
const partsOf=l=>Array.isArray(l?.parts)?l.parts:[];
const partText=p=>`${p.slot}：${p.zh}`;
const partsHtml=l=>partsOf(l).length?`<div class="ops-parts">${partsOf(l).map(p=>`<div class="ops-part"><b>${esc(partText(p))}</b>${p.note?`<span class="ops-specs">${specParts({cat:p.cat,zh:p.zh,note:p.note}).map(s=>`<span class="ops-spec ops-spec-${s.kind} ops-spec-${s.tone}">${s.kind==='custom'?'※ ':''}${esc(s.text)}</span>`).join('')}</span>`:''}</div>`).join('')}</div>`:'';
function itemOptionNote(groups,picks,extra){ const active=groups.filter(g=>!g.when||picks[g.when.key]===g.when.value); const parts=active.map(g=>g.label+'：'+(picks[g.key]||g.choices[0])); const x=String(extra||'').trim(); if(x)parts.push(x.slice(0,80)); return parts.join('；'); }
function itemNotePresets(groups){ return groups.some(g=>g.key==='temperature'||g.key==='sugar'||g.key==='ice')?['分開裝','打包','先上']:['不要蔥','不要香菜','不辣','加辣','醬另放','分開裝','打包','先上']; }
/* 細項畫面在中欄（取代菜單）：POS_OPT 存狀態，15 秒輪詢重畫也不會丟掉已選的規格；確定才送出，取消／返回不新增 */
function optionPaneHtml(o){
  const it=o.it,groups=o.groups;
  return `<div class="pos-opt pos-opt-pane" role="group" aria-label="餐點細項">
    <div class="pos-opt-body">
      <h2>${o.line?'編輯：':''}${esc(it.zh)}</h2><p class="hint hint--tight">NT$${num(it.price)}${it.en?' · '+esc(it.en):''}</p>
      <div class="pos-opt-group"><div class="pos-opt-title"><span>數量</span></div><div class="pos-opt-qty"><button type="button" data-oq="-1" aria-label="減少">−</button><b id="pos-opt-qty">${o.qty}</b><button type="button" data-oq="1" aria-label="增加">＋</button></div></div>
      ${groups.map(g=>`<div class="pos-opt-group" data-opt="${esc(g.key)}"><div class="pos-opt-title"><span>${esc(g.label)}</span><small class="hint hint--tight">必選</small></div><div class="pos-opt-choices">${g.choices.map((c,i)=>`<label><input type="radio" name="pos_opt_${esc(g.key)}" value="${esc(c)}" ${(o.picks[g.key]||g.choices[0])===c?'checked':''}><span>${esc(c)}</span></label>`).join('')}</div></div>`).join('')}
      <label class="pos-opt-group"><div class="pos-opt-title"><span>其他需求</span><small class="hint hint--tight">選填，點常用的或自己補</small></div>${noteChips('pos-opt-note',itemNotePresets(groups))}<textarea id="pos-opt-note" maxlength="80" placeholder="例如：不要蔥、醬另外放">${esc(o.extra||'')}</textarea></label>
    </div>
    <div class="op-card-actions pos-opt-actions"><button type="button" class="btn btn--ghost" id="pos-opt-cancel">取消</button><button type="button" class="btn btn--solid" id="pos-opt-add">確定</button></div>
  </div>`;
}
function openItemOptions(it,groups,note0,onDone,editing){
  const picks={}; groups.forEach(g=>{ picks[g.key]=g.choices[0]; });
  POS_OPT={table:POS_TABLE,it,groups,picks,qty:1,extra:note0||'',onDone,line:null,...(editing||{})};
  paintPos();
}
function bindOptionPane(host){
  const o=POS_OPT,pane=o&&host.querySelector('.pos-opt-pane');if(!o||!pane)return;
  const q=sel=>pane.querySelector(sel),groups=o.groups;
  const paint=()=>{ q('#pos-opt-qty').textContent=o.qty; };
  pane.querySelectorAll('[data-oq]').forEach(b=>b.onclick=()=>{ o.qty=Math.max(1,Math.min(20,o.qty+Number(b.dataset.oq))); paint(); });
  const syncGroups=()=>{const active=(typeof OrderLib!=='undefined'&&OrderLib.activeOptionGroups)?OrderLib.activeOptionGroups(groups,o.picks):groups;groups.forEach(g=>{const el=pane.querySelector(`[data-opt="${g.key}"]`);if(el)el.hidden=!active.includes(g);});};
  pane.querySelectorAll('input[type=radio]').forEach(r=>r.onchange=()=>{ if(r.checked)o.picks[r.name.replace(/^pos_opt_/,'')]=r.value; syncGroups(); });
  syncGroups();
  const ta=q('#pos-opt-note');ta.addEventListener('input',()=>{o.extra=ta.value;});
  q('#pos-opt-cancel').onclick=()=>{ POS_OPT=null; paintPos(); };
  q('#pos-opt-add').onclick=()=>{ const isCombo=groups.some(g=>g.combo); const note=isCombo?String(ta.value||'').trim().slice(0,80):itemOptionNote(groups,o.picks,ta.value); const done=o.onDone; const body={item_id:o.it.id,qty:o.qty,note}; if(isCombo)body.combo=OrderLib.comboPayload(groups,o.picks); POS_OPT=null; paintPos(); done(body); };
}
// 把已存的備註字串（「糖度：半糖；冰塊：去冰；其他」）拆回規格選項與其他需求，編輯既有品項時帶入
function itemOptionParse(groups,note){
  const picks={},rest=[];const parts=String(note||'').split('；').map(x=>x.trim()).filter(Boolean);
  groups.forEach(g=>{picks[g.key]=g.choices[0];});
  for(const p of parts){const g=groups.find(x=>p.startsWith(x.label+'：')&&x.choices.includes(p.slice(x.label.length+1)));if(g)picks[g.key]=p.slice(g.label.length+1);else rest.push(p);}
  return {picks,extra:rest.join('；')};
}

/* ===== 操作人員：疊在品牌帳號登入之上的識別——沿用排班打卡同一組 4 位數識別碼認人，結帳／開桌時記下是誰經手。
 * 不是帳密登入：平板仍用品牌管理員帳號登入 token；這組識別碼只存「現在是誰在操作」的名字，不是憑證。 */
let OPERATOR=null; /* 只在一次動作期間存在，不寫入儲存；每次要動作才輸入 PIN */
let OP_PIN='',OP_MSG=null,OP_BUSY=false;
/* 需要 PIN 的動作（結帳、作廢、開錢櫃…）：每次都先跳鍵盤認人，動作做完就忘掉 */
async function ensureOperator(cb){ return new Promise((resolve,reject)=>openOperatorPad(async()=>{ try{ resolve(await cb()); }catch(e){reject(e);}finally{ OPERATOR=null; } },false,()=>{OPERATOR=null;resolve();})); }
function openOperatorPad(onDone,required,onCancel){
  OP_PIN=''; OP_MSG=null;
  const ov=document.createElement('div'); ov.className='op-overlay';
  document.body.appendChild(ov);
  const close=()=>{ if(ov.parentNode)ov.parentNode.removeChild(ov); };
  const paint=()=>{
    const dots=[0,1,2,3].map(i=>`<i class="${i<OP_PIN.length?'on':''}"></i>`).join('');
    const keys=['1','2','3','4','5','6','7','8','9','⌫','0','清除'].map(k=>`<button type="button" class="clock-key" data-key="${esc(k)}">${esc(k)}</button>`).join('');
    const msg=OP_MSG?`<div class="clock-msg ${OP_MSG.ok?'ok':'bad'}" role="status">${esc(OP_MSG.text)}</div>`:'';
    ov.innerHTML=`<div class="op-card" role="dialog" aria-label="操作人員">
      <h2>操作人員${tipIcon(required?'閒置太久，畫面已鎖定。輸入你的 4 位數識別碼繼續。':'輸入你的 4 位數識別碼，這筆操作會記下是你。')}</h2>
      <div class="clock-pad"><div class="clock-pin" aria-label="識別碼">${dots}</div><div class="clock-keys">${keys}</div></div>
      ${msg}
      <div class="op-card-actions">${required?'<button type="button" class="btn btn--ghost" id="op-logout">登出</button>':'<button type="button" class="btn btn--ghost" id="op-cancel">取消</button>'}</div>
    </div>`;
    ov.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{ if(OP_BUSY)return; const k=b.dataset.key; if(k==='⌫')OP_PIN=OP_PIN.slice(0,-1); else if(k==='清除')OP_PIN=''; else if(OP_PIN.length<4)OP_PIN+=k; OP_MSG=null; paint(); if(OP_PIN.length===4)submit(); });
    const cancelBtn=ov.querySelector('#op-cancel'); if(cancelBtn)cancelBtn.onclick=()=>{if(OP_BUSY)return;OP_PIN='';close();onCancel?.();};
    const outBtn=ov.querySelector('#op-logout'); if(outBtn)outBtn.onclick=()=>{ document.getElementById('p-logout')?.click(); };
  };
  const submit=async()=>{
    const pin=OP_PIN; OP_BUSY=true;
    try{ const out=await api('/admin/staff/verify',{method:'POST',body:{pin}}); OPERATOR={id:out.id,name:out.name,pin}; OP_PIN=''; OP_BUSY=false; close(); onDone&&onDone(); }
    catch(e){ OP_PIN=''; OP_MSG={ok:false,text:e.message}; OP_BUSY=false; paint(); }
  };
  paint();
}

/* 排班表：週一起七欄，每欄列出誰幾點到幾點；點某天「＋ 排班」展開表單。host 由 POS 分頁或後台傳入 */
async function loadShifts(host){
  host=host||document.getElementById('shifts-body');if(!host)return;
  if(!SHIFT_WEEK)SHIFT_WEEK=mondayOf(MenuLib.businessDay());
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<h2>排班表</h2><p class="hint">載入中…</p>';}
  let d,off=[],staffing=[];try{const to=addDaysStr(SHIFT_WEEK,6);[d,off,staffing]=await Promise.all([api(`/admin/shifts?from=${SHIFT_WEEK}&to=${to}`+(SCOPE?'&venue='+SCOPE:'')),api(`/admin/shifts/days-off?from=${SHIFT_WEEK}&to=${to}`).then(x=>x.days_off||[],()=>[]),api('/admin/shifts/staffing').then(x=>x.staffing||[],()=>[])]);}catch(e){host.innerHTML=`<h2>排班表</h2><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  const today=MenuLib.businessDay(),staff=d.staff||[],shifts=d.shifts||[];
  // 每天：這天的班 ＋ 這天排休的人（灰字，自動排班不會排他）
  const cols=(d.days||[]).map(day=>{const list=shifts.filter(s=>s.day===day),offs=off.filter(o=>o.day===day);
    return `<div class="shift-day ${day===today?'today':''}"><h4>${esc(dayText(day))}<small>${list.length?list.length+' 班':''}</small></h4>${list.map(s=>`<div class="shift-item v-${esc(s.venue)}"><b>${esc(s.name)}</b><span>${esc(s.start_time)}–${esc(s.end_time)}${SCOPE?'':' · '+esc(BRAND_LABEL[s.venue]||s.venue)}</span>${s.note?`<small>${esc(s.note)}</small>`:''}<button type="button" class="shift-del" data-del="${esc(s.id)}" aria-label="刪除 ${esc(s.name)} ${esc(s.day)} 的班">×</button></div>`).join('')||'<p class="a-empty">—</p>'}${offs.map(o=>`<div class="shift-item shift-off"><b>${esc(o.name)}</b><span>排休${o.note?' · '+esc(o.note):''}</span><button type="button" class="shift-del" data-off-del="${esc(o.id)}" aria-label="取消 ${esc(o.name)} ${esc(o.day)} 的排休">×</button></div>`).join('')}<button type="button" class="btn btn--ghost btn-xs shift-add" data-add="${esc(day)}">＋ 排班</button> <button type="button" class="btn btn--ghost btn-xs shift-add" data-off="${esc(day)}">排休</button></div>`;}).join('');
  const venue=SHIFT_FORM.venue||SCOPE||venueNow();
  // 排休表單：員工挑自己、填日期（今天以後）；人力需求：各店各時段要幾個人（自動排班目標）
  const offForm=SHIFT_FORM.offDay?`<div class="a-form shift-new"><label>員工<select id="off-staff">${staff.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label>排休日<input type="date" id="off-day" value="${esc(SHIFT_FORM.offDay)}" min="${esc(today)}"></label><label class="shift-note">備註<input id="off-note" maxlength="80" placeholder="例：回家"></label>${noteChips('off-note',['回家','看醫生','學校','家庭事務','私人行程'])}
      <button type="button" class="btn btn--solid" id="off-save">加入排休</button><button type="button" class="btn btn--ghost" id="off-cancel">取消</button></div>`:'';
  const staffingForm=SHIFT_FORM.staffing?`<div class="a-form shift-new staffing-form"><div style="flex:1 1 100%">${opsHelp('各店各時段要幾個人；自動排班會照這個表把沒排休、不違反勞基法規則的員工排進去，排不滿會顯示警示。')}</div>
      ${SHIFT_FORM.staffing.map((s,i)=>`<div class="staffing-row" data-i="${i}">${SCOPE?`<b>${esc(BRAND_LABEL[SCOPE])}</b>`:`<select data-f="venue">${['CAFE','BAR'].map(v=>`<option value="${v}" ${s.venue===v?'selected':''}>${esc(BRAND_LABEL[v])}</option>`).join('')}</select>`}<input type="time" data-f="start" value="${esc(s.start)}"><span>–</span><input type="time" data-f="end" value="${esc(s.end)}"><input type="number" inputmode="numeric" data-f="headcount" min="0" max="9" step="1" value="${esc(String(s.headcount))}" aria-label="人數"><span>人</span><button type="button" class="shift-del" data-staffing-del="${i}" aria-label="刪除這列">×</button></div>`).join('')}
      <button type="button" class="btn btn--ghost btn-sm" id="staffing-add">＋ 時段</button><button type="button" class="btn btn--solid" id="staffing-save">儲存人力需求</button><button type="button" class="btn btn--ghost" id="staffing-cancel">取消</button></div>`:'';
  const warn=(SHIFT_FORM.warnings||[]).length?`<div class="shift-warn" role="status"><b>自動排班有排不滿的時段，請手動補人：</b><ul>${SHIFT_FORM.warnings.map(w=>`<li>${esc(w.message||w)}</li>`).join('')}</ul></div>`:'';
  const form=SHIFT_FORM.day?`<div class="a-form shift-new"><label>員工<select id="sh-staff">${staff.map(s=>`<option value="${esc(s.id)}" ${s.id===SHIFT_FORM.staff_id?'selected':''}>${esc(s.name)}${s.role?'（'+esc(s.role)+'）':''}</option>`).join('')}</select></label><label>營業日<input type="date" id="sh-day" value="${esc(SHIFT_FORM.day)}"></label>
      ${SCOPE?'':`<label>店別<select id="sh-venue">${['CAFE','BAR'].map(v=>`<option value="${v}" ${v===venue?'selected':''}>${esc(BRAND_LABEL[v])}</option>`).join('')}</select></label>`}
      <label>開始<input type="time" id="sh-start" value="${esc(VENUE_HOURS[venue][0])}"></label><label>結束<input type="time" id="sh-end" value="${esc(VENUE_HOURS[venue][1])}"></label><label class="shift-note">備註<input id="sh-note" maxlength="80" placeholder="例：代班"></label>
      <div class="reason-chips reason-chips--inline" role="group" aria-label="常用班別">${[['08:00','13:00','咖啡早班'],['12:00','17:00','咖啡午班'],['08:00','17:00','咖啡全日'],['17:00','22:00','三點水前段'],['21:00','03:00','三點水後段'],['17:00','03:00','三點水全日']].map(([s,e,l])=>`<button type="button" data-shift-quick="${s}-${e}">${l} ${s}–${e}</button>`).join('')}</div>${noteChips('sh-note',['代班','新人跟班','活動支援','半天'])}
      <button type="button" class="btn btn--solid" id="sh-save">加入</button><button type="button" class="btn btn--ghost" id="sh-cancel">取消</button></div>`:'';
  host.innerHTML=`<div class="ops-head"><h2>排班表</h2>${staff.length?opsHelp('員工先按「排休」填不能上班的日子；店長按「自動排班」一鍵排整週（排休日不排、依勞基法規則），再手動調整。三點水排到凌晨直接填 17:00–03:00，算開始那天的營業日。'):''}</div>${staff.length?'':'<p class="hint">還沒有員工，請先到後台（admin.emoji.tw）「排班打卡」新增員工。</p>'}
    <div class="a-toolbar"><button class="btn btn--ghost btn-sm" id="sh-prev">上週</button><b class="shift-week">${esc(d.from)} ～ ${esc(d.to)}</b><button class="btn btn--ghost btn-sm" id="sh-next">下週</button><button class="btn btn--ghost btn-sm" id="sh-this">本週</button><button class="btn btn--solid btn-sm" id="sh-auto">自動排班</button><button class="btn btn--ghost btn-sm" id="sh-staffing">人力需求</button><button class="btn btn--ghost btn-sm" id="sh-csv">匯出 CSV</button></div>
    ${warn}${form}${offForm}${staffingForm}<div class="shift-week-grid">${cols}</div>`;
  const reload=()=>loadShifts(host);
  host.querySelector('#sh-auto').onclick=async()=>{if(!staff.length){toast('請先到後台（admin.emoji.tw）「排班打卡」新增員工');return;}if(!await posConfirm(`自動排 ${d.from} ～ ${d.to} 這週？已排的班會保留，排休日不排。`,{ok:'自動排班'}))return;
    opsThen(()=>api('/admin/shifts/auto',{method:'POST',body:{from:SHIFT_WEEK,venue:SCOPE||''}}),out=>`已自動排 ${out.added.length} 班${out.warnings.length?`，${out.warnings.length} 個時段排不滿`:''}`,out=>{SHIFT_FORM={warnings:out.warnings};return reload();});};
  host.querySelector('#sh-staffing').onclick=()=>{SHIFT_FORM={staffing:staffing.map(s=>({...s}))};reload();};
  host.querySelectorAll('[data-off]').forEach(b=>b.onclick=()=>{if(!staff.length){toast('請先到後台（admin.emoji.tw）「排班打卡」新增員工');return;}SHIFT_FORM={offDay:b.dataset.off};reload();});
  host.querySelectorAll('[data-off-del]').forEach(b=>b.onclick=async()=>{if(!await posConfirm('取消這天排休？',{ok:'取消排休',cancel:'返回'}))return;opsThen(()=>api('/admin/shifts/days-off/'+b.dataset.offDel,{method:'DELETE'}),'已取消排休',reload);});
  const offCancel=host.querySelector('#off-cancel');if(offCancel)offCancel.onclick=()=>{SHIFT_FORM={};reload();};
  const offSave=host.querySelector('#off-save');if(offSave)offSave.onclick=()=>{const body={staff_id:host.querySelector('#off-staff').value,day:host.querySelector('#off-day').value,note:host.querySelector('#off-note').value};
    opsThen(()=>api('/admin/shifts/days-off',{method:'POST',body}),out=>`${out.name} ${out.day} 已排休${out.warnings.length?'；'+out.warnings.join('；'):''}`,()=>{SHIFT_FORM={};return reload();});};
  const stForm=host.querySelector('.staffing-form');if(stForm){
    const readRows=()=>[...stForm.querySelectorAll('.staffing-row')].map(r=>({venue:SCOPE||r.querySelector('[data-f=venue]').value,start:r.querySelector('[data-f=start]').value,end:r.querySelector('[data-f=end]').value,headcount:Number(r.querySelector('[data-f=headcount]').value)}));
    stForm.querySelector('#staffing-add').onclick=()=>{const v=SCOPE||venueNow();SHIFT_FORM={staffing:[...readRows(),{venue:v,start:VENUE_HOURS[v][0],end:VENUE_HOURS[v][1],headcount:1}]};reload();};
    stForm.querySelectorAll('[data-staffing-del]').forEach(b=>b.onclick=()=>{const rows=readRows();rows.splice(Number(b.dataset.staffingDel),1);SHIFT_FORM={staffing:rows};reload();});
    stForm.querySelector('#staffing-cancel').onclick=()=>{SHIFT_FORM={};reload();};
    stForm.querySelector('#staffing-save').onclick=()=>opsThen(()=>api('/admin/shifts/staffing',{method:'PUT',body:{staffing:readRows()}}),'已儲存人力需求',()=>{SHIFT_FORM={};return reload();});
  }
  host.querySelector('#sh-prev').onclick=()=>{SHIFT_WEEK=addDaysStr(SHIFT_WEEK,-7);reload();};
  host.querySelector('#sh-next').onclick=()=>{SHIFT_WEEK=addDaysStr(SHIFT_WEEK,7);reload();};
  host.querySelector('#sh-this').onclick=()=>{SHIFT_WEEK=mondayOf(MenuLib.businessDay());reload();};
  host.querySelector('#sh-csv').onclick=()=>downloadCSV(`排班_${d.from}.csv`,d.csv||[]);
  host.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(!staff.length){toast('請先到後台（admin.emoji.tw）「排班打卡」新增員工');return;}SHIFT_FORM={...SHIFT_FORM,day:b.dataset.add,venue};reload();});
  host.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!await posConfirm('刪除這一班？',{ok:'刪除',danger:true}))return;opsThen(()=>api('/admin/shifts/'+b.dataset.del,{method:'DELETE'}),'已刪除',reload);});
  const vs=host.querySelector('#sh-venue');if(vs)vs.onchange=()=>{const v=vs.value;host.querySelector('#sh-start').value=VENUE_HOURS[v][0];host.querySelector('#sh-end').value=VENUE_HOURS[v][1];SHIFT_FORM.venue=v;};
  host.querySelectorAll('[data-shift-quick]').forEach(b=>b.onclick=()=>{const [s,e]=b.dataset.shiftQuick.split('-');host.querySelector('#sh-start').value=s;host.querySelector('#sh-end').value=e;host.querySelectorAll('[data-shift-quick]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  bindNoteChips(host);bindFillChips(host);
  const cancel=host.querySelector('#sh-cancel');if(cancel)cancel.onclick=()=>{SHIFT_FORM={};reload();};
  const save=host.querySelector('#sh-save');if(save)save.onclick=()=>{const body={staff_id:host.querySelector('#sh-staff').value,day:host.querySelector('#sh-day').value,venue:vs?vs.value:(SCOPE||venue),start:host.querySelector('#sh-start').value,end:host.querySelector('#sh-end').value,note:host.querySelector('#sh-note').value};
    opsThen(()=>api('/admin/shifts',{method:'POST',body}),out=>`已排 ${out.name} ${out.day} ${out.start_time}–${out.end_time}${(out.warnings||[]).length?'。提醒：'+out.warnings.join('；'):''}`,()=>{SHIFT_FORM={day:body.day,venue:body.venue,staff_id:body.staff_id};return reload();});};
}

/* 後台「排班打卡」：員工名單（識別碼）、本週排班、出勤紀錄（工時報表） */
async function loadStaff(){
  const host=document.getElementById('staff-body');if(!host)return;
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML=`<div class="ops-head"><h2>排班打卡</h2>${opsHelp('員工不用帳號：每人一組 4 位數識別碼，在平板 POS（pos.emoji.tw）的「打卡」分頁輸入後按上班／下班。有排班的話打卡會自動算出遲到早退；出勤紀錄可匯出 CSV 給會計算薪。')}</div><div id="staff-list"></div><div id="shifts-body"></div><div id="att-body"></div>`;}
  await Promise.all([loadStaffList(host.querySelector('#staff-list')),loadShifts(host.querySelector('#shifts-body')),loadAttendance(host.querySelector('#att-body'))]);
}
async function loadStaffList(host){
  let d;try{d=await api('/admin/staff'+(SCOPE?'?venue='+SCOPE:''));}catch(e){host.innerHTML=`<h3>員工</h3><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  const staff=d.staff||[];
  const rows=staff.map(s=>`<tr class="${s.active?'':'staff-off'}"><td><b>${esc(s.name)}</b>${s.role?` <span class="hint hint--tight">${esc(s.role)}</span>`:''}</td><td class="a-mono">${s.pin!=null?esc(s.pin):'••••'}</td><td>${esc(s.venues?s.venues.map(v=>BRAND_LABEL[v]||v).join('／'):'兩店')}</td><td>${s.active?'<span class="pill pill-ok">在職</span>':'<span class="pill pill-draft">已停用</span>'}</td><td>${esc(s.note||'')}</td><td class="ops-actions"><div class="ops-btns"><button type="button" class="btn btn--ghost btn-xs" data-edit="${esc(s.id)}">編輯</button><button type="button" class="btn btn--ghost btn-xs" data-toggle="${esc(s.id)}" data-active="${s.active?'1':'0'}">${s.active?'停用':'啟用'}</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="a-empty">還沒有員工，按「新增員工」開始。</td></tr>';
  const cur=STAFF_EDIT&&STAFF_EDIT!=='new'?staff.find(s=>s.id===STAFF_EDIT):null;
  const curVenue=cur?(cur.venues&&cur.venues.length===1?cur.venues[0]:''):(SCOPE||'');
  const form=STAFF_EDIT?`<div class="a-form staff-form"><label>姓名<input id="st-name" maxlength="40" value="${esc(cur?.name||'')}" placeholder="員工姓名"></label><label>識別碼<input id="st-pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${esc(cur?.pin||'')}" placeholder="${cur?'不改就留空':'留空自動產生'}"></label>
      <label>店別<select id="st-venues">${[['','兩店都可'],['CAFE',BRAND_LABEL.CAFE],['BAR',BRAND_LABEL.BAR]].filter(([v])=>!SCOPE||!v||v===SCOPE).map(([v,l])=>`<option value="${v}" ${curVenue===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
      <label>職稱<input id="st-role" maxlength="20" value="${esc(cur?.role||'')}" placeholder="例：店長、工讀"></label>${fillChips('st-role',[['店長','店長'],['正職','正職'],['工讀','工讀'],['實習','實習']])}<label class="shift-note">備註<input id="st-note" maxlength="120" value="${esc(cur?.note||'')}"></label>
      <button type="button" class="btn btn--solid" id="st-save">${cur?'儲存':'新增'}</button><button type="button" class="btn btn--ghost" id="st-cancel">取消</button></div>`:'';
  host.innerHTML=`<div class="ops-head"><h3>員工</h3>${tipIcon('「新增員工」填姓名與店別，系統給一組 4 位數識別碼，員工用它在 POS 打卡與確認操作人員；離職或休職按「停用」，歷史紀錄保留。員工管理只在後台，平板上改不到。')}</div><div class="a-toolbar"><button class="btn btn--solid btn-sm" id="st-new">新增員工</button></div>${form}
    <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>姓名</th><th>識別碼</th><th>店別</th><th>狀態</th><th>備註</th><th class="ops-th">操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const reload=()=>loadStaffList(host);
  host.querySelector('#st-new').onclick=()=>{STAFF_EDIT='new';reload();};bindFillChips(host);
  host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{STAFF_EDIT=b.dataset.edit;reload();});
  host.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const on=b.dataset.active==='1';if(on&&!await posConfirm('停用後這位員工不能打卡，識別碼會釋出給新人。',{ok:'停用',danger:true}))return;opsThen(()=>api('/admin/staff/'+b.dataset.toggle,{method:'PATCH',body:{active:!on}}),on?'已停用':'已啟用',reload);});
  const cancel=host.querySelector('#st-cancel');if(cancel)cancel.onclick=()=>{STAFF_EDIT=null;reload();};
  const save=host.querySelector('#st-save');if(save)save.onclick=()=>{const v=host.querySelector('#st-venues').value,pin=host.querySelector('#st-pin').value.trim();const body={name:host.querySelector('#st-name').value,venues:v?[v]:[],role:host.querySelector('#st-role').value,note:host.querySelector('#st-note').value};if(pin)body.pin=pin;
    opsThen(()=>cur?api('/admin/staff/'+cur.id,{method:'PATCH',body}):api('/admin/staff',{method:'POST',body}),out=>cur?`已更新 ${out.name}`:`已新增 ${out.name}，識別碼 ${out.pin}`,()=>{STAFF_EDIT=null;return reload();});};
}
/* 修正出勤面板：上班／下班時間點日期＋時間膠囊、休息分鐘膠囊、原因膠囊，全部不必打字；留空下班＝還沒下班 */
function openAttendanceFix(r,reload,toIso){
  const tp=iso=>iso?localStamp(iso).replace(' ','T'):'';
  const {ov,close}=pickOverlay(`<h3>修正 ${esc(r.name)} ${esc(r.day)} 的出勤</h3>
    <label class="pos-opt-group mk-field"><div class="pos-opt-title"><span>上班時間</span></div><input type="datetime-local" id="fx-in" value="${esc(tp(r.clock_in))}">${stampChips('fx-in')}</label>
    <label class="pos-opt-group mk-field"><div class="pos-opt-title"><span>下班時間</span><small class="hint hint--tight">留空＝還沒下班</small></div><input type="datetime-local" id="fx-out" value="${esc(tp(r.clock_out))}">${stampChips('fx-out')}<button type="button" class="btn btn--ghost btn-xs" id="fx-out-clear" style="margin-top:6px">清空（還沒下班）</button></label>
    <label class="pos-opt-group mk-field"><div class="pos-opt-title"><span>休息分鐘</span></div><input type="number" id="fx-break" inputmode="numeric" min="0" max="600" step="1" value="${Number(r.break_minutes)||0}">${fillChips('fx-break',BREAK_PRESETS.map(([v,l])=>[String(v),l]))}</label>
    <label class="pos-opt-group mk-field"><div class="pos-opt-title"><span>原因</span><small class="hint hint--tight">選填</small></div><input id="fx-note" maxlength="200" value="${esc(r.note||'')}" placeholder="選下面或自己填">${reasonChips('fx-note',REASON_PRESETS.attendance_fix)}</label>
    <div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>取消</button><button type="button" class="btn btn--solid" data-ok>儲存修正</button></div>`,'修正出勤');
  bindStampChips(ov);bindFillChips(ov);bindReasonChips(ov);
  ov.onclick=e=>{if(e.target===ov)close();};
  ov.querySelector('[data-cancel]').onclick=close;
  ov.querySelector('#fx-out-clear').onclick=()=>{const o=ov.querySelector('#fx-out');o.value='';o.dispatchEvent(new Event('input'));};
  ov.querySelector('[data-ok]').onclick=()=>{const tIn=ov.querySelector('#fx-in').value,tOut=ov.querySelector('#fx-out').value,brk=ov.querySelector('#fx-break').value,note=ov.querySelector('#fx-note').value.trim();
    if(!tIn){toast('請選上班時間');return;}
    close();
    opsThen(async()=>{const clock_in=toIso(tIn),clock_out=toIso(tOut);if(!clock_in)throw Error('上班時間必填');return api('/admin/attendance/'+r.id,{method:'PATCH',body:{clock_in,clock_out,break_minutes:Number(brk)||0,note}});},out=>`已修正，本班 ${out.minutes!=null?hoursText(out.minutes):'尚未下班'}`,reload);};
}
/* 出勤紀錄：區間（預設最近 7 個營業日）、每人彙總、明細（可修正／刪除）、CSV */
async function loadAttendance(host){
  if(!ATT_TO){ATT_TO=MenuLib.businessDay();ATT_FROM=addDaysStr(ATT_TO,-6);}
  let d;try{d=await api(`/admin/attendance?from=${ATT_FROM}&to=${ATT_TO}`);}catch(e){host.innerHTML=`<h3>出勤紀錄</h3><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  const sum=(d.summary||[]).map(s=>`<tr><td><b>${esc(s.name)}</b></td><td class="num">${num(s.shifts)}</td><td class="num">${esc(s.hours)}</td><td class="num">${s.late?num(s.late):''}</td><td class="num">${s.open?`<span class="pill pill-bad">${num(s.open)}</span>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="a-empty">這段期間沒有出勤</td></tr>';
  const rows=(d.rows||[]).map(r=>`<tr class="${r.clock_out?'':'att-open'}"><td class="a-mono">${esc(r.day)}</td><td><b>${esc(r.name)}</b></td><td class="a-mono" title="${esc(applicationTime(r.clock_in))}">${esc(clockText(r.clock_in))}${r.late_minutes?` <span class="pill pill-wait">晚 ${num(r.late_minutes)} 分</span>`:''}</td><td class="a-mono" title="${esc(r.clock_out?applicationTime(r.clock_out):'')}">${r.clock_out?esc(clockText(r.clock_out)):r.on_break?'<span class="pill pill-wait">休息中</span>':'<span class="pill pill-bad">未打卡</span>'}${r.early_minutes?` <span class="pill pill-wait">早 ${num(r.early_minutes)} 分</span>`:''}</td><td class="num">${r.break_minutes?esc(hoursText(r.break_minutes)):''}</td><td class="num">${esc(hoursText(r.minutes))}</td><td class="hint hint--tight">${r.shift_start?esc(r.shift_start+'–'+r.shift_end):''}</td><td>${esc(r.note||'')}${r.edited_by?` <span class="hint hint--tight" title="${esc(r.edited_by)}">（已修正）</span>`:''}</td><td class="ops-actions"><div class="ops-btns"><button type="button" class="btn btn--ghost btn-xs" data-fix="${esc(r.id)}">修正</button><button type="button" class="btn btn--ghost btn-xs" data-rm="${esc(r.id)}">刪除</button></div></td></tr>`).join('')||`<tr><td colspan="9" class="a-empty">—</td></tr>`;
  host.innerHTML=`<div class="ops-head"><h3>出勤紀錄</h3>${opsHelp('工時＝下班－上班－休息，未打下班卡的不計；遲到早退以排班為準。忘了打卡用「修正」補登，會記下是誰改的。')}</div>
    <div class="a-toolbar"><label>從 <input type="date" id="att-from" value="${esc(d.from)}"></label><label>到 <input type="date" id="att-to" value="${esc(d.to)}"></label><button class="btn btn--ghost btn-sm" id="att-week">最近 7 天</button><button class="btn btn--ghost btn-sm" id="att-month">本月</button><button class="btn btn--solid btn-sm" id="att-csv">匯出 CSV</button></div>
    <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>員工</th><th class="num">班數</th><th class="num">總工時（小時）</th><th class="num">遲到</th><th class="num">未打下班卡</th></tr></thead><tbody>${sum}</tbody></table></div>
    <div class="a-wrap2" style="margin-top:14px"><table class="a-tbl"><thead><tr><th>營業日</th><th>員工</th><th>上班</th><th>下班</th><th class="num">休息</th><th class="num">工時</th><th>排班</th><th>備註</th><th class="ops-th">操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const reload=()=>loadAttendance(host);
  host.querySelector('#att-from').onchange=e=>{ATT_FROM=e.target.value||ATT_FROM;reload();};
  host.querySelector('#att-to').onchange=e=>{ATT_TO=e.target.value||ATT_TO;reload();};
  host.querySelector('#att-week').onclick=()=>{ATT_TO=MenuLib.businessDay();ATT_FROM=addDaysStr(ATT_TO,-6);reload();};
  host.querySelector('#att-month').onclick=()=>{ATT_TO=MenuLib.businessDay();ATT_FROM=ATT_TO.slice(0,8)+'01';reload();};
  host.querySelector('#att-csv').onclick=()=>downloadCSV(`出勤_${d.from}_${d.to}.csv`,d.csv||[]);
  host.querySelectorAll('[data-rm]').forEach(b=>b.onclick=async()=>{if(!await posConfirm('刪除這筆出勤？',{ok:'刪除',danger:true}))return;opsThen(()=>api('/admin/attendance/'+b.dataset.rm,{method:'DELETE'}),'已刪除',reload);});
  // 修正：一張面板（上班、下班、休息都用點的），時間用台北時間 YYYY-MM-DDTHH:mm
  const toIso=s=>{s=String(s||'').trim();if(!s)return null;if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(s))s+=':00';const t=new Date(s.replace(' ','T')+'+08:00');if(isNaN(t))throw Error('時間格式請用 2026-10-13 09:00');return t.toISOString();};
  host.querySelectorAll('[data-fix]').forEach(b=>b.onclick=()=>{const r=(d.rows||[]).find(x=>x.id===b.dataset.fix);if(!r)return;openAttendanceFix(r,reload,toIso);});
}


/* ---- 銷量／客群圖表：純 CSS，不依賴外部套件 ---- */
const CHART_COLORS=['#1f2937','#d97706','#0d9488','#7c3aed','#dc2626','#2563eb','#65a30d','#db2777'];
function hbars(rows,{fmt=num,color='var(--ink)'}={}){const mx=Math.max(1,...rows.map(r=>r[1]));return rows.length?`<div class="sales-bars chart-hbars">${rows.map(([l,v,sub])=>`<div class="sales-bar chart-hbar"><span class="chart-lbl" title="${esc(l)}">${esc(l)}</span><i style="width:${Math.max(1,Math.round(v/mx*100))}%;background:${color}"></i><span class="num">${esc(fmt(v))}${sub?`<small> ${esc(sub)}</small>`:''}</span></div>`).join('')}</div>`:'<p class="a-empty">這段期間沒有資料</p>';}
function vbars(rows,{fmt=num}={}){const mx=Math.max(1,...rows.map(r=>r[1]));return rows.length?`<div class="chart-vbars" style="--n:${rows.length}">${rows.map(([l,v])=>`<div class="chart-vcol" title="${esc(l)}：${esc(fmt(v))}"><span class="chart-vval">${v?esc(fmt(v)):''}</span><i style="height:${Math.max(v?2:0,Math.round(v/mx*100))}%"></i><span class="chart-vlbl">${esc(l)}</span></div>`).join('')}</div>`:'<p class="a-empty">這段期間沒有資料</p>';}
function donut(rows,{center=''}={}){const tot=rows.reduce((a,r)=>a+r[1],0);if(!tot)return '<p class="a-empty">這段期間沒有資料</p>';let acc=0;const stops=rows.map((r,i)=>{const a=acc/tot*100;acc+=r[1];return `${CHART_COLORS[i%CHART_COLORS.length]} ${a}% ${acc/tot*100}%`;}).join(',');
  return `<div class="chart-donut-wrap"><div class="chart-donut" style="background:conic-gradient(${stops})"><span>${esc(center)}</span></div><ul class="chart-legend">${rows.map((r,i)=>`<li><b style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></b>${esc(r[0])}<span class="num">${Math.round(r[1]/tot*100)}%<small> ${esc(r[2]??num(r[1]))}</small></span></li>`).join('')}</ul></div>`;}
function chartCard(title,body){return `<div class="chart-card"><h3>${esc(title)}</h3>${body}</div>`;}
function analyticsCharts(kind,d){
  const hrs=Object.keys(d.by_hour||{}).map(Number).sort((a,b)=>a-b);
  const hourRows=hrs.length?Array.from({length:hrs[hrs.length-1]-hrs[0]+1},(_,i)=>{const h=String(hrs[0]+i).padStart(2,'0');return [h,d.by_hour?.[h]?.amount||0];}):[];
  const wdName=['日','一','二','三','四','五','六'];
  const wdRows=[1,2,3,4,5,6,0].map(w=>['週'+wdName[w],d.by_weekday?.[w]?.amount||0]);
  const dayRows=(d.by_day||[]).map(r=>[r.day.slice(5),r.amount]);
  const c=d.customers||{};
  const pair=(a,b,la,lb)=>[[la,c[a]?.orders||0,(c[a]?.orders||0)+' 單'],[lb,c[b]?.orders||0,(c[b]?.orders||0)+' 單']];
  if(kind==='products'){
    const top=(d.items||[]).slice(0,10).map(i=>[i.zh,i.qty]);
    const topAmt=[...(d.items||[])].sort((a,b)=>b.amount-a.amount).slice(0,10).map(i=>[i.zh,i.amount]);
    const cats=(d.categories||[]).slice(0,8).map(r=>[catLabel(r.cat),r.amount,'NT$'+num(r.amount)]);
    const catQty=(d.categories||[]).slice(0,8).map(r=>[catLabel(r.cat),r.qty]);
    return `<div class="chart-grid">${chartCard('每日營收',vbars(dayRows))}${chartCard('類別營收占比',donut(cats,{center:'NT$'+num(d.amount)}))}${chartCard('熱銷品項 Top 10（數量）',hbars(top))}${chartCard('品項營收 Top 10（金額）',hbars(topAmt,{fmt:v=>'NT$'+num(v)}))}${chartCard('各類別銷量',hbars(catQty))}${chartCard('時段營收',vbars(hourRows))}</div>`;
  }
  const methods=Object.entries(d.by_method||{}).map(([k,v])=>[payMethodLabel(k),v.amount,'NT$'+num(v.amount)]).sort((a,b)=>b[1]-a[1]);
  return `<div class="chart-grid">${chartCard('會員 vs 非會員（單數）',donut(pair('member','guest','會員','非會員'),{center:num(d.orders)+' 單'}))}${chartCard('內用 vs 外帶（單數）',donut(pair('dinein','takeout','內用','外帶'),{center:num(d.orders)+' 單'}))}${chartCard('點餐方式（單數）',donut(pair('counter','qr','櫃檯點餐','含 QR 點餐'),{center:num(d.orders)+' 單'}))}${chartCard('付款方式（金額）',donut(methods,{center:'NT$'+num(d.amount)}))}${chartCard('時段來客（營收）',vbars(hourRows))}${chartCard('星期分布（營收）',vbars(wdRows))}${chartCard('每日營收',vbars(dayRows))}${chartCard('平均每單：會員 vs 非會員',hbars([['會員',c.member_avg_ticket||0],['非會員',c.guest_avg_ticket||0]],{fmt:v=>'NT$'+num(v)}))}</div>`;
}

// 「分析」分頁：銷量與客群合在同一頁，上方切換、共用日期區間（POS 平板）；/admin 仍可各自掛 products-body／customers-body
function tabProducts(){return '<div class="a-sec" id="products-body"></div>';}
function tabCustomers(){return '<div class="a-sec" id="customers-body"></div>';}
function tabAnalytics(){return '<div class="a-sec" id="analytics-body"></div>';}
let ANALYTICS_FROM='',ANALYTICS_TO='',ANALYTICS_KIND='products';
const ANALYTICS_KINDS=[['products','銷量'],['customers','客群']];
/* 常用日期區間：以營業日（03:00 分界）為「今天」；週一為一週第一天。「同期」＝上一期從頭算到與今天相同的第幾天（月底不足時截到該月最後一天）。 */
const ANALYTICS_PRESETS=[['today','今天'],['yesterday','昨天'],['week','當週'],['lastweek_td','上週同期'],['month','當月'],['lastmonth_td','上月同期'],['last7','近七天'],['last30','近三十天']];
function analyticsPresetRange(key,today){
  const [y,m,d]=String(today).split('-').map(Number),D=(yy,mm,dd)=>new Date(Date.UTC(yy,mm-1,dd));
  const f=x=>x.toISOString().slice(0,10),t=D(y,m,d),add=(x,n)=>new Date(x.getTime()+n*864e5);
  const wd=(t.getUTCDay()+6)%7,mon=add(t,-wd);
  const dim=(yy,mm)=>new Date(Date.UTC(yy,mm,0)).getUTCDate();
  const py=m===1?y-1:y,pm=m===1?12:m-1;
  switch(key){
    case 'today':return [f(t),f(t)];
    case 'yesterday':return [f(add(t,-1)),f(add(t,-1))];
    case 'week':return [f(mon),f(t)];
    case 'lastweek_td':return [f(add(mon,-7)),f(add(t,-7))];
    case 'month':return [f(D(y,m,1)),f(t)];
    case 'lastmonth_td':return [f(D(py,pm,1)),f(D(py,pm,Math.min(d,dim(py,pm))))];
    case 'last7':return [f(add(t,-6)),f(t)];
    case 'last30':return [f(add(t,-29)),f(t)];
  }
  return null;
}
function loadProducts(){return loadAnalytics('products');}
function loadCustomers(){return loadAnalytics('customers');}
async function loadAnalytics(kind){
  const merged=document.getElementById('analytics-body');
  if(merged&&!kind)kind=ANALYTICS_KIND;
  if(merged)ANALYTICS_KIND=kind;
  const host=merged||document.getElementById(kind+'-body');if(!host)return;
  const title=merged?'分析':kind==='products'?'銷量分析':'客群分析';
  const switcher=merged?`<div class="a-toolbar an-kinds" role="tablist" aria-label="分析類型">${ANALYTICS_KINDS.map(([k,l])=>`<button type="button" class="btn ${k===kind?'btn--solid':'btn--ghost'}" role="tab" data-an-kind="${k}" aria-selected="${k===kind}">${l}</button>`).join('')}</div>`:'';
  const query=new URLSearchParams();if(ANALYTICS_FROM)query.set('from',ANALYTICS_FROM);if(ANALYTICS_TO)query.set('to',ANALYTICS_TO);if(SCOPE)query.set('venue',SCOPE);
  host.innerHTML=`<h2>${title}</h2>${switcher}<p class="hint">載入中…</p>`;
  let d;try{d=await api('/admin/analytics?'+query);}catch(e){host.innerHTML=`<h2>${title}</h2><p class="a-empty">${esc(e.message)}</p>`;return;}
  ANALYTICS_FROM=d.from;ANALYTICS_TO=d.to;
  const table=(heads,rows)=>`<div class="a-wrap2"><table class="a-tbl"><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}" class="a-empty">這段期間沒有資料</td></tr>`}</tbody></table></div>`;
  const productRows=(d.items||[]).map(i=>[i.zh,BRAND_LABEL[i.venue]||i.venue,catLabel(i.cat),i.qty,num(i.amount),i.orders]);
  const c=d.customers||{},segments=[['member','會員'],['guest','非會員'],['takeout','外帶'],['dinein','內用'],['qr','含 QR 點餐'],['counter','櫃檯點餐']];
  const customerRows=segments.map(([key,label])=>[label,c[key]?.orders||0,num(c[key]?.amount||0)]);
  host.innerHTML=`<div class="ops-head"><h2>${title}</h2>${opsHelp('營業日以凌晨 03:00 分界，最多查 93 天。作廢單不計；品項金額為品項小計，不分攤整單折扣。單數是付款單數（含預收與分攤），不是來客人數；會員、內外帶與點餐方式為不同維度，不可相加。新會員依全店首次付款判定；無會員識別碼的聚落價單不計入不重複會員。')}</div>${switcher}
    <form class="a-toolbar" id="analytics-range"><label>起日 <input type="date" name="from" value="${esc(d.from)}" required></label><label>迄日 <input type="date" name="to" value="${esc(d.to)}" required></label><button class="btn btn--solid" type="submit">查詢</button><button class="btn btn--ghost" type="button" id="analytics-csv">匯出 CSV</button></form>
    <div class="a-toolbar" id="analytics-presets">${(()=>{const td=MenuLib.businessDay();return ANALYTICS_PRESETS.map(([k,l])=>{const r=analyticsPresetRange(k,td),on=r&&r[0]===d.from&&r[1]===d.to;return `<button class="btn ${on?'btn--solid':'btn--ghost'} btn-sm" type="button" data-preset="${k}" aria-pressed="${on}">${l}</button>`;}).join('');})()}</div>
    <div class="a-kpis"><div class="a-kpi"><div class="kl">營收</div><div class="kv">NT$${num(d.amount)}</div></div><div class="a-kpi"><div class="kl">付款單數</div><div class="kv">${num(d.orders)}</div></div><div class="a-kpi"><div class="kl">平均每單</div><div class="kv">NT$${num(d.avg_ticket)}</div></div></div>
    ${analyticsCharts(kind,d)}
    ${kind==='products'?`<h3>品項銷量</h3>${table(['品項','店別','類別','數量','品項金額','單數'],productRows)}<h3>每日營收</h3>${table(['營業日','付款單數','營收'],(d.by_day||[]).map(r=>[r.day,r.orders,num(r.amount)]))}<h3>類別銷量</h3>${table(['類別','數量','品項金額'],(d.categories||[]).map(r=>[catLabel(r.cat),r.qty,num(r.amount)]))}`:`<h3>付款單客群</h3>${table(['分類','單數','營收'],customerRows)}<h3>會員回訪</h3>${table(['指標','數值'],[['不重複會員',c.unique_members],['區間內至少兩單',c.repeat_members],['首次付款會員',c.new_members],['會員平均每單',num(c.member_avg_ticket)],['非會員平均每單',num(c.guest_avg_ticket)]])}`}`;
  host.querySelectorAll('[data-an-kind]').forEach(b=>b.onclick=()=>{if(b.dataset.anKind===kind)return;ANALYTICS_KIND=b.dataset.anKind;if(typeof tabUrl==='function'&&location.pathname!==tabUrl('analytics'))history.replaceState(null,'',tabUrl('analytics'));loadAnalytics(ANALYTICS_KIND);});
  host.querySelector('#analytics-range').onsubmit=e=>{e.preventDefault();ANALYTICS_FROM=host.querySelector('[name=from]').value;ANALYTICS_TO=host.querySelector('[name=to]').value;loadAnalytics(kind);};
  host.querySelectorAll('#analytics-presets [data-preset]').forEach(b=>b.onclick=()=>{const r=analyticsPresetRange(b.dataset.preset,MenuLib.businessDay());if(!r)return;[ANALYTICS_FROM,ANALYTICS_TO]=r;loadAnalytics(kind);});
  host.querySelector('#analytics-csv').onclick=()=>downloadCSV(`${title}_${d.from}_${d.to}.csv`,kind==='products'?[['品項','店別','類別','數量','品項金額','單數'],...productRows]:[['分類','單數','營收'],...customerRows]);
}
