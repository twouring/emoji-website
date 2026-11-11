/* POS「設定」分頁：不常用的功能（庫存、排班、紀錄）收進這裡；點歌已獨立成 ktv.emoji.tw（KK 11/6），這裡只留入口連結，頂欄只留每天要用的分頁；
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
  const escCfg=typeof escposBridgeConfig==='function'?escposBridgeConfig():null;
  // All user-derived values inside this fixed template are escaped; setup text and package URL are application constants.
  const escpos=`<div class="set-sec" aria-labelledby="set-escpos"><h3 id="set-escpos">列印站設定（USB ESC/POS）</h3><p class="hint">將 EPSON TM‑T70II 以 USB 接到這台 POS 電腦後，安裝列印站程式。POS 會透過本機服務直接出單；服務只在這台電腦的 <code>127.0.0.1</code> 運作，不會開放到網路。</p><h4>第一次安裝</h4><ol class="hint"><li>先安裝 Node.js 22 LTS 與 EPSON TM‑T70II USB 驅動，並用系統列印測試頁確認印表機正常。</li><li>下載並執行對應安裝程式：<a href="/downloads/EmojiPOSPrinterStationSetup.ps1" download>Windows 安裝程式</a>　<a href="/downloads/EmojiPOSPrinterStationInstaller.command" download>macOS 安裝程式</a>。</li><li>安裝程式會要求輸入系統印表機名稱、建立配對 token、啟動服務並設為登入後自動啟動。</li><li>安裝完成後，將畫面顯示的 token 填入下方，按「儲存並測試列印」。</li></ol><details class="hint"><summary>無法執行安裝程式？</summary><p>Windows：右鍵安裝檔，選「使用 PowerShell 執行」；若被封鎖，按「詳細資訊」後選「仍要執行」。macOS：右鍵安裝檔選「打開」，再於系統設定的「隱私權與安全性」允許。兩種安裝程式都會先檢查 Node.js 22 LTS；未安裝時會開啟下載頁。</p></details><details class="hint"><summary>怎麼找到印表機名稱？</summary><p>macOS 開 Terminal，輸入 <code>lpstat -p -d</code>；Windows 到「設定 → 藍牙與裝置 → 印表機與掃描器」查看名稱。安裝程式會要求填完整名稱。</p></details><h4>配對這台 POS 主機</h4><div class="a-form"><label>服務網址<input id="escpos-url" value="${esc(escCfg?.url||'http://127.0.0.1:17890')}" inputmode="url"></label><label>印表機 ID<input id="escpos-printer" value="${esc(escCfg?.printerId||'receipt-main')}" autocapitalize="off"></label><label>配對 token<input id="escpos-token" value="${esc(escCfg?.token||'')}" type="password" autocomplete="off"></label><button type="button" class="btn btn--ghost" id="escpos-check">測試連線</button><button type="button" class="btn btn--solid" id="escpos-save">儲存並測試列印</button></div><p class="hint" id="escpos-status">${escCfg?'已設定這台主機的 ESC/POS 列印服務':'尚未設定'}</p><p class="hint">印表機斷線、缺紙或卡紙仍須現場確認。</p></div>`;
  host.innerHTML=`<div class="ops-head"><h2>設定</h2></div>
    <div class="set-sec" aria-labelledby="set-more"><h3 id="set-more">更多功能</h3><div class="set-links">${links}</div></div>
    <div class="set-sec" aria-labelledby="set-ktv"><h3 id="set-ktv">KTV 點歌</h3><div class="set-links"><a class="set-link" href="https://ktv.emoji.tw/" target="_blank" rel="noopener">${POSIcon('music')}<span class="set-link-main"><b>開啟言文字 KTV</b><span>點歌已獨立成 ktv.emoji.tw：控台、電視畫面、遙控、歌單、統計</span></span><span class="set-chev" aria-hidden="true">›</span></a></div></div>
    ${escpos}
    <div class="set-sec" aria-labelledby="set-dev"><h3 id="set-dev">這台平板</h3>
      <div class="set-links">
        <button type="button" class="set-link" id="set-print-test">${POSIcon('printer')}<span class="set-link-main"><b>測試列印</b><span>${typeof escposReady==='function'&&escposReady()?'已設定 ESC/POS 主機列印，印一張測試單確認紙張與連線':typeof starReady==='function'&&starReady()?'已接 mPOP，印一張測試單確認紙張與連線':'需設定 ESC/POS 主機列印，或用 Star webPRNT Browser 接 mPOP'}</span></span><span class="set-chev" aria-hidden="true">›</span></button>
        <button type="button" class="set-link" id="set-edit-tables">${POSIcon('pencil')}<span class="set-link-main"><b>編輯桌位擺放</b><span>拖到跟現場一樣的位置，全店平板一起套用</span></span><span class="set-chev" aria-hidden="true">›</span></button>
      </div>
      ${ver&&!ver.includes('<')?`<p class="hint">POS 版本 v${esc(ver)}</p>`:''}
    </div>`;
  host.querySelectorAll('[data-set-tab]').forEach(b=>b.onclick=()=>go(b.dataset.setTab));
  const escInputs=()=>({url:host.querySelector('#escpos-url').value.trim().replace(/\/$/,''),printerId:host.querySelector('#escpos-printer').value.trim(),token:host.querySelector('#escpos-token').value.trim()});
  const escStatus=t=>{host.querySelector('#escpos-status').textContent=t;};
  host.querySelector('#escpos-check').onclick=async()=>{const c=escInputs();if(!c.url||!c.token||!c.printerId)return escStatus('請填完整服務網址、印表機 ID 與 token');try{const r=await fetch(c.url+'/health',{mode:'cors',credentials:'omit',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error(String(r.status));escStatus('本機列印服務已連線');}catch(e){escStatus('無法連到本機列印服務');}};
  host.querySelector('#escpos-save').onclick=async()=>{const c=escInputs();if(!c.url||!c.token||!c.printerId)return escStatus('請填完整服務網址、印表機 ID 與 token');try{localStorage.setItem('tth_escpos_bridge',JSON.stringify(c));escStatus('已儲存；正在送出測試單…');const ok=await printTestTicket();escStatus(ok?'測試單已傳送至 TM‑T70II':'設定已儲存，但測試列印失敗');}catch(e){escStatus('無法儲存這台主機設定');}};
  host.querySelector('#set-print-test').onclick=async e=>{const b=e.currentTarget;if(b.disabled)return;b.disabled=true;try{await printTestTicket();}finally{b.disabled=false;}};
  host.querySelector('#set-edit-tables').onclick=()=>{POS_EDIT=true;POS_EDIT_POS=null;const h=document.getElementById('pos-body');if(h)delete h.dataset.sig;go('pos');};
}
