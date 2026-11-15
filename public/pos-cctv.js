/* POS 監視器：只嵌入 Windows bridge 的 HTTPS 播放器；NVR 位址、RTSP 和帳密永不進 POS 或 Cloud Run。 */
const CCTV_KEY='tth_pos_cctv_bridge';
function cctvBridgeUrl(){
  let raw='';try{raw=localStorage.getItem(CCTV_KEY)||'';}catch(e){}
  try{const url=new URL(raw);if(url.protocol !== 'https:')return '';return url.href.replace(/\/$/,'');}catch(e){return '';}
}
function tabCctv(){return '<div class="a-sec" id="cctv-body"></div>';}
function paintCctv(){
  const host=document.getElementById('cctv-body');if(!host)return;
  const bridge=cctvBridgeUrl();
  if(!bridge){
    host.innerHTML=`<div class="ops-head"><h2>監視器</h2></div><p class="hint">先在店內 Windows 主機安裝 VIGI bridge，再貼上 bridge 的 HTTPS 播放網址。這個網址只儲存在目前這台 POS；NVR 位址與登入資料不會送到 POS 或雲端。</p><label class="cctv-field">Bridge HTTPS 播放網址<input id="cctv-url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://cctv.emoji.tw/channel-zero"></label><div class="cctv-actions"><button type="button" class="btn btn--solid" id="cctv-save">儲存並開啟</button><a class="btn btn--ghost" href="/downloads/EmojiPOSVigiBridgeSetup.ps1" download>下載 Windows bridge 安裝程式</a></div><p class="hint">bridge 要使用命名 Cloudflare Tunnel；不要把 NVR 的 192.168.x.x 或 RTSP 網址填在這裡。</p>`;
    host.querySelector('#cctv-save').onclick=()=>{const raw=host.querySelector('#cctv-url').value.trim();try{const url=new URL(raw);if(url.protocol !== 'https:')throw Error();localStorage.setItem(CCTV_KEY,url.href.replace(/\/$/,''));paintCctv();}catch(e){toast('請填入有效的 HTTPS bridge 網址');}};
    return;
  }
  host.innerHTML=`<div class="ops-head"><h2>監視器</h2><div class="cctv-actions"><button type="button" class="btn btn--ghost btn-sm" id="cctv-change">更換 bridge</button><a class="btn btn--ghost btn-sm" href="${esc(bridge)}" target="_blank" rel="noopener noreferrer">另開</a></div></div><p class="hint">VIGI Channel-Zero · 低延遲 HLS 影像。畫面逾時時，先確認店內 Windows bridge 與 Cloudflare Tunnel 正在執行。</p><iframe class="cctv-frame" title="店內監視器即時影像" src="${esc(bridge)}" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; fullscreen" referrerpolicy="no-referrer"></iframe>`;
  host.querySelector('#cctv-change').onclick=()=>{try{localStorage.removeItem(CCTV_KEY);}catch(e){}paintCctv();};
}
