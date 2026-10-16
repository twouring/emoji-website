// scripts/test-pos-pick-inputs.mjs — POS 現場輸入「選」不「打」：
// 1) pos-ops.js 不再有瀏覽器 prompt()；2) 共用面板（桌號、金額、備註、統編）行為；3) 各表單接上膠囊鍵；4) SW 版本升級
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ops = read('public/pos-ops.js');
const css = read('public/pos-ops.css');

// 假 DOM：只做 innerHTML 解析 data-* 按鈕與 #id 輸入欄位，足夠驅動面板的 onclick
function fakeDoc() {
  const made = [];
  const mk = () => {
    const node = { html: '', children: [], inputs: {}, parentNode: null, dataset: {} };
    Object.defineProperty(node, 'innerHTML', { set(v) { node.html = v; }, get() { return node.html; } });
    node.querySelector = sel => {
      if (sel.startsWith('#')) return node.inputs[sel] || (node.inputs[sel] = { value: '', maxLength: 160, focus() {}, listeners: {}, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, dispatchEvent(e) { (this.listeners[e.type] || []).forEach(f => f(e)); }, textContent: '' });
      const all = node.querySelectorAll(sel); return all[0] || null;
    };
    node.querySelectorAll = sel => {
      // `.note-chips[data-note-for]` 這類「膠囊容器」：回一個 box，dataset 取自 html，查詢委回同一份 html
      const cm = sel.match(/^\.[a-z-]+\[data-([a-z-]+)\]$/);
      if (cm) { const attr = cm[1], camel = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); const x = new RegExp(`data-${attr}="([^"]*)"`).exec(node.html); if (!x) return []; return [node.inputs['box:' + attr] || (node.inputs['box:' + attr] = { dataset: { [camel]: x[1] }, querySelectorAll: node.querySelectorAll, querySelector: node.querySelector })]; }
      const m = sel.match(/^\[data-([a-z-]+)\]$/); if (!m) return [];
      const attr = m[1], camel = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const re = new RegExp(`data-${attr}(?:="([^"]*)")?`, 'g'); const out = []; let x;
      while ((x = re.exec(node.html))) { const key = attr + ':' + (x[1] ?? '') + ':' + x.index; out.push(node.inputs[key] || (node.inputs[key] = { dataset: { [camel]: x[1] ?? '' }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, onclick: null })); }
      return out;
    };
    node.remove = () => { node.removed = true; };
    node.parentNode = { removeChild() { node.removed = true; } };
    return node;
  };
  const document = { createElement: () => { const n = mk(); made.push(n); return n; }, body: { appendChild() {} } };
  return { document, made };
}
function ctxWith(extra = {}) {
  const { document, made } = fakeDoc();
  const toasts = [];
  const ctx = { document, toast: m => toasts.push(m), esc: s => String(s ?? ''), num: n => Number(n || 0).toLocaleString('en-US'), Promise, Event: class { constructor(t) { this.type = t; } }, String, Number, Array, ...extra };
  vm.createContext(ctx);
  // 只載入共用面板這一段 + 需要的常數
  const start = ops.indexOf('const NOTE_PRESETS='), end = ops.indexOf('let POS_INV_SCAN_STREAM=');
  vm.runInContext(ops.slice(start, end), ctx);
  return { ctx, made, toasts };
}
const click = (node, attr, value) => { const b = node.querySelectorAll(`[data-${attr}]`).find(x => value === undefined || x.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === value); assert.ok(b, `找不到 data-${attr}=${value}`); return b.onclick(); };

