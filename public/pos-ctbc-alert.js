/* POS 中信刷卡收款通知（KK 11/5，同 LINE Pay 機制 pos-linepay-alert.js）：有新的中信行動刷卡實收（或退貨）就響鈴、
 * 跳全螢幕彈窗顯示交易完整資訊（可輪播看最近 8 小時）（金額、交易時間、卡號末四碼、授權碼、端末機、行動裝置使用者、店別）。
 * 只能按「我知道了」關閉：點背景、Esc 都不會關。已讀記在這台裝置（localStorage，依品牌分 key），新裝置第一次開機不補跳舊交易。
 * 不論在哪個頁面，一律背景同步：同步完成後 1 秒再同步（setTimeout 鏈，不靠固定間隔或排程）。
 * 樣式沿用 .lpa-*。依賴 pos.html 的 esc/api/DATA/POS_URL_VENUE、pos-ops.js 的 cashInChime（錢進帳音效）。 */
const CTA_GAP_MS = 1000;      // 不分頁面背景讀取；同步改由伺服器端單一迴圈（KK 11/6），POS 只讀結果：上一輪讀完等 1 秒再讀（setTimeout 鏈）
/* 已讀 key 依品牌：本檔在 pos.html 定義 POS_URL_VENUE 之前載入，要用時才算（先前寫成常數，一律落到 _home） */
const CTA_KEY = () => 'tth_ctbc_seen_' + (typeof POS_URL_VENUE === 'string' && POS_URL_VENUE ? POS_URL_VENUE : 'home').toLowerCase();
let CTA = { timer: null, queue: [], recent: [], idx: 0, open: false };

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
/* 輪播（KK 11/5）：彈窗可看最近 8 小時交易（API recent，新到舊），從最新一筆開始；‹ › 鍵、左右滑動、鍵盤方向鍵切換，新的標「新」 */
function ctaSlides(){
  const fresh = new Set(CTA.queue.map(a => a.id)), seen = new Set();
  const list = [...CTA.queue].reverse().concat(CTA.recent || []).filter(a => !seen.has(a.id) && seen.add(a.id));
  list.sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
  return list.map(a => ({ ...a, fresh: fresh.has(a.id) }));
}
function ctaGo(d){ const n = ctaSlides().length; CTA.idx = Math.max(0, Math.min(n - 1, (CTA.idx || 0) + d)); ctaPaint(); }
function ctaPaint(){
  let ov = document.getElementById('cta');
  if (!CTA.queue.length) { if (ov) ov.remove(); CTA.open = false; return; }
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'cta'; ov.className = 'lpa-ov';
    ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'cta-title');
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {   // 只有按鈕能關，點背景不關
      if (e.target.closest('[data-cta-ok]')) return ctaAck();
      const nav = e.target.closest('[data-cta-nav]'); if (nav && !nav.disabled) ctaGo(Number(nav.dataset.ctaNav));
    });
    ov.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); ctaGo(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ctaGo(-1); }
    });
    let x0 = null;
    ov.addEventListener('pointerdown', e => { if (e.target.closest('.lpa-list')) x0 = e.clientX; });
    ov.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) ctaGo(dx < 0 ? 1 : -1); });
  }
  const slides = ctaSlides(), n = slides.length;
  CTA.idx = Math.max(0, Math.min(n - 1, CTA.idx || 0));
  const cur = slides[CTA.idx], newN = CTA.queue.length;
  ov.innerHTML = `<div class="lpa-card is-ctbc">
    <h2 id="cta-title">收到信用卡（中信）</h2>
    <div class="lpa-nav">
      <button type="button" class="lpa-arrow" data-cta-nav="-1" aria-label="較新一筆" ${CTA.idx ? '' : 'disabled'}>‹</button>
      <span class="lpa-pos">${cur.fresh ? '<b class="lpa-new">新</b>' : ''}${CTA.idx + 1} / ${n}<small>最近 8 小時</small></span>
      <button type="button" class="lpa-arrow" data-cta-nav="1" aria-label="較早一筆" ${CTA.idx < n - 1 ? '' : 'disabled'}>›</button>
    </div>
    <div class="lpa-list">${ctaCard(cur)}</div>
    ${newN > 1 ? `<p class="lpa-sum">這次收到 ${newN} 筆新交易，按 › 或左滑看較早的</p>` : ''}
    <p class="lpa-note">請到該桌結帳登記為信用卡。POS 在背景持續同步，不論停在哪個頁面。</p>
    <button type="button" class="btn btn--solid lpa-ok" data-cta-ok>我知道了</button>
  </div>`;
  CTA.open = true;
  ov.querySelector('[data-cta-ok]')?.focus();
}
function ctaAck(){
  const seen = ctaSeen() || [];
  ctaSaveSeen([...new Set([...seen, ...CTA.queue.map(a => a.id)])]);
  CTA.queue = []; CTA.idx = 0; ctaPaint();
}
async function loadCtbcAlerts(){
  if (!DATA) return;
  let d; try { d = await api('/admin/orders/ctbc-alerts'); } catch (e) { return; }
  const list = d.alerts || [];
  CTA.recent = d.recent || [];
  const seen = ctaSeen();
  if (!seen) { ctaSaveSeen(list.map(a => a.id)); return; }   // 這台裝置第一次用：目前已有的只記為已讀
  const have = new Set([...seen, ...CTA.queue.map(a => a.id)]);
  const fresh = list.filter(a => !have.has(a.id));
  if (!fresh.length) { if (CTA.open) ctaPaint(); return; }
  CTA.queue.push(...fresh); CTA.idx = 0;
  CTA.queue.sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)));
  ctaPaint();
  try { if (typeof cashInChime === 'function') cashInChime(); else if (typeof newTicketChime === 'function') newTicketChime(); } catch (e) {}
}
function ctbcAlertBoot(){
  if (CTA.timer) return;
  const tick = async () => {
    try { await loadCtbcAlerts(); }
    finally { CTA.timer = setTimeout(tick, CTA_GAP_MS); }
  };
  tick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCtbcAlerts(); });
}
