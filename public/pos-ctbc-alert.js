/* POS 中信刷卡收款通知（KK 11/5，同 LINE Pay 機制 pos-linepay-alert.js）：有新的中信行動刷卡實收（或退貨）就響鈴、
 * 跳全螢幕彈窗顯示最近一筆完整資訊（金額、交易時間、卡號末四碼、授權碼、端末機、行動裝置使用者、店別）。
 * 只能按「我知道了」關閉：點背景、Esc 都不會關。已讀記在這台裝置（localStorage，依品牌分 key），新裝置第一次開機不補跳舊交易。
 * 停在桌號結帳頁時每秒同步一次（setTimeout 鏈：上一輪做完才排下一輪，不靠固定間隔或排程）；其他畫面 15 秒只讀 DB（排程 15 分鐘同步）。
 * 樣式沿用 .lpa-*。依賴 pos.html 的 esc/api/DATA/POS_URL_VENUE、pos-ops.js 的 newTicketChime。 */
const CTA_POLL_MS = 15000;
const CTA_TABLE_MS = 1000;    // 在桌號結帳頁：每秒叫伺服器同步中信後台＋檢查新交易（KK 11/5）
/* 已讀 key 依品牌：本檔在 pos.html 定義 POS_URL_VENUE 之前載入，要用時才算（先前寫成常數，一律落到 _home） */
const CTA_KEY = () => 'tth_ctbc_seen_' + (typeof POS_URL_VENUE === 'string' && POS_URL_VENUE ? POS_URL_VENUE : 'home').toLowerCase();
let CTA = { timer: null, queue: [], open: false };

function ctaSeen(){ try { const v = JSON.parse(localStorage.getItem(CTA_KEY()) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
function ctaSaveSeen(ids){ try { localStorage.setItem(CTA_KEY(), JSON.stringify(ids.slice(-300))); } catch (e) {} }
function ctaMoney(n){ const a = Math.abs(Number(n) || 0).toLocaleString('zh-TW'); return (n < 0 ? '−' : '') + 'NT$' + a; }
function ctaRow(k, v){ return v ? `<div class="lpa-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : ''; }
function ctaCard(a){
  const refund = a.amount < 0;
  return `<div class="lpa-item${refund ? ' is-refund' : ''}">
    <div class="lpa-amt"><span class="lpa-type">${esc(a.type_label || (refund ? '退貨' : '銷售'))}</span><b>${esc(ctaMoney(a.amount))}</b></div>
    ${ctaRow('店別', a.venue_label)}${ctaRow('交易時間', a.time)}${ctaRow('卡號末四碼', a.card_last4)}
    ${ctaRow('授權碼', a.auth_code)}${ctaRow('端末機', a.terminal_id)}${ctaRow('行動裝置使用者', a.device_user)}${ctaRow('商品備註', a.note)}
  </div>`;
}
function ctaPaint(){
  let ov = document.getElementById('cta');
  if (!CTA.queue.length) { if (ov) ov.remove(); CTA.open = false; return; }
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'cta'; ov.className = 'lpa-ov';
    ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'cta-title');
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target.closest('[data-cta-ok]')) ctaAck(); });   // 只有按鈕能關，點背景不關
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } });
  }
  const last = CTA.queue[CTA.queue.length - 1], more = CTA.queue.length - 1;
  ov.innerHTML = `<div class="lpa-card">
    <h2 id="cta-title">收到信用卡（中信）</h2>
    <div class="lpa-list">${ctaCard(last)}</div>
    ${more > 0 ? `<p class="lpa-sum">另有 ${more} 筆較早的交易，請到日結中信對帳查看</p>` : ''}
    <p class="lpa-note">請到該桌結帳登記為信用卡。在桌號結帳頁每秒同步一次，其他畫面每 15 分鐘。</p>
    <button type="button" class="btn btn--solid lpa-ok" data-cta-ok>我知道了</button>
  </div>`;
  CTA.open = true;
  ov.querySelector('[data-cta-ok]')?.focus();
}
function ctaAck(){
  const seen = ctaSeen() || [];
  ctaSaveSeen([...new Set([...seen, ...CTA.queue.map(a => a.id)])]);
  CTA.queue = []; ctaPaint();
}
async function loadCtbcAlerts(){
  if (!DATA) return;
  let d; try { d = await api('/admin/orders/ctbc-alerts'); } catch (e) { return; }
  const list = d.alerts || [];
  const seen = ctaSeen();
  if (!seen) { ctaSaveSeen(list.map(a => a.id)); return; }   // 這台裝置第一次用：目前已有的只記為已讀
  const have = new Set([...seen, ...CTA.queue.map(a => a.id)]);
  const fresh = list.filter(a => !have.has(a.id));
  if (!fresh.length) return;
  CTA.queue.push(...fresh);
  CTA.queue.sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)));
  ctaPaint();
  try { if (typeof newTicketChime === 'function') newTicketChime(); } catch (e) {}
}
const ctaOnTable = () => typeof TAB !== 'undefined' && TAB === 'pos' && typeof POS_TABLE !== 'undefined' && !!POS_TABLE && !document.hidden;
async function syncCtbcNow(){ try { await api('/admin/orders/ctbc-alerts/sync', { method: 'POST', body: {} }); } catch (e) {} }
function ctbcAlertBoot(){
  if (CTA.timer) return;
  const tick = async () => {
    const table = ctaOnTable();
    try { if (table) await syncCtbcNow(); await loadCtbcAlerts(); }
    finally { CTA.timer = setTimeout(tick, table ? CTA_TABLE_MS : CTA_POLL_MS); }
  };
  tick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCtbcAlerts(); });
}