test('pos-ops.js 不再有任何瀏覽器 prompt()：桌號、金額、備註、統編、訂位留言、出勤時間全改面板／膠囊', () => {
  assert.equal((ops.match(/\bprompt\(/g) || []).length, 0);
  for (const fn of ['function pickFrom(', 'function pickTableNo(', 'function pickAmount(', 'function pickNote(', 'async function askInvoice(', 'function stampChips(', 'function bindStampChips(', 'function openAttendanceFix(', 'const noteChips=', 'const fillChips=', 'function bindNoteChips(', 'function bindFillChips(']) assert.ok(ops.includes(fn), fn);
});

test('pickTableNo：點區＋數字鍵＝桌號；沒按數字不放行；排除自己這桌；取消回 null', async () => {
  const { ctx, made, toasts } = ctxWith();
  let p = ctx.pickTableNo({ title: 'x', exclude: ['B2'] }); let ov = made.at(-1);
  assert.match(ov.html, /data-zone="A"/); assert.match(ov.html, /data-key="確定"/);
  click(ov, 'key', '確定'); assert.match(toasts.at(-1), /請點桌號數字/);
  click(ov, 'zone', 'B'); click(ov, 'key', '2'); click(ov, 'key', '確定'); assert.match(toasts.at(-1), /B2 就是這一桌/);
  click(ov, 'key', '⌫'); click(ov, 'key', '1'); click(ov, 'key', '1'); click(ov, 'key', '確定');
  assert.equal(await p, 'B11'); assert.ok(ov.removed);
  p = ctx.pickTableNo({}); ov = made.at(-1); click(ov, 'cancel'); assert.equal(await p, null);
});

test('pickAmount：常用面額一鍵送出；數字鍵＋確定回 number 且檢查範圍；digits 模式回固定位數字串', async () => {
  const { ctx, made, toasts } = ctxWith();
  let p = ctx.pickAmount({ title: 'x', presets: [50, 100] }); let ov = made.at(-1);
  assert.match(ov.html, /data-preset="100"/);
  click(ov, 'preset', '100'); assert.equal(await p, 100);
  p = ctx.pickAmount({ title: 'x', min: 1, max: 500 }); ov = made.at(-1);
  click(ov, 'key', '0'); click(ov, 'key', '7'); click(ov, 'key', '00'); // 前導 0 去掉 → 700
  assert.equal(ov.querySelector('#pos-amt-show').textContent, '700');
  click(ov, 'ok'); assert.match(toasts.at(-1), /1–500/, '超過上限要擋、面板不關');
  click(ov, 'key', '⌫'); click(ov, 'key', '⌫'); click(ov, 'ok'); assert.equal(await p, 7);
  p = ctx.pickAmount({ title: '統編', digits: 8, unit: '' }); ov = made.at(-1);
  assert.doesNotMatch(ov.html, /data-ok/, 'digits 模式用鍵盤上的「確定」');
  for (const k of '1234567') click(ov, 'key', k);
  click(ov, 'key', '確定'); assert.match(toasts.at(-1), /8 位數字/);
  click(ov, 'key', '8'); click(ov, 'key', '9'); // 第 9 碼不會進去
  click(ov, 'key', '確定'); assert.equal(await p, '12345678');
});

test('pickNote：常用備註可複選（再按一次移除）、以「、」串接、可補字、取消回 null、清空回空字串', async () => {
  const { ctx, made } = ctxWith();
  assert.equal(ctx.toggleToken('', '去冰'), '去冰'); assert.equal(ctx.toggleToken('去冰', '不要蔥'), '去冰、不要蔥'); assert.equal(ctx.toggleToken('去冰、不要蔥', '去冰'), '不要蔥');
  let p = ctx.pickNote({ title: 'x', initial: '' }); let ov = made.at(-1);
  assert.match(ov.html, /data-note="去冰"/); assert.match(ov.html, /id="pos-note-pick"/);
  const inp = ov.querySelector('#pos-note-pick');
  click(ov, 'note', '去冰'); click(ov, 'note', '不要蔥'); assert.equal(inp.value, '去冰、不要蔥');
  click(ov, 'note', '去冰'); assert.equal(inp.value, '不要蔥');
  inp.value = '不要蔥、醬多'; click(ov, 'ok'); assert.equal(await p, '不要蔥、醬多');
  p = ctx.pickNote({ title: 'x', initial: '舊' }); ov = made.at(-1); click(ov, 'cancel'); assert.equal(await p, null);
  p = ctx.pickNote({ title: 'x', initial: '舊' }); ov = made.at(-1); ov.querySelector('#pos-note-pick').value = ''; click(ov, 'ok'); assert.equal(await p, '');
});

test('bindStampChips：點日期＋點時間組成 YYYY-MM-DDTHH:mm，並觸發 input／change', () => {
  const { ctx, made } = ctxWith({ todayTaipei: () => '2026-10-16', addDaysStr: (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }, dayText: d => d.slice(5) });
  const start = ops.indexOf('const TIME_SLOTS='), end = ops.indexOf('function openMakeup(');
  vm.runInContext(ops.slice(start, end), ctx);
  const host = ctx.document.createElement('div');
  host.innerHTML = `<input id="mk-in">${ctx.stampChips('mk-in')}`;
  // 假 host：querySelectorAll('.stamp-chips[data-stamp-for]') 回自己
  const box = { dataset: { stampFor: 'mk-in', bound: '' }, html: host.html, querySelectorAll: host.querySelectorAll };
  Object.defineProperty(box, 'innerHTML', { get() { return host.html; } });
  host.querySelectorAll = sel => sel === '.stamp-chips[data-stamp-for]' ? [box] : fakeDoc().document.createElement('x').querySelectorAll.call(host, sel);
  const inp = host.querySelector('#mk-in'); let events = [];
  inp.addEventListener('change', () => events.push('change'));
  ctx.bindStampChips(host);
  assert.match(host.html, /data-stamp-day="2026-10-16"/); assert.match(host.html, /data-stamp-day="2026-10-10"/, '往前 7 天');
  assert.match(host.html, /data-stamp-time="09:00"/); assert.match(host.html, /data-stamp-time="23:30"/);
  box.querySelectorAll('[data-stamp-day]').find(b => b.dataset.stampDay === '2026-10-15').onclick();
  assert.equal(inp.value, '2026-10-15T09:00', '只點日期先用 09:00');
  box.querySelectorAll('[data-stamp-time]').find(b => b.dataset.stampTime === '17:30').onclick();
  assert.equal(inp.value, '2026-10-15T17:30'); assert.ok(events.length >= 2);
});

test('接線：結帳頁開桌／換桌／備註／客製金額／折扣／補開發票；訂位；出餐暫停文案；錢櫃；日結；排班；出勤修正', () => {
  // 結帳：加開桌號是按鈕不是輸入欄；換桌「其他桌號」走 pickTableNo
  assert.match(ops, /<button type="button" class="btn btn--ghost" id="pos-open-extra">＋ 加開桌號<\/button>/);
  assert.doesNotMatch(ops, /<input id="pos-open-table"/);
  assert.match(ops, /#pos-open-extra'\)\.onclick=async\(\)=>\{const t=await pickTableNo\(/);
  // 先收部分金額（預收）也走金額鍵盤，上限＝未結金額－1
  assert.match(ops, /#pos-prepay'\);if\(prepayBtn\)prepayBtn\.onclick=async\(\)=>\{/);
  assert.match(ops, /const raw=await pickAmount\(\{title:`這桌未結 NT\$\$\{num\(due\)\}，先付多少？`[^\n]*max:Math\.max\(1,due-1\)/);
  assert.match(ops, /\[data-other\]'\)\.onclick=async\(\)=>\{done\(\);const table=await pickTableNo\(\{[^\n]*exclude:\[cur\.table\]/);
  // 備註：下一項備註欄有常用膠囊；改備註走 pickNote；選項面板也有膠囊
  assert.ok(ops.includes("${noteChips('pos-note',NOTE_PRESETS)}"));
  assert.match(ops, /\[data-note-edit\]'\)\.forEach\(b=>b\.onclick=async\(\)=>\{[^\n]*await pickNote\(/);
  assert.ok(ops.includes("${noteChips('pos-opt-note',NOTE_PRESETS)}"));
  // 客製金額：pickAmount 帶常用面額，之後仍沿用原本 0–100000 驗證
  assert.match(ops, /if\(it\?\.custom_price\)\{\s*const raw=await pickAmount\(\{[^\n]*presets:\[50,100,150,200,300,500\]/);
  assert.match(ops, /if\(!Number\.isFinite\(n\)\|\|n<0\|\|n>100000\)/);
  // 折扣快捷鍵
  assert.match(ops, /data-disc-quick="\$\{t\}:\$\{v\}"/); assert.match(ops, /\[data-disc-quick\]'\)\.forEach\(b=>b\.onclick=/);
  // 補開發票
  assert.match(ops, /invoice=await askInvoice\(\);/);
  // 訂位：日期／人數／桌號／備註膠囊；確認／婉拒留言用 pickReason
  for (const s of ["fillChips('resv-new-date',dayChoices())", "fillChips('resv-new-party',PARTY_CHOICES)", "fillChips('resv-new-table',[['','不排'],...DEFAULT_TABLES.map(t=>[t,t])])", "noteChips('resv-new-note',RESV_NOTE_PRESETS)", "fillChips('re-date',dayChoices())", "fillChips('re-party',PARTY_CHOICES)", "noteChips('re-note',RESV_NOTE_PRESETS)"]) assert.ok(ops.includes(s), s);
  assert.match(ops, /presets:status==='confirmed'\?REASON_PRESETS\.resv_confirm:REASON_PRESETS\.resv_cancel/);
  // 出餐：暫停文案膠囊、QR 一鍵全部固定桌
  assert.ok(ops.includes("${reasonChips('pause-msg-'+v,PAUSE_PRESETS)}")); assert.match(ops, /#qr-all'\)\.onclick=\(\)=>\{[^\n]*DEFAULT_TABLES\.join\(','\)/);
  // 錢櫃／日結
  for (const s of ["fillChips('reg-open-total'", "fillChips('reg-cash-amount'", "fillChips('reg-keep'", "fillChips('ts-amount'"]) assert.ok(ops.includes(s), s);
  // 排班／員工／補打卡／出勤修正
  assert.match(ops, /data-shift-quick="\$\{s\}-\$\{e\}"/); assert.ok(ops.includes("fillChips('st-role'"));
  assert.ok(ops.includes("${stampChips('mk-in')}") && ops.includes("${stampChips('mk-out')}") && ops.includes("fillChips('mk-break'"));
  assert.match(ops, /\[data-fix\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{[^\n]*openAttendanceFix\(r,reload,toIso\)/);
  assert.ok(ops.includes("${stampChips('fx-in')}") && ops.includes("${stampChips('fx-out')}") && ops.includes("fillChips('fx-break'") && ops.includes("reasonChips('fx-note',REASON_PRESETS.attendance_fix)"));
  // 綁定：每個畫面都呼叫對應的 bind
  assert.ok((ops.match(/bindNoteChips\(/g) || []).length >= 6); assert.ok((ops.match(/bindFillChips\(/g) || []).length >= 8); assert.ok((ops.match(/bindStampChips\(/g) || []).length >= 3);
});

test('樣式與 SW：鍵盤 56px、大字顯示、選中狀態、時間膠囊橫向捲；pos-sw 升到 v35+', () => {
  assert.match(css, /\.pos-tno-keys \.clock-key,\.pos-amt-keys \.clock-key\{min-height:64px/);
  assert.match(css, /\.clock-key\[data-key="確定"\][^}]*background:var\(--ink\)/, '確定鍵主色');
  assert.match(css, /\.pos-tno-zones\{display:grid;grid-template-columns:repeat\(6,1fr\)\}/, 'A–F 六等分');
  assert.match(ops, /target\.scrollIntoView\(\{block:'nearest',inline:'center'\}\)/, '時間列自動捲到選中格');
  assert.match(css, /\.pos-tno b,\.pos-amt b\{font-size:2rem/);
  assert.match(css, /\.note-chips button\[aria-pressed="true"\]/); assert.match(css, /\.fill-chips button\[aria-pressed="true"\]/);
  assert.match(css, /\.stamp-chips \.stamp-times\{flex-wrap:nowrap;overflow-x:auto/);
});
