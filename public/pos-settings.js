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
  // 版面（KK 11/12）：狀態徽章置頂；已配對時安裝步驟收起；三步驟卡片＋下載按鈕；token 單獨一欄、網址與印表機 ID 收進進階。
  const dl=POSIcon('download');
  const steps=`<ol class="esc-steps">
      <li class="esc-step"><span class="esc-no" aria-hidden="true">1</span><div><b class="esc-step-t">接好印表機</b><p>EPSON TM‑T70II 用 USB 接到這台電腦，安裝 EPSON 驅動與 <a href="https://nodejs.org/" target="_blank" rel="noopener">Node.js&nbsp;22&nbsp;LTS</a>，再用系統「列印測試頁」確認能出紙。</p></div></li>
      <li class="esc-step"><span class="esc-no" aria-hidden="true">2</span><div><b class="esc-step-t">下載並執行列印站程式</b>
        <div class="esc-dl"><a class="btn btn--ghost" href="/downloads/EmojiPOSPrinterStationSetup.ps1" download>${dl}Windows 安裝程式</a><a class="btn btn--ghost" href="/downloads/EmojiPOSPrinterStationInstaller.zip" download>${dl}macOS 安裝程式（ZIP）</a></div>
        <p>Windows：右鍵選「使用 PowerShell 執行」。macOS：連按兩下 ZIP 解壓，再連按兩下裡面的安裝程式。程式會要你輸入印表機名稱，完成後畫面會顯示<b>配對 token</b>，並設為開機自動啟動。</p>
        <details class="esc-help"><summary>安裝遇到問題</summary><ul><li><b>Windows 被封鎖：</b>按「詳細資訊」→「仍要執行」。</li><li><b>macOS 無法打開：</b>右鍵安裝程式選「打開」，或到「系統設定 → 隱私權與安全性」按「強制打開」。</li><li><b>印表機名稱：</b>macOS 開「終端機」輸入 <code>lpstat -p</code>；Windows 到「設定 → 藍牙與裝置 → 印表機與掃描器」。</li></ul></details></div></li>
      <li class="esc-step"><span class="esc-no" aria-hidden="true">3</span><div><b class="esc-step-t">配對這台 POS 主機</b><p>把安裝程式顯示的 token 貼到下方，按「儲存並測試列印」，會印一張測試單。</p></div></li>
    </ol>`;
  const escpos=`<div class="set-sec esc-card" aria-labelledby="set-escpos">
    <div class="esc-head"><h3 id="set-escpos">列印站設定（USB ESC/POS）</h3><span class="pill ${escCfg?'pill-ok':'pill-draft'}" id="escpos-pill">${escCfg?'已配對':'尚未配對'}</span></div>
    <p class="esc-lede">讓這台電腦直接用 USB 印出餐單、收據並開錢櫃。列印服務只在本機 <code>127.0.0.1</code> 運作，不對外開放。</p>
    ${escCfg?`<details class="esc-reinstall"><summary>安裝步驟（換電腦或重新安裝時用）</summary>${steps}</details>`:steps}
    <div class="esc-pair" role="group" aria-label="配對這台 POS 主機">
      <label class="esc-field">配對 token<input id="escpos-token" value="${esc(escCfg?.token||'')}" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上安裝程式顯示的 token"></label>
      <details class="esc-adv"><summary>進階設定</summary><div class="esc-adv-grid"><label class="esc-field">服務網址<input id="escpos-url" value="${esc(escCfg?.url||'http://127.0.0.1:17890')}" inputmode="url" autocapitalize="off" spellcheck="false"></label><label class="esc-field">印表機 ID<input id="escpos-printer" value="${esc(escCfg?.printerId||'receipt-main')}" autocapitalize="off" spellcheck="false"></label></div><p class="esc-note">沒改過安裝程式設定就不用動。</p></details>
      <div class="esc-acts"><button type="button" class="btn btn--solid" id="escpos-save">${POSIcon('printer')}儲存並測試列印</button><button type="button" class="btn btn--ghost" id="escpos-check">只測連線</button>${escCfg?'<button type="button" class="btn btn--ghost esc-unpair" id="escpos-unpair">解除配對</button>':''}</div>
      <p class="esc-status" id="escpos-status" role="status" aria-live="polite" data-tone="${escCfg?'ok':''}">${escCfg?'這台主機已配對，出單會直接送到 USB 印表機。':'尚未配對：完成上面三步後，貼上 token 即可。'}</p>
    </div>
    <p class="esc-note">送出成功代表印表機已收到資料；斷線、缺紙或卡紙仍要現場確認。</p>
  </div>`;
  host.innerHTML=`<div class="ops-head"><h2>設定</h2></div>
    <div class="set-sec" aria-labelledby="set-more"><h3 id="set-more">更多功能</h3><div class="set-links">${links}</div></div>
    <div class="set-sec" aria-labelledby="set-ktv"><h3 id="set-ktv">KTV 點歌</h3><div class="set-links"><a class="set-link" href="https://ktv.emoji.tw/" target="_blank" rel="noopener">${POSIcon('music')}<span class="set-link-main"><b>開啟言文字 KTV</b><span>點歌已獨立成 ktv.emoji.tw：控台、電視畫面、遙控、歌單、統計</span></span><span class="set-chev" aria-hidden="true">›</span></a></div></div>
    ${escpos}
    <div class="set-sec" aria-labelledby="set-dev"><h3 id="set-dev">這台平板</h3>
      <div class="set-links">
        <button type="button" class="set-link" id="set-print-test">${POSIcon('printer')}<span class="set-link-main"><b>測試列印</b><span>${typeof escposReady==='function'&&escposReady()?'已設定 ESC/POS 主機列印，印一張測試單確認紙張與連線':typeof starReady==='function'&&starReady()?'已接 mPOP，印一張測試單確認紙張與連線':'需設定 ESC/POS 主機列印，或用 Star webPRNT Browser 接 mPOP'}</span></span><span class="set-chev" aria-hidden="true">›</span></button>
        <button type="button" class="set-link" id="set-edit-tables">${POSIcon('pencil')}<span class="set-link-main"><b>編輯桌位擺放</b><span>拖到跟現場一樣的位置，全店平板一起套用</span></span><span class="set-chev" aria-hidden="true">›</span></button>
        <a class="set-link" id="set-nvr" href="https://192.168.50.2/" target="_blank" rel="noopener noreferrer">${POSIcon('camera')}<span class="set-link-main"><b>監視器</b><span>在新分頁開啟 VIGI 即時影像；登入資料只留在這台 POS 主機</span></span><span class="set-chev" aria-hidden="true">›</span></a>
      </div>
      ${ver&&!ver.includes('<')?`<p class="hint">POS 版本 v${esc(ver)}</p>`:''}
    </div>`;
  host.querySelectorAll('[data-set-tab]').forEach(b=>b.onclick=()=>go(b.dataset.setTab));
  const escInputs=()=>({url:host.querySelector('#escpos-url').value.trim().replace(/\/$/,''),printerId:host.querySelector('#escpos-printer').value.trim(),token:host.querySelector('#escpos-token').value.trim()});
  // tone：''＝一般、busy、ok、bad；用 data-tone 換色，文字一律 textContent（不進 innerHTML）
  const escStatus=(t,tone='')=>{const s=host.querySelector('#escpos-status');s.textContent=t;s.dataset.tone=tone;};
  const escNeed=c=>{if(!c.token){escStatus('請先貼上配對 token','bad');host.querySelector('#escpos-token').focus();return false;}if(!c.url||!c.printerId){escStatus('進階設定的服務網址與印表機 ID 不能空白','bad');host.querySelector('.esc-adv').open=true;return false;}return true;};
  const escBusy=async(btn,fn)=>{if(btn.disabled)return;const all=[...host.querySelectorAll('.esc-acts .btn')];all.forEach(b=>b.disabled=true);try{await fn();}finally{all.forEach(b=>b.disabled=false);}};
  host.querySelector('#escpos-check').onclick=e=>escBusy(e.currentTarget,async()=>{const c=escInputs();if(!escNeed(c))return;escStatus('連線中…','busy');const out=await escposCheck(c);escStatus(out.ok?'連線正常：'+(out.printer.name||out.printer.id)+'（尚未儲存）':'連不上列印服務：'+out.error,out.ok?'ok':'bad');});
  host.querySelector('#escpos-save').onclick=e=>escBusy(e.currentTarget,async()=>{const c=escInputs();if(!escNeed(c))return;escStatus('連線中…','busy');const check=await escposCheck(c);if(!check.ok)return escStatus('未儲存，連不上列印服務：'+check.error,'bad');try{localStorage.setItem('tth_escpos_bridge',JSON.stringify(c));}catch(err){return escStatus('無法儲存這台主機設定','bad');}const pill=host.querySelector('#escpos-pill');pill.textContent='已配對';pill.className='pill pill-ok';escStatus('已儲存，正在送出測試單…','busy');const ok=await printTestTicket();escStatus(ok?'完成：測試單已送到 '+(check.printer.name||'TM‑T70II')+'，請確認有出紙。':'已儲存，但測試列印失敗：'+escposLastError(),ok?'ok':'bad');});
  const unpair=host.querySelector('#escpos-unpair');if(unpair)unpair.onclick=async()=>{if(!await posConfirm('解除後這台電腦不會再用 USB 出單，要重新貼 token 才能恢復。',{title:'解除列印站配對',ok:'解除配對',danger:true}))return;try{localStorage.removeItem('tth_escpos_bridge');}catch(err){}paintSettings(host);};
  host.querySelector('#set-print-test').onclick=async e=>{const b=e.currentTarget;if(b.disabled)return;b.disabled=true;try{await printTestTicket();}finally{b.disabled=false;}};
  host.querySelector('#set-edit-tables').onclick=()=>{POS_EDIT=true;POS_EDIT_POS=null;const h=document.getElementById('pos-body');if(h)delete h.dataset.sig;go('pos');};
}
