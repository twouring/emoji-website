/* POS 空間情境（KK 11/15，server 規則在 lib/pos-space.js）：等等空間、約書旅以共享空間計時制營業。
   結帳頁左側桌況換成「入場看板」：席位（指定席號）＋入場單（E01–E99），每張卡倒數剩餘時間；
   右側仍是原本的結帳面板（收方案款＝開始計時；離場有超時再補收），面板上方加入場資訊列（延長／離場／補印）。
   宿主（pos.html＋pos-ops.js）須先定義：esc、api、toast、num、SCOPE、BRAND_LABEL、MENU_DOC、POS_DATA、POS_TABLE、posSelectTable、
   ensureOperator、OPERATOR、posConfirm、ordersBeep、ticketCanvas、starSend、canPrint、starHint、clockText、applicationTime。 */
/* XSS：本檔 innerHTML 模板內所有來自資料的字串（席號、品名、時間文字）一律經 esc()，數字經 num()/Number()；其餘是程式常數。 */
const SPACE_STATE = {
  unpaid: ['sp-unpaid', '待收款'], ready: ['sp-ready', '線上已付'], ok: ['sp-ok', '使用中'], open: ['sp-ok', '不限時'], soon: ['sp-soon', '快到時'],
  grace: ['sp-grace', '寬限中'], over: ['sp-over', '超時'], stale: ['sp-stale', '待確認離場'], left: ['sp-gone', '待補收'],
};
let SPACE_ALERTED = new Set();
function posSpaceOn(){ return !!(SCOPE && POS_DATA && POS_DATA.space_settings && POS_DATA.space_settings.mode === 'space'); }
function spaceCfg(){ return (POS_DATA && POS_DATA.space_settings) || { grace_min: 15, unit_min: 60, max_hours: 0, warn_min: 10, capacity: 0, seats: [], seat_cats: [] }; }
function spacePlans(){ return (MENU_DOC?.items || []).filter(it => it.published && it.venue === SCOPE && it.space_role === 'plan').sort((a, b) => (a.sort || 0) - (b.sort || 0)); }
function spaceOvertimeItem(cat){ const l = (MENU_DOC?.items || []).filter(it => it.published && it.venue === SCOPE && it.space_role === 'overtime'); return l.find(it => it.cat === cat) || l[0] || null; }
const spaceShortName = zh => String(zh || '').replace(/^空間使用費｜/, '').replace(/^(等等空間|貴賓室)/, '').trim() || zh;
const spaceDur = m => { m = Math.max(0, Math.round(m)); return m < 60 ? `${m} 分` : `${Math.floor(m / 60)} 時${m % 60 ? ` ${m % 60} 分` : ''}`; };
/* 依現在時間重算狀態（伺服器值會落後最多 15 秒；每 30 秒就地更新卡片文字，不重畫） */
function spaceLive(sp, now = Date.now()){
  if (!sp) return null;
  const c = spaceCfg();
  if (sp.out_at) return { state: 'left', text: `離場 ${clockText(sp.out_at)}` };
  if (!sp.in_at && sp.prepaid) return { state: 'ready', text: `${sp.member || '會員'}・掃碼入場後計時` };
  if (!sp.in_at) return { state: 'unpaid', text: '收款後開始計時' };
  if (!sp.due_at) return { state: 'open', text: `已使用 ${spaceDur((now - Date.parse(sp.in_at)) / 60000)}` };
  const left = (Date.parse(sp.due_at) - now) / 60000;
  if (left > c.warn_min) return { state: 'ok', text: `剩 ${spaceDur(left)}` };
  if (left > 0) return { state: 'soon', text: `剩 ${spaceDur(left)}` };
  if (-left <= c.grace_min) return { state: 'grace', text: `已超 ${spaceDur(-left)}・寬限內不收` };
  const units = Math.ceil((-left - c.grace_min) / c.unit_min);
  return { state: -left > c.grace_min + 120 ? 'stale' : 'over', text: `已超 ${spaceDur(-left)}・計 ${units} 單位` };
}
/* 狀態文字以「・」分段，每段不斷行（避免「已超 1 時 30／分」這種斷法） */
const spaceTextHtml = t => String(t).split('・').map(x => `<span class="sp-nw">${esc(x)}</span>`).join('<span aria-hidden="true">・</span>');
function spaceCardHtml(s){
  const sp = s.space, live = spaceLive(sp), [cls, label] = SPACE_STATE[live.state] || SPACE_STATE.ok;
  const plan = (sp.plans || []).map(p => spaceShortName(p.zh)).join('＋') || '—';
  return `<button type="button" class="sp-card ${cls}${s.table === POS_TABLE ? ' on' : ''}" data-pos-table="${esc(s.table)}" data-space-in="${esc(sp.in_at || '')}" data-space-due="${esc(sp.due_at || '')}" data-space-out="${esc(sp.out_at || '')}" aria-label="${esc(s.table)}，${esc(label)}，${esc(live.text)}">
    <span class="sp-head"><b class="sp-no">${esc(s.table)}</b><span class="pill sp-pill" data-space-label>${esc(label)}</span>${sp.headcount > 1 ? `<span class="sp-hc">${Number(sp.headcount)} 位</span>` : ''}</span>
    <span class="sp-plan">${esc(plan)}</span>
    <span class="sp-times"><span class="sp-nw">${sp.in_at ? `入 ${esc(clockText(sp.in_at))}` : '未入場'}</span>${sp.due_at ? ` <span class="sp-nw">→ <b>離 ${esc(clockText(sp.due_at))}</b></span>` : ''}</span>
    <span class="sp-left" data-space-text>${spaceTextHtml(live.text)}</span>
    ${s.unpaid_amount ? `<span class="sp-due">待收 NT$${num(s.unpaid_amount)}</span>` : ''}
  </button>`;
}
function spaceBoardHtml(d){
  const c = spaceCfg(), sum = d.space_summary || {}, sessions = (d.sessions || []).filter(s => s.space), legacy = (d.sessions || []).filter(s => !s.space);   // 切成空間前開的一般桌，照樣列出來結帳
  const bySeat = new Map(sessions.map(s => [s.table, s]));
  const seats = c.seats.map(t => bySeat.get(t) ? spaceCardHtml(bySeat.get(t)) : `<button type="button" class="sp-card sp-free" data-space-seat="${esc(t)}" aria-label="${esc(t)} 空席，點一下入場"><span class="sp-head"><b class="sp-no">${esc(t)}</b></span><span class="sp-plan">空席</span><span class="sp-left">＋ 入場</span></button>`).join('');
  const others = sessions.filter(s => !c.seats.includes(s.table)).sort((a, b) => String(a.table).localeCompare(String(b.table), 'zh-Hant', { numeric: true }));
  const inside = sum.inside ?? sessions.filter(s => !s.space.out_at).reduce((a, s) => a + (s.space.headcount || 1), 0);
  const stat = (k, v) => `<span class="sp-stat"><small>${esc(k)}</small><b>${v}</b></span>`;
  return `<div class="sp-board"><div class="ops-head"><h2>入場管理</h2><div class="sp-head-acts"><button type="button" class="btn btn--solid" id="sp-scan">掃碼進出</button><button type="button" class="btn btn--ghost" id="sp-enter">＋ 入場</button>${SCOPE === 'STAY' ? '<button type="button" class="btn btn--ghost" id="sp-members">會員</button>' : ''}</div></div>
    <div class="sp-stats" aria-label="今日統計">${stat('在場', `${num(inside)}${c.capacity ? `／${num(c.capacity)}` : ''} 人`)}${stat('今日人次', num(sum.people || 0))}${stat('平均停留', sum.avg_stay_min != null ? spaceDur(sum.avg_stay_min) : '—')}${stat('超時收入', 'NT$' + num(sum.overtime_amount || 0))}</div>
    ${c.seats.length ? `<h3 class="sp-sub">指定席位 <small>${esc(c.seat_cats.map(x => MenuLib.CAT_LABEL[x]?.zh || x).join('、'))}</small></h3><div class="sp-grid">${seats}</div>` : ''}
    <h3 class="sp-sub">入場單${others.length ? ` <span class="kds-count">${others.length}</span>` : ''}</h3>
    <div class="sp-grid">${others.map(spaceCardHtml).join('') || '<p class="hint">目前沒有入場單。會員出示 App 會員卡按「掃碼進出」；現場購買按「＋ 入場」。</p>'}</div>
    ${legacy.length ? `<h3 class="sp-sub">一般單 <small>切換情境前開的單，結清後照舊清桌</small></h3><div class="sp-grid">${legacy.map(s => `<button type="button" class="sp-card sp-unpaid${s.table === POS_TABLE ? ' on' : ''}" data-pos-table="${esc(s.table)}" aria-label="${esc(s.table)} 一般單"><span class="sp-head"><b class="sp-no">${esc(s.table)}</b><span class="pill sp-pill">一般單</span></span><span class="sp-plan">${Number(s.lines?.length || 0)} 項</span>${s.unpaid_amount ? `<span class="sp-due">待收 NT$${num(s.unpaid_amount)}</span>` : ''}</button>`).join('')}</div>` : ''}
    <p class="hint sp-rule">超時 ${Number(c.grace_min)} 分鐘內不收費，之後每 ${Number(c.unit_min)} 分鐘計 1 單位${c.max_hours ? `；連續使用上限 ${Number(c.max_hours)} 小時` : ''}。規則在「設定 → 營業情境」。</p></div>`;
}
/* 入場對話框：選方案（＋人數／席號）→ 回傳 {item_id,headcount,seat} 或 null */
function pickSpacePlan({ seat = '', title = '入場', timedOnly = false, headcount: hc0 = 1, fixedHeadcount = false } = {}){
  return new Promise(resolve => {
    const c = spaceCfg(), used = new Set((POS_DATA?.sessions || []).map(s => s.table));
    const free = c.seats.filter(t => !used.has(t) || t === seat);
    let plans = spacePlans().filter(p => !timedOnly || p.space_minutes > 0);
    if (seat) plans = plans.filter(p => c.seat_cats.includes(p.cat));
    let pick = plans[0]?.id || '', hc = hc0, st = seat;
    const ov = document.createElement('div'); ov.className = 'op-overlay'; document.body.appendChild(ov);
    const done = v => { if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(v); };
    const paint = () => {
      const it = plans.find(p => p.id === pick), needSeat = !!it && c.seat_cats.includes(it.cat) && c.seats.length > 0 && !timedOnly;
      if (needSeat) hc = 1;
      const groups = [...new Set(plans.map(p => p.cat))];
      ov.innerHTML = `<div class="op-card sp-dialog" role="dialog" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
        ${plans.length ? groups.map(g => `<h3 class="sp-sub">${esc(MenuLib.CAT_LABEL[g]?.zh || g)}</h3><div class="sp-plans">${plans.filter(p => p.cat === g).map(p => `<button type="button" class="sp-plan-opt" data-plan="${esc(p.id)}" aria-pressed="${p.id === pick}"><b>${esc(spaceShortName(p.zh))}</b><span>${p.price ? 'NT$' + num(p.price) : '0 元'}${p.space_minutes ? '' : '・不限時'}</span></button>`).join('')}</div>`).join('') : '<p class="a-empty">這個品牌還沒有計時方案，請到後台菜單新增（space_role: plan）。</p>'}
        ${needSeat ? `<h3 class="sp-sub">席位</h3><div class="sp-plans">${free.map(t => `<button type="button" class="sp-plan-opt sp-seat-opt" data-seat="${esc(t)}" aria-pressed="${t === st}"><b>${esc(t)}</b></button>`).join('') || '<p class="a-empty">席位已滿</p>'}</div>` : ''}
        ${!needSeat && !fixedHeadcount ? `<h3 class="sp-sub">人數</h3><div class="sp-hc-row"><button type="button" class="btn btn--ghost" data-hc="-1" aria-label="減少人數">−</button><b aria-live="polite">${hc} 位</b><button type="button" class="btn btn--ghost" data-hc="1" aria-label="增加人數">＋</button></div>` : ''}
        ${it ? `<p class="sp-total">合計 <b>NT$${num(it.price * hc)}</b>${it.space_minutes ? `・${spaceDur(it.space_minutes)}` : '・不限時'}</p>` : ''}
        <div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>取消</button><button type="button" class="btn btn--solid" data-ok ${it && (!needSeat || st) ? '' : 'disabled'}>${timedOnly ? '延長' : '開入場單'}</button></div></div>`;
      ov.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { pick = b.dataset.plan; paint(); });
      ov.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => { st = b.dataset.seat; paint(); });
      ov.querySelectorAll('[data-hc]').forEach(b => b.onclick = () => { hc = Math.min(20, Math.max(1, hc + Number(b.dataset.hc))); paint(); });
      ov.querySelector('[data-cancel]').onclick = () => done(null);
      const ok = ov.querySelector('[data-ok]'); if (ok) ok.onclick = () => done({ item_id: pick, headcount: hc, seat: needSeat ? st : '' });
    };
    paint();
  });
}
async function spaceEnter(seat, reload){
  const p = await pickSpacePlan({ seat, title: seat ? `${seat} 入場` : '入場' }); if (!p) return;
  return ensureOperator(async () => {
    try {
      const out = await api('/admin/orders/space/entries', { method: 'POST', body: { ...p, venue: SCOPE, operator_id: OPERATOR?.id } });
      toast(`已開入場單 ${out.table}，請收款 NT$${num(out.amount)}${out.item.price ? '' : '（0 元直接結帳即開始計時）'}`);
      await reload(); posSelectTable(out.table);
    } catch (e) { toast(e.message); }
  });
}
function bindSpaceBoard(host, reload){
  const en = host.querySelector('#sp-enter'); if (en) en.onclick = () => spaceEnter('', reload);
  const sc = host.querySelector('#sp-scan'); if (sc) sc.onclick = () => spaceScan(reload);
  const mb = host.querySelector('#sp-members'); if (mb) mb.onclick = () => spaceMembers();
  host.querySelectorAll('[data-space-seat]').forEach(b => b.onclick = () => spaceEnter(b.dataset.spaceSeat, reload));
  host.querySelectorAll('.sp-card[data-pos-table]').forEach(b => b.onclick = () => posSelectTable(b.dataset.posTable));
}
/* 結帳面板上方：入場資訊列 */
function spacePanelHtml(cur){
  if (!cur || !cur.space) return '';
  const sp = cur.space, live = spaceLive(sp), [cls, label] = SPACE_STATE[live.state] || SPACE_STATE.ok;
  const btn = (id, t, solid) => `<button type="button" class="btn ${solid ? 'btn--solid' : 'btn--ghost'} btn-sm" id="${id}">${t}</button>`;
  return `<div class="sp-bar ${cls}" role="group" aria-label="入場資訊">
    <div class="sp-bar-times"><span><small>入場</small><b>${sp.in_at ? esc(clockText(sp.in_at)) : '—'}</b></span><span class="sp-bar-due"><small>預計離場</small><b>${sp.due_at ? esc(clockText(sp.due_at)) : sp.in_at ? '不限時' : '—'}</b></span>${sp.out_at ? `<span><small>離場</small><b>${esc(clockText(sp.out_at))}</b></span>` : ''}<span><small>${esc(label)}</small><b class="sp-bar-left">${esc(live.text)}</b></span></div>
    <div class="sp-bar-acts">${sp.prepaid && !sp.in_at ? btn('sp-checkin', '入場（開始計時）', true) : ''}${sp.in_at && !sp.out_at ? btn('sp-extend', '延長') + btn('sp-leave', '離場', true) : ''}${live.state === 'stale' ? btn('sp-leave-fix', '補登離場時間') : ''}${sp.out_at ? btn('sp-resume', '取消離場') : ''}${sp.in_at ? btn('sp-reprint', '補印入場單') : ''}</div>
    ${sp.limit_hit && !sp.out_at ? `<p class="sp-bar-warn">已連續使用滿 ${spaceCfg().max_hours} 小時，請請客人離場；要繼續使用請離場後重新入場。</p>` : ''}
  </div>`;
}
function bindSpacePanel(host, cur, reload){
  if (!cur || !cur.space) return;
  const on = (id, fn) => { const b = host.querySelector('#' + id); if (b) b.onclick = async () => { if (b.disabled) return; b.disabled = true; try { await fn(); } finally { b.disabled = false; } }; };
  on('sp-extend', async () => {
    const p = await pickSpacePlan({ title: `${cur.table} 延長`, timedOnly: true, headcount: cur.space.headcount || 1, fixedHeadcount: true }); if (!p) return;
    try { await api('/admin/orders/sessions/' + cur.id + '/space/extend', { method: 'POST', body: { item_id: p.item_id } }); toast('已加上延長方案，請收款'); await reload(); } catch (e) { toast(e.message); }
  });
  const leave = async outAt => {
    let headers;
    if (outAt && DATA?.super !== true) { const pin = await askManagerPin('補登離場時間需要店長確認'); if (!pin) return; headers = { 'X-Manager-Pin': pin }; }
    try {
      const out = await api('/admin/orders/sessions/' + cur.id + '/space/leave', { method: 'POST', body: outAt ? { out_at: outAt } : {}, headers });
      if (out.closed) { toast(`${out.table} 已離場，使用 ${spaceDur(out.used_minutes)}，沒有超時`); await printSpaceExit({ ...out, lines: cur.lines }); }
      else toast(`超時 ${out.overtime_units} 小時 × ${out.headcount} 人，請補收 NT$${num(out.due)}`);
      await reload();
    } catch (e) { toast(e.message); }
  };
  on('sp-leave', async () => {
    const live = spaceLive(cur.space);
    if (!await posConfirm(`${cur.table} 離場？\n入場 ${clockText(cur.space.in_at)}，現在 ${clockText(new Date().toISOString())}（${live.text}）。\n有超時會自動加上超時費用，再照一般流程收款。`, { title: '離場', ok: '離場' })) return;
    await leave();
  });
  on('sp-leave-fix', async () => {
    const v = await pickReason({ title: `${cur.table} 實際離場時間（HH:MM，今天）`, presets: [], placeholder: '例：18:30', maxlength: 5 }); if (!v) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!m) return toast('請輸入 HH:MM');
    const d = new Date(); const tw = new Date(d.getTime() + 8 * 3600e3); tw.setUTCHours(Number(m[1]), Number(m[2]), 0, 0); let at = new Date(tw.getTime() - 8 * 3600e3);
    if (at > d) at = new Date(at.getTime() - 86400e3);
    await leave(at.toISOString());
  });
  on('sp-checkin', () => spaceCheckin({ id: cur.id, table: cur.table, member: cur.space.member, need_seat: (cur.space.plans || []).some(p => spaceCfg().seat_cats.includes(p.cat)) && spaceCfg().seats.length > 0 }, reload));
  on('sp-resume', async () => { if (!await posConfirm(`取消 ${cur.table} 的離場？離場自動加的超時費用會移除，繼續計時。`, { ok: '取消離場' })) return; try { await api('/admin/orders/sessions/' + cur.id + '/space/resume', { method: 'POST', body: {} }); toast('已取消離場，繼續計時'); await reload(); } catch (e) { toast(e.message); } });
  on('sp-reprint', () => printSpaceEntry({ in_at: cur.space.in_at, due_at: cur.space.due_at, seat: cur.table, headcount: cur.space.headcount, plan: (cur.space.plans || []).map(p => p.zh).join('、') }, { reprint: true }));
}
/* 掃碼進出（KK 11/17）：掃會員 App 會員卡 QR（KK 11/17 進出統一用會員卡）。在場內＝離場；線上已付未到（貴賓室）＝入場開始計時；等等空間有效方案＝會員入場（0 元、不限時）。
   相機或掃描槍都可以（pickMemberCard，QR 區分大小寫）。 */
