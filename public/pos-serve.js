/* POS「出餐」分頁（KK 11/9）：外場人員點桌出餐。
   版面沿用「結帳」頁的桌位平面圖／格子（同一份 table_layout），有待出品項的桌亮起並顯示「待出 N 道」＋最久等幾分；
   點桌開出這桌待出清單，一道一道按「出餐」（POST …/tickets/:ticket/serve {lines:[line]}），或「這桌全部出餐」。
   先結後做（外帶、App 商店）已結帳未出的單按「出餐並通知」（POST /admin/orders/:id/status ready）。
   資料：GET /admin/orders（tickets＝已送單未出完、orders＝已結帳出餐單），不新增 API。 */
var SERVE_TIMER = null, SERVE_TABLE = '', SERVE_DATA = null, SERVE_BUSY = false;
function tabServe(){ return '<div id="serve-body"></div>'; }

// 每桌待出：送單裡還沒出的行＋已結帳還沒出餐的單
function serveByTable(d){
  const m = new Map(), get = t => { if (!m.has(t)) m.set(t, { table:t, lines:[], orders:[], since:'' }); return m.get(t); };
  for (const t of d.tickets || []) for (const l of orderLines(t)) {
    if (l.served_at || l.cancelled || l.song || l.tip) continue;
    const e = get(t.table_no); e.lines.push({ ...l, ticket:t.ticket, session_id:t.session_id, placed_at:l.placed_at || t.placed_at });
    const at = l.placed_at || t.placed_at; if (at && (!e.since || at < e.since)) e.since = at;
  }
  for (const o of d.orders || []) if (o.status === 'paid') { const e = get(o.table_no); e.orders.push(o); if (o.paid_at && (!e.since || o.paid_at < e.since)) e.since = o.paid_at; }
  for (const e of m.values()) e.count = e.lines.reduce((a, l) => a + (Number(l.qty) || 1), 0) + e.orders.reduce((a, o) => a + orderLines(o).filter(l => !l.cancelled && !l.song && !l.tip).reduce((b, l) => b + (Number(l.qty) || 1), 0), 0);
  return m;
}
const serveAge = at => { const m = (Date.now() - new Date(at)) / 60000; return m >= 15 ? ' serve-late' : m >= 8 ? ' serve-warn' : ''; };

async function loadServe(){
  const host = document.getElementById('serve-body'); if (!host) return;
  clearTimeout(SERVE_TIMER);
  if (!host.dataset.init) { host.dataset.init = '1'; host.innerHTML = '<div class="a-sec"><h2>出餐</h2><p class="hint">載入中…</p></div>'; }
  const again = () => { SERVE_TIMER = setTimeout(() => { if (document.getElementById('serve-body') && TAB === 'serve') loadServe(); }, globalThis.POS_LIVE_OK ? 60000 : 10000); };
  let d; try { d = await api('/admin/orders' + scopeQuery()); } catch (e) { if (host.querySelector('.serve-board')) toast('更新失敗：' + e.message); else host.innerHTML = `<div class="a-sec"><h2>出餐</h2><p class="a-empty">載入失敗：${esc(e.message)}</p></div>`; again(); return; }
  SERVE_DATA = d;
  // 資料沒變就不重繪（避免正要按的鈕被換掉）；等候分鐘每分鐘更新一次
  const sig = JSON.stringify([(d.tickets || []).map(t => [t.ticket, t.items.map(l => [l.line, l.qty, l.served_at || '', l.cancelled ? 1 : 0])]), (d.orders || []).map(o => [o.id, o.status]), d.sessions.map(s => [s.table, s.party_size]), d.table_layout, SERVE_TABLE, Math.floor(Date.now() / 60000)]);
  if (!SERVE_BUSY && (host.dataset.sig !== sig || !host.querySelector('.serve-board'))) { host.dataset.sig = sig; paintServe(); }
  again();
}

