/* POS 庫存分頁（/pos/inventory）。動態文字一律經 esc() 再進 innerHTML。
 * 原物料（raw）與備料（prep：醬料、糖漿、高湯等店內先做好的半成品）放在同一張表：
 *   進貨＝入倉（可填金額算平均成本）、製作備料＝依每批配方扣原物料再加備料、耗用／報廢／盤點手動調整；
 *   出餐自動扣：菜單品項設好「每份用量」後，送出點餐（或櫃檯先結後做）時伺服器依配方扣，套餐依組成品項扣。
 * 每筆寫入都要輸入 4 位數識別碼（ensureOperator），紀錄會記是誰做的。依賴 pos-ops.js 的 esc/num/api/toast/opsThen/tipIcon/ensureOperator/OPERATOR/scopeQuery/SCOPE/MENU_DOC/MenuLib/BRAND_LABEL/downloadCSV。 */
const INV_KIND={raw:'原物料',prep:'備料'};
const INV_VENUE={TTH:'共用',CAFE:'在咖啡',BAR:'三點水'};
const INV_MOVE={in:'進貨',use:'耗用',waste:'報廢',count:'盤點',make:'製作備料',prep_use:'備料耗用',sale:'出餐扣庫存',void_back:'作廢回補'};
const INV_UNITS=['g','ml','個','份','片','張','顆'];
const INV_STORAGE={chill:'冷藏',freeze:'冷凍',dry:'常溫乾貨'};
const INV_WASTE=['過期','變質','打翻','品質不佳','試做／員工餐'];
const INV_USE=['試做','員工餐','活動招待','清潔／保養'];
let INV={data:null,view:'list',filter:'all',q:'',edit:null,bom:null,moves:null,from:'',to:'',movesInv:''};
const invQty=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:3});
const invCost=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:Number(n)<1?4:2});
const invLow=i=>i.active!==false&&(Number(i.qty)<0||(Number(i.safety_qty)>0&&Number(i.qty)<=Number(i.safety_qty)));
/* 叫貨單（10/19 員工大會 #42）：低於安全量或負庫存的原物料，依供應商分組；建議量＝補到安全量的 2 倍，有進貨單位就換算成整數包（無條件進位）。
 * 只產出清單給店長傳給廠商（複製文字），不會自動下單；貨到後照舊按「進貨」入倉。備料是店內自己做的，不列入。 */
