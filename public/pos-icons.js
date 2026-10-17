/* POS 圖示：內嵌 SVG（24px 格線、stroke 跟文字同色），不依賴外部字型或圖檔。
   1) POSIcon(name) 回傳 <svg> 字串；2) 依下方對照表替 #app 與頂欄內的按鈕自動補圖示（MutationObserver，重繪後也會補）。
   只負責 /pos，不載入 /admin。新增按鈕想要圖示：在 MAP 加一行 selector → 圖示名稱。 */
(function(){
  var P = {
    wallet:'<path d="M3 7a2 2 0 0 1 2-2h12v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2"/><circle cx="16.5" cy="14.5" r="1"/>',
    utensils:'<path d="M4 3v7a3 3 0 0 0 3 3v8"/><path d="M7 3v7"/><path d="M10 3v7a3 3 0 0 1-3 3"/><path d="M17 21V3c-2.5 1.5-4 4.5-4 8h4"/>',
    ban:'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chart:'<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V7M16 16v-3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.6 3.5 2.5 3.5 5.7"/>',
    refresh:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    archive:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    login:'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    bag:'<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    send:'<path d="m22 2-11 11"/><path d="m22 2-7 20-4-9-9-4 20-7Z"/>',
    cash:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v.01M18 14v.01"/>',
    swap:'<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/>',
    camera:'<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.5"/>',
    printer:'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    file:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    xcircle:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z"/><path d="M10 21h4"/>',
    play:'<path d="M7 4.5v15l12-7.5-12-7.5Z"/>',
    pencil:'<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    clip:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    download:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    left:'<path d="m15 5-7 7 7 7"/>',
    right:'<path d="m9 5 7 7-7 7"/>',
    sparkles:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 16v4M17 18h4"/>',
    coffee:'<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',
    userplus:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6 1.5 0 2.8.4 3.9 1.1"/><path d="M19 14v6M16 17h6"/>',
    tag:'<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1"/>',
    pause:'<path d="M8 5v14M16 5v14"/>'
  };
  function ic(name){ return Object.prototype.hasOwnProperty.call(P,name) ? '<svg class="ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + P[name] + '</svg>' : ''; }
  window.POSIcon = ic;

  var MAP = [
    ['#p-drawer','archive'], ['#p-logout','logout'], ['#op-logout','logout'],
    // 結帳
    ['#pos-open','plus'], ['#pos-open-extra','plus'], ['#pos-takeout','bag'], ['#pos-place','send'],
    ['#pos-checkout','cash'], ['#pos-prepay','wallet'], ['#pos-move','swap'], ['#pos-cash-drawer','archive'],
    ['#pos-table-qr','qr'], ['#qr-make','qr'], ['#qr-all','qr'], ['#qr-print','printer'], ['#qr-print1','printer'], ['#pos-yan-lookup','search'],
    ['#pos-invoice-scan','camera'], ['#pos-carrier-scan','camera'], ['#hist-scan','camera'],
    ['#pos-disc-apply','tag'], ['#pos-print-test','printer'], ['#pos-print-resume','play'],
    ['[data-void-line]','xcircle'], ['[data-void]','xcircle'],
    // 出餐／查單
    ['[data-print]','printer'], ['[data-receipt]','printer'], ['[data-invoice-print]','printer'], ['[data-invoice-issue]','file'],
    ['[data-serve]','check'], ['[data-order][data-status=ready]','bell'], ['[data-order][data-status=done]','check'],
    ['#hist-go','search'], ['#hist-today','calendar'],
    // 訂位
    ['#resv-today','calendar'], ['[data-resv-edit]','pencil'], ['[data-resv-delete]','trash'],
    // 日結
    ['[data-reg-open]','login'], ['#reg-open-go','login'], ['[data-reg-close]','lock'], ['#reg-close-go','lock'],
    ['[data-reg-print]','printer'], ['#reg-count-print','printer'], ['[data-reg-count]','clip'], ['#reg-count-go','clip'],
    ['[data-reg-cash]','plus'], ['[data-reg-reopen]','refresh'], ['#lp-sync','refresh'], ['#lp-csv','download'],
    ['#sales-csv','download'], ['#sales-prev','left'], ['#sales-next','right'], ['#sales-today','calendar'],
    // 打卡／排班
    ['#clock-in','login'], ['#clock-out','logout'], ['#clock-break-start','coffee'], ['#clock-break-end','play'], ['#clock-makeup','history'],
    ['#att-week','calendar'], ['#att-month','calendar'], ['#att-csv','download'], ['[data-fix]','pencil'], ['[data-rm]','trash'],
    ['#sh-prev','left'], ['#sh-next','right'], ['#sh-this','calendar'], ['#sh-auto','sparkles'], ['#sh-staffing','users'], ['#sh-csv','download'],
    ['[data-add]','plus'], ['#staffing-add','plus'], ['#st-new','userplus'], ['[data-edit]','pencil']
  ];
  var SEL = MAP.map(function(m){ return m[0]; }).join(',');
  function decorate(root){
    if (!root || !root.querySelectorAll) return;
    var list = root.matches && root.matches(SEL) ? [root] : [];
    list = list.concat([].slice.call(root.querySelectorAll(SEL)));
    list.forEach(function(b){
      if (b.querySelector(':scope > .ic')) return;
      var name = ''; for (var i = 0; i < MAP.length; i++) if (b.matches(MAP[i][0])) { name = MAP[i][1]; break; }
      if (!name) return;
      var first = b.firstChild;
      // 取代文字前面的 📷、＋ 這類符號，避免重複
      if (first && first.nodeType === 3) first.nodeValue = first.nodeValue.replace(/^\s*(?:📷|＋|\+|↻)\s*/, '');
      if (!b.textContent.trim() && !b.getAttribute('aria-label')) return;
      b.insertAdjacentHTML('afterbegin', ic(name));
    });
  }
  function start(){
    decorate(document.body);
    var t = null;
    new MutationObserver(function(){ clearTimeout(t); t = setTimeout(function(){ decorate(document.body); }, 30); })
      .observe(document.body, { childList:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