async function spaceScan(reload){
  const tok = await pickMemberCard(); if (!tok) return;
  return ensureOperator(async () => {
    let out;
    try { out = await api('/admin/orders/space/scan', { method: 'POST', body: { token: tok, venue: SCOPE, operator_id: OPERATOR?.id } }); }
    catch (e) { toast(e.message); return; }
    if (out.action === 'entered') {
      toast(`${out.member} 會員入場（${out.table}）${out.activated ? '，方案已啟用' : ''}`);
      await printSpaceEntry(out.space_started); await reload(); posSelectTable(out.table); return;
    }
    if (out.action === 'checkin') return spaceCheckin(out, reload);
    if (out.action === 'inside') {
      await reload(); posSelectTable(out.table);
      const cur = (POS_DATA?.sessions || []).find(s => s.id === out.id);
      if (!cur || !cur.space) { toast(`${out.member} 在場內（${out.table}）`); return; }
      if (!await posConfirm(`${out.member}（${out.table}）離場？\n${spaceLive(cur.space).text}\n有超時會自動加上超時費用，再照一般流程收款。`, { title: '掃碼離場', ok: '離場' })) return;
      try {
        const r = await api('/admin/orders/sessions/' + out.id + '/space/leave', { method: 'POST', body: {} });
        if (r.closed) { toast(`${r.table} 已離場，使用 ${spaceDur(r.used_minutes)}，沒有超時`); await printSpaceExit({ ...r, lines: cur.lines }); }
        else toast(`超時 ${r.overtime_units} 小時 × ${r.headcount} 人，請補收 NT$${num(r.due)}`);
        await reload();
      } catch (e) { toast(e.message); }
    }
  });
}
/* 線上已付（會員 App 貴賓室）到場：靜讀室先選席號，再開始計時並印入場單 */
async function spaceCheckin(info, reload){
  let seat = '';
  if (info.need_seat) {
    const c = spaceCfg(), used = new Set((POS_DATA?.sessions || []).map(s => s.table));
    seat = await new Promise(resolve => {
      const ov = document.createElement('div'); ov.className = 'op-overlay'; document.body.appendChild(ov);
      const done = v => { ov.remove(); resolve(v); };
      ov.innerHTML = `<div class="op-card sp-dialog" role="dialog" aria-label="選席位"><h2>${esc(info.member || '')} 選席位</h2><div class="sp-plans">${c.seats.filter(t => !used.has(t)).map(t => `<button type="button" class="sp-plan-opt sp-seat-opt" data-seat="${esc(t)}"><b>${esc(t)}</b></button>`).join('') || '<p class="a-empty">席位已滿</p>'}</div><div class="op-card-actions"><button type="button" class="btn btn--ghost" data-cancel>取消</button></div></div>`;
      ov.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => done(b.dataset.seat));
      ov.querySelector('[data-cancel]').onclick = () => done('');
    });
    if (!seat) return;
  }
  try {
    const out = await api('/admin/orders/sessions/' + info.id + '/space/checkin', { method: 'POST', body: { seat } });
    toast(`${info.member || ''} 已入場（${out.table}），開始計時`);
    await printSpaceEntry(out.space_started); await reload(); posSelectTable(out.table);
  } catch (e) { toast(e.message); }
}
/* 等等空間會員清單：App 線上購買／現場開通的方案、狀態、在不在場 */
const SPACE_MEMBER_STATE = { pending: '待首次進場', active: '有效', expired: '已到期' };
const SPACE_MEMBER_SRC = { stripe: 'App 線上購買', 'pos-manual': '現場開通', yan: '點數兌換' };
async function spaceMembers(){
  let d; try { d = await api('/admin/orders/space/members'); } catch (e) { toast(e.message); return; }
  const ov = document.createElement('div'); ov.className = 'op-overlay'; document.body.appendChild(ov);
  let f = '';
  const paint = () => {
    const list = (d.members || []).filter(m => !f || (m.name + m.phone + m.plan_label).includes(f));
    ov.innerHTML = `<div class="op-card sp-dialog sp-members" role="dialog" aria-label="等等空間會員"><h2>等等空間會員 <small>${num(d.members.length)} 筆</small></h2>
      <input type="search" class="sp-mem-q" placeholder="搜尋姓名、電話末碼、方案" value="${esc(f)}" autocomplete="off">
      <div class="sp-mem-list">${list.map(m => `<div class="sp-mem"><b>${esc(m.name || '（未填姓名）')}</b><span>${esc(m.plan_label)}・${esc(SPACE_MEMBER_SRC[m.source] || m.source)}</span><span class="pill">${esc(SPACE_MEMBER_STATE[m.state] || m.state)}</span>${m.inside ? '<span class="pill sp-mem-in">在場</span>' : ''}<small>${esc(m.phone)} 購買 ${esc(applicationTime(m.purchased_at))}${m.ends_at ? `・到期 ${esc(applicationTime(m.ends_at))}` : ''}</small></div>`).join('') || '<p class="a-empty">沒有符合的會員</p>'}</div>
      <p class="hint">會員到場：按「掃碼進出」掃 App 會員卡，第一次進場會自動啟用方案。</p>
      <div class="op-card-actions"><button type="button" class="btn btn--solid" data-cancel>關閉</button></div></div>`;
    const q = ov.querySelector('.sp-mem-q'); q.oninput = () => { f = q.value.trim(); const pos = q.selectionStart; paint(); const n = ov.querySelector('.sp-mem-q'); n.focus(); n.setSelectionRange(pos, pos); };
    ov.querySelector('[data-cancel]').onclick = () => ov.remove();
  };
  paint();
}
/* 入場單／離場單（58mm 熱感紙；沒接印表機就跳提示） */
function spaceRuleText(cat){
  const c = spaceCfg(), ot = spaceOvertimeItem(cat);
  return `超時 ${c.grace_min} 分鐘內不收費，之後每 ${c.unit_min === 60 ? '小時' : c.unit_min + ' 分鐘'}${ot ? ` NT$${num(ot.price)}／人` : ' 另計'}`;
}
async function printSpaceEntry(info, { reprint = false } = {}){
  if (!canPrint()) { starHint(); return false; }
  const c = spaceCfg(), cat = (spacePlans().find(p => info.plan && String(info.plan).includes(p.zh)) || {}).cat;
  const sp = [{ kind: 'center', text: BRAND_LABEL[SCOPE] || SCOPE, size: 30, bold: true }, { kind: 'center', text: reprint ? '入場單（補印）' : '入場單', size: 22 }, 'rule',
    { kind: 'center', text: info.seat || '入場', size: 56, bold: true },
    { kind: 'wrap', text: spaceShortName(info.plan || ''), size: 24, bold: true },
    ...(info.headcount > 1 ? [{ kind: 'left', text: `${info.headcount} 位`, size: 22 }] : []), 'dash',
    { kind: 'row', left: '入場時間', right: clockText(info.in_at), size: 26 },
    { kind: 'left', text: '預計離場', size: 22 }, { kind: 'center', text: info.due_at ? clockText(info.due_at) : '不限時', size: 60, bold: true }, 'dash',
    { kind: 'wrap', text: spaceRuleText(cat), size: 20 },
    ...(c.max_hours ? [{ kind: 'wrap', text: `連續使用上限 ${c.max_hours} 小時，到時請離場，可重新入場計時。`, size: 20 }] : []),
    { kind: 'wrap', text: '離開時請到櫃檯按離場，超時費用離場時結算。', size: 20 },
    { kind: 'center', text: applicationTime(new Date().toISOString()), size: 18 }];
  const ok = await starSend({ canvas: ticketCanvas(sp), label: '入場單' });
  toast(ok ? '已印出入場單' : '入場單未印出，請按「補印入場單」');
  return ok;
}
async function printSpaceExit(out){
  if (!canPrint()) return false;
  const lines = (out.lines || []).filter(l => !l.cancelled && !l.credit_of);
  const sp = [{ kind: 'center', text: BRAND_LABEL[SCOPE] || SCOPE, size: 30, bold: true }, { kind: 'center', text: '離場單', size: 22 }, 'rule',
    { kind: 'center', text: out.table || '', size: 44, bold: true },
    { kind: 'row', left: '入場', right: clockText(out.in_at), size: 24 }, { kind: 'row', left: '離場', right: clockText(out.out_at), size: 24 },
    { kind: 'row', left: '使用時間', right: spaceDur(out.used_minutes), size: 24, bold: true },
    { kind: 'row', left: '方案時數', right: out.plan_minutes ? spaceDur(out.plan_minutes) : '不限時', size: 22 },
    { kind: 'row', left: '超時', right: out.overtime_units ? `${out.overtime_units} 小時 × ${out.headcount} 人` : '無', size: 22 }, 'dash',
    ...lines.map(l => ({ kind: 'row', left: `${spaceShortName(l.zh)} ×${l.qty}`, right: 'NT$' + num(l.price * l.qty), size: 22 })),
    'dash', { kind: 'row', left: '合計', right: 'NT$' + num(lines.reduce((a, l) => a + l.price * l.qty, 0)), size: 26, bold: true },
    { kind: 'center', text: '謝謝光臨', size: 20 }];
  const ok = await starSend({ canvas: ticketCanvas(sp), label: '離場單' });
  if (!ok) toast('離場單未印出');
  return ok;
}
/* 頂欄：空間情境不需要「出餐」分頁 */
function spaceHidesTab(id){ return id === 'serve' && posSpaceOn(); }
/* 每 30 秒就地更新倒數；到上限／待確認離場時響一次並彈窗 */
function spaceTick(){
  if (typeof document === 'undefined') return;
  for (const e of document.querySelectorAll('.sp-card[data-space-in]')) {
    if (e.classList.contains('sp-ready')) continue;   // 線上已付未到：沒有倒數
    const live = spaceLive({ in_at: e.dataset.spaceIn || null, due_at: e.dataset.spaceDue || null, out_at: e.dataset.spaceOut || null }), [cls, label] = SPACE_STATE[live.state];
    const t = e.querySelector('[data-space-text]'); if (t && t.textContent !== live.text) t.innerHTML = spaceTextHtml(live.text);
    const p = e.querySelector('[data-space-label]'); if (p && p.textContent !== label) p.textContent = label;
    for (const k of Object.values(SPACE_STATE).map(x => x[0])) e.classList.toggle(k, k === cls);
  }
  const bar = document.querySelector('.sp-bar-left'); const cur = (POS_DATA?.sessions || []).find(s => s.table === POS_TABLE);
  if (bar && cur?.space) bar.textContent = spaceLive(cur.space).text;
  if (!posSpaceOn() || typeof TAB === 'undefined' || TAB !== 'pos') return;
  const hits = (POS_DATA?.sessions || []).filter(s => s.space && !s.space.out_at && s.space.in_at && (s.space.limit_hit || ['over', 'stale'].includes(spaceLive(s.space).state)))
    .map(s => ({ s, key: s.id + ':' + (s.space.limit_hit ? 'limit' : spaceLive(s.space).state) })).filter(x => !SPACE_ALERTED.has(x.key));
  if (!hits.length) return;
  hits.forEach(x => SPACE_ALERTED.add(x.key));
  try { ordersBeep(); } catch (e) {}
  posConfirm(hits.map(({ s }) => `${s.table}：${s.space.limit_hit ? `已連續使用滿 ${spaceCfg().max_hours} 小時，須離場` : spaceLive(s.space).text}`).join('\n'), { title: '入場時間提醒', ok: '知道了', cancel: '知道了' });
}
if (typeof document !== 'undefined' && typeof setInterval === 'function' && !globalThis.__posSpaceTick) globalThis.__posSpaceTick = setInterval(spaceTick, 30000);