function invOrderPlan(items){
  const groups=new Map();
  for(const i of items||[]){
    if(i.kind!=='raw'||!invLow(i))continue;
    const safety=Math.max(0,Number(i.safety_qty)||0),qty=Number(i.qty)||0;
    const need=Math.max(safety*2-qty,safety>0?0:-qty);
    if(!(need>0))continue;
    const pack=i.pack_unit&&Number(i.pack_size)>0?{unit:i.pack_unit,n:Math.ceil(need/Number(i.pack_size)-1e-9)}:null;
    const key=String(i.supplier||'').trim()||'未填供應商';
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({id:i.id,name:i.name,unit:i.unit,qty,safety,need:Math.round(need*1000)/1000,pack,venue:i.venue});
  }
  return [...groups].sort((a,b)=>(a[0]==='未填供應商')-(b[0]==='未填供應商')||a[0].localeCompare(b[0],'zh-Hant')).map(([supplier,lines])=>({supplier,lines}));
}
const invOrderAmount=l=>l.pack?`${invQty(l.pack.n)} ${l.pack.unit}`:`${invQty(l.need)} ${l.unit}`;
function invOrderText(g){return `【叫貨】${g.supplier}\n`+g.lines.map(l=>`・${l.name} ${invOrderAmount(l)}`).join('\n');}
function invOrderHtml(){
  const plan=invOrderPlan(invItems());
  if(!plan.length)return '<p class="a-empty">目前沒有低於安全量的原物料。品項要先在「編輯」填安全庫存量，低於時才會出現在這裡。</p>';
  return `<p class="hint">低於安全量的原物料，依供應商分組；建議量＝補到安全量的 2 倍（有進貨單位就換成整包）。按「複製」貼到 LINE 給廠商，貨到後回「庫存」按「進貨」入倉。</p>`+plan.map((g,gi)=>`<section class="inv-order"><div class="ops-head"><h3>${esc(g.supplier)} <small class="hint hint--tight">${g.lines.length} 項</small></h3><button type="button" class="btn btn--ghost btn-sm" data-inv-order-copy="${gi}">複製叫貨文字</button></div>
    <div class="a-wrap2"><table class="a-tbl"><thead><tr><th>品項</th><th class="num">現有</th><th class="num">安全量</th><th class="num">建議叫貨</th></tr></thead><tbody>${g.lines.map(l=>`<tr><td>${esc(l.name)}${l.venue&&l.venue!=='TTH'?` <small class="hint hint--tight">${esc(INV_VENUE[l.venue]||l.venue)}</small>`:''}</td><td class="num">${invQty(l.qty)} ${esc(l.unit)}</td><td class="num">${invQty(l.safety)} ${esc(l.unit)}</td><td class="num"><b>${esc(invOrderAmount(l))}</b>${l.pack?` <small class="hint hint--tight">≈${invQty(l.need)} ${esc(l.unit)}</small>`:''}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
}
function tabInventory(){ return '<div class="a-sec" id="inv-body"></div>'; }
function resetInventory(){ INV={data:null,view:'list',filter:'all',q:'',edit:null,bom:null,moves:null,from:'',to:'',movesInv:''}; }
async function loadInventory(refresh){
  const host=document.getElementById('inv-body');if(!host)return;
  if(!INV.data||refresh!==false){
    if(!INV.data)host.innerHTML='<div class="ops-head"><h2>庫存</h2></div><p class="hint">載入中…</p>';
    try{INV.data=await api('/admin/inventory'+scopeQuery());}catch(e){host.innerHTML=`<div class="ops-head"><h2>庫存</h2></div><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  }
  if(INV.view==='moves'&&!INV.moves)return loadInventoryMoves();
  paintInventory();
}
function invItems(){ return (INV.data?.items||[]); }
function invById(id){ return invItems().find(i=>i.id===id); }
function invVenueOptions(cur){
  const list=SCOPE?['TTH',SCOPE]:['TTH','CAFE','BAR'];
  return list.map(v=>`<option value="${v}"${v===cur?' selected':''}>${esc(INV_VENUE[v])}</option>`).join('');
}
function invSelectOptions(cur,{excludeId=''}={}){
  const items=invItems().filter(i=>i.active!==false&&i.id!==excludeId);
  const grp=k=>items.filter(i=>i.kind===k).map(i=>`<option value="${esc(i.id)}"${i.id===cur?' selected':''}>${esc(i.name)}（${esc(i.unit)}）</option>`).join('');
  return `<option value="">選擇庫存品項</option><optgroup label="原物料">${grp('raw')}</optgroup><optgroup label="備料">${grp('prep')}</optgroup>`;
}
/* 配方列編輯器（備料每批配方、菜單每份用量共用） */
function invBomRows(rows,{excludeId='',per='每批'}={}){
  return `<div class="inv-bom" data-inv-bom>${rows.map((r,i)=>{const it=invById(r.inv_id);return `<div class="inv-bom-row" data-row="${i}"><select data-bom-inv aria-label="庫存品項">${invSelectOptions(r.inv_id,{excludeId})}</select><label class="inv-bom-qty"><input data-bom-qty type="number" inputmode="decimal" min="0" step="any" value="${r.qty===''||r.qty==null?'':esc(r.qty)}" placeholder="${esc(per)}用量" aria-label="${esc(per)}用量"><span>${esc(it?.unit||'')}</span></label><button type="button" class="btn btn--ghost btn--danger btn-sm" data-bom-del="${i}" aria-label="移除這一列">移除</button></div>`;}).join('')}
    <button type="button" class="btn btn--ghost btn-sm" data-bom-add>＋ 加一列</button></div>`;
}
function invReadBom(box){
  return [...box.querySelectorAll('.inv-bom-row')].map(r=>({inv_id:r.querySelector('[data-bom-inv]').value,qty:r.querySelector('[data-bom-qty]').value.trim()}));
}
function invBindBom(box,get,set,repaint){
  if(!box)return;
  box.querySelectorAll('[data-bom-inv],[data-bom-qty]').forEach(el=>el.onchange=()=>{set(invReadBom(box));if(el.matches('[data-bom-inv]'))repaint();});
  box.querySelectorAll('[data-bom-qty]').forEach(el=>el.oninput=()=>set(invReadBom(box)));
  box.querySelectorAll('[data-bom-del]').forEach(b=>b.onclick=()=>{const rows=invReadBom(box);rows.splice(Number(b.dataset.bomDel),1);set(rows);repaint();});
  const add=box.querySelector('[data-bom-add]');if(add)add.onclick=()=>{set([...invReadBom(box),{inv_id:'',qty:''}]);repaint();};
}
const invBomBody=rows=>rows.filter(r=>r.inv_id||String(r.qty).trim()).map(r=>{if(!r.inv_id)throw Error('配方有一列沒選品項');const q=Number(r.qty);if(!(q>0))throw Error('配方用量要大於 0');return {inv_id:r.inv_id,qty:q};});

function invEditForm(){
  if(!INV.edit)return '';
  const cur=INV.edit==='new'?{kind:'raw',venue:SCOPE||'TTH',unit:'',safety_qty:0,batch_yield:1,bom:[]}:invById(INV.edit);
  if(!cur)return '';
  const f=INV.form||(INV.form={name:cur.name||'',kind:cur.kind,unit:cur.unit||'',venue:cur.venue||'TTH',category:cur.category||'',safety_qty:cur.safety_qty??0,batch_yield:cur.batch_yield??1,note:cur.note||'',pack_unit:cur.pack_unit||'',pack_size:cur.pack_size??'',yield_rate:cur.yield_rate??1,supplier:cur.supplier||'',storage:cur.storage||'',shelf_life:cur.shelf_life||'',ref_cost:cur.ref_cost??''});
  const hasStock=INV.edit!=='new'&&Number(cur.qty)!==0;
  if(!INV.bom)INV.bom=(cur.bom||[]).map(b=>({...b}));
  const prep=f.kind==='prep';
  return `<form class="a-form inv-form" id="inv-form" autocomplete="off"><h3>${INV.edit==='new'?'新增庫存品項':'編輯「'+esc(cur.name)+'」'}</h3>
    <div class="inv-kind" role="radiogroup" aria-label="類型">${Object.entries(INV_KIND).map(([k,l])=>`<label class="inv-chip"><input type="radio" name="inv-kind" value="${k}"${f.kind===k?' checked':''}><span>${l}</span></label>`).join('')}</div>
    <label>品名<input id="inv-name" maxlength="40" value="${esc(f.name)}" placeholder="${prep?'例：青醬、焦糖醬、柴魚高湯':'例：鮮奶、咖啡豆、雞腿排'}" required></label>
    <label>庫存單位（配方用量的單位）<input id="inv-unit" maxlength="10" value="${esc(f.unit)}" placeholder="g、ml、個…" required${hasStock?' readonly':''}></label>
    ${hasStock?`<p class="hint inv-note">已有庫存，改單位請按下面的「換算單位」。</p>`:`<div class="reason-chips reason-chips--inline" role="group" aria-label="常用單位">${INV_UNITS.map(u=>`<button type="button" data-unit="${esc(u)}" aria-pressed="${f.unit===u}">${esc(u)}</button>`).join('')}</div>`}
    <label>進貨單位（選填）<input id="inv-pack-unit" maxlength="10" value="${esc(f.pack_unit)}" placeholder="斤、盒、瓶、包…"></label>
    <label>每一進貨單位＝幾${esc(f.unit||'庫存單位')}<input id="inv-pack-size" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.pack_size)}" placeholder="例：1 斤＝600"></label>
    <label>使用率（可食率）<input id="inv-yield-rate" type="number" inputmode="decimal" min="0.05" max="1" step="any" value="${esc(f.yield_rate)}" placeholder="1＝沒有耗損"></label>
    <label>供應商（選填）<input id="inv-supplier" maxlength="30" value="${esc(f.supplier)}" placeholder="尚太、大永、海康…"></label>
    <label>保存方式<select id="inv-storage"><option value="">—</option>${Object.entries(INV_STORAGE).map(([k,l])=>`<option value="${k}"${f.storage===k?' selected':''}>${l}</option>`).join('')}</select></label>
    <label>保存天數（選填）<input id="inv-shelf" maxlength="40" value="${esc(f.shelf_life)}" placeholder="D+3、5 天、依包裝效期…"></label>
    ${f.kind==='prep'?'':`<label>參考成本（元／${esc(f.unit||'單位')}，選填）<input id="inv-ref-cost" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.ref_cost)}" placeholder="還沒進貨時，算配方成本用"></label>`}
    <label>店別<select id="inv-venue">${invVenueOptions(f.venue)}</select></label>
    <label>分類（選填）<input id="inv-cat" maxlength="20" value="${esc(f.category)}" placeholder="乳品、醬料、包材…"></label>
    <label>安全庫存量<input id="inv-safety" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.safety_qty)}"></label>
    ${prep?`<label>每批產出量<input id="inv-yield" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.batch_yield)}"></label>
    <div class="inv-bom-wrap"><b>每批配方</b><span class="hint">做一批（上面的產出量）會用掉哪些原物料；按「製作」時依實際產出量等比扣。</span>${invBomRows(INV.bom,{excludeId:cur.id||'',per:'每批'})}</div>`:''}
    <label class="inv-note">備註（選填）<input id="inv-note" maxlength="120" value="${esc(f.note)}" placeholder="廠商、保存方式、效期…"></label>
    <div class="inv-form-actions">${INV.edit!=='new'?`<button type="button" class="btn btn--ghost${cur.active===false?'':' btn--danger'}" id="inv-toggle">${cur.active===false?'恢復使用':'停用'}</button><button type="button" class="btn btn--ghost" id="inv-convert">換算單位</button>`:''}<span class="inv-spacer"></span><button type="button" class="btn btn--ghost" id="inv-cancel">取消</button><button type="submit" class="btn btn--solid">儲存</button></div></form>`;
}
function invReadForm(host){
  const v=id=>host.querySelector(id)?.value??'';
  INV.form={...INV.form,name:v('#inv-name'),unit:v('#inv-unit'),venue:v('#inv-venue'),category:v('#inv-cat'),safety_qty:v('#inv-safety'),batch_yield:host.querySelector('#inv-yield')?v('#inv-yield'):INV.form?.batch_yield,note:v('#inv-note'),pack_unit:v('#inv-pack-unit'),pack_size:v('#inv-pack-size'),yield_rate:v('#inv-yield-rate'),supplier:v('#inv-supplier'),storage:v('#inv-storage'),shelf_life:v('#inv-shelf'),ref_cost:host.querySelector('#inv-ref-cost')?v('#inv-ref-cost'):INV.form?.ref_cost};
  const k=host.querySelector('input[name=inv-kind]:checked');if(k)INV.form.kind=k.value;
  const box=host.querySelector('[data-inv-bom]');if(box)INV.bom=invReadBom(box);
}
function paintInventory(){
  const host=document.getElementById('inv-body');if(!host||!INV.data)return;
  const all=invItems(),low=all.filter(invLow).length,prepN=all.filter(i=>i.kind==='prep'&&i.active!==false).length;
  const q=INV.q.trim().toLowerCase();
  const list=all.filter(i=>INV.filter==='off'?i.active===false:i.active!==false).filter(i=>INV.filter==='all'||INV.filter==='off'||(INV.filter==='low'?invLow(i):i.kind===INV.filter)).filter(i=>!q||(i.name+' '+(i.category||'')).toLowerCase().includes(q));
  const views=[['list','庫存'],['order','叫貨單'],['recipes','菜單配方'],['moves','異動紀錄']];
  const head=`<div class="ops-head"><h2>庫存${low?` <span class="pill pill-bad">${low} 項低於安全量</span>`:''}</h2>${tipIcon('<b>進貨</b>＝貨到時入倉（可填這批總金額，自動算平均成本）。<br><b>備料</b>（醬料、糖漿、高湯…）先在「編輯」設好每批配方，做好後按「製作」填產出量，原物料會依配方等比扣掉、備料加進庫存。<br><b>出餐自動扣</b>：在「菜單配方」設每份用量（可用原物料或備料）；客人送出點餐、或櫃檯直接結帳時自動扣，套餐依組成品項扣。送單後還沒出餐就作廢會自動補回；已出餐的不補，差異用「盤點」調整。<br>庫存可以是負數（先賣後補登進貨），不會自動估清。')}</div>
    <div class="inv-views" role="tablist">${views.map(([k,l])=>`<button type="button" role="tab" aria-selected="${INV.view===k}" class="${INV.view===k?'on':''}" data-inv-view="${k}">${l}</button>`).join('')}</div>`;
  if(INV.view==='order'){host.innerHTML=head+invOrderHtml();bindInventory(host);return;}
  if(INV.view==='recipes'){host.innerHTML=head+invRecipesHtml();bindInventory(host);return;}
  if(INV.view==='moves'){host.innerHTML=head+invMovesHtml();bindInventory(host);return;}
  const filters=[['all','全部'],['raw','原物料'],['prep',`備料${prepN?' '+prepN:''}`],['low',`低於安全量${low?' '+low:''}`],['off','已停用']];
  const card=i=>{const lowNow=invLow(i),neg=Number(i.qty)<0;return `<article class="inv-card${lowNow?' is-low':''}${i.active===false?' is-off':''}">
    <div class="inv-card-top"><b class="inv-name">${esc(i.name)}</b>${i.kind==='prep'?'<span class="pill pill-wait">備料</span>':''}${lowNow?`<span class="pill pill-bad">${neg?'庫存為負':'該叫貨了'}</span>`:''}</div>
    <div class="inv-qty${neg?' neg':''}"><b>${invQty(i.qty)}</b> <span>${esc(i.unit)}</span></div>
    ${i.pack_unit&&Number(i.pack_size)>0?`<div class="inv-pack">≈ ${invQty(Number(i.qty)/Number(i.pack_size))} ${esc(i.pack_unit)}</div>`:''}
    <div class="inv-meta">${[INV_VENUE[i.venue]||i.venue,i.category,i.supplier,INV_STORAGE[i.storage]?INV_STORAGE[i.storage]+(i.shelf_life?' '+i.shelf_life:''):i.shelf_life,Number(i.safety_qty)>0?'安全量 '+invQty(i.safety_qty):'',i.unit_cost!=null?'成本 '+invCost(i.unit_cost)+' 元/'+i.unit:'',Number(i.yield_rate)<1?'使用率 '+Math.round(Number(i.yield_rate)*100)+'%':''].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
    ${i.active===false?`<div class="ops-btns"><button type="button" class="btn btn--ghost btn-sm" data-inv-edit="${esc(i.id)}">編輯</button></div>`:`<div class="inv-acts">${i.kind==='prep'?`<button type="button" class="btn btn--solid" data-inv-move="make" data-id="${esc(i.id)}">製作</button>`:`<button type="button" class="btn btn--solid" data-inv-move="in" data-id="${esc(i.id)}">進貨</button>`}<button type="button" class="btn btn--ghost" data-inv-move="count" data-id="${esc(i.id)}">盤點</button>
      <details class="ops-more"><summary class="btn btn--ghost" aria-label="更多操作">⋯</summary><div class="ops-btns">${i.kind==='prep'?`<button type="button" class="btn btn--ghost btn-sm" data-inv-move="in" data-id="${esc(i.id)}">進貨（買現成）</button>`:''}<button type="button" class="btn btn--ghost btn-sm" data-inv-move="use" data-id="${esc(i.id)}">耗用</button><button type="button" class="btn btn--ghost btn--danger btn-sm" data-inv-move="waste" data-id="${esc(i.id)}">報廢</button><button type="button" class="btn btn--ghost btn-sm" data-inv-history="${esc(i.id)}">紀錄</button><button type="button" class="btn btn--ghost btn-sm" data-inv-edit="${esc(i.id)}">編輯</button></div></details></div>`}
  </article>`;};
  host.innerHTML=head+`<div class="a-toolbar inv-tools"><div class="inv-filters" role="group" aria-label="篩選">${filters.map(([k,l])=>`<button type="button" class="${INV.filter===k?'on':''}" aria-pressed="${INV.filter===k}" data-inv-filter="${k}">${esc(l)}</button>`).join('')}</div>
    <input type="search" id="inv-q" placeholder="搜尋品名或分類" value="${esc(INV.q)}" aria-label="搜尋庫存品項"><button type="button" class="btn btn--solid" id="inv-new">＋ 新增品項</button></div>
    ${invEditForm()}
    ${list.length?`<div class="inv-grid">${list.map(card).join('')}</div>`:`<p class="a-empty">${all.length?'沒有符合的品項。':'還沒有庫存品項。先按「＋ 新增品項」建立原物料（鮮奶、咖啡豆…）與備料（醬料、糖漿…）。'}</p>`}`;
  bindInventory(host);
}
function bindInventory(host){
  host.querySelectorAll('[data-inv-view]').forEach(b=>b.onclick=()=>{INV.view=b.dataset.invView;INV.edit=null;INV.form=null;INV.bom=null;if(INV.view==='moves'){INV.moves=null;loadInventoryMoves();}else paintInventory();});
  host.querySelectorAll('[data-inv-order-copy]').forEach(b=>b.onclick=async()=>{const g=invOrderPlan(invItems())[Number(b.dataset.invOrderCopy)];if(!g)return;const text=invOrderText(g);try{await navigator.clipboard.writeText(text);toast('已複製 '+g.supplier+' 的叫貨文字');}catch(e){window.prompt('複製下面的叫貨文字',text);}});
  host.querySelectorAll('[data-inv-filter]').forEach(b=>b.onclick=()=>{INV.filter=b.dataset.invFilter;paintInventory();});
  const qi=host.querySelector('#inv-q');if(qi){qi.oninput=()=>{INV.q=qi.value;const pos=qi.selectionStart;paintInventory();const n=document.getElementById('inv-q');if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}}};}
  const nb=host.querySelector('#inv-new');if(nb)nb.onclick=()=>{INV.edit='new';INV.form=null;INV.bom=null;paintInventory();host.querySelector('#inv-name')?.focus();};
  host.querySelectorAll('[data-inv-edit]').forEach(b=>b.onclick=()=>{INV.edit=b.dataset.invEdit;INV.form=null;INV.bom=null;INV.view='list';paintInventory();host.querySelector('#inv-form')?.scrollIntoView({block:'start'});});
  host.querySelectorAll('[data-inv-history]').forEach(b=>b.onclick=()=>{INV.view='moves';INV.movesInv=b.dataset.invHistory;INV.moves=null;if(!INV.from){const t=MenuLib.businessDay();INV.to=t;INV.from=invAddDays(t,-6);}loadInventoryMoves();});
  host.querySelectorAll('[data-inv-move]').forEach(b=>b.onclick=()=>{const it=invById(b.dataset.id);if(it)invMoveDialog(it,b.dataset.invMove);});
  const form=host.querySelector('#inv-form');
  if(form){
    const repaint=()=>{invReadForm(host);paintInventory();};
    form.querySelectorAll('input[name=inv-kind]').forEach(r=>r.onchange=repaint);
    form.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{form.querySelector('#inv-unit').value=b.dataset.unit;repaint();});
    invBindBom(form.querySelector('[data-inv-bom]'),()=>INV.bom,rows=>{INV.bom=rows;},repaint);
    form.querySelector('#inv-cancel').onclick=()=>{INV.edit=null;INV.form=null;INV.bom=null;paintInventory();};
    const cv=form.querySelector('#inv-convert');if(cv)cv.onclick=()=>{const it=invById(INV.edit);if(it)invConvertDialog(it);};
    const tg=form.querySelector('#inv-toggle');if(tg)tg.onclick=()=>{const it=invById(INV.edit);if(!it)return;ensureOperator(()=>opsThen(()=>api('/admin/inventory/items/'+encodeURIComponent(it.id),{method:'PATCH',body:{active:it.active===false,operator_id:OPERATOR?.id}}),it.active===false?'已恢復使用':'已停用（紀錄保留）',()=>{INV.edit=null;INV.form=null;INV.bom=null;return loadInventory();}));};
    form.onsubmit=e=>{e.preventDefault();invReadForm(host);const f=INV.form;
      if(!f.name.trim()){toast('請填寫品名');return;}if(!f.unit.trim()){toast('請填寫單位');return;}
      let bom;try{bom=f.kind==='prep'?invBomBody(INV.bom||[]):undefined;}catch(err){toast(err.message);return;}
      const pu=String(f.pack_unit||'').trim();if(pu&&!(Number(f.pack_size)>0)){toast('請填每一'+pu+'是幾'+f.unit);return;}
      const yr=f.yield_rate===''?1:Number(f.yield_rate);if(!(yr>=0.05&&yr<=1)){toast('使用率要在 0.05–1 之間（例：0.9＝九成可用）');return;}
      const body={name:f.name.trim(),kind:f.kind,unit:f.unit.trim(),venue:f.venue,category:f.category.trim(),safety_qty:f.safety_qty===''?0:Number(f.safety_qty),note:f.note.trim(),pack_unit:pu,pack_size:pu?Number(f.pack_size):null,yield_rate:yr,supplier:String(f.supplier||'').trim(),storage:f.storage||'',shelf_life:String(f.shelf_life||'').trim(),ref_cost:f.kind==='prep'||f.ref_cost===''||f.ref_cost==null?null:Number(f.ref_cost),...(f.kind==='prep'?{batch_yield:Number(f.batch_yield),bom}:{})};
      const isNew=INV.edit==='new';
      ensureOperator(()=>opsThen(()=>api(isNew?'/admin/inventory/items':'/admin/inventory/items/'+encodeURIComponent(INV.edit),{method:isNew?'POST':'PATCH',body:{...body,operator_id:OPERATOR?.id}}),isNew?`已新增「${body.name}」`:'已儲存',()=>{INV.edit=null;INV.form=null;INV.bom=null;return loadInventory();}));
    };
  }
  host.querySelectorAll('[data-recipe-edit]').forEach(b=>b.onclick=()=>invRecipeDialog(b.dataset.recipeEdit));
  const rq=host.querySelector('#inv-rq');if(rq){rq.oninput=()=>{INV.rq=rq.value;const pos=rq.selectionStart;paintInventory();const n=document.getElementById('inv-rq');if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}}};}
  const rf=host.querySelector('#inv-rfilter');if(rf)rf.onchange=()=>{INV.rfilter=rf.value;paintInventory();};
  const mf=host.querySelector('#inv-moves-form');if(mf)mf.onsubmit=e=>{e.preventDefault();INV.from=mf.querySelector('#inv-from').value;INV.to=mf.querySelector('#inv-to').value;INV.movesInv=mf.querySelector('#inv-mi').value;INV.moves=null;loadInventoryMoves();};
  const csv=host.querySelector('#inv-csv');if(csv)csv.onclick=()=>downloadCSV(`庫存異動_${INV.from}_${INV.to}.csv`,INV.moves?.csv||[]);
}
const invAddDays=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};

/* 進貨／製作／耗用／報廢／盤點：覆蓋式卡片，數量用大字數字欄；送出前認人 */
function invMoveDialog(it,type){
  const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
  const close=()=>{if(ov.parentNode)ov.parentNode.removeChild(ov);};
  const title={in:'進貨（入倉）',make:'製作備料',use:'耗用',waste:'報廢',count:'盤點'}[type];
  const bom=(it.bom||[]).map(b=>({...b,item:invById(b.inv_id)}));
  const yieldQ=Number(it.batch_yield)||1;
  const presets=type==='waste'?INV_WASTE:type==='use'?INV_USE:[];
  const qtyLabel={in:'進貨數量',make:'這次做了多少',use:'耗用數量',waste:'報廢數量',count:'實際點到的數量'}[type];
  const packed=type==='in'&&it.pack_unit&&Number(it.pack_size)>0;   // 進貨用斤／盒／瓶登記，系統換算成庫存單位
  const qUnit=packed?it.pack_unit:it.unit;
  ov.innerHTML=`<div class="op-card inv-move" role="dialog" aria-label="${esc(title)}"><h2>${esc(title)}｜${esc(it.name)}</h2>
    <p class="inv-move-now">目前 <b>${invQty(it.qty)}</b> ${esc(it.unit)}</p>
    <label class="inv-move-qty"><span>${esc(qtyLabel)}（${esc(qUnit)}）${packed?`<small class="hint">1 ${esc(it.pack_unit)}＝${invQty(it.pack_size)} ${esc(it.unit)}</small>`:''}</span><input id="inv-mq" type="number" inputmode="decimal" min="0" step="any" value="${type==='count'?esc(it.qty):type==='make'?esc(yieldQ):''}" autofocus></label>
    ${type==='make'&&yieldQ?`<div class="reason-chips">${[0.5,1,2,3].map(n=>`<button type="button" data-batches="${n}">${n} 批（${invQty(yieldQ*n)} ${esc(it.unit)}）</button>`).join('')}</div>`:''}
    ${type==='in'?`<label class="inv-move-qty"><span>這批總金額（元，選填，用來算平均成本）</span><input id="inv-ma" type="number" inputmode="numeric" min="0" step="1"></label>`:''}
    ${type==='make'?`<div class="inv-make-plan" id="inv-plan"></div>`:''}
    ${type==='count'?`<p class="hint" id="inv-diff"></p>`:''}${packed?`<p class="hint" id="inv-conv"></p>`:''}
    ${presets.length?`<div class="reason-chips">${presets.map(p=>`<button type="button" data-preset="${esc(p)}">${esc(p)}</button>`).join('')}</div>`:''}
    <label class="reason-other"><span>${type==='waste'?'報廢原因（必填）':type==='in'?'廠商／備註（選填）':'備註（選填）'}</span><input id="inv-mn" maxlength="120"></label>
    <div class="op-card-actions"><button type="button" class="btn btn--ghost" id="inv-mc">取消</button><button type="button" class="btn btn--solid${type==='waste'?' btn--danger':''}" id="inv-mok">${esc(title.replace(/（.*）/,''))}</button></div></div>`;
  const qi=ov.querySelector('#inv-mq'),ni=ov.querySelector('#inv-mn');
  const plan=()=>{const box=ov.querySelector('#inv-plan');if(!box)return;const q=Number(qi.value)||0;
    box.innerHTML=bom.length?`<b>會扣掉的原物料</b><ul>${bom.map(b=>{const yr=Number(b.item?.yield_rate)>0?Number(b.item.yield_rate):1;const use=Math.round(b.qty*q/yieldQ/yr*1000)/1000;const left=b.item?Number(b.item.qty)-use:null;return `<li>${esc(b.item?.name||'（已刪除的品項）')} <b>${invQty(use)}</b> ${esc(b.item?.unit||'')}${left!=null?`<span class="hint">　剩 ${invQty(left)}${left<0?'（不足）':''}</span>`:''}</li>`;}).join('')}</ul>`:'<p class="clock-msg bad">還沒設定每批配方：請先按「編輯」填寫用了哪些原物料。</p>';};
  const diff=()=>{const d=ov.querySelector('#inv-diff');if(!d)return;const v=qi.value===''?null:Number(qi.value)-Number(it.qty);d.textContent=v==null?'':v===0?'與帳上相同':`盤差 ${v>0?'+':''}${invQty(v)} ${it.unit}`;};
  const conv=()=>{const c=ov.querySelector('#inv-conv');if(!c)return;const v=Number(qi.value)||0;c.textContent=v?`＝ ${invQty(v*Number(it.pack_size))} ${it.unit}，入倉後 ${invQty(Number(it.qty)+v*Number(it.pack_size))} ${it.unit}`:'';};
  qi.oninput=()=>{plan();diff();conv();};plan();diff();conv();
  const syncBatches=()=>ov.querySelectorAll('[data-batches]').forEach(b=>b.setAttribute('aria-pressed',String(Math.abs(Number(qi.value)-yieldQ*Number(b.dataset.batches))<1e-6)));
  ov.querySelectorAll('[data-batches]').forEach(b=>b.onclick=()=>{qi.value=String(Math.round(yieldQ*Number(b.dataset.batches)*1000)/1000);plan();syncBatches();});
  qi.addEventListener('input',syncBatches);syncBatches();
  ov.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{ni.value=b.dataset.preset;ov.querySelectorAll('[data-preset]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  ov.querySelector('#inv-mc').onclick=close;
  ov.querySelector('#inv-mok').onclick=()=>{
    const raw=qi.value.trim();if(raw===''){toast('請輸入數量');qi.focus();return;}
    const qn=Number(raw);if(!Number.isFinite(qn)||qn<0||(type!=='count'&&qn===0)){toast('數量要大於 0');qi.focus();return;}
    if(type==='make'&&!bom.length){toast('請先設定每批配方');return;}
    const note=ni.value.trim();if(type==='waste'&&!note){toast('請選或填報廢原因');ni.focus();return;}
    const amt=ov.querySelector('#inv-ma')?.value.trim();
    const body={type,note,...(type==='count'?{counted:qn}:packed?{packs:qn}:{qty:qn}),...(amt?{amount:Number(amt)}:{})};
    close();
    ensureOperator(()=>opsThen(()=>api('/admin/inventory/items/'+encodeURIComponent(it.id)+'/moves',{method:'POST',body:{...body,operator_id:OPERATOR?.id}}),out=>`${title.replace(/（.*）/,'')}完成：${it.name} 現在 ${invQty(out.qty)} ${it.unit}${out.used?.length?`；已扣 ${out.used.map(u=>u.name+' '+invQty(u.qty)+u.unit).join('、')}`:''}`,()=>loadInventory()));
  };
}

/* 換算單位：例如原本用「斤」記，要改成 g（1 斤＝600 g）；庫存量、均價與所有配方用量一起換 */
function invConvertDialog(it){
  const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
  const close=()=>{if(ov.parentNode)ov.parentNode.removeChild(ov);};
  const presets=[['斤','g',600],['kg','g',1000],['L','ml',1000],['公斤','g',1000]].filter(([a])=>a===it.unit);
  ov.innerHTML=`<div class="op-card inv-move" role="dialog" aria-label="換算單位"><h2>換算單位｜${esc(it.name)}</h2>
    <p class="inv-move-now">目前 <b>${invQty(it.qty)}</b> ${esc(it.unit)}</p>
    ${presets.length?`<div class="reason-chips">${presets.map(([a,b,f])=>`<button type="button" data-cv="${esc(b)}" data-f="${f}">1 ${esc(a)} → ${f} ${esc(b)}</button>`).join('')}</div>`:''}
    <label class="inv-move-qty"><span>新單位</span><input id="inv-cu" maxlength="10" placeholder="g、ml…"></label>
    <label class="inv-move-qty"><span>1 ${esc(it.unit)}＝幾個新單位</span><input id="inv-cf" type="number" inputmode="decimal" min="0" step="any"></label>
    <p class="hint" id="inv-cp"></p>
    <div class="op-card-actions"><button type="button" class="btn btn--ghost" id="inv-cc">取消</button><button type="button" class="btn btn--solid" id="inv-cok">換算</button></div></div>`;
  const u=ov.querySelector('#inv-cu'),f=ov.querySelector('#inv-cf'),p=ov.querySelector('#inv-cp');
  const show=()=>{const n=Number(f.value);p.textContent=n>0&&u.value.trim()?`換算後 ${invQty(Number(it.qty)*n)} ${u.value.trim()}；菜單配方與備料配方的用量也會 ×${n}`:'';};
  u.oninput=show;f.oninput=show;
  ov.querySelectorAll('[data-cv]').forEach(b=>b.onclick=()=>{u.value=b.dataset.cv;f.value=b.dataset.f;show();});
  ov.querySelector('#inv-cc').onclick=close;
  ov.querySelector('#inv-cok').onclick=()=>{const unit=u.value.trim(),factor=Number(f.value);if(!unit){toast('請填新單位');return;}if(!(factor>0)){toast('換算倍數要大於 0');return;}
    close();ensureOperator(()=>opsThen(()=>api('/admin/inventory/items/'+encodeURIComponent(it.id)+'/convert',{method:'POST',body:{unit,factor,operator_id:OPERATOR?.id}}),out=>`已換算：${it.name} 現在 ${invQty(out.qty)} ${out.unit}`,()=>{INV.edit=null;INV.form=null;INV.bom=null;return loadInventory();}));};
}

/* 菜單配方：每份用量 */
function invRecipesHtml(){
  if(typeof MENU_DOC==='undefined'||!MENU_DOC?.items?.length)return '<p class="a-empty">菜單還沒載入，請重新整理。</p>';
  const recipes=INV.data?.recipes||{},q=(INV.rq||'').trim().toLowerCase(),mode=INV.rfilter||'all';
  const items=MenuLib.sortItems(MENU_DOC.items.filter(it=>(!SCOPE||it.venue===SCOPE)&&(it.published||it.pos_only)));
  const shown=items.filter(it=>!q||String(it.zh).toLowerCase().includes(q)).filter(it=>mode==='all'||(mode==='set'?recipes[it.id]?.length:!recipes[it.id]?.length));
  const setN=items.filter(it=>recipes[it.id]?.length).length;
  const groups=new Map();for(const it of shown){if(!groups.has(it.cat))groups.set(it.cat,[]);groups.get(it.cat).push(it);}
  const row=it=>{const r=recipes[it.id]||[];return `<tr><td class="ops-item"><b>${esc(it.zh)}</b>${SCOPE?'':' <span class="hint">'+esc(BRAND_LABEL[it.venue]||it.venue)+'</span>'}${it.cat==='COMBO'?'<br><span class="hint hint--tight">套餐會依組成品項各自的配方扣，這裡只填額外耗材（外帶杯、袋子）</span>':''}</td><td>${r.length?r.map(x=>{const iv=invById(x.inv_id);return `<span class="inv-tag${iv?.kind==='prep'?' prep':''}">${esc(iv?.name||'?')} ${invQty(x.qty)}${esc(iv?.unit||'')}</span>`;}).join(' '):'<span class="hint">未設定（出餐不扣）</span>'}</td><td class="num inv-cost">${(()=>{const c=INV.data?.costs?.[it.id];if(!c)return '<span class="hint">—</span>';const hi=c.ratio!=null&&c.ratio>0.3;return `<b>${invCost(c.cost)}</b>${c.ratio!=null?`<br><span class="${hi?'inv-neg':'hint'}">${Math.round(c.ratio*1000)/10}%</span>`:''}${c.missing?.length?`<br><span class="hint hint--tight" title="${esc(c.missing.join('、'))}">缺 ${c.missing.length} 項成本</span>`:''}`;})()}</td><td class="ops-actions"><div class="ops-btns"><button type="button" class="btn btn--ghost btn-sm" data-recipe-edit="${esc(it.id)}">${r.length?'修改':'設定'}</button></div></td></tr>`;};
  return `<div class="a-toolbar inv-tools"><input type="search" id="inv-rq" placeholder="搜尋菜單品項" value="${esc(INV.rq||'')}" aria-label="搜尋菜單品項"><select id="inv-rfilter" aria-label="篩選"><option value="all"${mode==='all'?' selected':''}>全部（${items.length}）</option><option value="set"${mode==='set'?' selected':''}>已設定（${setN}）</option><option value="unset"${mode==='unset'?' selected':''}>未設定（${items.length-setN}）</option></select></div>
    ${invItems().length?'':'<p class="clock-msg bad">還沒有庫存品項，請先到「庫存」新增原物料與備料。</p>'}
    ${[...groups].map(([cat,list])=>`<h3>${esc(MenuLib.CAT_LABEL?.[cat]?.zh||cat)}</h3><div class="a-wrap2"><table class="a-tbl inv-recipes"><thead><tr><th>菜單品項</th><th>每份用量</th><th class="num" title="每份食材成本／成本率">成本／成本率</th><th class="ops-th">操作</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`).join('')||'<p class="a-empty">沒有符合的品項。</p>'}`;
}
function invRecipeDialog(itemId){
  const it=(MENU_DOC?.items||[]).find(x=>x.id===itemId);if(!it)return;
  let rows=(INV.data?.recipes?.[itemId]||[]).map(r=>({...r}));if(!rows.length)rows=[{inv_id:'',qty:''}];
  const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
  const close=()=>{if(ov.parentNode)ov.parentNode.removeChild(ov);};
  const paint=()=>{
    ov.innerHTML=`<div class="op-card op-card--wide inv-recipe" role="dialog" aria-label="配方"><h2>${esc(it.zh)}｜每份用量</h2><p class="hint">賣出一份會扣掉的原物料或備料（醬料等）。全部移除＝這道不扣庫存。</p>
      ${invBomRows(rows,{per:'每份'})}
      <div class="op-card-actions"><button type="button" class="btn btn--ghost" id="inv-rc">取消</button><button type="button" class="btn btn--solid" id="inv-rok">儲存配方</button></div></div>`;
    invBindBom(ov.querySelector('[data-inv-bom]'),()=>rows,r=>{rows=r;},paint);
    ov.querySelector('#inv-rc').onclick=close;
    ov.querySelector('#inv-rok').onclick=()=>{rows=invReadBom(ov.querySelector('[data-inv-bom]'));let lines;try{lines=invBomBody(rows);}catch(e){toast(e.message);return;}
      close();ensureOperator(()=>opsThen(()=>api('/admin/inventory/recipes/'+encodeURIComponent(itemId),{method:'PUT',body:{lines,operator_id:OPERATOR?.id}}),lines.length?`已儲存「${it.zh}」配方`:`已清除「${it.zh}」配方`,()=>loadInventory()));};
  };
  paint();
}

/* 異動紀錄：營業日區間，可單看一個品項，可下載 CSV */
async function loadInventoryMoves(){
  const host=document.getElementById('inv-body');if(!host)return;
  if(!INV.from){const t=MenuLib.businessDay();INV.to=t;INV.from=invAddDays(t,-6);}
  try{INV.moves=await api('/admin/inventory/moves?from='+INV.from+'&to='+INV.to+(INV.movesInv?'&inv_id='+encodeURIComponent(INV.movesInv):'')+(SCOPE?'&venue='+SCOPE:''));}catch(e){INV.moves={moves:[],csv:[],error:e.message};}
  if(TAB==='inventory')paintInventory();
}
function invMovesHtml(){
  const m=INV.moves;if(!m)return '<p class="hint">載入中…</p>';
  const t=x=>new Date(x).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const rows=(m.moves||[]).map(x=>{const iv=invById(x.inv_id);return `<tr><td>${esc(t(x.created_at))}</td><td class="ops-item"><b>${esc(iv?.name||x.inv_id)}</b></td><td><span class="pill ${x.type==='waste'?'pill-bad':x.type==='in'||x.type==='make'||x.type==='void_back'?'pill-ok':'pill-draft'}">${esc(INV_MOVE[x.type]||x.type)}</span></td><td class="num${x.delta<0?' inv-neg':''}">${x.delta>0?'+':''}${invQty(x.delta)}</td><td class="num">${x.qty_after==null?'':invQty(x.qty_after)} ${esc(iv?.unit||'')}</td><td>${esc([x.note,x.amount!=null?'NT$'+num(x.amount):''].filter(Boolean).join(' · '))}</td><td>${esc(x.operator_name||x.actor||'')}</td></tr>`;}).join('');
  return `<form class="a-toolbar inv-tools" id="inv-moves-form"><label>從 <input type="date" id="inv-from" value="${esc(INV.from)}"></label><label>到 <input type="date" id="inv-to" value="${esc(INV.to)}"></label><select id="inv-mi" aria-label="品項"><option value="">全部品項</option>${invItems().map(i=>`<option value="${esc(i.id)}"${i.id===INV.movesInv?' selected':''}>${esc(i.name)}</option>`).join('')}</select><button type="submit" class="btn btn--ghost">查詢</button><button type="button" class="btn btn--ghost" id="inv-csv"${rows?'':' disabled'}>下載 CSV</button></form>
    ${m.error?`<p class="a-empty">載入失敗：${esc(m.error)}</p>`:rows?`<div class="a-wrap2"><table class="a-tbl inv-moves"><thead><tr><th>時間</th><th>品項</th><th>操作</th><th class="num">變動</th><th class="num">結存</th><th>備註</th><th>經手人</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="a-empty">這段期間沒有異動。</p>'}`;
}
