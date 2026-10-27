/* POS 打賞（「設定 → 打賞」，網址 /pos/tips）：
 *  1) 開關、表演者名稱、快捷金額、單筆上限（客人在桌邊點餐頁自填金額＋選音效，金額記在這桌帳上）
 *  2) 期間統計：已收（已結帳）／已支付給表演者／未付餘額；另列還掛在桌上未結帳的打賞
 *  3) 支付給表演者：要店長識別碼；現金從錢櫃付會同時記一筆錢櫃臨時支出
 *  4) 全店每 5 秒輪詢：客人送出的打賞先在右上角「待確認」（響鈴），店員按「確認」才掛帳；確認後只有播放裝置那台播音效，各台跳通知
 * 依賴 pos.html 的 esc/api/toast/DATA/num/NT、pos-songs.js 的 songSfx/SONGS/isSongPlayer、pos-settings.js 的 askManagerPin。 */
const TIP_POLL_MS = 5000;
let TIPS = { data: null, from: '', to: '', busy: false, err: '' };
let TIP_EV = { seen: null, timer: null };
function tabTips(){ return '<div class="a-sec" id="tips-body"></div>'; }
function tipDay(off){ const d = new Date(Date.now() - 3 * 3600e3 + 8 * 3600e3 + off * 86400e3); return d.toISOString().slice(0, 10); }
async function loadTips(){
  const host = document.getElementById('tips-body'); if (!host) return;
  if (!TIPS.from) { TIPS.to = tipDay(0); TIPS.from = tipDay(-6); }
  if (!TIPS.data) host.innerHTML = '<div class="ops-head"><h2>打賞</h2></div><p class="hint">載入中…</p>';
  try { TIPS.data = await api('/admin/orders/tips?from=' + TIPS.from + '&to=' + TIPS.to); TIPS.err = ''; } catch (e) { TIPS.err = e.message; }
  paintTips();
}
function tipTime(iso){ try { return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function paintTips(){
  const host = document.getElementById('tips-body'); if (!host) return;
  if (TIPS.err && !TIPS.data) { host.innerHTML = `<div class="ops-head"><h2>打賞</h2></div><p class="a-empty">載入失敗：${esc(TIPS.err)}</p>`; return; }
  const d = TIPS.data, s = d.settings, snd = Object.fromEntries((d.sounds || []).map(x => [x.id, x.zh]));
  const perf = d.by_performer || [];
  const owe = perf.filter(r => r.unpaid > 0);
  const firstOwe = owe[0];
  host.innerHTML = `<div class="ops-head"><h2>打賞</h2><button type="button" class="btn btn--ghost btn-sm" data-tip-back>‹ 設定</button></div>
    <div class="set-sec"><h3>客人打賞</h3>
      <label class="song-switch"><input type="checkbox" data-tip-enabled ${s.enabled ? 'checked' : ''}><span><b>開放客人打賞</b><small>${s.enabled ? '已開放：客人在桌邊點餐頁自填金額、選音效送出，店員在 POS 右上角按「確認」後才記在這桌帳上，結帳一起收。打賞是代收轉付，不計營收、不開發票。' : '目前關閉：客人點餐頁不會出現「打賞」。'}</small></span></label>
      <form class="song-set tip-set" data-tip-set>
        <label>表演者（顯示給客人）<input name="performer" maxlength="30" autocomplete="off" value="${esc(s.performer)}" placeholder="例：今晚駐唱 小安"></label>
        <label>快捷金額（逗號分隔）<input name="presets" maxlength="40" inputmode="numeric" autocomplete="off" value="${esc(s.presets.join(', '))}"></label>
        <label>單筆上限（NT$）<input type="number" name="max" min="1" max="10000" step="1" inputmode="numeric" value="${esc(s.max)}"></label>
        <button type="submit" class="btn btn--solid">儲存</button>
      </form>
      <p class="hint">音效只從播放裝置那台平板出聲（設定 → 點歌 →「在這台播放」）；沒指定時不會響，各台只跳通知。換表演者時改名字，統計會依名字分開算。</p>
    </div>
    <div class="set-sec"><h3>統計與支付</h3>
      <form class="tip-range" data-tip-range><label>從<input type="date" name="from" value="${esc(TIPS.from)}"></label><label>到<input type="date" name="to" value="${esc(TIPS.to)}"></label><button type="submit" class="btn btn--ghost btn-sm">查詢</button></form>
      <div class="tip-kpis">
        <div><small>期間已收（已結帳）</small><b>${NT(d.total)}</b><small>${num(d.count)} 筆</small></div>
        <div><small>期間已支付表演者</small><b>${NT(d.paid)}</b></div>
        <div class="${d.unpaid > 0 ? 'is-owe' : ''}"><small>目前未付餘額（全部期間）</small><b>${NT(d.unpaid)}</b></div>
        ${d.pending_unpaid_bills ? `<div><small>還掛在桌上未結帳</small><b>${NT(d.pending_unpaid_bills)}</b><small>結帳後才算已收</small></div>` : ''}
      </div>
      ${perf.length ? `<table class="a-tbl tip-tbl"><thead><tr><th>表演者</th><th>期間已收</th><th>期間已付</th><th>未付餘額</th><th></th></tr></thead><tbody>${perf.map(r => `<tr><td>${esc(r.performer)}</td><td>${NT(r.amount)}<small>（${num(r.count)} 筆）</small></td><td>${NT(r.paid)}</td><td><b>${NT(r.unpaid)}</b></td><td>${r.unpaid > 0 ? `<button type="button" class="btn btn--solid btn-sm" data-tip-pay="${esc(r.performer)}" data-amt="${esc(r.unpaid)}">支付</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="a-empty">這段期間沒有打賞。</p>'}
      <form class="tip-pay" data-tip-payform id="tip-payform">
        <h4>登記支付給表演者</h4>
        <label>表演者<input name="performer" maxlength="30" autocomplete="off" required value="${esc(firstOwe ? firstOwe.performer : s.performer)}"></label>
        <label>金額（NT$）<input type="number" name="amount" min="1" step="1" inputmode="numeric" required value="${firstOwe ? esc(firstOwe.unpaid) : ''}"></label>
        <label>支付方式<select name="method">${Object.entries(d.pay_methods || {}).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select></label>
        <label>備註<input name="note" maxlength="80" autocomplete="off" placeholder="例：10/31 萬聖節場"></label>
        <button type="submit" class="btn btn--solid" ${TIPS.busy ? 'disabled' : ''}>登記支付</button>
        <p class="hint">${DATA && DATA.super ? '' : '需要店長識別碼。'}選「現金（錢櫃）」會同時在目前開著的帳本記一筆臨時支出，關帳點鈔才對得起來。</p>
      </form>
      <details class="song-hist"><summary>打賞明細（${num((d.tips || []).length)} 筆）</summary>${(d.tips || []).length ? `<table class="a-tbl"><thead><tr><th>時間</th><th>桌</th><th>客人</th><th>表演者</th><th>音效</th><th>金額</th></tr></thead><tbody>${d.tips.map(t => `<tr><td>${esc(tipTime(t.paid_at))}</td><td>${esc(t.table)}</td><td>${esc(t.by)}</td><td>${esc(t.performer || '（未指定）')}</td><td>${esc(snd[t.sfx] || '')}</td><td>${NT(t.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="a-empty">沒有資料。</p>'}</details>
      <details class="song-hist"><summary>支付紀錄（${num((d.payouts || []).length)} 筆）</summary>${(d.payouts || []).length ? `<table class="a-tbl"><thead><tr><th>時間</th><th>表演者</th><th>方式</th><th>金額</th><th>經手</th><th>備註</th></tr></thead><tbody>${d.payouts.map(p => `<tr><td>${esc(tipTime(p.at))}</td><td>${esc(p.performer)}</td><td>${esc((d.pay_methods || {})[p.method] || p.method)}</td><td>${NT(p.amount)}</td><td>${esc(p.by)}</td><td>${esc(p.note)}</td></tr>`).join('')}</tbody></table>` : '<p class="a-empty">沒有資料。</p>'}</details>
    </div>`;
}
async function tipSaveSettings(body, msg){
  try { const r = await api('/admin/orders/tips/settings', { method: 'POST', body }); TIPS.data.settings = r.settings; if (msg) toast(msg); } catch (e) { toast(e.message); }
  paintTips();
}
let TIP_PIN = '';
async function tipPayout(body){
  const isSuper = !!(DATA && DATA.super); let msg = '支付給表演者需要店長識別碼';
  for (let i = 0; i < 3; i++) {
    if (!isSuper && !TIP_PIN) { const p = await askManagerPin(msg); if (!p) return null; TIP_PIN = p; }
    try { return await api('/admin/orders/tips/payouts', { method: 'POST', body, headers: isSuper ? {} : { 'X-Manager-Pin': TIP_PIN } }); }
    catch (e) { if (e.status === 403 && !isSuper) { TIP_PIN = ''; msg = e.message; continue; } throw e; }
  }
  return null;
}
document.addEventListener('click', e => {
  if (!e.target.closest('#tips-body')) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.matches('[data-tip-back]')) return go('settings');
  if (b.dataset.tipPay) { const f = document.getElementById('tip-payform'); f.performer.value = b.dataset.tipPay; f.amount.value = b.dataset.amt; f.scrollIntoView({ block: 'center' }); f.amount.focus(); }
});
document.addEventListener('change', e => {
  if (!e.target.closest('#tips-body')) return;
  if (e.target.matches('[data-tip-enabled]')) tipSaveSettings({ enabled: e.target.checked }, e.target.checked ? '已開放客人打賞' : '已關閉打賞');
});
document.addEventListener('submit', async e => {
  const f = e.target; if (!f.closest('#tips-body')) return; e.preventDefault();
  if (f.matches('[data-tip-set]')) return tipSaveSettings({ performer: f.performer.value, presets: f.presets.value, max: f.max.value }, '打賞設定已儲存');
  if (f.matches('[data-tip-range]')) { if (f.from.value && f.to.value && f.from.value <= f.to.value) { TIPS.from = f.from.value; TIPS.to = f.to.value; } else return toast('日期區間不正確'); return loadTips(); }
  if (f.matches('[data-tip-payform]')) {
    if (TIPS.busy) return;
    const body = { performer: f.performer.value.trim(), amount: Number(f.amount.value), method: f.method.value, note: f.note.value.trim() };
    if (!body.performer || !(body.amount > 0)) return toast('請填表演者與金額');
    if (!await posConfirm(`支付 ${NT(body.amount)} 給「${body.performer}」（${(TIPS.data.pay_methods || {})[body.method] || body.method}）？`, { ok: '確定支付' })) return;
    TIPS.busy = true; paintTips();
    try { const r = await tipPayout(body); if (r) toast('已登記支付' + (r.payout.cash_move ? '，並記入錢櫃臨時支出' : '')); } catch (err) { toast(err.message); }
    TIPS.busy = false; return loadTips();
  }
});

/* ---- 打賞：客人送出 → 這裡跳「待確認」卡片（響鈴）→ 店員確認才掛帳、播放裝置播音效；不收就結案 ---- */
let TIP_REQ = { list: [], seen: null, busy: {} };
function tipChime(){
  const c = typeof posAudio === 'function' ? posAudio() : null; if (!c) return;
  [0, .18].forEach((d, i) => { try {
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + d;
    o.type = 'sine'; o.frequency.value = i ? 1320 : 990; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .25);
    o.start(t); o.stop(t + .27);
  } catch (e) {} });
}
function tipReqBox(){
  let box = document.getElementById('tip-req');
  if (!box) {
    box = document.createElement('div'); box.id = 'tip-req'; box.setAttribute('role', 'alert'); box.setAttribute('aria-live', 'assertive');
    document.body.appendChild(box);
    box.addEventListener('click', e => { const b = e.target.closest('[data-tip-act]'); if (b) tipDecide(b.dataset.id, b.dataset.tipAct); });
  }
  return box;
}
function paintTipRequests(){
  const box = tipReqBox();
  if (!TIP_REQ.list.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<div class="tip-req-head">${typeof POSIcon === 'function' ? POSIcon('sparkles') : ''}打賞待確認 <b>${TIP_REQ.list.length}</b></div>` + TIP_REQ.list.map(r => {
    const busy = TIP_REQ.busy[r.id] ? ' disabled' : '';
    return `<div class="tip-req-card"><span class="tip-req-table">${esc(r.table || '—')}</span><span class="tip-req-main"><b>${NT(r.amount)}</b><small>${r.by ? esc(r.by) + '・' : ''}${esc(TIP_SFX_LABEL[r.sfx] || '')}${r.performer ? '・給 ' + esc(r.performer) : ''}</small></span><span class="tip-req-acts"><button type="button" class="is-ok" data-tip-act="confirm" data-id="${esc(r.id)}"${busy}>確認</button><button type="button" data-tip-act="reject" data-id="${esc(r.id)}"${busy}>不收</button></span></div>`;
  }).join('');
}
async function tipDecide(id, act){
  if (TIP_REQ.busy[id]) return;
  const r = TIP_REQ.list.find(x => x.id === id);
  if (act === 'reject' && !await posConfirm(`不收桌 ${r ? r.table : ''} 的打賞 ${r ? NT(r.amount) : ''}？`, { ok: '不收', danger: true })) return;
  TIP_REQ.busy[id] = true; paintTipRequests();
  try { await api('/admin/orders/tips/' + encodeURIComponent(id) + '/' + act, { method: 'POST', body: {} }); TIP_REQ.list = TIP_REQ.list.filter(x => x.id !== id); toast(act === 'confirm' ? '已確認，打賞記在這桌帳上' : '已不收'); }
  catch (e) { toast(e.message); }
  delete TIP_REQ.busy[id]; paintTipRequests(); tipEventsTick();
}
/* ---- 已確認的打賞：播音效（只有播放裝置那台）＋各台跳通知 ---- */

function tipPop(ev){
  let box = document.getElementById('tip-pop');
  if (!box) { box = document.createElement('div'); box.id = 'tip-pop'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'tip-pop-card';
  el.innerHTML = `${typeof POSIcon === 'function' ? POSIcon('sparkles') : ''}<span><b>桌 ${esc(ev.table || '—')}${ev.by ? '・' + esc(ev.by) : ''} 打賞 ${NT(ev.amount)}</b><small>${ev.performer ? '給 ' + esc(ev.performer) + '・' : ''}${esc(ev.sfx_label || '')}</small></span>`;
  box.appendChild(el); setTimeout(() => el.remove(), 8000);
}
function tipShouldPlay(){
  // 只有設定成播放裝置（點歌「在這台播放」）的那台出聲；沒指定就都不響，只跳通知
  return typeof isSongPlayer === 'function' && isSongPlayer();
}
const TIP_SFX_LABEL = { applause: '掌聲', 'applause-big': '熱烈掌聲', cheer: '歡呼', 'cheer-scream': '尖叫歡呼', wow: '哇～', drumroll: '鼓聲', 'party-horn': '派對喇叭', kiss: '親親', laugh: '笑聲', rimshot: '冷笑話鼓' };
async function tipEventsTick(){
  if (!DATA || document.hidden) return;
  let d; try { d = await api('/admin/orders/tips/events'); } catch (e) { return; }
  TIP_REQ.list = d.pending || [];
  const reqIds = new Set(TIP_REQ.list.map(r => r.id));
  if (TIP_REQ.seen && TIP_REQ.list.some(r => !TIP_REQ.seen.has(r.id))) tipChime();
  TIP_REQ.seen = reqIds; paintTipRequests();
  const list = d.events || [];
  if (TIP_EV.seen) {
    const fresh = list.filter(ev => !TIP_EV.seen.has(ev.id));
    fresh.forEach((ev, i) => setTimeout(() => {
      tipPop({ ...ev, sfx_label: TIP_SFX_LABEL[ev.sfx] || '' });
      if (tipShouldPlay() && typeof songSfx === 'function') songSfx(ev.sfx);
    }, i * 3000));
    if (fresh.length && TAB === 'tips') loadTips();
  }
  TIP_EV.seen = new Set(list.map(ev => ev.id));   // 第一次載入只記下已存在的，不重播
}
function tipBoot(){
  if (TIP_EV.timer) return;
  const tick = async () => { try { await tipEventsTick(); } finally { TIP_EV.timer = setTimeout(tick, TIP_POLL_MS); } };
  tick();
}
