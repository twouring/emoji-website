/* POS「菜單內容」分頁（KK 11/15）：內容管理員（職稱含「內容管理員」或「店長」）在平板上改自己品牌的菜單品項與照片。
   資料：GET /api/admin/menu/items；存檔 POST /api/admin/menu/items、PATCH /api/admin/menu/items/:id；照片 POST /api/admin/menu/items/:id/photo（前端先縮到 1600px JPEG）。
   估清、剩餘份數不在這裡（估清分頁）；書籍在約書旅書冊後台。
   畫面字串裡的使用者／資料值一律經 esc()（itemThumb 內部也 esc），innerHTML 只組固定模板。
   宿主頁（pos.html）須先定義：esc、api、toast、num、SCOPE、BRAND_LABEL、MenuLib、MENU_DOC；pos-ops.js 的 posConfirm、itemThumb。 */
let MC_DATA=null,MC_Q='',MC_CAT='',MC_BUSY=false;
function tabContent(){ return '<div class="a-sec" id="content-body"></div>'; }
const mcCatLabel=c=>(MenuLib.CAT_LABEL[c]&&MenuLib.CAT_LABEL[c].zh)||c;
async function loadContent(){
  const host=document.getElementById('content-body');if(!host)return;
  if(!MC_DATA)host.innerHTML='<div class="ops-head"><h2>菜單內容</h2></div><p class="hint">載入中…</p>';
  try{MC_DATA=await api('/admin/menu/items');}catch(e){host.innerHTML=`<div class="ops-head"><h2>菜單內容</h2></div><p class="a-empty">載入失敗：${esc(e.message)}</p>`;return;}
  paintContent(host);
}
function mcFilter(host){
  const q=MC_Q.trim().toLowerCase();let n=0;
  host.querySelectorAll('[data-mc-item]').forEach(b=>{const hit=(!MC_CAT||b.dataset.cat===MC_CAT)&&(!q||b.dataset.text.includes(q));b.hidden=!hit;if(hit)n++;});
  const none=host.querySelector('#mc-none');if(none)none.hidden=n>0;
}
function paintContent(host){
  host=host||document.getElementById('content-body');if(!host||!MC_DATA)return;
  const items=MC_DATA.items||[],can=MC_DATA.can_edit===true;
  const cats=[...new Set(items.map(it=>it.cat))];
  const tabs=[['','全部']].concat(cats.map(c=>[c,mcCatLabel(c)])).map(([k,v])=>`<button type="button" data-mc-cat="${esc(k)}" class="${MC_CAT===k?'on':''}">${esc(v)}</button>`).join('');
  const cards=items.map(it=>`<button type="button" class="mc-card${it.published?'':' is-off'}" data-mc-item="${esc(it.id)}" data-cat="${esc(it.cat)}" data-text="${esc([it.zh,it.en,it.ja].join(' ').toLowerCase())}">${itemThumb(it,'mc-card__img')}<span class="mc-card-main"><b>${esc(it.zh)}</b><span>${esc(mcCatLabel(it.cat))}・NT$${num(it.price)}${SCOPE?'':'・'+esc(BRAND_LABEL[it.venue]||it.venue)}</span><span class="mc-pills">${it.published?'<span class="pill pill-ok">上架中</span>':'<span class="pill pill-draft">未上架</span>'}${it.image?'':'<span class="pill pill-wait">缺照片</span>'}${it.shared?'<span class="pill pill-draft">共用</span>':''}</span></span></button>`).join('');
  host.innerHTML=`<div class="ops-head"><h2>菜單內容</h2>${can?'<button type="button" class="btn btn--solid" id="mc-new">新增品項</button>':''}</div>
    <p class="hint">${can?'點品項修改品名、價格、說明、照片與上架狀態；存檔後官網、桌邊點餐與 POS 立即更新。估清請到「估清」分頁。':'目前登入的員工沒有內容權限，只能檢視。需要修改請管理員把職稱設為「內容管理員」或「店長」。'}</p>
    <div class="mc-tools"><input type="search" id="mc-q" placeholder="搜尋品名" value="${esc(MC_Q)}" aria-label="搜尋品名" maxlength="40" autocomplete="off"></div>
    <div class="inv-views mc-cats">${tabs}</div>
    <div class="mc-grid">${cards}</div><p class="a-empty" id="mc-none" hidden>沒有符合的品項</p>`;
  host.querySelector('#mc-q').oninput=e=>{MC_Q=e.target.value;mcFilter(host);};
  host.querySelectorAll('[data-mc-cat]').forEach(b=>b.onclick=()=>{MC_CAT=b.dataset.mcCat;host.querySelectorAll('[data-mc-cat]').forEach(x=>x.classList.toggle('on',x===b));mcFilter(host);});
  host.querySelectorAll('[data-mc-item]').forEach(b=>b.onclick=()=>{const it=items.find(x=>x.id===b.dataset.mcItem);if(it)mcEdit(it,host);});
  const nb=host.querySelector('#mc-new');if(nb)nb.onclick=()=>mcEdit(null,host);
  mcFilter(host);
}
/* 照片縮圖：長邊 1600px、JPEG 0.85（平板拍的原圖常 >5MB） */
function mcShrink(file){
  return new Promise((resolve,reject)=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{const s=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',0.85));};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('讀不到這張照片'));};
    img.src=url;
  });
}
function mcSyncMenu(item){
  if(!MENU_DOC||!item)return;
  const i=MENU_DOC.items.findIndex(x=>x.id===item.id),cur=i>=0?MENU_DOC.items[i]:{};
  const next={...cur,...item,sold_out:cur.sold_out||'',stock_day:cur.stock_day||'',stock_left:cur.stock_left??null,combo:item.combo_text!=null?MenuLib.comboFromText(item.combo_text):cur.combo};
  if(i>=0)MENU_DOC.items[i]=next;else MENU_DOC.items.push(next);
}
function mcEdit(it,host){
  const can=MC_DATA?.can_edit===true,cats=MC_DATA?.cats||[];
  const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
  const close=()=>{if(ov.parentNode)ov.parentNode.removeChild(ov);};
  const v=it||{zh:'',en:'',ja:'',ko:'',cat:MC_CAT||'COFFEE',price:'',emo:0,points:0,note:'',note_en:'',note_ja:'',published:false,sort:'',available_from:'',available_to:'',pos_only:false,combo_text:'',image:''};
  const venueSel=!it&&!SCOPE?`<label>品牌<select id="mc-venue">${(MC_DATA?.venues||[]).filter(x=>MenuLib.ITEM_VENUES.includes(x)).map(x=>`<option value="${esc(x)}">${esc(BRAND_LABEL[x]||x)}</option>`).join('')}</select></label>`:'';
  const dis=can?'':' disabled';
  ov.innerHTML=`<div class="op-card mc-edit" role="dialog" aria-label="${esc(it?'修改 '+it.zh:'新增品項')}">
    <h2>${esc(it?it.zh:'新增品項')}</h2>
    <div class="mc-photo">${it?itemThumb(it,'mc-photo__img'):'<span class="mc-photo__img mc-photo__img--ph" aria-hidden="true">＋</span>'}
      <div>${it&&can?`<label class="btn btn--ghost mc-photo-btn">${it.image?'更換照片':'上傳照片'}<input type="file" id="mc-file" accept="image/jpeg,image/png,image/webp" hidden></label><p class="hint hint--tight">JPEG／PNG／WebP，會自動縮小</p>`:it?'':'<p class="hint hint--tight">先存檔，再上傳照片</p>'}</div></div>
    <form class="a-form mc-form" id="mc-form">
      ${venueSel}
      <label class="mc-wide">中文品名<input id="mc-zh" maxlength="80" required value="${esc(v.zh)}" autocomplete="off"${dis}></label>
      <label>分類<select id="mc-cat"${dis}>${cats.map(c=>`<option value="${esc(c)}" ${c===v.cat?'selected':''}>${esc(mcCatLabel(c))}</option>`).join('')}</select></label>
      <label>售價<input id="mc-price" type="number" inputmode="numeric" min="0" max="100000" value="${esc(v.price)}" required${dis}></label>
      <label>會員價<input id="mc-emo" type="number" inputmode="numeric" min="0" max="100000" value="${esc(v.emo||'')}" placeholder="空白＝九折"${dis}></label>
      <label>兌換點數<input id="mc-points" type="number" inputmode="numeric" min="0" max="100000" value="${esc(v.points||'')}" placeholder="0＝不開放"${dis}></label>
      <label>排序<input id="mc-sort" type="number" inputmode="numeric" min="0" max="100000" value="${esc(v.sort)}"${dis}></label>
      <label class="mc-wide">英文品名<input id="mc-en" maxlength="80" value="${esc(v.en)}" autocomplete="off"${dis}></label>
      <label class="mc-wide">日文品名<input id="mc-ja" maxlength="80" value="${esc(v.ja)}" autocomplete="off"${dis}></label>
      <label class="mc-full">中文說明<textarea id="mc-note" maxlength="600" rows="2"${dis}>${esc(v.note)}</textarea></label>
      <label class="mc-full">英文說明<textarea id="mc-note-en" maxlength="600" rows="2"${dis}>${esc(v.note_en)}</textarea></label>
      <label class="mc-full">日文說明<textarea id="mc-note-ja" maxlength="600" rows="2"${dis}>${esc(v.note_ja)}</textarea></label>
      <label>供應起日<input id="mc-from" type="date" value="${esc(v.available_from)}"${dis}></label>
      <label>供應迄日<input id="mc-to" type="date" value="${esc(v.available_to)}"${dis}></label>
      <label class="mc-full" id="mc-combo-wrap"${v.cat==='COMBO'?'':' hidden'}>套餐內容（每行一欄：主餐：原味貝果、鮪魚貝果+30）<textarea id="mc-combo" maxlength="2000" rows="3"${dis}>${esc(v.combo_text)}</textarea></label>
      <label class="mc-chk"><input type="checkbox" id="mc-pub" ${v.published?'checked':''}${dis}> 上架（官網、桌邊點餐看得到）</label>
      <label class="mc-chk"><input type="checkbox" id="mc-posonly" ${v.pos_only?'checked':''}${dis}> 只在 POS 顯示</label>
    </form>
    <div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>${can?'取消':'關閉'}</button>${can?'<button type="button" class="btn btn--solid" data-save>存檔</button>':''}</div></div>`;
  ov.querySelector('[data-cancel]').onclick=close;
  const catEl=ov.querySelector('#mc-cat');catEl.onchange=()=>{ov.querySelector('#mc-combo-wrap').hidden=catEl.value!=='COMBO';};
  const after=async d=>{mcSyncMenu(d.item);await loadContent();};
  const file=ov.querySelector('#mc-file');
  if(file)file.onchange=async()=>{
    const f=file.files&&file.files[0];if(!f||MC_BUSY)return;MC_BUSY=true;toast('照片上傳中…');
    try{const data=await mcShrink(f);const d=await api('/admin/menu/items/'+encodeURIComponent(it.id)+'/photo',{method:'POST',body:{image_base64:data}});toast('已更新照片');close();await after(d);}
    catch(e){toast(e.message);}finally{MC_BUSY=false;}
  };
  const save=ov.querySelector('[data-save]');
  if(save)save.onclick=async()=>{
    if(MC_BUSY)return;
    const g=id=>ov.querySelector(id),val=id=>g(id).value.trim();
    if(!val('#mc-zh')){toast('請填中文品名');g('#mc-zh').focus();return;}
    if(val('#mc-price')===''){toast('請填售價');g('#mc-price').focus();return;}
    const body={zh:val('#mc-zh'),cat:catEl.value,price:Number(val('#mc-price')),emo:Number(val('#mc-emo')||0),points:Number(val('#mc-points')||0),en:val('#mc-en'),ja:val('#mc-ja'),note:val('#mc-note'),note_en:val('#mc-note-en'),note_ja:val('#mc-note-ja'),available_from:val('#mc-from'),available_to:val('#mc-to'),published:g('#mc-pub').checked,pos_only:g('#mc-posonly').checked};
    if(val('#mc-sort')!=='')body.sort=Number(val('#mc-sort'));
    if(catEl.value==='COMBO')body.combo_text=g('#mc-combo').value;
    if(it&&it.published&&!body.published&&!await posConfirm(`把「${it.zh}」下架？下架後客人在官網與桌邊點餐看不到。`,{ok:'下架',danger:true}))return;
    const vs=g('#mc-venue');if(vs)body.venue=vs.value;
    MC_BUSY=true;
    try{const d=it?await api('/admin/menu/items/'+encodeURIComponent(it.id),{method:'PATCH',body}):await api('/admin/menu/items',{method:'POST',body});toast(it?'已存檔':'已新增，可以上傳照片了');close();await after(d);if(!it&&d.item){const n=(MC_DATA?.items||[]).find(x=>x.id===d.item.id);if(n)mcEdit(n,host);}}
    catch(e){toast(e.message);}finally{MC_BUSY=false;}
  };
}
