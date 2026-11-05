/* POS LINE Pay 收款通知（KK 11/5）：每 15 秒輪詢 /admin/orders/linepay-alerts，有新的 LINE Pay 實收（或退款）就響鈴、
 * 跳全螢幕彈窗顯示最近一筆的完整資訊（金額、交易時間、付款方式、卡號末四碼、驗證碼、交易號碼、店別）。
 * 只能按「我知道了」關閉：點背景、Esc 都不會關。已讀記在這台裝置（localStorage，依品牌分 key），新裝置第一次開機不補跳舊交易。
 * 資料來自 LINE Pay 商家後台：平常每 5 分鐘同步；停在桌號結帳頁時每秒同步一次（setTimeout 鏈）。依賴 pos.html 的 esc/api/DATA/POS_URL_VENUE、pos-ops.js 的 newTicketChime。 */
const LPA_POLL_MS = 15000;
const LPA_TABLE_MS = 1000;    // 在桌號結帳頁：每秒叫伺服器同步 LINE Pay 後台＋檢查新交易（KK 11/5：每秒、用 setTimeout 鏈，上一輪做完才排下一輪，不靠排程）
/* 已讀 key 依品牌：本檔在 pos.html 定義 POS_URL_VENUE 之前載入，要用時才算（先前寫成常數，一律落到 _home） */
const LPA_KEY = () => 'tth_lp_seen_' + (typeof POS_URL_VENUE === 'string' && POS_URL_VENUE ? POS_URL_VENUE : 'home').toLowerCase();
let LPA = { timer: null, queue: [], open: false };

function lpaSeen(){ try { const v = JSON.parse(localStorage.getItem(LPA_KEY()) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
function lpaSaveSeen(ids){ try { localStorage.setItem(LPA_KEY(), JSON.stringify(ids.slice(-300))); } catch (e) {} }
function lpaMoney(n){ const a = Math.abs(Number(n) || 0).toLocaleString('zh-TW'); return (n < 0 ? '−' : '') + 'NT$' + a; }
function lpaRow(k, v){ return v ? `<div class="lpa-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : ''; }
function lpaCard(a){
  const refund = a.amount < 0;
  return `<div class="lpa-item${refund ? ' is-refund' : ''}">
    <div class="lpa-amt"><span class="lpa-type">${esc(a.type_label || (refund ? '退款' : '付款'))}</span><b>${esc(lpaMoney(a.amount))}</b></div>
    ${lpaRow('店別', a.venue_label)}${lpaRow('交易時間', a.time)}${lpaRow('付款方式', a.method_label)}
    ${lpaRow('卡號末四碼', a.card_last4)}${lpaRow('驗證碼', a.confirm_no)}${lpaRow('交易號碼', a.id)}
    ${a.origin_id && a.origin_id !== a.id ? lpaRow('原交易號碼', a.origin_id) : ''}${lpaRow('訂單號碼', a.order_no)}
  </div>`;
}
function lpaPaint(){
  let ov = document.getElementById('lpa');
  if (!LPA.queue.length) { if (ov) ov.remove(); LPA.open = false; return; }
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'lpa'; ov.className = 'lpa-ov';
    ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'lpa-title');
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target.closest('[data-lpa-ok]')) lpaAck(); });   // 只有按鈕能關，點背景不關
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } });
  }
  // 只顯示最近一筆（KK 11/5）；同批較舊的交易按「我知道了」時一起標已讀，只提示筆數
  const last = LPA.queue[LPA.queue.length - 1], more = LPA.queue.length - 1;
  ov.innerHTML = `<div class="lpa-card">
    <h2 id="lpa-title">收到 LINE Pay</h2>
    <div class="lpa-list">${lpaCard(last)}</div>
    ${more > 0 ? `<p class="lpa-sum">另有 ${more} 筆較早的交易，請到日結 LINE Pay 對帳查看</p>` : ''}
    <p class="lpa-note">請到該桌結帳登記為 LINE Pay。在桌號結帳頁每秒同步一次，其他畫面每 5 分鐘。</p>
    <button type="button" class="btn btn--solid lpa-ok" data-lpa-ok>我知道了</button>
  </div>`;
  LPA.open = true;
  ov.querySelector('[data-lpa-ok]')?.focus();
}
function lpaAck(){
  const seen = lpaSeen() || [];
  lpaSaveSeen([...new Set([...seen, ...LPA.queue.map(a => a.id)])]);
  LPA.queue = []; lpaPaint();
}
async function loadLinepayAlerts(){
  if (!DATA) return;
  let d; try { d = await api('/admin/orders/linepay-alerts'); } catch (e) { return; }
  const list = d.alerts || [];
  const seen = lpaSeen();
  // 這台裝置第一次用：目前已有的交易只記為已讀，不補跳
  if (!seen) { lpaSaveSeen(list.map(a => a.id)); return; }
  const have = new Set([...seen, ...LPA.queue.map(a => a.id)]);
  const fresh = list.filter(a => !have.has(a.id));
  if (!fresh.length) return;
  LPA.queue.push(...fresh);
  LPA.queue.sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)));
  lpaPaint();
  try { if (typeof newTicketChime === 'function') newTicketChime(); } catch (e) {}
}
const lpaOnTable = () => typeof TAB !== 'undefined' && TAB === 'pos' && typeof POS_TABLE !== 'undefined' && !!POS_TABLE && !document.hidden;
async function syncLinepayNow(){ try { await api('/admin/orders/linepay-alerts/sync', { method: 'POST', body: {} }); } catch (e) {} }
function linepayAlertBoot(){
  if (LPA.timer) return;
  const tick = async () => {
    const table = lpaOnTable();
    try { if (table) await syncLinepayNow(); await loadLinepayAlerts(); }
    finally { LPA.timer = setTimeout(tick, table ? LPA_TABLE_MS : LPA_POLL_MS); }
  };
  tick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadLinepayAlerts(); });
}
