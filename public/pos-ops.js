/* 餐飲營運共用腳本：出餐看板（吧檯／廚房分站、列印、作廢）、暫停點餐、櫃檯結帳（POS）＋桌況、估清、訂位、日結、桌號 QR。
   /admin（admin.html）與平板 POS 子站（pos.emoji.tw → pos.html）共同載入；本檔只管畫面與 API 呼叫。
   宿主頁須先定義：esc、num、NT、api、toast、applicationTime、downloadCSV、opsHref(tab)、SCOPE、TAB、DATA、MENU_DOC、BRAND_LABEL，
   並載入 /menu-lib.js（MenuLib）與 /vendor/qrcode.min.js（QRCode）。所有 innerHTML 的動態內容一律經 esc()。 */
function tabOrders(){ return '<div class="a-sec" id="orders-body"></div>'; }
function tabPos(){ return '<div id="pos-body"></div>'; }
function tabReservations(){ return '<div class="a-sec" id="resv-body"></div>'; }
function tabSales(){ return '<div class="a-sec" id="sales-body"></div>'; }
let ORDERS_TIMER=null,ORDERS_SEEN=null,POS_TIMER=null,POS_DATA=null,POS_TABLE='',POS_PICK=null,POS_MEMBER=false,POS_INVOICE={mode:''},RESV_FROM='',RESV_DAYS=7,SALES_DAY='';
const PAY_LABEL={cash:'現金',card:'刷卡',linepay:'LINE Pay',transfer:'轉帳',tappay:'線上刷卡'};
const INV_LABEL={paper:'紙本',company:'統編',mobile:'手機載具',citizen:'自然人憑證',donate:'捐贈'};
const STATION_LABEL={bar:'吧檯',kitchen:'廚房'};
const TABLE_STATE={empty:['pill-draft','已開桌'],open:['pill-wait','點餐中'],preparing:['pill-wait','準備中'],ready:['pill-ok','可取餐'],idle:['pill-draft','待清桌']};
const ORDER_STATE={paid:'準備中',ready:'可取餐',done:'已取餐',void:'已作廢'};
const elapsedText=iso=>{const m=Math.max(0,Math.floor((Date.now()-new Date(iso))/60000));return m<60?`${m} 分`:`${Math.floor(m/60)} 時 ${m%60} 分`;};
// 現場看板只顯示時刻（HH:MM），不佔欄寬；完整日期時間放 title 供滑鼠停留查看
const clockText=iso=>{const d=iso?new Date(iso):null;return d&&!isNaN(d)?d.toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit'}):'—';};
const todayTaipei=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
const scopeQuery=(extra='')=>{const p=[SCOPE?'venue='+SCOPE:'',extra].filter(Boolean).join('&');return p?'?'+p:'';};
const payText=o=>PAY_LABEL[o.payer?.method]||(o.tappay?.rec_trade_id?PAY_LABEL.tappay:'—');
const invoiceText=o=>{const inv=o.invoice||{};if(inv.status==='issued')return `發票 ${inv.number||'已開立'}`;if(inv.status==='failed')return `發票失敗：${inv.error||'待補開'}`;if(inv.status==='void')return `發票已作廢 ${inv.number||''}`;if(inv.requested)return '發票待補開';return '未開發票';};
function invoiceBody(host){
  const mode=host.querySelector('input[name=pos-invoice]:checked')?.value||'';POS_INVOICE.mode=mode;
  if(!mode)return {mode:''};
  const box=host.querySelector('.pos-invoice');
  return {mode,buyer_ubn:box.querySelector('[name=buyer_ubn]')?.value||'',carrier_num:box.querySelector('[name=carrier_num]')?.value||'',love_code:box.querySelector('[name=love_code]')?.value||'',buyer_name:box.querySelector('[name=buyer_name]')?.value||'',buyer_email:box.querySelector('[name=buyer_email]')?.value||'',comment:box.querySelector('[name=comment]')?.value||''};
}
// 平板上正在操作的畫面不走 refresh() 整頁重繪，只重載該分頁
async function opsThen(fn,msg,reload){try{const out=await fn();toast(typeof msg==='function'?msg(out):msg);if(reload)await reload(out);}catch(e){toast(e.message);}}
function ordersBeep(){try{const c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=660;g.gain.value=.2;o.start();o.stop(c.currentTime+.5);}catch(e){}}
// 出餐單列印：80mm 出單機版型，吧檯／廚房各自一段；內容全部經 esc
function printOrder(o){
  const section=s=>(o.stations?.[s]||[]).length?`<h2>${STATION_LABEL[s]}</h2>`+o.stations[s].map(l=>`<div class="l"><span>${esc(l.zh)} ×${l.qty}</span><span>${Number(l.price*l.qty).toLocaleString('zh-TW')}</span></div>${l.note?`<div class="n">${esc(l.note)}</div>`:''}`).join(''):'';
  const w=window.open('','_blank');if(!w){toast('瀏覽器擋下列印視窗，請允許彈出視窗');return;}
  w.document.write(`<title>桌號 ${esc(o.table_no)}</title><style>body{font-family:sans-serif;width:72mm;margin:0;padding:4mm;font-size:16px}h1{font-size:32px;margin:0 0 4px}h2{font-size:16px;margin:10px 0 4px;border-bottom:2px solid #000}.m{color:#444;margin-bottom:6px}.l{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #bbb}.n{color:#222;padding:0 0 4px 1em}.t{display:flex;justify-content:space-between;font-weight:700;margin-top:10px;font-size:18px}</style><h1>桌號 ${esc(o.table_no)}</h1><div class="m">${esc(applicationTime(o.paid_at))} · ${esc(payText(o))}${o.payer?.member?' · 會員價':''}</div>${section('bar')}${section('kitchen')}<div class="t"><span>合計</span><span>NT$${Number(o.amount).toLocaleString('zh-TW')}</span></div>`);
  w.document.close();w.focus();w.print();
}
function voidOrderPrompt(id,reload){
  const reason=prompt('作廢原因（必填，會記在日結與操作紀錄）：');if(reason===null)return;
  if(!reason.trim()){toast('請填寫作廢原因');return;}
  opsThen(()=>api('/admin/orders/'+id+'/void',{method:'POST',body:{reason}}),'已作廢，品項退回未結帳',reload);
}
function bindOrderButtons(host,orders,reload){
  host.querySelectorAll('[data-print]').forEach(b=>b.onclick=()=>{const o=orders.find(x=>x.id===b.dataset.print);if(o)printOrder(o);});
  host.querySelectorAll('[data-void]').forEach(b=>b.onclick=()=>voidOrderPrompt(b.dataset.void,reload));
}

async function loadOrders(){
  const host=document.getElementById('orders-body');if(!host)return;
  clearTimeout(ORDERS_TIMER);
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<h2>點餐出餐</h2><p class="hint">載入中…</p>';}
  let d;try{d=await api('/admin/orders'+scopeQuery());}catch(e){if(host.querySelector('table'))toast('更新失敗：'+e.message);else host.innerHTML=`<h2>點餐出餐</h2><p class="a-empty">載入失敗：${esc(e.message)}</p>`;ORDERS_TIMER=setTimeout(()=>{if(document.getElementById('orders-body')&&TAB==='orders')loadOrders();},10000);return;}
  const ids=new Set(d.orders.map(o=>o.id));if(ORDERS_SEEN&&[...ids].some(id=>!ORDERS_SEEN.has(id)))ordersBeep();ORDERS_SEEN=ids;
  // 資料沒變就不重繪，避免自動更新時把正要按的按鈕換掉（經過時間每分鐘更新一次）
  const sig=JSON.stringify([d.orders.map(o=>[o.id,o.status,o.push_count]),d.pause,Math.floor(Date.now()/60000)]);
  const again=()=>{ORDERS_TIMER=setTimeout(()=>{if(document.getElementById('orders-body')&&TAB==='orders')loadOrders();},10000);};
  if(host.dataset.sig===sig&&host.querySelector('#qr-tables')){again();return;}
  host.dataset.sig=sig;
  const qrTables=host.querySelector('#qr-tables')?.value??'';
  const pauseEdit=Object.entries(d.pause||{}).map(([v,p])=>`<div class="ops-pause ${p.paused?'on':''}" data-pause-venue="${esc(v)}"><label><input type="checkbox" data-pause-on ${p.paused?'checked':''}> <b>${esc(BRAND_LABEL[v]||v)}</b> 暫停點餐</label><input data-pause-msg maxlength="80" placeholder="給客人的文案，例：今日最後點餐 22:30" value="${esc(p.message)}"><button class="btn btn--ghost btn-sm" data-pause-save>儲存</button>${p.paused?'<span class="pill pill-bad">客人目前無法加菜</span>':''}</div>`).join('');
  const stationHtml=o=>['bar','kitchen'].filter(s=>o.stations?.[s]?.length).map(s=>`<div class="ops-station"><span class="pill pill-draft">${STATION_LABEL[s]}</span><span>${o.stations[s].map(l=>`${esc(l.zh)} ×${l.qty}${l.note?` <span class="hint" style="margin:0">${esc(l.note)}</span>`:''}`).join('<br>')}</span></div>`).join('');
  const rows=d.orders.map(o=>`<tr class="${o.status==='ready'?'ops-ready':''}"><td><b style="font-size:1.2em">${esc(o.table_no)}</b></td><td>${stationHtml(o)}</td><td class="a-mono" title="${esc(applicationTime(o.paid_at))}">${esc(clockText(o.paid_at))}<br><span class="hint" style="margin:0">${elapsedText(o.paid_at)}前</span></td><td class="num" style="white-space:nowrap">${Number(o.amount).toLocaleString('zh-TW')}<br><span class="hint" style="margin:0">${esc(payText(o))}</span></td><td>${o.status==='ready'?'<span class="pill pill-ok">可取餐</span>':'<span class="pill pill-wait">準備中</span>'}${o.push_count?' 🔔':''}</td><td class="ops-actions" style="white-space:nowrap">${o.status==='paid'?`<button class="btn btn--solid btn-sm" data-order="${esc(o.id)}" data-status="ready">出餐並通知</button> `:''}<button class="btn btn--ghost btn-sm" data-order="${esc(o.id)}" data-status="done">已取餐</button> <button class="btn btn--ghost btn-sm" data-print="${esc(o.id)}">列印</button> <button class="btn btn--ghost btn-sm" data-void="${esc(o.id)}">作廢</button></td></tr>`).join('')||'<tr><td colspan="6" class="a-empty">目前沒有待出餐的訂單</td></tr>';
  host.innerHTML=`<h2>點餐出餐</h2>
    <p class="hint">客人掃桌上 QR 加菜，用餐完到 <a href="${opsHref('pos')}" data-tab="pos">櫃檯結帳</a>；收款後的單會出現在這裡，品項依吧檯／廚房分列。按「出餐並通知」會推播給客人到櫃檯取餐；每 10 秒自動更新，有新單會響一聲。</p>
    ${pauseEdit?`<div class="ops-pauses">${pauseEdit}</div>`:''}
    <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>桌號</th><th>品項（吧檯／廚房）</th><th>結帳</th><th class="num">金額</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3 style="margin-top:28px">桌號 QR</h3>
    <p class="hint">輸入桌號（逗號分隔）產生 QR，列印貼桌上。QR 內含簽章，更換 APP_SECRET 後須重印。</p>
    <div class="a-toolbar"><input id="qr-tables" placeholder="例：A1,A2,A3,B1" style="min-width:260px" value="${esc(qrTables)}"><button class="btn btn--solid btn-sm" id="qr-make">產生</button><button class="btn btn--ghost btn-sm" id="qr-print" hidden>列印</button></div>
    <div id="qr-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-top:12px"></div>`;
  const reload=()=>{host.dataset.sig='';return loadOrders();};
  host.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>opsThen(()=>api('/admin/orders/'+b.dataset.order+'/status',{method:'POST',body:{status:b.dataset.status}}),out=>out.status==='ready'?`已出餐，推播 ${out.notified} 台裝置`:'已標記取餐',reload));
  bindOrderButtons(host,d.orders,reload);
  host.querySelectorAll('[data-pause-save]').forEach(b=>b.onclick=()=>{const box=b.closest('[data-pause-venue]');opsThen(()=>api('/admin/orders/pause',{method:'POST',body:{venue:box.dataset.pauseVenue,paused:box.querySelector('[data-pause-on]').checked,message:box.querySelector('[data-pause-msg]').value}}),out=>out.pause[box.dataset.pauseVenue].paused?'已暫停點餐，客人掃碼會看到你的文案':'已恢復點餐',reload);});
  host.querySelector('#qr-make').onclick=async()=>{const tables=host.querySelector('#qr-tables').value.trim();if(!tables)return;try{const out=await api('/admin/tables/qr?tables='+encodeURIComponent(tables));const grid=host.querySelector('#qr-grid');grid.innerHTML='';for(const t of out.tables){const url=await new Promise((ok,no)=>QRCode.toDataURL(t.url,{width:360,margin:1},(e,u)=>e?no(e):ok(u)));grid.insertAdjacentHTML('beforeend',`<div class="qr-card" style="text-align:center;border:1px solid #ddd;border-radius:10px;padding:12px;background:#fff"><img src="${url}" alt="桌號 ${esc(t.table)}" style="width:100%"><div style="font-size:1.6em;font-weight:700">桌號 ${esc(t.table)}</div><div class="hint" style="margin:0">掃碼點餐 · 言文字</div></div>`);}host.querySelector('#qr-print').hidden=false;}catch(e){toast(e.message);}};
  host.querySelector('#qr-print').onclick=()=>{const w=window.open('','_blank');w.document.write('<title>桌號 QR</title><style>body{font-family:sans-serif;margin:0}.g{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px}.g>div{break-inside:avoid;text-align:center;border:1px solid #ccc;border-radius:10px;padding:12px}img{width:100%}</style><div class="g">'+host.querySelector('#qr-grid').innerHTML+'</div>');w.document.close();w.focus();w.print();};
  again();
}