function paintServe(){
  const host = document.getElementById('serve-body'), d = SERVE_DATA; if (!host || !d) return;
  const pend = serveByTable(d);
  const open = new Map(d.sessions.filter(s => !s.takeout).map(s => [s.table, s]));
  const TBL = posTables(d);
  const names = [...TBL, ...[...new Set([...open.keys(), ...pend.keys()])].filter(t => !TBL.includes(t) && !isTakeoutNo(t))];
  const layoutPos = (d.table_layout && !Array.isArray(d.table_layout) && d.table_layout.pos) || {};
  const legacy = Array.isArray(d.table_layout) ? d.table_layout : (d.table_layout?.order || []);
  names.sort((a, b) => { const r = t => legacy.includes(t) ? legacy.indexOf(t) : 1e6; return r(a) - r(b); });
  const placed = names.filter(t => Array.isArray(layoutPos[t])).sort((a, b) => (layoutPos[a][1] - layoutPos[b][1]) || (layoutPos[a][0] - layoutPos[b][0]));
  if (SERVE_TABLE && !pend.has(SERVE_TABLE)) SERVE_TABLE = '';
  const card = t => {
    const p = pend.get(t), s = open.get(t), pl = layoutPos[t] ? ' is-placed' : '';
    if (!p) return `<div class="pos-table serve-idle${pl}${s ? '' : ' empty'}" aria-label="${esc(t)} 沒有待出餐點"><b>${esc(t)}</b><span class="serve-none">${s ? '沒有待出' : '空桌'}</span></div>`;
    return `<button type="button" class="pos-table pos-ticket serve-has${pl}${serveAge(p.since)}${t === SERVE_TABLE ? ' on' : ''}" data-serve-table="${esc(t)}" aria-label="${isTakeoutNo(t) ? '外帶 ' : ''}${esc(t)}，待出 ${p.count} 份"><span class="tk-head">${isTakeoutNo(t) ? `<b>${esc(t)}</b>` : ''}<span class="pill pill-wait">待出 ${p.count} 份</span></span><span class="tk-time serve-age">${p.since ? '等 ' + elapsedShort(p.since) : ''}</span></button>`;
  };
  const slot = t => `<div class="pos-slot${layoutPos[t] ? ' is-placed' : ''}" data-slot="${esc(t)}"><span class="pos-slot-name">${esc(t)}</span>${card(t)}</div>`;
  const floor = placed.length ? `<div class="pos-floor">${placed.map(t => `<div class="pos-floor-slot${layoutPos[t][2] ? ' is-sized' : ''}" style="left:${layoutPos[t][0]}%;top:${layoutPos[t][1]}%${layoutPos[t][2] ? `;width:${layoutPos[t][2]}%;min-height:${layoutPos[t][3]}%` : ''}">${slot(t)}</div>`).join('')}</div>` : '';
  const takeouts = [...pend.keys()].filter(isTakeoutNo).sort();
  const total = [...pend.values()].reduce((a, p) => a + p.count, 0);
  host.innerHTML = `<div class="pos-layout serve-board"><div class="a-sec pos-tables"><div class="pos-tables-row"><div class="pos-tables-main"><div class="ops-head"><h2>出餐${total ? ` <span class="kds-count">${total}</span>` : ''}</h2>${opsHelp('桌位與「結帳」頁同一張平面圖。亮起的桌＝有已送單、還沒送到桌上的餐點，數字是待出幾份，等候 8 分轉黃、15 分轉紅。點桌後一道一道按「出餐」，客人手機會同步顯示已出餐。')}</div><div class="pos-board">${floor}<div class="pos-grid">${names.map(slot).join('')}</div></div></div></div><div class="pos-foot"><aside class="pos-takeouts" aria-label="外帶待出"><div class="ops-head"><h2>外帶${takeouts.length ? ` <span class="kds-count">${takeouts.length}</span>` : ''}</h2></div><div class="pos-takeout-list">${takeouts.length ? takeouts.map(card).join('') : '<p class="hint">沒有外帶待出</p>'}</div></aside></div></div></div>${SERVE_TABLE ? serveSheetHtml(pend.get(SERVE_TABLE)) : ''}`;
  host.querySelectorAll('[data-serve-table]').forEach(b => b.onclick = () => { SERVE_TABLE = b.dataset.serveTable; paintServe(); });
  bindServeSheet(host, pend.get(SERVE_TABLE));
}