/* 設定頁「營業情境」區塊（pos-settings.js 呼叫）：切換餐飲／空間、計時規則；寫入走 pmWrite（店長識別碼） */
let SPACE_SET = null, SPACE_SET_ERR = '';
async function refreshSpaceSettings(){
  if (!SCOPE) { SPACE_SET = null; return; }
  try { SPACE_SET = (await api('/admin/orders/space/settings?venue=' + SCOPE)).settings; SPACE_SET_ERR = ''; document.documentElement.classList.toggle('pos-space-mode', SPACE_SET.mode === 'space'); } catch (e) { SPACE_SET_ERR = e.message; }
}
function spaceSettingsSection(){
  if (!SCOPE) return '';
  if (SPACE_SET_ERR) return `<div class="set-sec"><h3>營業情境</h3><p class="a-empty">載入失敗：${esc(SPACE_SET_ERR)}</p></div>`;
  const c = SPACE_SET; if (!c) return '';
  const cats = [...new Set((MENU_DOC?.items || []).filter(it => it.venue === SCOPE && MenuLib.SPACE_CATS.includes(it.cat)).map(it => it.cat))];
  const num1 = (id, label, v, hint, min, max) => `<label class="sp-set-f">${esc(label)}<input type="number" inputmode="numeric" id="${id}" value="${Number(v)}" min="${min}" max="${max}"><small>${esc(hint)}</small></label>`;
  return `<div class="set-sec" aria-labelledby="set-mode-h"><h3 id="set-mode-h">營業情境</h3>
    <p class="hint">餐飲＝桌號點餐、出餐單（在咖啡、三點水）。空間＝共享空間計時制：客人購買時間方案，收款當下開始計時，入場單印入場與預計離場時間，離場時自動結算超時（等等空間、約書旅）。切換需要店長識別碼；還有客人未離場時不能切回餐飲。</p>
    <div class="sp-mode" role="radiogroup" aria-label="營業情境">${['dining', 'space'].map(m => `<label class="sp-mode-opt"><input type="radio" name="sp-mode" value="${m}" ${c.mode === m ? 'checked' : ''}><b>${m === 'space' ? '空間（計時入場）' : '餐飲（桌號點餐）'}</b></label>`).join('')}</div>
    <div class="sp-set-grid" ${c.mode === 'space' ? '' : 'hidden'} id="sp-set-fields">
      ${num1('sp-grace', '寬限（分鐘）', c.grace_min, '超時多少分鐘內不收費', 0, 120)}
      ${num1('sp-unit', '超時計費單位（分鐘）', c.unit_min, '超過寬限後每多少分鐘收 1 單位', 15, 240)}
      ${num1('sp-max', '連續使用上限（小時）', c.max_hours, '0＝不限；到時提醒須離場', 0, 24)}
      ${num1('sp-warn', '到時前提醒（分鐘）', c.warn_min, '卡片轉黃的時間', 0, 60)}
      ${num1('sp-cap', '在場人數上限', c.capacity, '0＝不限；滿了不能再入場', 0, 500)}
      <label class="sp-set-f sp-set-wide">指定席號<input id="sp-seats" value="${esc(c.seats.join(', '))}" placeholder="例：Q1, Q2, Q3" autocomplete="off"><small>用逗號分隔；留白＝不指定席號，入場單自動編 E01 起</small></label>
      ${cats.length ? `<fieldset class="sp-set-f sp-set-wide"><legend>這些方案入場時要選席號（一席一人）</legend>${cats.map(x => `<label class="sp-cat"><input type="checkbox" data-sp-cat="${esc(x)}" ${c.seat_cats.includes(x) ? 'checked' : ''}>${esc(MenuLib.CAT_LABEL[x]?.zh || x)}</label>`).join('')}</fieldset>` : ''}
    </div>
    <button type="button" class="btn btn--solid" id="sp-set-save">儲存營業情境</button></div>`;
}
function bindSpaceSettings(host){
  const save = host.querySelector('#sp-set-save'); if (!save) return;
  host.querySelectorAll('input[name=sp-mode]').forEach(r => r.onchange = () => { const f = host.querySelector('#sp-set-fields'); if (f) f.hidden = r.value !== 'space' || !r.checked; });
  save.onclick = async () => {
    if (save.disabled) return; save.disabled = true;
    const v = id => host.querySelector('#' + id)?.value;
    const body = { venue: SCOPE, mode: host.querySelector('input[name=sp-mode]:checked')?.value, grace_min: v('sp-grace'), unit_min: v('sp-unit'), max_hours: v('sp-max'), warn_min: v('sp-warn'), capacity: v('sp-cap'), seats: v('sp-seats') || '', seat_cats: [...host.querySelectorAll('[data-sp-cat]:checked')].map(x => x.dataset.spCat) };
    try { const out = await pmWrite('/admin/orders/space/settings', 'POST', body); if (out) { SPACE_SET = out.settings; toast(`已儲存：${out.settings.mode === 'space' ? '空間' : '餐飲'}情境`); if (POS_DATA) POS_DATA.space_settings = out.settings; document.documentElement.classList.toggle('pos-space-mode', out.settings.mode === 'space'); const pb = document.getElementById('pos-body'); if (pb) delete pb.dataset.sig; paintSettings(host); } }
    catch (e) { toast(e.message); } finally { save.disabled = false; }
  };
}
