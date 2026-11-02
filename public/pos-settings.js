/* POS「設定」分頁：不常用的功能（庫存、排班、紀錄）收進這裡；點歌開關／價格／常態歌單／YouTube 帳號也在這裡（pos-songs.js 提供區塊），頂欄只留每天要用的分頁；
   另外是這台平板的列印、桌位設定。只有管理員能用的功能（收款帳戶管理）放在 admin「系統設定」，不放 POS（KK 11/2）。
   askManagerPin 給打賞支付（pos-tips.js）用；識別碼只留在記憶體，離開設定頁即清空。
   宿主頁（pos.html）須先定義：esc、api、toast、go、TABS、DATA、tabUrl、POSIcon；本檔用到 pos-ops.js 的 printTestTicket、starReady、POS_EDIT。 */
let SET_PIN='';
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
      ov.innerHTML=`<div class="op-card" role="dialog" aria-label="店長識別碼"><h2>店長識別碼</h2><p class="hint">這個操作需要店長確認，會記在紀錄裡。</p>
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
async function loadSettings(){
  const host=document.getElementById('settings-body');if(!host)return;
  paintSettings(host);
}
function paintSettings(host){
  host=host||document.getElementById('settings-body');if(!host)return;
  const links=TABS.filter(t=>t.group==='settings').map(t=>`<button type="button" class="set-link" data-set-tab="${esc(t.id)}">${POSIcon(t.icon)}<span class="set-link-main"><b>${esc(t.label)}</b><span>${esc(t.desc||'')}</span></span><span class="set-chev" aria-hidden="true">›</span></button>`).join('');
  const ver=(document.querySelector('.p-ver')?.getAttribute('title')||'').replace(/^v/,'');
  host.innerHTML=`<div class="ops-head"><h2>設定</h2></div>
    <div class="set-sec" aria-labelledby="set-more"><h3 id="set-more">更多功能</h3><div class="set-links">${links}</div></div>
    ${typeof songSettingsSection==='function'?songSettingsSection():''}
    <div class="set-sec" aria-labelledby="set-dev"><h3 id="set-dev">這台平板</h3>
      <div class="set-links">
        <button type="button" class="set-link" id="set-print-test">${POSIcon('printer')}<span class="set-link-main"><b>測試列印</b><span>${typeof starReady==='function'&&starReady()?'已接 mPOP，印一張測試單確認紙張與連線':'需用 Star webPRNT Browser 開 POS 並接上 mPOP'}</span></span><span class="set-chev" aria-hidden="true">›</span></button>
        <button type="button" class="set-link" id="set-edit-tables">${POSIcon('pencil')}<span class="set-link-main"><b>編輯桌位擺放</b><span>拖到跟現場一樣的位置，全店平板一起套用</span></span><span class="set-chev" aria-hidden="true">›</span></button>
      </div>
      ${ver&&!ver.includes('<')?`<p class="hint">POS 版本 v${esc(ver)}</p>`:''}
    </div>`;
  host.querySelectorAll('[data-set-tab]').forEach(b=>b.onclick=()=>go(b.dataset.setTab));
  if(typeof bindSongSettings==='function')bindSongSettings();   // 點歌設定（pos-songs.js）
  host.querySelector('#set-print-test').onclick=async e=>{const b=e.currentTarget;if(b.disabled)return;b.disabled=true;try{await printTestTicket();}finally{b.disabled=false;}};
  host.querySelector('#set-edit-tables').onclick=()=>{POS_EDIT=true;POS_EDIT_POS=null;const h=document.getElementById('pos-body');if(h)delete h.dataset.sig;go('pos');};
}
