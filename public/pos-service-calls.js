/* POS 呼叫服務通知：客人在桌邊點餐頁按「呼叫服務」→ 這裡每 5 秒輪詢 → 有新呼叫就響鈴、右上角常駐卡片
 * 「桌號＋項目＋已等幾分鐘＋處理」。不管在哪個分頁都看得到；等超過 3 分鐘轉紅。店員按「處理」結案，其他台下一輪就消失。
 * 依賴 pos.html 的 esc/api/toast/DATA。動態文字一律經 esc() 再進 innerHTML。 */
const SVC_POLL_MS = 5000;
const SVC_LATE_MS = 3 * 60e3;
let SVC = { list: [], seen: null, timer: null, busy: {} };

function svcChime(){
  const c = typeof posAudio === 'function' ? posAudio() : null; if (!c) return;
  [0, .22, .44].forEach((d, i) => { try {
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + d;
    o.type = 'triangle'; o.frequency.value = i === 1 ? 1175 : 880; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .2);
    o.start(t); o.stop(t + .22);
  } catch (e) {} });
}
function svcAgo(iso){
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60e3);
  return m < 1 ? '剛剛呼叫' : '等 ' + m + ' 分鐘';
}
function svcLabel(c, kinds){ return (kinds && kinds[c.kind] && kinds[c.kind].zh) || c.kind; }
function svcBox(){
  let box = document.getElementById('svc-calls');
  if (!box) {
    box = document.createElement('div'); box.id = 'svc-calls'; box.setAttribute('role', 'alert'); box.setAttribute('aria-live', 'assertive');
    document.body.appendChild(box);
    box.addEventListener('click', e => { const b = e.target.closest('[data-svc-done]'); if (b) svcDone(b.dataset.svcDone); });
  }
  return box;
}
function paintServiceCalls(kinds){
  const box = svcBox();
  if (!SVC.list.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<div class="svc-head">${typeof POSIcon === 'function' ? POSIcon('bell') : ''}客人呼叫 <b>${SVC.list.length}</b></div>` + SVC.list.map(c => {
    const late = Date.now() - Date.parse(c.at) > SVC_LATE_MS;
    return `<div class="svc-card${late ? ' is-late' : ''}"><span class="svc-table">${esc(c.table || '—')}</span><span class="svc-main"><b>${esc(svcLabel(c, kinds))}</b>${c.note ? `<small>${esc(c.note)}</small>` : ''}<small>${c.by ? esc(c.by) + '・' : ''}${esc(svcAgo(c.at))}</small></span><button type="button" data-svc-done="${esc(c.id)}"${SVC.busy[c.id] ? ' disabled' : ''}>處理</button></div>`;
  }).join('');
}
let SVC_KINDS = null;
async function loadServiceCalls(){
  if (!DATA || document.hidden) return;
  let d; try { d = await api('/admin/orders/service-calls'); } catch (e) { return; }
  SVC_KINDS = d.kinds || SVC_KINDS; SVC.list = d.pending || [];
  const ids = new Set(SVC.list.map(c => c.id));
  // 第一次載入不響（開機時已有的呼叫只顯示）；之後出現新 id 才響
  if (SVC.seen && SVC.list.some(c => !SVC.seen.has(c.id))) svcChime();
  SVC.seen = ids;
  paintServiceCalls(SVC_KINDS);
}
async function svcDone(id){
  if (SVC.busy[id]) return; SVC.busy[id] = true; paintServiceCalls(SVC_KINDS);
  try { await api('/admin/orders/service-calls/' + encodeURIComponent(id) + '/done', { method: 'POST', body: {} }); SVC.list = SVC.list.filter(c => c.id !== id); }
  catch (e) { toast('處理失敗：' + e.message); }
  delete SVC.busy[id]; paintServiceCalls(SVC_KINDS);
}
function serviceCallBoot(){
  if (SVC.timer) return;
  const tick = async () => { try { await loadServiceCalls(); } finally { SVC.timer = setTimeout(tick, SVC_POLL_MS); } };
  tick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadServiceCalls(); });
}
// 「等 N 分鐘」每 30 秒更新一次（不打 API）
setInterval(() => { if (SVC.list.length) paintServiceCalls(SVC_KINDS); }, 30000);
