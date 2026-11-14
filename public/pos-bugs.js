/* POS 大家來找碴（「設定 → 找碴」，網址 /pos/bugs）：會員在 App 拍照回報的問題，逐筆審核（認可＝會員點數 +1，取消認可會扣回／不認可／重複），
 * 右側排行依認可件數。開幕活動現場用：每 10 秒自動更新。依賴 pos.html 的 esc/api/toast/go/downloadCSV。 */
let BG = { data: null, status: 'pending', err: '', timer: null, from: '', to: '' };
function tabBugs(){ return '<div class="a-sec" id="bg-body"></div>'; }
function bgDay(off){ return new Date(Date.now() + 8 * 3600e3 + off * 86400e3).toISOString().slice(0, 10); }
function bgTime(iso){ try { return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function bgImg(u){ return /^\//.test(u || '') ? (location.hostname.startsWith('admin.') ? location.origin.replace(/\/\/admin\./, '//www.') : '') + u : u; }
async function loadBugs(){
  const host = document.getElementById('bg-body'); if (!host) { clearInterval(BG.timer); BG.timer = null; return; }
  if (!BG.from) { BG.from = bgDay(0); BG.to = bgDay(0); }
  if (!BG.data) host.innerHTML = '<div class="ops-head"><h2>大家來找碴</h2></div><p class="hint">載入中…</p>';
  try { BG.data = await api('/admin/bug-reports?from=' + BG.from + '&to=' + BG.to); BG.err = ''; } catch (e) { BG.err = e.message; }
  paintBugs();
  if (!BG.timer) BG.timer = setInterval(() => { if (!document.getElementById('bg-body')) { clearInterval(BG.timer); BG.timer = null; return; } if (!document.querySelector('#bg-body input:focus')) loadBugs(); }, 10000);
}
function bgRows(){ return (BG.data.reports || []).filter(r => !BG.status || r.status === BG.status); }
function paintBugs(){
  const host = document.getElementById('bg-body'); if (!host) return;
  if (BG.err && !BG.data) { host.innerHTML = `<div class="ops-head"><h2>大家來找碴</h2></div><p class="a-empty">載入失敗：${esc(BG.err)}</p>`; return; }
  const d = BG.data, K = d.kinds || {}, S = d.statuses || {}, c = d.counts || {}, rows = bgRows();
  const card = r => `<div class="bg-card" data-id="${esc(r.id)}">
      <div class="bg-meta"><b>${esc(r.location)}</b><span>${esc((K[r.kind] || {}).zh || r.kind)}</span><span>${esc(r.user_name || '會員')}</span><span>${esc(bgTime(r.created_at))}</span><span class="bg-st bg-${esc(r.status)}">${esc(S[r.status] || r.status)}</span></div>
      ${r.text ? `<p class="bg-text">${esc(r.text)}</p>` : ''}
      ${(r.photos || []).length ? `<div class="bg-pics">${r.photos.map(u => `<a href="${esc(bgImg(u))}" target="_blank" rel="noopener"><img src="${esc(bgImg(u))}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
      <div class="bg-act"><input type="text" maxlength="200" placeholder="回覆（選填，會顯示在會員 App）" value="${esc(r.review_note || '')}" data-note>
        <button type="button" class="btn btn-sm" data-review="accepted">認可 +1</button><button type="button" class="btn btn--ghost btn-sm" data-review="duplicate">重複</button><button type="button" class="btn btn--ghost btn-sm" data-review="rejected">不認可</button>${r.status !== 'pending' ? '<button type="button" class="btn btn--ghost btn-sm" data-review="pending">改回待審</button>' : ''}</div>
    </div>`;
  host.innerHTML = `<div class="ops-head"><h2>大家來找碴</h2><button type="button" class="btn btn--ghost btn-sm" data-bg-back>‹ 設定</button></div>
    <div class="set-sec">
      <form class="tip-range" data-bg-range><label>從<input type="date" name="from" value="${esc(BG.from)}"></label><label>到<input type="date" name="to" value="${esc(BG.to)}"></label>
        <label>狀態<select name="status"><option value="">全部（${d.count}）</option>${Object.entries(S).map(([k, v]) => `<option value="${esc(k)}" ${BG.status === k ? 'selected' : ''}>${esc(v)}（${c[k] || 0}）</option>`).join('')}</select></label>
        <button type="submit" class="btn btn--ghost btn-sm">查詢</button>${(d.reports || []).length ? '<button type="button" class="btn btn--ghost btn-sm" data-bg-csv>匯出 CSV</button>' : ''}</form>
      <div class="bg-grid"><div>${rows.length ? rows.map(card).join('') : '<p class="a-empty">沒有符合的回報。</p>'}</div>
        <aside class="bg-board"><h3>排行（認可件數）</h3>${(d.leaderboard || []).length ? `<ol>${d.leaderboard.map(x => `<li><span>${esc(x.name || '會員')}</span><b>${x.points}</b></li>`).join('')}</ol>` : '<p class="a-empty">還沒有認可的回報。</p>'}
          <p class="hint">待審核 ${c.pending || 0}・認可 ${c.accepted || 0}・重複 ${c.duplicate || 0}・不認可 ${c.rejected || 0}</p></aside></div>
    </div>`;
}
document.addEventListener('click', async e => {
  if (!e.target.closest('#bg-body')) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.matches('[data-bg-back]')) return go('settings');
  if (b.matches('[data-bg-csv]')) { const K = BG.data.kinds || {}, S = BG.data.statuses || {}; return downloadCSV(`大家來找碴_${BG.from}_${BG.to}.csv`, [['時間', '會員', '類型', '位置', '說明', '照片', '狀態', '回覆', '審核者'], ...(BG.data.reports || []).map(r => [bgTime(r.created_at), r.user_name, (K[r.kind] || {}).zh || r.kind, r.location, r.text, (r.photos || []).map(bgImg).join(' '), S[r.status] || r.status, r.review_note, r.reviewed_by])]); }
  if (b.dataset.review) {
    const cardEl = b.closest('[data-id]'), note = cardEl.querySelector('[data-note]').value;
    b.disabled = true;
    try { const out = await api('/admin/bug-reports/' + encodeURIComponent(cardEl.dataset.id) + '/review', { method: 'POST', body: { status: b.dataset.review, note } }); toast(b.dataset.review === 'accepted' ? `已認可，${out.report.user_name || '會員'} 會員點數 +1${out.balance != null ? `（可用 ${out.balance} 點）` : ''}` : '已更新'); await loadBugs(); }
    catch (x) { toast(x.message || '更新失敗'); b.disabled = false; }
  }
});
document.addEventListener('submit', e => {
  const f = e.target; if (!f.matches('[data-bg-range]')) return; e.preventDefault();
  if (!(f.from.value && f.to.value && f.from.value <= f.to.value)) return toast('日期區間不正確');
  BG.from = f.from.value; BG.to = f.to.value; BG.status = f.status.value; loadBugs();
});