/* 櫃檯結帳：桌況格 → 點桌號 → 未結帳品項（可勾選分帳）→ 付款方式／會員價 → 收款；也能代客加菜、逐項作廢、清桌 */
async function loadPos(){
  const host=document.getElementById('pos-body');if(!host)return;
  clearTimeout(POS_TIMER);
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<div class="a-sec"><h2>櫃檯結帳</h2><p class="hint">載入中…</p></div>';}
  try{POS_DATA=await api('/admin/orders'+scopeQuery('all=1'));}catch(e){if(host.querySelector('.pos-grid'))toast('更新失敗：'+e.message);else host.innerHTML=`<div class="a-sec"><h2>櫃檯結帳</h2><p class="a-empty">載入失敗：${esc(e.message)}</p></div>`;POS_TIMER=setTimeout(()=>{if(document.getElementById('pos-body')&&TAB==='pos')loadPos();},15000);return;}
  const sig=JSON.stringify([POS_DATA.sessions.map(s=>[s.id,s.unpaid,s.unpaid_amount,s.state]),POS_DATA.orders.map(o=>[o.id,o.status])]);
  if(host.dataset.sig!==sig||!host.querySelector('.pos-grid')){host.dataset.sig=sig;paintPos();}
  POS_TIMER=setTimeout(()=>{if(document.getElementById('pos-body')&&TAB==='pos')loadPos();},15000);
}
function paintPos(){
  const host=document.getElementById('pos-body'),d=POS_DATA;if(!host||!d)return;
  const sessions=d.sessions;
  if(POS_TABLE&&!sessions.find(s=>s.table===POS_TABLE))POS_TABLE='';
  const cur=sessions.find(s=>s.table===POS_TABLE)||null;
  const grid=sessions.map(s=>{const [cls,label]=TABLE_STATE[s.state]||TABLE_STATE.open;return `<button type="button" class="pos-table ${s.table===POS_TABLE?'on':''} ${s.takeout?'takeout':''}" data-pos-table="${esc(s.table)}"><b>${s.takeout?'外帶 ':''}${esc(s.table)}</b><span class="pill ${cls}">${label}</span><small>${s.unpaid?`未結 NT$${Number(s.unpaid_amount).toLocaleString('zh-TW')}`:s.state==='empty'?'還沒點餐':'已結清'}</small>${s.mixed?'<small class="pill pill-bad">混桌</small>':''}</button>`;}).join('')||'<p class="a-empty">目前沒有使用中的桌。客人掃桌上 QR、或按上面「開桌」「外帶」後會出現在這裡。</p>';
  // 櫃檯開桌／外帶：客人沒掃 QR 也能從這裡開始點
  const opener=`<div class="pos-open"><input id="pos-open-table" placeholder="桌號，例：A3" maxlength="8" autocapitalize="characters" autocomplete="off" aria-label="桌號"><button type="button" class="btn btn--ghost" id="pos-open">開桌</button><button type="button" class="btn btn--solid" id="pos-takeout">＋ 外帶</button></div>`;
  let panel='';
  if(cur){
    if(POS_PICK)POS_PICK=new Set([...POS_PICK].filter(l=>cur.lines.some(x=>x.line===l)));
    const menuById=new Map((MENU_DOC?.items||[]).map(it=>[it.id,it]));
    const priceOf=l=>{const it=menuById.get(l.item_id);return POS_MEMBER&&it&&it.emo>0&&it.emo<l.price?it.emo:l.price;};
    const picked=cur.lines.filter(l=>!POS_PICK||POS_PICK.has(l.line));
    const total=picked.reduce((a,l)=>a+priceOf(l)*l.qty,0);
    const lineRows=cur.lines.map(l=>`<tr><td><input type="checkbox" data-pick="${esc(l.line)}" ${!POS_PICK||POS_PICK.has(l.line)?'checked':''} aria-label="選取 ${esc(l.zh)}"></td><td>${esc(l.zh)}${l.note?`<br><span class="hint" style="margin:0">${esc(l.note)}</span>`:''}</td><td>${esc(l.by)}</td><td class="num">${l.qty}</td><td class="num">${Number(priceOf(l)*l.qty).toLocaleString('zh-TW')}${priceOf(l)!==l.price?`<br><span class="hint" style="margin:0"><s>${Number(l.price*l.qty).toLocaleString('zh-TW')}</s></span>`:''}</td><td class="ops-actions"><button class="btn btn--ghost btn-sm" data-void-line="${esc(l.line)}">作廢</button></td></tr>`).join('')||'<tr><td colspan="6" class="a-empty">這桌沒有未結帳品項</td></tr>';
    const menuItems=MenuLib.sortItems((MENU_DOC?.items||[]).filter(it=>it.published&&(!SCOPE||it.venue===SCOPE)));
    const live=d.orders.filter(o=>o.session_id===cur.id);
    const liveRows=live.map(o=>`<tr><td class="a-mono" title="${esc(applicationTime(o.paid_at))}">${esc(clockText(o.paid_at))}</td><td>${o.items.map(l=>`${esc(l.zh)} ×${l.qty}`).join('、')}</td><td>${esc(payText(o))}${o.payer?.member?' · 會員價':''}<br><span class="hint" style="margin:0">${esc(invoiceText(o))}</span></td><td class="num">${Number(o.amount).toLocaleString('zh-TW')}</td><td>${o.status==='void'?`<span class="pill pill-bad">已作廢</span><br><span class="hint" style="margin:0">${esc(o.void_reason||'')}</span>`:esc(ORDER_STATE[o.status]||o.status)}</td><td style="white-space:nowrap">${o.status==='void'?'':`<button class="btn btn--ghost btn-sm" data-print="${esc(o.id)}">列印</button> ${(o.invoice?.requested&&o.invoice?.status!=='issued')?`<button class="btn btn--ghost btn-sm" data-invoice-issue="${esc(o.id)}">補開發票</button> `:''}<button class="btn btn--ghost btn-sm" data-void="${esc(o.id)}">作廢</button>`}</td></tr>`).join('');
    panel=`<div class="a-sec pos-panel">
      <h2>桌號 ${esc(cur.table)} <span class="pill ${TABLE_STATE[cur.state]?.[0]||''}">${TABLE_STATE[cur.state]?.[1]||''}</span><span class="hint" style="margin:0 0 0 auto;font-weight:400">最後動作 ${esc(applicationTime(cur.updated_at))}</span></h2>
      ${cur.mixed?'<p class="hint"><span class="pill pill-bad">混桌</span> 這桌含其他品牌的品項：只能結自己店別的，清桌請由言文字管理員處理。</p>':''}
      <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>結</th><th>品項</th><th>點餐人</th><th class="num">數量</th><th class="num">小計</th><th>操作</th></tr></thead><tbody>${lineRows}</tbody></table></div>
      <div class="a-form pos-add"><label style="flex:1;min-width:220px">櫃檯代客加菜<select id="pos-item"><option value="">選品項…</option>${menuItems.map(it=>`<option value="${esc(it.id)}">${esc(it.zh)}　NT$${Number(it.price).toLocaleString('zh-TW')}${MenuLib.soldOutToday(it)?'（已估清）':''}</option>`).join('')}</select></label><label>數量<input id="pos-qty" type="number" min="1" max="20" value="1" style="width:90px"></label><label style="flex:1;min-width:180px">備註<input id="pos-note" maxlength="160" placeholder="去冰、不要蔥…"></label><button class="btn btn--ghost btn-sm" id="pos-add">加入</button></div>
      <div class="pos-pay">
        <div class="pos-methods" role="radiogroup" aria-label="付款方式">${['cash','card','linepay','transfer'].map((m,i)=>`<label class="pos-method"><input type="radio" name="pos-method" value="${m}" ${i===0?'checked':''}><span>${PAY_LABEL[m]}</span></label>`).join('')}</div>
        <label class="pos-member"><input type="checkbox" id="pos-member" ${POS_MEMBER?'checked':''}> 套用會員價（有設會員價的品項才會變）</label>
        <div class="pos-total"><span>${POS_PICK&&POS_PICK.size<cur.lines.length?`分帳：${picked.length}／${cur.lines.length} 項`:'全桌未結帳'}</span><b>NT$${total.toLocaleString('zh-TW')}</b></div>
        <div class="pos-invoice"><div class="pos-invoice-head"><b>ezPay 電子發票</b><span class="hint" style="margin:0">${DATA?.invoice?.configured?'已設定':'尚未設定 ezPay env，會先記為待補開／失敗'}</span></div><div class="pos-invoice-types">${[['','不開'],['paper','紙本'],['company','統編'],['mobile','手機載具'],['citizen','自然人憑證'],['donate','捐贈']].map(([m,l])=>`<label><input type="radio" name="pos-invoice" value="${m}" ${POS_INVOICE.mode===m?'checked':''}><span>${l}</span></label>`).join('')}</div><div class="pos-invoice-fields"><input name="buyer_ubn" inputmode="numeric" maxlength="8" placeholder="統編 8 碼"><input name="carrier_num" autocapitalize="characters" maxlength="64" placeholder="手機條碼 /ABC1234 或自然人憑證"><input name="love_code" inputmode="numeric" maxlength="20" placeholder="愛心碼"><input name="buyer_name" maxlength="60" placeholder="買受人／公司名稱"><input name="buyer_email" type="email" maxlength="120" placeholder="Email（選填）"><input name="comment" maxlength="80" placeholder="發票備註（選填）"></div></div>
        <div class="pos-actions"><button class="btn btn--solid" id="pos-checkout" ${picked.length?'':'disabled'}>收款並送出餐單</button><button class="btn btn--ghost" id="pos-close">${cur.takeout?'收掉外帶單':'清桌'}</button></div>
      </div>
      ${live.length?`<h3 style="margin-top:20px">這桌已結帳的單</h3><div class="a-wrap2"><table class="a-tbl"><thead><tr><th>時間</th><th>品項</th><th>付款</th><th class="num">金額</th><th>狀態</th><th>操作</th></tr></thead><tbody>${liveRows}</tbody></table></div>`:''}
    </div>`;
  }
  host.innerHTML=`<div class="a-sec"><h2>櫃檯結帳</h2><p class="hint">點桌號看這桌的未結帳品項。可全桌結、勾選部分品項分開結（分帳）、代客加菜、逐項作廢；收款後自動變成出餐單進「點餐出餐」。客人沒掃 QR 就輸入桌號「開桌」或按「外帶」。每 15 秒自動更新。</p>${opener}<div class="pos-grid">${grid}</div></div>${panel}`;
  const reload=()=>{host.dataset.sig='';return loadPos();};
  host.querySelectorAll('[data-pos-table]').forEach(b=>b.onclick=()=>{POS_TABLE=b.dataset.posTable;POS_PICK=null;paintPos();});
  const openSession=body=>opsThen(()=>api('/admin/orders/sessions',{method:'POST',body}),out=>out.takeout?`外帶單 ${out.table} 已開，請加入品項`:out.created?`已開桌 ${out.table}`:`桌號 ${out.table} 已在使用中`,out=>{POS_TABLE=out.table;POS_PICK=null;return reload();});
  host.querySelector('#pos-open').onclick=()=>{const t=host.querySelector('#pos-open-table').value.trim().toUpperCase();if(!t){toast('請先輸入桌號');host.querySelector('#pos-open-table').focus();return;}openSession({table_no:t});};
  host.querySelector('#pos-open-table').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();host.querySelector('#pos-open').click();}};
  host.querySelector('#pos-takeout').onclick=()=>openSession({takeout:true});
  if(!cur)return;
  host.querySelectorAll('[data-pick]').forEach(c=>c.onchange=()=>{const all=[...host.querySelectorAll('[data-pick]')],on=all.filter(x=>x.checked).map(x=>x.dataset.pick);POS_PICK=on.length===all.length?null:new Set(on);paintPos();});
  host.querySelector('#pos-member').onchange=e=>{POS_MEMBER=e.target.checked;paintPos();};
  host.querySelectorAll('[data-void-line]').forEach(b=>b.onclick=()=>{const reason=prompt('作廢這個品項的原因（必填）：');if(reason===null)return;if(!reason.trim()){toast('請填寫作廢原因');return;}opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items/'+b.dataset.voidLine,{method:'DELETE',body:{reason}}),'已作廢品項',reload);});
  host.querySelector('#pos-add').onclick=()=>{const item_id=host.querySelector('#pos-item').value;if(!item_id){toast('請先選品項');return;}opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/items',{method:'POST',body:{item_id,qty:Number(host.querySelector('#pos-qty').value)||1,note:host.querySelector('#pos-note').value}}),'已加入這桌',reload);};
  host.querySelectorAll('input[name=pos-invoice]').forEach(r=>r.onchange=()=>{POS_INVOICE.mode=r.checked?r.value:POS_INVOICE.mode;});
  host.querySelector('#pos-checkout').onclick=()=>{
    const method=host.querySelector('input[name=pos-method]:checked')?.value,picked=cur.lines.filter(l=>!POS_PICK||POS_PICK.has(l.line));
    if(!picked.length)return;
    const menuById=new Map((MENU_DOC?.items||[]).map(it=>[it.id,it]));
    const total=picked.reduce((a,l)=>{const it=menuById.get(l.item_id);return a+(POS_MEMBER&&it&&it.emo>0&&it.emo<l.price?it.emo:l.price)*l.qty;},0);
    if(!confirm(`向桌號 ${cur.table} 收 NT$${total.toLocaleString('zh-TW')}（${PAY_LABEL[method]}${POS_MEMBER?'，會員價':''}${POS_INVOICE.mode?'，'+INV_LABEL[POS_INVOICE.mode]+'發票':''}）？`))return;
    opsThen(()=>api('/admin/orders/sessions/'+cur.id+'/checkout',{method:'POST',body:{method,member:POS_MEMBER,lines:POS_PICK?[...POS_PICK]:[],invoice:invoiceBody(host)}}),out=>`已收款 NT$${Number(out.amount).toLocaleString('zh-TW')}${out.invoice?.status==='issued'?`，發票 ${out.invoice.number||'已開立'}`:out.invoice?.status==='failed'?`，發票開立失敗可補開` : ''}${out.remaining?`，這桌還有 NT$${Number(out.remaining).toLocaleString('zh-TW')} 未結`:'，這桌已結清'}`,()=>{POS_PICK=null;POS_MEMBER=false;return reload();});
  };
  host.querySelector('#pos-close').onclick=async()=>{
    if(!confirm(cur.takeout?`確定收掉外帶單 ${cur.table}？`:`確定清桌 ${cur.table}？未取餐的單會標記已取餐，下一組客人掃碼會開新的一桌。`))return;
    try{await api('/admin/orders/sessions/'+cur.id+'/close',{method:'POST',body:{}});toast('已清桌');POS_TABLE='';await reload();}
    catch(e){
      // 有未結帳品項：子帳號要先結帳或逐項作廢；言文字管理員可強制清桌（作廢全部未結）
      if(e.status===409&&DATA&&!DATA.brands&&confirm(e.message+'\n\n以言文字管理員身分強制清桌並作廢這些品項？')){try{await api('/admin/orders/sessions/'+cur.id+'/close',{method:'POST',body:{force:true}});toast('已強制清桌');POS_TABLE='';await reload();}catch(e2){toast(e2.message);}}
      else toast(e.message);
    }
  };
  host.querySelectorAll('[data-invoice-issue]').forEach(b=>b.onclick=()=>opsThen(()=>api('/admin/orders/'+b.dataset.invoiceIssue+'/invoice/issue',{method:'POST',body:{}}),out=>`已補開發票 ${out.invoice?.number||''}`,reload));
  bindOrderButtons(host,d.orders,reload);
}

/* 訂位：依日期列出、確認／婉拒（留 Email 的客人會收到信）、排桌、已到／未到 */
async function loadReservations(){
  const host=document.getElementById('resv-body');if(!host)return;
  if(!RESV_FROM)RESV_FROM=todayTaipei();
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<h2>訂位</h2><p class="hint">載入中…</p>';}
  let d;try{d=await api(`/admin/reservations?from=${encodeURIComponent(RESV_FROM)}&days=${RESV_DAYS}`+(SCOPE?'&venue='+SCOPE:''));}catch(e){host.innerHTML=`<h2>訂位</h2><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  const L=d.labels||{},PILL={new:'pill-wait',confirmed:'pill-ok',arrived:'pill-ok',no_show:'pill-bad',cancelled:'pill-draft'};
  const FLOW={new:[['confirmed','確認並通知'],['cancelled','婉拒']],confirmed:[['arrived','已到'],['no_show','未到'],['cancelled','取消']],arrived:[['confirmed','改回已確認']],no_show:[['confirmed','改回已確認']],cancelled:[['confirmed','恢復並通知']]};
  const actions=r=>(FLOW[r.status]||[]).map(([s,l])=>`<button class="btn ${s==='confirmed'&&r.status==='new'?'btn--solid':'btn--ghost'} btn-sm" data-resv="${esc(r.id)}" data-resv-status="${s}">${l}</button>`).join(' ');
  const weekday=date=>['日','一','二','三','四','五','六'][new Date(date+'T12:00:00Z').getUTCDay()];
  let day='';
  const rows=d.reservations.map(r=>{
    const head=r.reserve_date!==day?(day=r.reserve_date,`<tr class="resv-day"><td colspan="7">${esc(r.reserve_date)}（${weekday(r.reserve_date)}）</td></tr>`):'';
    return head+`<tr class="${r.status==='cancelled'?'resv-off':''}"><td class="a-mono"><b>${esc(r.reserve_time)}</b><br><span class="hint" style="margin:0">${esc(BRAND_LABEL[r.venue]||'')} · ${esc(r.period)}</span></td><td><b>${esc(r.name)}</b> ${Number(r.party_size)} 位<br><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>${r.email?`<br><span class="hint" style="margin:0">${esc(r.email)}</span>`:'<br><span class="hint" style="margin:0">未留 Email，請電話聯繫</span>'}</td><td>${esc(r.note||'')}${r.staff_note?`<br><span class="hint" style="margin:0">店內：${esc(r.staff_note)}</span>`:''}</td><td><input data-resv-table="${esc(r.id)}" value="${esc(r.table_no||'')}" placeholder="桌號" maxlength="8" style="width:84px" aria-label="桌號"></td><td><span class="pill ${PILL[r.status]||''}">${esc(L[r.status]||r.status)}</span>${r.handled_by?`<br><span class="hint" style="margin:0">${esc(r.handled_by)}</span>`:''}</td><td class="a-mono resv-id">${esc(r.request_id)}</td><td class="ops-actions" style="white-space:nowrap">${actions(r)}</td></tr>`;
  }).join('')||'<tr><td colspan="7" class="a-empty">這段期間沒有訂位申請</td></tr>';
  // 櫃檯登記（電話／現場）：時段依店別 30 分鐘一格；Email 可留空（留了才寄確認信）
  const slotOf=(from,to)=>{const o=[];for(let m=from;m<to;m+=30)o.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);return o;};
  const slotGroups=[['CAFE',slotOf(8*60,17*60)],['BAR',slotOf(17*60,24*60).concat(slotOf(0,3*60))]].filter(([v])=>!SCOPE||v===SCOPE);
  const addForm=`<details class="resv-add" id="resv-add"><summary class="btn btn--ghost">＋ 登記訂位（電話／現場）</summary>
    <form class="a-form" id="resv-form" autocomplete="off">
      <label>日期<input name="date" type="date" required value="${esc(RESV_FROM)}"></label>
      <label>時間<select name="time" required>${slotGroups.map(([v,ts])=>`<optgroup label="${esc(BRAND_LABEL[v])}">${ts.map(t=>`<option value="${t}">${t}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>人數<input name="party_size" type="number" inputmode="numeric" min="1" max="50" value="2" required style="width:90px"></label>
      <label>姓名<input name="name" required maxlength="80" placeholder="王小姐"></label>
      <label>手機<input name="phone" type="tel" inputmode="tel" required minlength="8" maxlength="32" placeholder="0912-345-678"></label>
      <label>Email（可空）<input name="email" type="email" maxlength="254" placeholder="留了會寄確認信"></label>
      <label>桌號<input name="table_no" maxlength="8" autocapitalize="characters" placeholder="A3" style="width:100px"></label>
      <label style="flex:1;min-width:200px">備註<input name="note" maxlength="500" placeholder="靠窗、嬰兒椅…"></label>
      <button class="btn btn--solid" type="submit">登記</button>
    </form></details>`;
  host.innerHTML=`<h2>訂位 ${d.pending?`<span class="badge">${d.pending} 待確認</span>`:''}</h2>
    <p class="hint">客人從 <a href="/reserve" target="_blank" rel="noopener">/reserve</a>（Google Maps／官方 LINE 連結）訂位，送出即成立、客人已收到確認信（座位保留至預約時間後 10 分鐘）。08:00–16:59 歸在咖啡、其餘歸三點水。這裡可填桌號、按「取消」寄婉拒信給客人（沒留 Email 的請電話聯繫）；當天到店按「已到」，沒來按「未到」。舊的「待確認」申請按「確認並通知」會補寄確認信。</p>
    ${addForm}
    <div class="a-toolbar"><label>從 <input type="date" id="resv-from" value="${esc(RESV_FROM)}"></label><select id="resv-days" aria-label="顯示天數">${[[1,'只看這天'],[7,'7 天'],[30,'30 天'],[60,'60 天']].map(([n,l])=>`<option value="${n}" ${n===RESV_DAYS?'selected':''}>${l}</option>`).join('')}</select><button class="btn btn--ghost btn-sm" id="resv-today">今天</button><span class="hint" style="margin:0">${d.reservations.length} 筆</span></div>
    <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>時間</th><th>客人</th><th>備註</th><th>桌號</th><th>狀態</th><th>編號</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  host.querySelector('#resv-from').onchange=e=>{RESV_FROM=e.target.value||todayTaipei();loadReservations();};
  host.querySelector('#resv-days').onchange=e=>{RESV_DAYS=Number(e.target.value)||7;loadReservations();};
  host.querySelector('#resv-today').onclick=()=>{RESV_FROM=todayTaipei();loadReservations();};
  host.querySelector('#resv-form').onsubmit=e=>{
    e.preventDefault();const f=e.target,body=Object.fromEntries(new FormData(f));body.party_size=Number(body.party_size);
    opsThen(()=>api('/admin/reservations',{method:'POST',body}),out=>`已登記 ${out.request_id}${out.mailed?'，已寄確認信給客人':''}`,()=>{RESV_FROM=body.date;return loadReservations();});
  };
  host.querySelectorAll('[data-resv]').forEach(b=>b.onclick=()=>{
    const r=d.reservations.find(x=>x.id===b.dataset.resv),status=b.dataset.resvStatus;if(!r)return;
    const table_no=host.querySelector(`[data-resv-table="${CSS.escape(r.id)}"]`)?.value.trim()||'';
    let staff_note=r.staff_note||'';
    if(['confirmed','cancelled'].includes(status)){const v=prompt(`${status==='confirmed'?'確認':'婉拒'} ${r.name} ${r.reserve_date} ${r.reserve_time}（${r.party_size} 位）${r.email?'，會寄信通知客人':'，客人未留 Email，請另行電話聯繫'}。\n店內留言（會附在信裡，可留空）：`,staff_note);if(v===null)return;staff_note=v;}
    opsThen(()=>api('/admin/reservations/'+r.id+'/status',{method:'POST',body:{status,table_no,staff_note}}),out=>`已更新為「${L[out.status]||out.status}」${out.mailed?'，已寄信通知客人':''}`,loadReservations);
  });
}

/* 日結：依營業日（03:00 起算）彙總；CSV 由 downloadCSV 產生（含公式注入防護） */
async function loadSales(){
  const host=document.getElementById('sales-body');if(!host)return;
  if(!SALES_DAY)SALES_DAY=MenuLib.businessDay();
  if(!host.dataset.init){host.dataset.init='1';host.innerHTML='<h2>日結報表</h2><p class="hint">載入中…</p>';}
  let d;try{d=await api(`/admin/sales?day=${encodeURIComponent(SALES_DAY)}`+(SCOPE?'&venue='+SCOPE:''));}catch(e){host.innerHTML=`<h2>日結報表</h2><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  const methods=Object.entries(d.by_method||{}).sort((a,b)=>b[1]-a[1]).map(([m,v])=>`<tr><td>${esc(PAY_LABEL[m]||m)}</td><td class="num">${Number(v).toLocaleString('zh-TW')}</td><td class="num">${d.amount?Math.round(v/d.amount*100):0}%</td></tr>`).join('')||'<tr><td colspan="3" class="a-empty">這天沒有營收</td></tr>';
  const hours=Object.entries(d.by_hour||{}).sort(),maxH=Math.max(1,...hours.map(h=>h[1]));
  const hourBars=hours.map(([h,v])=>`<div class="sales-bar"><span class="a-mono">${esc(h)}:00</span><i style="width:${Math.round(v/maxH*100)}%"></i><span class="num">${Number(v).toLocaleString('zh-TW')}</span></div>`).join('')||'<p class="a-empty">—</p>';
  const items=(d.items||[]).map(it=>`<tr><td>${esc(it.zh)}</td><td>${esc(BRAND_LABEL[it.venue]||'')}</td><td class="num">${it.qty}</td><td class="num">${Number(it.amount).toLocaleString('zh-TW')}</td></tr>`).join('')||'<tr><td colspan="4" class="a-empty">—</td></tr>';
  // LINE Pay 對帳：LINE Pay 後台實收（每日 04:30 同步）vs POS 登記為 LINE Pay 的單；差額非 0 標紅
  const lp=d.linepay||{},lpPos=lp.pos||{},lpLp=lp.linepay||{},diff=Number(lp.diff)||0;
  const lpRows=(lp.rows||[]).map(t=>`<tr class="${t.amount<0?'lp-refund':''}"><td class="a-mono">${esc(clockText(t.paid_at))}</td><td>${esc(t.type_label||t.type)}</td><td class="num">${Number(t.amount).toLocaleString('zh-TW')}</td><td>${esc(t.method_label||t.method)}${t.card_last4?` <span class="a-mono">…${esc(t.card_last4)}</span>`:''}</td><td class="a-mono">${esc(t.confirm_no||'')}</td></tr>`).join('')||`<tr><td colspan="5" class="a-empty">${lp.configured===false?'尚未設定 LINE Pay 商家後台帳密（LINEPAY_MERCHANT_ID / LINEPAY_MERCHANT_PW）':'這天沒有 LINE Pay 實收'}</td></tr>`;
  const lpStatus=diff===0?(lpLp.count||lpPos.count?'<span class="pill pill-ok">帳對了</span>':''):`<span class="pill pill-bad">差額 ${diff>0?'+':''}${num(diff)}</span>`;
  const lpHint=diff>0?'LINE Pay 收到的比 POS 登記多：可能有單漏登、或登成現金／刷卡。':diff<0?'POS 登記的 LINE Pay 比實際收到多：可能客人未完成付款、或已在 LINE Pay 退款但 POS 沒作廢。':'';
  const lpBlock=`<h3 style="margin-top:20px">LINE Pay 對帳 ${lpStatus}</h3>
    <p class="hint">左邊是 POS 結帳時選「LINE Pay」的成立單，右邊是 LINE Pay 商家後台同一營業日的實收（退款已扣）。${lp.synced_at?`上次同步 ${esc(applicationTime(lp.synced_at))}。`:''}${esc(lpHint)}</p>
    <div class="a-kpis lp-kpis"><div class="a-kpi"><div class="kl">POS 登記 LINE Pay</div><div class="kv"><span class="u">NT$</span>${num(lpPos.amount)}<span class="u"> · ${num(lpPos.count)} 單</span></div></div><div class="a-kpi"><div class="kl">LINE Pay 實收</div><div class="kv"><span class="u">NT$</span>${num(lpLp.amount)}<span class="u"> · ${num(lpLp.count)} 筆${lpLp.refunds?`，退 ${num(lpLp.refunds)} 筆 NT$${num(lpLp.refund_amount)}`:''}</span></div></div><div class="a-kpi ${diff?'lp-diff':''}"><div class="kl">差額</div><div class="kv"><span class="u">NT$</span>${diff>0?'+':''}${num(diff)}</div></div></div>
    <div class="a-toolbar"><button class="btn btn--ghost btn-sm" id="lp-sync" ${lp.configured===false?'disabled':''}>同步 LINE Pay</button><button class="btn btn--ghost btn-sm" id="lp-csv">匯出 LINE Pay CSV</button></div>
    <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>時間</th><th>類型</th><th class="num">金額</th><th>付款方式</th><th>驗證碼</th></tr></thead><tbody>${lpRows}</tbody></table></div>`;
  host.innerHTML=`<h2>日結報表</h2>
    <p class="hint">營業日從凌晨 03:00 起算到翌日 03:00（三點水深夜的單算前一天）。作廢的單不計營收、另列筆數。CSV 含每一筆品項明細與付款方式，可直接交會計。</p>
    <div class="a-toolbar"><label>營業日 <input type="date" id="sales-day" value="${esc(d.day)}"></label><button class="btn btn--ghost btn-sm" id="sales-prev">前一天</button><button class="btn btn--ghost btn-sm" id="sales-next">後一天</button><button class="btn btn--ghost btn-sm" id="sales-today">今天</button><button class="btn btn--solid btn-sm" id="sales-csv">匯出 CSV</button></div>
    <div class="a-kpis"><div class="a-kpi"><div class="kl">營收</div><div class="kv"><span class="u">NT$</span>${num(d.amount)}</div></div><div class="a-kpi"><div class="kl">成立單數</div><div class="kv">${num(d.orders)}<span class="u"> 單</span></div></div><div class="a-kpi"><div class="kl">平均每單</div><div class="kv"><span class="u">NT$</span>${num(d.orders?Math.round(d.amount/d.orders):0)}</div></div><div class="a-kpi"><div class="kl">作廢</div><div class="kv">${num(d.voided)}<span class="u"> 單 · NT$${num(d.void_amount)}</span></div></div></div>
    <div class="sales-cols"><div><h3>付款方式</h3><div class="a-wrap2"><table class="a-tbl"><thead><tr><th>方式</th><th class="num">金額</th><th class="num">占比</th></tr></thead><tbody>${methods}</tbody></table></div></div><div><h3>時段分布</h3><div class="sales-bars">${hourBars}</div></div></div>
    <h3 style="margin-top:20px">品項銷量</h3><div class="a-wrap2"><table class="a-tbl"><thead><tr><th>品項</th><th>店別</th><th class="num">數量</th><th class="num">金額</th></tr></thead><tbody>${items}</tbody></table></div>
    ${lpBlock}`;
  const shift=n=>{const t=new Date(SALES_DAY+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);SALES_DAY=t.toISOString().slice(0,10);loadSales();};
  // 同步：抓「這個營業日前後 3 天」，退款會回補到幾天前；按下去要等後台登入、約 20–60 秒
  host.querySelector('#lp-sync').onclick=e=>{const b=e.currentTarget;b.disabled=true;b.textContent='同步中…（約 1 分鐘）';
    const addDays=(day,n)=>{const t=new Date(day+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
    const start=addDays(d.day,-3),end=[addDays(d.day,1),todayTaipei()].sort()[0];
    opsThen(()=>api('/admin/sales/linepay/sync',{method:'POST',body:{start,end}}),out=>`已同步 ${out.start} ～ ${out.end}，${out.count} 筆`,loadSales).finally(()=>{b.disabled=false;b.textContent='同步 LINE Pay';});};
  host.querySelector('#lp-csv').onclick=()=>downloadCSV(`LINEPay_${d.day}.csv`,lp.csv||[]);
  host.querySelector('#sales-day').onchange=e=>{SALES_DAY=e.target.value||MenuLib.businessDay();loadSales();};
  host.querySelector('#sales-prev').onclick=()=>shift(-1);
  host.querySelector('#sales-next').onclick=()=>shift(1);
  host.querySelector('#sales-today').onclick=()=>{SALES_DAY=MenuLib.businessDay();loadSales();};
  host.querySelector('#sales-csv').onclick=()=>downloadCSV(`日結_${d.day}${SCOPE?'_'+(BRAND_LABEL[SCOPE]||SCOPE):''}.csv`,d.csv||[]);
}

/* 估清：平板一鍵切換「今日估清／恢復供應」，直接寫伺服器（只動 sold_out），翌日 03:00 自動恢復 */
function tabSoldOut(){ return '<div class="a-sec" id="soldout-body"></div>'; }
function loadSoldOut(){
  const host=document.getElementById('soldout-body');if(!host)return;
  const items=MenuLib.sortItems((MENU_DOC?.items||[]).filter(it=>it.published&&(!SCOPE||it.venue===SCOPE)));
  const groups=new Map();for(const it of items){if(!groups.has(it.cat))groups.set(it.cat,[]);groups.get(it.cat).push(it);}
  const cards=[...groups].map(([cat,list])=>`<h3>${esc(MenuLib.CAT_LABEL[cat]?.zh||cat)}</h3><div class="so-grid">${list.map(it=>{const off=MenuLib.soldOutToday(it);return `<button type="button" class="so-item ${off?'off':''}" data-so="${esc(it.id)}" data-on="${off?'0':'1'}" aria-pressed="${off?'true':'false'}"><b>${esc(it.zh)}</b><span>NT$${Number(it.price).toLocaleString('zh-TW')}${SCOPE?'':' · '+esc(BRAND_LABEL[it.venue]||it.venue)}</span><small>${off?'今日估清 · 點一下恢復':'供應中'}</small></button>`;}).join('')}</div>`).join('')||'<p class="a-empty">沒有已發布的菜單項目，請先在後台「菜單」儲存菜單。</p>';
  host.innerHTML=`<h2>估清</h2><p class="hint">點一下品項切換「今日估清」，客人掃碼立刻點不到；翌日 03:00 自動恢復供應。</p>${cards}`;
  host.querySelectorAll('[data-so]').forEach(b=>b.onclick=()=>{const id=b.dataset.so,on=b.dataset.on==='1';opsThen(()=>api('/admin/menu/sold-out',{method:'POST',body:{item_id:id,sold_out:on}}),on?'已標記今日估清，客人掃碼點不到':'已恢復供應',()=>{MENU_DOC.items=MENU_DOC.items.map(x=>x.id===id?{...x,sold_out:on?MenuLib.businessDay():''}:x);loadSoldOut();});});
}
