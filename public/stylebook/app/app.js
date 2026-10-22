/* 會員 App Stylebook（/stylebook/app/）
   樣式不複製：執行時從 /m.html 的 <style> 與 /m-event.js 的 CSS 常數直接載入，展示永遠等於正式 App。
   每個範例的 html 同時用來渲染與顯示程式碼；scripts/test-app-stylebook.mjs 會檢查 App 每個 class 都在這裡出現。
   本頁只做本機示範，不呼叫任何 API。 */
(function () {
'use strict';
const ICON = {
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16v9H4zM8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  qr: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h3v4h-4v-3h4M18 14h3v3"/></svg>',
  fork: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M17 3c-2 2-3 5-3 8h3v10"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 9h16l-1.5 11h-13zM8 9V6a4 4 0 0 1 8 0v3"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.33-.17-1.96H12v3.7h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.26z"/><path fill="#34A853" d="M12 21.6c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.07v2.58A9.99 9.99 0 0 0 12 21.6z"/><path fill="#FBBC05" d="M6.41 13.5A6 6 0 0 1 6.1 11.6c0-.66.11-1.3.31-1.9V7.12H3.07A9.99 9.99 0 0 0 2 11.6c0 1.61.39 3.14 1.07 4.48l3.34-2.58z"/><path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.96 2.99 14.7 2 12 2 8.09 2 4.72 4.24 3.07 7.12l3.34 2.58C7.2 7.74 9.4 5.98 12 5.98z"/></svg>',
  line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 3C6.48 3 2 6.64 2 11.13c0 4.02 3.57 7.39 8.39 8.03.33.07.77.22.88.5.1.26.07.66.03.92l-.14.85c-.04.26-.2 1 .88.55 1.08-.46 5.83-3.43 7.95-5.88C21.46 14.49 22 12.9 22 11.13 22 6.64 17.52 3 12 3zM8.6 13.6H6.4a.5.5 0 0 1-.5-.5V9.1a.5.5 0 0 1 1 0v3.5h1.7a.5.5 0 0 1 0 1zm1.9-.5a.5.5 0 0 1-1 0V9.1a.5.5 0 0 1 1 0v4zm4.8 0a.5.5 0 0 1-.9.3l-2-2.7v2.4a.5.5 0 0 1-1 0V9.1a.5.5 0 0 1 .9-.3l2 2.7V9.1a.5.5 0 0 1 1 0v4zm3.2-2.5a.5.5 0 0 1 0 1h-1.7v1h1.7a.5.5 0 0 1 0 1h-2.2a.5.5 0 0 1-.5-.5V9.1a.5.5 0 0 1 .5-.5h2.2a.5.5 0 0 1 0 1h-1.7v1h1.7z"/></svg>',
  mark: '<svg class="mark" viewBox="0 0 200 200" fill="none" stroke="#1B1A17" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M62 72C26 58 12 118 44 130 52 132 58 128 64 122"/><path d="M138 72C174 58 188 118 156 130 148 132 142 128 136 122"/><path d="M62 72C66 44 134 44 138 72 144 92 140 112 130 124M70 124C60 112 56 92 62 72"/><path d="M100 100C106 130 106 160 86 180"/><circle fill="#FFDE34" stroke="none" cx="84" cy="80" r="6"/><circle fill="#1B1A17" stroke="none" cx="116" cy="80" r="6"/></svg>',
};

/* 元件目錄。src＝正式實作位置；rules＝必須遵守的行為。html 會原樣渲染並顯示為程式碼。 */
const GROUPS = [
 { id: 'layout', title: '01 版面骨架', items: [
  { name: '頁面容器 .wrap', src: 'm.html <main id="app" class="wrap">',
    rules: ['所有分頁內容渲染進 #app（.wrap）：最寬 480px、左右 18px，≤340px 時 14px。', 'body 已預留底部分頁列高度（--tab＋安全區），新頁面不用自己加 padding-bottom。', '不要在 .wrap 裡再包一層固定寬度容器。'],
    html: '<div class="wrap" style="padding:0">\n  <p>分頁內容放這裡。</p>\n</div>', inlineOk: true },
  { name: '頁首 .hello', src: 'home()、book()、me()、hostShell()',
    rules: ['每個分頁第一個元素。左邊 h1（1.4rem 明體），可加 small 副標；右邊放標誌或一顆次要按鈕。', '右側按鈕用 .btn（寬度自動）或 .quiet，不放主要操作。'],
    html: '<div class="hello">\n  <div><h1>早安，小言</h1><small>今天也一起工作吧</small></div>\n  ' + ICON.mark + '\n</div>\n<div class="hello">\n  <h1>我的</h1>\n  <button class="quiet" type="button" style="width:auto;margin:0">返回</button>\n</div>', inlineOk: true },
  { name: '區塊 .sec', src: 'home()、book()、me()',
    rules: ['頁面內每一段用 section.sec＋h2（1.15rem）。區塊間距 26px 已內建，不要另加 margin。', '區塊內容空的時候放 .empty，不要整段隱藏。'],
    html: '<section class="sec">\n  <h2>下一場活動</h2>\n  <p class="empty">目前沒有開放報名的活動</p>\n</section>' },
  { name: '底部分頁 nav.tabs', src: 'm.html <nav class="tabs" id="tabs">',
    rules: ['固定五格：會員卡、預約、會籍、活動、我的。新增功能放進既有分頁，不要加第六格。', '目前分頁用 aria-current="true"（不是 class）。圖示 24px、stroke 1.7，選中時 2.2。', '登入頁、活動報名、主辦頁要 tabs.hidden=true。'],
    html: '<nav class="tabs" aria-label="主選單">\n  <button aria-current="true">' + ICON.card + '<span>會員卡</span></button>\n  <button>' + ICON.clock + '<span>預約</span></button>\n  <button>' + ICON.lock + '<span>會籍</span></button>\n  <button>' + ICON.cal + '<span>活動</span></button>\n  <button>' + ICON.me + '<span>我的</span></button>\n</nav>', frame: 'tabs' },
  { name: '推入頁 .pg（含 .back、.body、.note、.center）', src: 'pushPg()、openSheet()、openComboPicker()',
    rules: ['第二層畫面一律用 .pg 從右側推入，並呼叫 pushPg(el) 取得 close()，讓手機返回鍵、手勢、‹ 都能關閉。', 'header 只放 .back 和置中 h3；內容放 .body（最寬 480px，已含安全區）。', '置中內容（QR、相機）加 .center。不要自己做 modal 或疊 z-index。'],
    html: '<div class="pg">\n  <header><button class="back" type="button"><b>‹</b><span>返回</span></button><h3>加到主畫面</h3></header>\n  <div class="body">\n    <ol><li>點右上角「⋯」</li><li>選「在瀏覽器開啟」</li></ol>\n    <p class="note">LINE、IG 內建瀏覽器無法安裝。</p>\n    <button class="btn solid" type="button">知道了</button>\n  </div>\n</div>', frame: 'pg' },
  { name: '全螢幕 QR .ov ／ 掃描 .scanov', src: 'm.html #ov、startRedeem()',
    rules: ['出示 QR 用既有 #ov（showOv()／openQr()），不要另做一個 QR 畫面。.sub 放次要說明。', 'QR 圖保持白底、安靜區與 320px 上限；不加濾鏡或圓點化。', '掃描頁用 .pg.scanov.center，video 正方形；關閉時一定要停相機。'],
    html: '<div class="pg ov center">\n  <header><button class="back" type="button"><b>‹</b><span>返回</span></button></header>\n  <div class="body">\n    <img src="/m-icon-192.png" alt="QR 示意" width="320" height="320">\n    <p>請出示給店員掃描</p>\n    <p class="sub">每 30 秒自動更新</p>\n  </div>\n</div>', frame: 'pg' },
  { name: '底部固定操作 .sticky ／ .mev-bar ／ .host-sticky', src: 'bookResv()、m-event.js shell()、m-host.js',
    rules: ['長表單的送出鍵放 .sticky（貼在分頁列上方）。', '分頁列隱藏的畫面（活動報名）用 .mev-bar 固定在底部。主辦頁用 .host-sticky。', '一個畫面只放一個固定操作。'],
    html: '<div class="sticky"><button class="btn solid" type="button">送出訂位</button></div>' },
 ]},
 { id: 'actions', title: '02 按鈕與操作', items: [
  { name: '按鈕 .btn／.btn.solid／.btn2', src: '全 App',
    rules: ['.btn.solid（墨底）＝該區塊主要操作，一個區塊只放一顆；.btn（墨框）＝次要。', '預設滿版、最小高度 52px。放在頁首等窄位置才加寬度自動。', '兩顆並排用 .btn2（左次要、右主要）。', '送出時立即 disabled（自動半透明），完成或失敗後恢復；失敗訊息用 toast()。'],
    html: '<button class="btn solid" type="button">購買會籍</button>\n<button class="btn" type="button" style="margin-top:8px">顯示進出 QR</button>\n<div class="btn2" style="margin-top:12px">\n  <button class="btn" type="button">取消</button>\n  <button class="btn solid" type="button">儲存</button>\n</div>\n<button class="btn solid" type="button" disabled style="margin-top:8px">處理中…</button>', inlineOk: true },
  { name: '主要黃鍵 .show', src: 'home() 出示會員卡',
    rules: ['全 App 只用在「出示會員卡」。黃色是每個畫面唯一的強調，不要拿 .show 做其他按鈕。'],
    html: '<button class="show" type="button">' + ICON.qr + '出示會員卡</button>' },
  { name: '文字按鈕 .quiet', src: 'book() 取消訂位、bookResv() 返回',
    rules: ['取消、稍後、返回等低權重操作。觸控高度 48px（卡片內 44px）。', '具破壞性的動作（取消訂位、取消活動）要先 confirm()。'],
    html: '<button class="quiet" type="button">取消訂位</button>' },
  { name: '膠囊按鈕 .rwb', src: 'rewardsSec() 兌換',
    rules: ['卡片內的小型主要操作（兌換）。最小 44×72px，墨底。'],
    html: '<button class="rwb" type="button">兌換</button>' },
  { name: '登入方式 .login .way', src: 'login()',
    rules: ['只用在登入頁。高度 56px、圖示固定在左側 18px。', 'LINE 用官方綠 #06C755（.way.line），Email 用墨底（.way.email），Google 白底。不要新增其他品牌色。'],
    html: '<div class="login" style="min-height:0">\n  <div class="ways">\n    <a class="way google" href="#">' + ICON.google + '以 Google 登入</a>\n    <a class="way line" href="#">' + ICON.line + '以 LINE 登入</a>\n    <button class="way email" type="button">' + ICON.mail + '用 Email 登入</button>\n  </div>\n</div>', inlineOk: true },
  { name: '快捷格 .quick', src: 'home()、book()',
    rules: ['固定三欄、高 84px，文字不換行。圖示 26px。', '只放三個入口；多於三個改用 .btn 清單。'],
    html: '<nav class="quick" aria-label="快捷">\n  <button type="button">' + ICON.fork + '訂位</button>\n  <button type="button">' + ICON.bag + '預約取餐</button>\n  <button type="button">' + ICON.cal + '報名活動</button>\n</nav>' },
 ]},
 { id: 'cards', title: '03 卡片', items: [
  { name: '會員卡 .pass', src: 'home()',
    rules: ['只用在首頁。墨底＋右上黃圓是品牌元素，不要複製到其他卡片。', '點數用 Cormorant 3.6rem、tabular-nums；手機號碼要遮罩。'],
    html: '<section class="pass" aria-label="會員卡">\n  <div class="brand">言文字 EMOJI</div>\n  <div class="pts"><span>我的點數</span><b>1,280</b></div>\n  <div class="who"><span>王小言</span><i>09-****-678</i></div>\n</section>\n<p class="hint">結帳時報手機號碼就能累積點數。</p>' },
  { name: '資訊卡 .tile', src: 'book()、upcomingSec()、evTile()',
    rules: ['清單項目的預設卡片：白底、細線、圓角 16px。', 'h3 標題後可接 .pill（狀態）或 .tag（強調）；說明放 .meta。', '卡片內操作放 .act。整張可點時用 a.tile，裡面就不要再放按鈕。'],
    html: '<div class="tile">\n  <h3>10/25（六）18:30<span class="pill on">已確認</span></h3>\n  <div class="meta">三點水 · 2 位 · 桌號 A3</div>\n  <div class="act"><button class="quiet" type="button">取消訂位</button></div>\n</div>\n<a class="tile" href="#">\n  <h3>Taiwan Digital Night<span class="tag">已報名</span></h3>\n  <div class="meta">11/1（六）19:00 · 言文字</div>\n</a>' },
  { name: '面板 .panel（含 .eyebrow、.status、.bar、.meta、.chip）', src: 'plan()',
    rules: ['狀態型資訊（會籍、權限）用 .panel。.eyebrow 是小標，.status 是明體狀態句。', '進度條 .bar > i 的寬度是唯一允許的動態 inline style。', '.chip＋.dot 顯示開關狀態，文字要寫清楚（不能只靠圓點顏色）。'],
    html: '<section class="panel">\n  <div class="eyebrow">目前狀態</div>\n  <div class="status">月會員會籍有效</div>\n  <div class="bar"><i style="width:40%"></i></div>\n  <div class="meta"><span>還有 18 天</span><span>月會員 · 2026/10/10 – 2026/11/09</span></div>\n  <div class="btn2">\n    <button class="btn solid" type="button">續訂／升級</button>\n    <button class="chip" type="button"><span class="dot on"></span>可進出等等空間</button>\n  </div>\n</section>', inlineOk: true },
  { name: '活動卡 .ecard（含 .cv、.bd、.meta2、.foot、.price）', src: 'evRow()',
    rules: ['活動列表專用。封面 16:9，沒有封面就不放 .cv。', '描述最多兩行（line-clamp），完整內容在報名頁。', '價格放 .foot 左側，狀態 .tag 放右側。'],
    html: '<a class="ecard" href="#">\n  <img class="cv" src="/og-cover.jpg" alt="" loading="lazy">\n  <div class="bd">\n    <h3>萬聖節之夜</h3>\n    <div class="meta2">10/31（五）19:00 · 言文字</div>\n    <p>變裝入場、南瓜調酒與現場 DJ。示意文字，實際內容讀 API。</p>\n    <div class="foot"><span class="price">NT$300 起</span><span><span class="tag">名額已滿</span></span></div>\n  </div>\n</a>' },
  { name: '已結束活動卡 .ecard.past', src: 'evRow()',
    rules: ['活動結束後系統自動改「已結束」，卡片灰階、降低不透明度，排在列表最後。', '價格位置改顯示「已結束」，不放報名狀態 .tag。'],
    html: '<a class="ecard past" href="#">\n  <div class="bd">\n    <h3>WordPress 彩虹小聚</h3>\n    <div class="meta2">10/19（日）18:30 · 等等空間</div>\n    <div class="foot"><span class="price">已結束</span><span></span></div>\n  </div>\n</a>' },
  { name: '兌換卡 .rgrid .rcard（含 .ph、.nm、.pt、.need、.lock）', src: 'rewardsSec()',
    rules: ['兩欄格線。圖片 4:3；沒有圖片用 .ph＋線條圖示，保留版位。', '點數不足加 .lock，並用 .need 寫出「還差 N 點」。'],
    html: '<div class="rgrid">\n  <div class="rcard">\n    <div class="ph">' + ICON.cup + '</div>\n    <div class="bd"><span class="nm">美式咖啡</span><span class="pt">120 點</span><button class="rwb" type="button">兌換</button></div>\n  </div>\n  <div class="rcard lock">\n    <div class="ph">' + ICON.clock + '</div>\n    <div class="bd"><span class="nm">空間 1 小時</span><span class="pt">300 點</span><small class="need">還差 20 點</small></div>\n  </div>\n</div>' },
  { name: '安裝提示 .install（含 .irow、.later）', src: 'installCard()',
    rules: ['只用在「加到主畫面」。墨框卡片，「稍後」7 天內不再出現。'],
    html: '<section class="install">\n  <h3>把會員卡放到主畫面</h3>\n  <p>結帳時一點就開，不用再找網址。</p>\n  <div class="irow"><button class="btn solid" type="button">加到主畫面</button><button class="later" type="button">稍後</button></div>\n</section>' },
 ]},
 { id: 'lists', title: '04 清單列', items: [
  { name: '欄位列 .row／.row.view', src: 'me()',
    rules: ['唯讀的「標籤：值」清單。左側 span 是標籤（muted），右側 b 是值。', '.row.view 的值靠右、長字串可斷行。'],
    html: '<div class="row view"><span>姓名</span><b>王小言</b></div>\n<div class="row view"><span>Email</span><b>very.long.address@example.com</b></div>' },
  { name: '方案列 .plan（含 .promo .tag）', src: 'plan()',
    rules: ['方案名稱在左，購買鍵在右。價格從 PLAN_PRICES 讀，不要寫死在樣板。', '優惠方案加 .promo，用 .tag 標示。'],
    html: '<div class="plan promo"><span><b class="tag">開幕優惠</b> 年會員 18 個月</span><button type="button">線上購買 NT$35,000</button></div>\n<div class="plan"><span>月會員</span><button type="button">線上購買 NT$4,000</button></div>' },
  { name: '動態列 .upd（.mute）', src: 'events() 會員動態',
    rules: ['公告、通知類的時間序清單。time 在標題下方；已讀／過期加 .mute。'],
    html: '<div class="upd"><b>11/1 開幕茶會</b><time>2026-10-20</time><p>15:00 開始，歡迎會員攜伴。</p></div>\n<div class="upd mute"><b>10/19–10/26 公休</b><time>2026-10-18</time></div>' },
  { name: '品項列 .mi（含 .nm、.q）＋分類 .cat', src: 'renderPickMenu()',
    rules: ['點餐品項。數量鈕 44×44 圓形，數字 tabular-nums。數量為 0 時減號 disabled。', '分類標題用 .cat，不用 h2。'],
    html: '<div class="cat">咖啡</div>\n<div class="mi">\n  <div class="nm">拿鐵<small>NT$150 · 可換燕麥奶</small></div>\n  <div class="q"><button type="button" aria-label="減少" disabled>−</button><b>0</b><button type="button" aria-label="增加">＋</button></div>\n</div>' },
 ]},
 { id: 'forms', title: '05 表單', items: [
  { name: '欄位 .field（登入、我的、活動報名）', src: 'login()、me()、m-event.js',
    rules: ['label 包住文字與 input，不需要 for。高度 52px、字級 1rem（iOS 才不會自動放大）。', '一定要設 autocomplete、inputmode、maxlength。', 'disabled 欄位自動變灰底。'],
    html: '<label class="field">姓名<input autocomplete="name" maxlength="80" value="王小言"></label>\n<label class="field">Email<input value="me@example.com" disabled></label>' },
  { name: '欄位 .fld（預約表單）', src: 'bookResv()、bookPickup()',
    rules: ['預約流程使用 .fld，可包 input／select／textarea，或包住 .seg、.slots 當群組標籤。', '日期用原生 input type=date，不自製日期器。'],
    html: '<label class="fld">日期<input type="date" value="2026-10-25"></label>\n<label class="fld">備註<textarea placeholder="過敏、慶生等需求"></textarea></label>' },
  { name: '單選膠囊 .seg（.two）', src: 'bookResv() 人數、openComboPicker()',
    rules: ['少量選項的單選。選中狀態用 aria-pressed="true"，不要用 class。', '預設三欄，兩個選項加 .two。'],
    html: '<div class="fld">人數\n  <div class="seg">\n    <button type="button" aria-pressed="false">1 位</button>\n    <button type="button" aria-pressed="true">2 位</button>\n    <button type="button" aria-pressed="false">3 位</button>\n  </div>\n</div>\n<div class="seg two"><button type="button" aria-pressed="true">內用</button><button type="button" aria-pressed="false">外帶</button></div>' },
  { name: '時段格 .slots', src: 'bookResv()、bookPickup()',
    rules: ['四欄時段。時段組別用 h4（佔滿一列）。已過或不可訂的時段 disabled，不要直接隱藏整組。'],
    html: '<div class="slots">\n  <h4>在咖啡</h4>\n  <button type="button" disabled>08:00</button><button type="button" aria-pressed="true">08:30</button><button type="button">09:00</button><button type="button">09:30</button>\n</div>' },
  { name: '語言切換 .lang', src: 'langBar()',
    rules: ['中文／English／日本語，aria-pressed 標示目前語言（黃底）。只出現在登入頁與「我的」。'],
    html: '<div class="lang" role="group" aria-label="Language"><button type="button" aria-pressed="true">中文</button><button type="button" aria-pressed="false">English</button><button type="button" aria-pressed="false">日本語</button></div>' },
  { name: '票種與勾選 .mev .tk／.chk／.req（活動報名）', src: 'm-event.js ticketCards()',
    rules: ['票種用 label.tk 包 radio；已截止加 .off 並 disabled。選中時外框自動變墨色。', '同意條款用 label.chk。必填標記用 .req（紅色）並在文字寫「必填」。', '報名畫面外層一定要有 .mev，這組樣式只在 .mev 內生效。'],
    html: '<div class="mev" style="padding-bottom:0">\n  <fieldset><legend>選擇票種</legend>\n    <label class="tk"><input type="radio" name="t" checked><span><b>一般票</b><small>售至 10/30</small></span><b>NT$300</b></label>\n    <label class="tk off"><input type="radio" name="t" disabled><span><b>早鳥票</b><small>已截止</small></span><b>NT$200</b></label>\n  </fieldset>\n  <label class="chk"><input type="checkbox"> 我同意活動條款<span class="req">（必填）</span></label>\n</div>', inlineOk: true },
 ]},
 { id: 'feedback', title: '06 狀態與回饋', items: [
  { name: '狀態標籤 .pill／.pill.on／.tag', src: 'book()、evRow()',
    rules: ['.pill＝一般狀態（灰框），.pill.on＝已確認／可取餐（黃底）。.tag＝已報名、名額已滿等強調（黃底墨框）。', '文字要完整說明狀態，不能只放圓點。'],
    html: '<p><span class="pill">已預約</span><span class="pill on">可取餐</span><span class="tag">已報名</span></p>' },
  { name: '空狀態 .empty', src: '全 App',
    rules: ['清單沒資料時一定要顯示，並告訴使用者原因或下一步。', '載入中也用 .empty（「載入中…」），API 失敗要和「0 筆」分開寫。'],
    html: '<p class="empty">目前沒有訂位。</p>' },
  { name: '提示文字 .hint／.ghost／.nb', src: 'home()、plan()',
    rules: ['欄位或區塊下方的說明用 .hint；再次要的加 .ghost（muted）。', '.nb 讓短詞不斷行（價格、日期）。'],
    html: '<p class="hint">結帳報手機號碼就能累點。</p>\n<p class="hint ghost">點「兌換」後掃桌上的點菜條碼，<span class="nb">空間時數</span>請到櫃檯。</p>' },
  { name: '離線列 .offline', src: 'home()',
    rules: ['偵測到離線時放在頁面最上方。顯示的是快取資料時要明講。'],
    html: '<div class="offline">目前離線，顯示上次的資料</div>' },
  { name: '吐司 .toast', src: 'm.html #toast、toast()',
    rules: ['操作結果與錯誤訊息一律呼叫 toast(訊息)，2.8 秒消失，role=status。', '關鍵結果（付款完成、報名成功）不能只靠 toast，頁面上也要留下狀態。'],
    html: '<div class="toast" role="status">已儲存</div>', frame: 'toast' },
  { name: '寄出確認 .login .sent', src: 'login() Email 登入',
    rules: ['寄出 Email 連結後替換表單，b 寫結果、後面寫寄到哪裡。'],
    html: '<div class="login" style="min-height:0"><div class="sent" role="status"><b>已寄出登入連結</b>請到 me@example.com 收信。</div></div>', inlineOk: true },
  { name: '報名結果 .mev .alert／.ok（含 .sum、.facts、.desc、.cover）', src: 'm-event.js',
    rules: ['錯誤用 .alert（紅框）並以「錯誤：」開頭；成功用 .ok（黃底）。', '.facts 是時間地點清單，.desc 保留換行，.sum 是金額小計列。'],
    html: '<div class="mev" style="padding-bottom:0">\n  <div class="facts"><p><b>時間</b> 10/31 19:00 – 22:00</p><p><b>地點</b> 言文字</p></div>\n  <p class="desc">變裝入場。\n現場有 DJ。</p>\n  <div class="sum"><span>小計</span><b>NT$600</b></div>\n  <div class="alert" role="alert">錯誤：名額已滿，請改選其他票種。</div>\n  <div class="ok" role="status" style="margin-top:8px">完成：報名成功，票券已寄到信箱。</div>\n</div>', inlineOk: true },
  { name: '優惠碼套用 .mev-coupon', src: 'm-event.js mount()',
    rules: ['付費活動才顯示，標題直接寫「優惠碼（選填）」，不摺疊。', '輸入框右側放「套用」，按下後打 /quote 試算；成功在下方 .note 顯示折抵，失敗改 .alert。', '套用後 .sum 列出原價、優惠折抵與合計，付款鈕同步顯示折扣後金額。'],
    html: '<div class="mev" style="padding-bottom:0">\n  <section class="sec"><h2>優惠碼（選填）</h2>\n    <div class="mev-coupon"><label class="field"><input aria-label="優惠碼" value="EARLY100"></label><button class="btn" type="button">套用</button></div>\n    <p class="note" role="status">已套用 EARLY100，折抵 NT$100</p>\n  </section>\n  <div class="sum"><span>原價</span><span>NT$600</span></div>\n  <div class="sum"><span>優惠折抵（EARLY100）</span><span>−NT$100</span></div>\n  <div class="sum"><b>合計</b><b>NT$500</b></div>\n</div>', inlineOk: true },
  { name: '報名結果頁 .mev-result／.mev-mark', src: 'm-event.js renderResult()',
    rules: ['報名送出、訪客報名、付款回傳後一律換成結果頁，不留在表單。', '.mev-mark 成功加 .ok（黃底勾），確認中不加。', '主按鈕：會員「出示票券」、訪客「用這個 Email 登入 App」；次按鈕回活動頁。'],
    html: '<div class="mev" style="padding-bottom:0">\n  <section class="mev-result" role="status">\n    <div class="mev-mark ok" aria-hidden="true">✓</div>\n    <h1>報名完成</h1>\n    <p class="note">確認信與票券資訊會寄到你的 Email。</p>\n    <div class="sec tile"><b>萬聖節之夜</b><p>10/31 19:00 – 22:00</p><p>言文字</p></div>\n    <button class="btn solid" type="button">出示票券</button>\n    <button class="btn" type="button">回活動頁</button>\n  </section>\n</div>', inlineOk: true },
 ]},
 { id: 'host', title: '07 主辦工作台（/host）', items: [
  { name: '活動摘要 .host-top／.host-status', src: 'm-host.js',
    rules: ['狀態膠囊 .host-status 搭配 .is-live／.is-pending／.is-ended，文字寫清楚，顏色只是輔助。'],
    html: '<div class="host-top">\n  <img class="host-cover" src="/og-cover.jpg" alt="">\n  <div><h1>萬聖節之夜</h1><p class="host-eyebrow">10/31（五）19:00</p><span class="host-status is-live">即將舉行</span></div>\n</div>\n<p><span class="host-status is-pending">審核中</span> <span class="host-status is-ended">已結束</span></p>' },
  { name: '數字區 .host-hero／.host-metrics', src: 'm-host.js',
    rules: ['主要數字放 .host-hero（墨底）並用 .host-count；次要數字三欄 .host-metric 放在 hero 裡。', '.host-metric 只放短數字（人數）；金額這類長數字在 320px 會斷行，改用 .row 清單。'],
    html: '<section class="host-hero">\n  <div class="host-count">86</div><p>已報名 · 名額使用 72%</p>\n  <div class="host-metrics">\n    <div class="host-metric"><b>42</b><span>已簽到</span></div>\n    <div class="host-metric"><b>44</b><span>尚未簽到</span></div>\n    <div class="host-metric"><b>34</b><span>剩餘名額</span></div>\n  </div>\n</section>' },
  { name: '操作格 .host-actions .host-action（.primary）', src: 'm-host.js',
    rules: ['兩欄大按鈕，b 是動作、span 是說明。.primary（黃底）一頁只能一個，通常是「簽到」。'],
    html: '<div class="host-actions">\n  <button class="host-action primary" type="button"><b>開始簽到</b><span>掃描票券 QR</span></button>\n  <button class="host-action" type="button"><b>來賓名單</b><span>搜尋、匯出 CSV</span></button>\n</div>' },
  { name: '清單 .host-row（.host-row-main、.chev）／可點卡片 .tile.host-card', src: 'm-host.js',
    rules: ['設定入口用 button.host-row，右側 .chev（›），最後一列自動去掉底線。', '整張卡片可點時用 button.tile.host-card（重設按鈕的寬度與對齊），裡面不再放按鈕。'],
    html: '<section class="sec" style="margin-top:0">\n  <button class="host-row" type="button"><span class="host-row-main"><h3>撥款帳戶</h3><p>設定售票活動的收款帳戶</p></span><span class="chev">›</span></button>\n  <button class="host-row" type="button"><span class="host-row-main"><h3>從其他平台匯入</h3><p>讀取公開活動資料後繼續送審</p></span><span class="chev">›</span></button>\n</section>\n<button class="tile host-card" type="button"><h3>萬聖節之夜<span class="pill">即將舉行</span></h3><div class="meta">10/31（五）19:00 · 言文字</div></button>', inlineOk: true },
  { name: '篩選與搜尋 .host-tabs／.host-search', src: 'm-host.js',
    rules: ['.host-tabs 可橫向捲動、aria-pressed 標示目前篩選。搜尋框用 .host-search。'],
    html: '<div class="host-tabs"><button type="button" aria-pressed="true">全部</button><button type="button" aria-pressed="false">未簽到</button><button type="button" aria-pressed="false">已簽到</button></div>\n<input class="host-search" placeholder="搜尋姓名或 Email">' },
  { name: '來賓卡 .guest-card（.guest-name、.guest-check、.done、.guest-detail）', src: 'm-host.js',
    rules: ['右上圓鈕切換簽到，已簽到加 .done（黃底）並更新 aria-label。'],
    html: '<div class="tile guest-card">\n  <h3 class="guest-name">陳小遊</h3><div class="meta">guest@example.com</div>\n  <button class="guest-check done" type="button" aria-label="撤銷簽到">✓</button>\n  <div class="guest-detail">一般票 · 10/20 報名</div>\n</div>' },
  { name: '掃描與提示 .scan-frame／.scan-result（.good／.bad）／.host-sheet-note／.host-empty', src: 'm-host.js',
    rules: ['掃描結果用 .scan-result＋.good／.bad，文字以「✓」或錯誤原因開頭。', '主辦空狀態用 .host-empty（虛線框）。'],
    html: '<div class="scan-frame"><video muted playsinline></video></div>\n<div class="scan-result good" role="status">✓ 簽到完成：陳小遊</div>\n<div class="scan-result bad" role="status">票券無效，請改用名單查詢。</div>\n<div class="host-sheet-note">撥款帳戶設定完成後，票款於活動結束 7 天後入帳。（示意）</div>\n<div class="host-empty">還沒有來賓報名。</div>' },
 ]},
];

const TOKENS = [
  ['--ink', '標題、主要操作、墨底'], ['--soft', '內文、說明'], ['--muted', '次要文字（App 比官網深一階）'],
  ['--paper', '頁底'], ['--alt', '次要底、停用欄位'], ['--line', '分隔線、卡片框'], ['--card', '卡片底'],
  ['--accent', '唯一的黃，只當底色'], ['--tab', '底部分頁列高度'],
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => s.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

async function loadAppCss() {
  const out = [];
  for (const url of ['/m.html', '/m']) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) continue; const h = await r.text(); const css = [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n'); if (css) { out.push(css); break; } } catch {}
  }
  try { const r = await fetch('/m-event.js', { cache: 'no-store' }); const t = await r.text(); const m = t.match(/const CSS=`([\s\S]*?)`;/); if (m) out.push(m[1]); } catch {}
  if (!out.length) throw new Error('讀不到 /m.html 的樣式');
  const st = document.createElement('style'); st.id = 'app-css'; st.textContent = out.join('\n');
  document.head.prepend(st);
  return out.length;
}

function render() {
  const nav = document.getElementById('sbk-toc');
  nav.innerHTML = '<a href="#tokens">00 基礎</a>' + GROUPS.map(g => `<a href="#${g.id}">${esc(g.title)}</a>`).join('');
  // innerHTML 只放本檔 GROUPS／TOKENS 常數（文件作者撰寫的靜態範例）與 esc() 過的文字，沒有使用者或 API 輸入。
  const root = document.getElementById('sbk-body');
  const cs = getComputedStyle(document.documentElement);
  let html = `<section class="sbk-sec" id="tokens"><h2 class="sbk-h2">00 基礎：色彩、字體、尺寸</h2>
   <p class="sbk-p">以下數值是從正式 App 的 <code>:root</code> 即時讀出。新程式一律用 <code>var(--token)</code>，不寫色碼。</p>
   <div class="sbk-swatches">${TOKENS.map(([k, use]) => { const v = cs.getPropertyValue(k).trim(); const color = k !== '--tab'; return `<div class="sbk-sw">${color ? `<span class="sbk-chip" style="background:var(${k})"></span>` : ''}<code>${k}</code><b>${esc(v)}</b><small>${esc(use)}</small></div>`; }).join('')}</div>
   <table class="sbk-table"><caption>字體與尺寸（App 實際值）</caption><tbody>
   <tr><th scope="row">標題</th><td>Noto Serif TC 700；頁首 h1 1.4rem、區塊 h2 1.15rem、卡片 h3 1.05rem</td></tr>
   <tr><th scope="row">內文／介面</th><td>Noto Sans TC，最小 1rem（測試強制，含按鈕、標籤、small）</td></tr>
   <tr><th scope="row">數字</th><td>點數、金額用 Cormorant Garamond＋tabular-nums；表單內數字用內文字體</td></tr>
   <tr><th scope="row">觸控尺寸</th><td>最小 44×44px；主要按鈕 52px、登入與出示卡片 56px</td></tr>
   <tr><th scope="row">圓角</th><td>欄位 12px、按鈕 14px、卡片 16px、會員卡 22px、膠囊 999px</td></tr>
   <tr><th scope="row">間距</th><td>.wrap 20px 18px、區塊間 26px、卡片內距 16px、卡片間 10px</td></tr>
   </tbody></table></section>`;
  for (const g of GROUPS) {
    html += `<section class="sbk-sec" id="${g.id}"><h2 class="sbk-h2">${esc(g.title)}</h2>`;
    for (const it of g.items) {
      const id = g.id + '-' + slug(it.name.split(' ')[0] + '-' + (it.name.match(/\.[\w-]+/) || [''])[0]);
      html += `<article class="sbk-item" id="${id}"><div class="sbk-doc"><h3 class="sbk-h3">${esc(it.name)}</h3><p class="sbk-src">正式實作：<code>${esc(it.src)}</code></p><ul class="sbk-rules">${it.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <details class="sbk-code"><summary>HTML</summary><pre><code>${esc(it.html)}</code></pre></details></div>
        <div class="sbk-frame${it.frame ? ' sbk-frame--' + it.frame : ''}" aria-label="${esc(it.name)} 示範">${it.html}</div></article>`;
    }
    html += '</section>';
  }
  root.innerHTML = html;
  root.querySelectorAll('.sbk-frame a[href="#"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));
  root.querySelectorAll('.sbk-frame [aria-pressed]').forEach(b => b.addEventListener('click', () => {
    const grp = b.parentElement; if (b.disabled) return;
    grp.querySelectorAll('[aria-pressed]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
}

window.AppStylebook = { GROUPS };
loadAppCss().then(n => { render(); document.getElementById('sbk-status').textContent = `已從正式 App 載入 ${n} 份樣式（/m.html、/m-event.js）。`; document.documentElement.dataset.ready = '1'; })
  .catch(e => { document.getElementById('sbk-status').textContent = '錯誤：' + e.message + '。請在官網或本機伺服器開啟本頁。'; render(); document.documentElement.dataset.ready = 'error'; });
})();