function serveSheetHtml(p){
  if (!p) return '';
  const specHtml = l => { const parts = specParts(l); return parts.length ? `<div class="ops-specs">${parts.map(x => `<span class="ops-spec ops-spec-${x.kind} ops-spec-${x.tone}">${x.kind === 'custom' ? '※ ' : ''}${esc(x.text)}</span>`).join('')}</div>` : ''; };
  const row = (l, btn) => `<li class="serve-line${serveAge(l.placed_at || p.since)}"><span class="ops-cat">${esc(catLabel(l.cat))}</span><div class="serve-line-body"><div class="ops-line-top"><b class="ops-name">${esc(l.zh)}</b><b class="ops-qty${l.qty > 1 ? ' many' : ''}">×${l.qty}</b>${l.comp_reason ? '<span class="hint hint--tight">贈送</span>' : ''}</div>${partsHtml(l)}${specHtml(l)}<span class="hint hint--tight serve-wait">等 ${elapsedShort(l.placed_at || p.since)} · ${esc(clockText(l.placed_at || p.since))} 送單${l.by && l.by !== '櫃檯' ? ' · ' + esc(l.by) : ''}</span></div>${btn}</li>`;
  const lines = p.lines.sort((a, b) => (a.placed_at || '') < (b.placed_at || '') ? -1 : 1).map(l => row(l, `<button type="button" class="btn btn--solid serve-btn" data-serve-line="${esc(l.line)}" data-serve-ticket="${esc(l.ticket)}" data-session="${esc(l.session_id)}">出餐</button>`)).join('');
  const orders = p.orders.map(o => `<li class="serve-order"><div class="serve-line-body"><span class="pill pill-ok">已結帳</span> <b>${orderLines(o).filter(l => !l.cancelled && !l.song && !l.tip).map(l => esc(l.zh) + ' ×' + l.qty).join('、')}</b><br><span class="hint hint--tight">${esc(clockText(o.paid_at))} 結帳 · 先結後做</span></div><button type="button" class="btn btn--solid serve-btn" data-serve-order="${esc(o.id)}">出餐並通知</button></li>`).join('');
  return `<div class="serve-sheet-bg" data-serve-close></div><section class="serve-sheet" role="dialog" aria-modal="true" aria-label="${esc(p.table)} 待出餐點"><div class="serve-sheet-head"><h2>${isTakeoutNo(p.table) ? '外帶' : '桌號'} ${esc(p.table)}</h2><span class="hint">待出 ${p.count} 份</span><button type="button" class="btn btn--ghost serve-close" data-serve-close aria-label="關閉">關閉</button></div><ul class="serve-lines">${lines}${orders}</ul>${p.lines.length > 1 ? `<div class="serve-sheet-foot"><button type="button" class="btn btn--ghost serve-all" data-serve-all>這桌全部出餐（${p.lines.reduce((a, l) => a + (Number(l.qty) || 1), 0)} 份）</button></div>` : ''}</section>`;
}

function bindServeSheet(host, p){
  if (!p) return;
  const close = () => { SERVE_TABLE = ''; paintServe(); };
  host.querySelectorAll('[data-serve-close]').forEach(b => b.onclick = close);
  const reload = async () => { SERVE_BUSY = false; host.dataset.sig = ''; await loadServe(); };
  const run = async (b, fn, msg) => { if (SERVE_BUSY) return; SERVE_BUSY = true; b.disabled = true; try { await fn(); toast(msg); } catch (e) { toast(e.message); } await reload(); };
  host.querySelectorAll('[data-serve-line]').forEach(b => b.onclick = () => run(b, () => api('/admin/orders/sessions/' + b.dataset.session + '/tickets/' + b.dataset.serveTicket + '/serve', { method:'POST', body:{ lines:[b.dataset.serveLine] } }), '已出餐'));
  host.querySelectorAll('[data-serve-order]').forEach(b => b.onclick = () => run(b, () => api('/admin/orders/' + b.dataset.serveOrder + '/status', { method:'POST', body:{ status:'ready' } }), '已出餐，已通知客人取餐'));
  // 全部出餐：依送單分組，一張送單一次呼叫（只標這桌目前待出的行）
  host.querySelectorAll('[data-serve-all]').forEach(b => b.onclick = () => run(b, async () => {
    const by = new Map(); for (const l of p.lines) { const k = l.session_id + '|' + l.ticket; if (!by.has(k)) by.set(k, []); by.get(k).push(l.line); }
    for (const [k, lines] of by) { const [sid, tk] = k.split('|'); await api('/admin/orders/sessions/' + sid + '/tickets/' + tk + '/serve', { method:'POST', body:{ lines } }); }
  }, '這桌全部出餐'));
}
