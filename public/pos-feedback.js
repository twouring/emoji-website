/* POS 意見回饋（「設定 → 回饋」，網址 /pos/feedback）：客人在桌邊點餐頁送出的意見，依日期查看，可篩類別、匯出 CSV。
 * 唯讀，不響鈴。依賴 pos.html 的 esc/api/toast/go/downloadCSV。 */
let FB = { data: null, from: '', to: '', kind: '', err: '' };
function tabFeedback(){ return '<div class="a-sec" id="fb-body"></div>'; }
function fbDay(off){ return new Date(Date.now() - 3 * 3600e3 + 8 * 3600e3 + off * 86400e3).toISOString().slice(0, 10); }
function fbTime(iso){ try { return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
async function loadFeedback(){
  const host = document.getElementById('fb-body'); if (!host) return;
  if (!FB.from) { FB.to = fbDay(0); FB.from = fbDay(-29); }
  if (!FB.data) host.innerHTML = '<div class="ops-head"><h2>意見回饋</h2></div><p class="hint">載入中…</p>';
  try { FB.data = await api('/admin/orders/feedback?from=' + FB.from + '&to=' + FB.to); FB.err = ''; } catch (e) { FB.err = e.message; }
  paintFeedback();
}
function fbRows(){ return (FB.data.feedback || []).filter(r => !FB.kind || r.kind === FB.kind); }
function paintFeedback(){
  const host = document.getElementById('fb-body'); if (!host) return;
  if (FB.err && !FB.data) { host.innerHTML = `<div class="ops-head"><h2>意見回饋</h2></div><p class="a-empty">載入失敗：${esc(FB.err)}</p>`; return; }
  const d = FB.data, K = d.kinds || {}, rows = fbRows();
  const counts = {}; (d.feedback || []).forEach(r => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  const lang = { zh: '中', en: 'EN', ja: '日', ko: '韓' };
  host.innerHTML = `<div class="ops-head"><h2>意見回饋</h2><button type="button" class="btn btn--ghost btn-sm" data-fb-back>‹ 設定</button></div>
    <div class="set-sec">
      <form class="tip-range" data-fb-range><label>從<input type="date" name="from" value="${esc(FB.from)}"></label><label>到<input type="date" name="to" value="${esc(FB.to)}"></label>
        <label>類別<select name="kind"><option value="">全部（${d.count}）</option>${Object.entries(K).map(([k, v]) => `<option value="${esc(k)}" ${FB.kind === k ? 'selected' : ''}>${esc(v.zh)}（${counts[k] || 0}）</option>`).join('')}</select></label>
        <button type="submit" class="btn btn--ghost btn-sm">查詢</button>${rows.length ? '<button type="button" class="btn btn--ghost btn-sm" data-fb-csv>匯出 CSV</button>' : ''}</form>
      <div class="tip-kpis"><div><small>期間回饋</small><b>${d.count}</b><small>筆</small></div><div><small>平均滿意度</small><b>${d.avg_rating == null ? '—' : d.avg_rating + ' / 5'}</b></div></div>
      ${rows.length ? `<table class="a-tbl fb-tbl"><thead><tr><th>時間</th><th>桌</th><th>類別</th><th>滿意度</th><th>內容</th><th>稱呼</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(fbTime(r.created_at))}</td><td>${esc(r.table_no)}</td><td>${esc((K[r.kind] || {}).zh || r.kind)}</td><td>${r.rating ? '★'.repeat(r.rating) : '—'}</td><td class="fb-text">${esc(r.text)}${r.lang && r.lang !== 'zh' ? ` <small>（${esc(lang[r.lang] || r.lang)}）</small>` : ''}</td><td>${esc(r.name || '—')}</td></tr>`).join('')}</tbody></table>` : '<p class="a-empty">這段期間沒有回饋。</p>'}
    </div>`;
}
document.addEventListener('click', e => {
  if (!e.target.closest('#fb-body')) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.matches('[data-fb-back]')) return go('settings');
  if (b.matches('[data-fb-csv]')) { const K = FB.data.kinds || {}; downloadCSV(`意見回饋_${FB.from}_${FB.to}.csv`, [['時間', '桌', '類別', '滿意度', '內容', '稱呼', '語言'], ...fbRows().map(r => [fbTime(r.created_at), r.table_no, (K[r.kind] || {}).zh || r.kind, r.rating || '', r.text, r.name, r.lang])]); }
});
document.addEventListener('submit', e => {
  const f = e.target; if (!f.matches('[data-fb-range]')) return; e.preventDefault();
  if (!(f.from.value && f.to.value && f.from.value <= f.to.value)) return toast('日期區間不正確');
  FB.from = f.from.value; FB.to = f.to.value; FB.kind = f.kind.value; loadFeedback();
});
