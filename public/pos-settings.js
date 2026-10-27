/* POS「設定」分頁：不常用的功能（庫存、排班、銷量、客群、紀錄）收進這裡，頂欄只留每天要用的分頁；
   另外管理收款帳戶（新增／改名／停用自訂收款帳戶）與這台平板的列印、桌位設定。
   收款帳戶寫入：超級管理員直接過；其他帳號要店長 4 位數識別碼（X-Manager-Pin header），識別碼只留在記憶體（SET_PIN），離開設定頁即清空。
   宿主頁（pos.html）須先定義：esc、api、toast、go、TABS、DATA、tabUrl、POSIcon；本檔用到 pos-ops.js 的 posConfirm、printTestTicket、starReady、POS_EDIT。 */
let SET_PIN='',SET_PM=null,SET_PM_ERR='',SET_BUSY=false;
function tabSettings(){ return '<div class="a-sec" id="settings-body"></div>'; }
function resetSettings(){ SET_PIN=''; }

// 店長識別碼鍵盤（沿用 .op-overlay／.clock-pad）：回傳 Promise<pin|null>
function askManagerPin(msg){
  return new Promise(resolve=>{
    let pin='';const ov=document.createElement('div');ov.className='op-overlay';document.body.appendChild(ov);
    const done=v=>{if(ov.parentNode)ov.parentNode.removeChild(ov);resolve(v);};
    const paint=()=>{
      const dots=[0,1,2,3].map(i=>`<i class="${i<pin.length?'on':''}"></i>`).join('');
      const keys=['1','2','3','4','5','6','7','8','9','⌫','0','清除'].map(k=>`<button type="button" class="clock-key" data-key="${esc(k)}">${esc(k)}</button>`).join('');
      ov.innerHTML=`<div class="op-card" role="dialog" aria-label="店長識別碼"><h2>店長識別碼</h2><p class="hint">修改收款帳戶需要店長確認，操作會記在紀錄裡。</p>
        <div class="clock-pad"><div class="clock-pin" aria-label="店長識別碼">${dots}</div><div class="clock-keys">${keys}</div></div>
        ${msg?`<div class="clock-msg bad" role="status">${esc(msg)}</div>`:''}
        <div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>取消</button></div></div>`;
      ov.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;msg='';
        if(k==='⌫')pin=pin.slice(0,-1);else if(k==='清除')pin='';else if(pin.length<4)pin+=k;
        if(pin.length===4)return done(pin);paint();});
      ov.querySelector('[data-cancel]').onclick=()=>done(null);
    };
    paint();
  });
}
// 收款帳戶寫入：非超管先要店長識別碼；識別碼錯（403 need_manager_pin）就清掉重問，最多 3 次
async function pmWrite(path,method,body){
  const isSuper=DATA?.super===true;
  for(let i=0,msg='';i<3;i++){
    if(!isSuper&&!SET_PIN){const p=await askManagerPin(msg);if(!p)return null;SET_PIN=p;}
    try{return await api(path,{method,body,headers:isSuper?{}:{'X-Manager-Pin':SET_PIN}});}
    catch(e){if(e.status===403&&!isSuper){SET_PIN='';msg=e.message;continue;}throw e;}
  }
  return null;
}
async function refreshPaymentMethods(){
  try{const d=await api('/admin/payment-methods');SET_PM=d.payment_methods||[];SET_PM_ERR='';if(DATA)DATA.payment_methods=SET_PM;}
  catch(e){SET_PM_ERR=e.message;}
}
async function loadSettings(){
  const host=document.getElementById('settings-body');if(!host)return;
  if(!SET_PM)host.innerHTML='<div class="ops-head"><h2>設定</h2></div><p class="hint">載入中…</p>';
  await refreshPaymentMethods();
  paintSettings(host);
}
function paintSettings(host){
  host=host||document.getElementById('settings-body');if(!host)return;
  const links=TABS.filter(t=>t.group==='settings').map(t=>`<button type="button" class="set-link" data-set-tab="${esc(t.id)}">${POSIcon(t.icon)}<span class="set-link-main"><b>${esc(t.label)}</b><span>${esc(t.desc||'')}</span></span><span class="set-chev" aria-hidden="true">›</span></button>`).join('');
  const list=SET_PM||[];
  const rows=list.map(m=>`<li class="set-pm${m.active?'':' is-off'}"><span class="set-pm-name">${esc(m.label)}</span>${m.builtin?'<span class="pill pill-draft">內建</span>':m.active?'<span class="pill pill-ok">啟用中</span>':'<span class="pill pill-bad">已停用</span>'}${m.builtin?'':`<span class="set-pm-acts"><button type="button" class="btn btn--ghost btn-sm" data-pm-rename="${esc(m.code)}">改名</button><button type="button" class="btn btn--ghost btn-sm" data-pm-toggle="${esc(m.code)}" data-on="${m.active?'0':'1'}">${m.active?'停用':'恢復'}</button></span>`}</li>`).join('');
  const ver=(document.querySelector('.p-ver')?.getAttribute('title')||'').replace(/^v/,'');
  host.innerHTML=`<div class="ops-head"><h2>設定</h2></div>
    <div class="set-sec" aria-labelledby="set-more"><h3 id="set-more">更多功能</h3><div class="set-links">${links}</div></div>
    <div class="set-sec" aria-labelledby="set-pm-h"><h3 id="set-pm-h">收款帳戶</h3>
      <p class="hint">現金、信用卡、LINE Pay、轉帳是內建付款方式。新增的收款帳戶（例如街口支付、另一組轉帳帳號）會出現在結帳的付款方式；停用後舊單據照常顯示，只是結帳不能再選。${DATA?.super?'':'新增、改名、停用需要店長識別碼。'}</p>
      ${SET_PM_ERR?`<p class="a-empty">收款帳戶載入失敗：${esc(SET_PM_ERR)}</p>`:`<ul class="set-pm-list">${rows}</ul>`}
      <form class="set-pm-add" id="pm-form"><label>新增收款帳戶<input id="pm-label" maxlength="20" autocomplete="off" placeholder="例：街口支付" required></label><button type="submit" class="btn btn--solid" id="pm-add">新增</button></form>
    </div>
    <div class="set-sec" aria-labelledby="set-dev"><h3 id="set-dev">這台平板</h3>
      <div class="set-links">
        <button type="button" class="set-link" id="set-print-test">${POSIcon('printer')}<span class="set-link-main"><b>測試列印</b><span>${typeof starReady==='function'&&starReady()?'已接 mPOP，印一張測試單確認紙張與連線':'需用 Star webPRNT Browser 開 POS 並接上 mPOP'}</span></span><span class="set-chev" aria-hidden="true">›</span></button>
        <button type="button" class="set-link" id="set-edit-tables">${POSIcon('pencil')}<span class="set-link-main"><b>編輯桌位擺放</b><span>拖到跟現場一樣的位置，全店平板一起套用</span></span><span class="set-chev" aria-hidden="true">›</span></button>
      </div>
      ${ver&&!ver.includes('<')?`<p class="hint">POS 版本 v${esc(ver)}</p>`:''}
    </div>`;
  host.querySelectorAll('[data-set-tab]').forEach(b=>b.onclick=()=>go(b.dataset.setTab));
  host.querySelector('#set-print-test').onclick=async e=>{const b=e.currentTarget;if(b.disabled)return;b.disabled=true;try{await printTestTicket();}finally{b.disabled=false;}};
  host.querySelector('#set-edit-tables').onclick=()=>{POS_EDIT=true;POS_EDIT_POS=null;const h=document.getElementById('pos-body');if(h)delete h.dataset.sig;go('pos');};
  host.querySelector('#pm-form').onsubmit=async e=>{
    e.preventDefault();if(SET_BUSY)return;
    const el=host.querySelector('#pm-label'),label=el.value.trim();if(!label){toast('請填寫收款帳戶名稱');el.focus();return;}
    if((SET_PM||[]).some(m=>m.label===label)){toast('已經有同名的收款帳戶');return;}
    SET_BUSY=true;
    try{const out=await pmWrite('/admin/payment-methods','POST',{label});if(out){toast(`已新增收款帳戶「${out.label}」`);await refreshPaymentMethods();paintSettings(host);}}
    catch(err){toast(err.message);}finally{SET_BUSY=false;}
  };
  host.querySelectorAll('[data-pm-toggle]').forEach(b=>b.onclick=async()=>{
    if(SET_BUSY)return;const m=(SET_PM||[]).find(x=>x.code===b.dataset.pmToggle);if(!m)return;const on=b.dataset.on==='1';
    if(!await posConfirm(`${on?'恢復':'停用'}收款帳戶「${m.label}」？${on?'':'停用後結帳不能再選，舊單據不受影響。'}`,{ok:on?'恢復':'停用',danger:!on}))return;
    SET_BUSY=true;
    try{const out=await pmWrite('/admin/payment-methods/'+encodeURIComponent(m.code),'PATCH',{active:on});if(out){toast(on?'已恢復':'已停用');await refreshPaymentMethods();paintSettings(host);}}
    catch(err){toast(err.message);}finally{SET_BUSY=false;}
  });
  host.querySelectorAll('[data-pm-rename]').forEach(b=>b.onclick=async()=>{
    if(SET_BUSY)return;const m=(SET_PM||[]).find(x=>x.code===b.dataset.pmRename);if(!m)return;
    const label=await pickReason({title:`收款帳戶改名：${m.label}`,presets:[],placeholder:'新名稱',maxlength:20,initial:m.label});
    if(label==null||label===m.label)return;
    SET_BUSY=true;
    try{const out=await pmWrite('/admin/payment-methods/'+encodeURIComponent(m.code),'PATCH',{label});if(out){toast('已更新名稱');await refreshPaymentMethods();paintSettings(host);}}
    catch(err){toast(err.message);}finally{SET_BUSY=false;}
  });
}
