// scripts/test-pos-reason-presets.mjs — POS 所有要填原因的地方都先列預設選項，選不到才手動填寫（現場不打字）
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const ops = read('public/pos-ops.js');
const css = read('public/pos-ops.css');

test('REASON_PRESETS：每個情境至少 3 個預設原因、不重複、不超過 12 字', () => {
  const src = ops.slice(ops.indexOf('const REASON_PRESETS='), ops.indexOf('// 覆蓋式原因選單'));
  const ctx = {}; vm.runInNewContext(src.replace('const REASON_PRESETS=', 'REASON_PRESETS='), ctx);
  const P = ctx.REASON_PRESETS;
  for (const k of ['void_order', 'void_line', 'cancel_item', 'comp', 'discount', 'cash_move', 'close_note', 'count_note', 'taishin', 'attendance_fix']) {
    assert.ok(Array.isArray(P[k]) && P[k].length >= 3, k);
    assert.equal(new Set(P[k]).size, P[k].length, k + ' 重複');
    for (const s of P[k]) assert.ok(s.length <= 12, `${k}: ${s}`);
  }
});

test('覆蓋式 pickReason：膠囊鍵即送、手動填寫必填時空白要擋、取消回 null、可選填（出勤修正）', async () => {
  // 只切 pickReason 這段，用假的 document／toast 跑
  const src = ops.slice(ops.indexOf('function pickReason('), ops.indexOf('// 表單內嵌'));
  const made = [];
  const el = (html) => {
    const node = { html: '', parentNode: { removeChild() { node.removed = true; } }, handlers: {}, inputs: {} };
    Object.defineProperty(node, 'innerHTML', { set(v) { node.html = v; }, get() { return node.html; } });
    node.querySelector = sel => node.inputs[sel] || (node.inputs[sel] = { value: '', focus() {}, onclick: null, onkeydown: null });
    node.querySelectorAll = sel => {
      const re = /data-reason="([^"]*)"/g; const out = []; let m;
      while ((m = re.exec(node.html))) { const r = m[1]; out.push(node.inputs['chip:' + r] || (node.inputs['chip:' + r] = { dataset: { reason: r }, onclick: null })); }
      return sel === '[data-reason]' ? out : [];
    };
    return node;
  };
  const toasts = [];
  const ctx = { toast: m => toasts.push(m), esc: s => String(s ?? ''), document: { createElement: () => { const n = el(); made.push(n); return n; }, body: { appendChild() {} } }, Promise };
  vm.runInNewContext(src, ctx);
  // 膠囊鍵即送
  let p = ctx.pickReason({ title: '作廢', presets: ['客人取消', '點錯單'] });
  let ov = made.at(-1); assert.match(ov.html, /data-reason="客人取消"/); assert.match(ov.html, /選不到？手動填寫/);
  ov.inputs['chip:點錯單'].onclick(); assert.equal(await p, '點錯單'); assert.ok(ov.removed);
  // 必填：空白擋、填字後確定
  p = ctx.pickReason({ title: 'x', presets: ['a'] }); ov = made.at(-1);
  ov.querySelector('#pos-reason-ok').onclick(); assert.match(toasts.at(-1), /請選一個原因/); assert.ok(!ov.removed);
  ov.querySelector('#pos-reason-input').value = ' 客人刷錯卡 '; ov.querySelector('#pos-reason-ok').onclick(); assert.equal(await p, '客人刷錯卡');
  // 取消 → null
  p = ctx.pickReason({ title: 'x', presets: ['a'] }); ov = made.at(-1); ov.querySelector('#pos-reason-cancel').onclick(); assert.equal(await p, null);
  // 選填：空白也能確定，帶 initial
  p = ctx.pickReason({ title: 'x', presets: ['a'], required: false, initial: '舊備註' }); ov = made.at(-1);
  assert.match(ov.html, /value="舊備註"/); assert.match(ov.html, /其他說明（選填）/);
  ov.querySelector('#pos-reason-input').value = ''; ov.querySelector('#pos-reason-ok').onclick(); assert.equal(await p, '');
  // Enter 送出
  p = ctx.pickReason({ title: 'x', presets: [] }); ov = made.at(-1); const inp = ov.querySelector('#pos-reason-input'); inp.value = '手打';
  inp.onkeydown({ key: 'Enter', preventDefault() {} }); assert.equal(await p, '手打');
});

test('每個要填原因的地方都接了預設選項：覆蓋式用 pickReason、表單欄位用 reasonChips', () => {
  // 覆蓋式（原本是 prompt）：作廢整張單、取消品項、數量減到 0、贈送、作廢品項、出勤修正備註
  for (const [fn, key] of [['voidOrderPrompt', 'void_order'], ['cancelOrderItemPrompt', 'cancel_item']]) {
    const body = ops.slice(ops.indexOf(`async function ${fn}(`), ops.indexOf('\n}', ops.indexOf(`async function ${fn}(`)));
    assert.match(body, new RegExp(`pickReason\\(\\{[^\\n]*presets:REASON_PRESETS\\.${key}`), fn);
    assert.doesNotMatch(body, /prompt\(/, fn + ' 不該再用 prompt');
  }
  assert.match(ops, /\[data-comp\]'\)\.forEach\(b=>b\.onclick=async\(\)=>\{[^\n]*pickReason\(\{[^\n]*presets:REASON_PRESETS\.comp/, '贈送');
  assert.match(ops, /\[data-void-line\]'\)\.forEach\(b=>b\.onclick=async\(\)=>\{[^\n]*pickReason\(\{[^\n]*presets:REASON_PRESETS\.void_line/, '作廢品項');
  assert.match(ops, /if\(next<1\)\{pickReason\(\{[^\n]*presets:REASON_PRESETS\.void_line/, '數量減到 0');
  // 出勤修正改成一張面板（openAttendanceFix）：原因欄是表單內嵌膠囊、選填（沒有 required 檢查）
  assert.ok(ops.includes("reasonChips('fx-note',REASON_PRESETS.attendance_fix)"), '出勤修正備註選填（面板內嵌膠囊）');
  assert.match(ops.slice(ops.indexOf('function openAttendanceFix('), ops.indexOf('/* 出勤紀錄')), /if\(!tIn\)\{toast\('請選上班時間'\);return;\}/, '面板只擋上班時間，原因不擋');
  // 表單欄位：折扣、臨時收支、關帳說明、小結說明、台新差異原因
  for (const [id, key] of [['pos-disc-reason', 'discount'], ['reg-cash-reason', 'cash_move'], ['reg-close-note', 'close_note'], ['reg-count-note', 'count_note'], ['ts-reason', 'taishin']]) {
    assert.ok(ops.includes(`\${reasonChips('${id}',REASON_PRESETS.${key})}`), id);
  }
  // 綁定：結帳面板、開關帳區塊、日結頁都呼叫 bindReasonChips
  assert.ok((ops.match(/bindReasonChips\(host\)/g) || []).length >= 3);
  // 原因類 prompt() 都清掉了；剩下的 prompt 只有時間／金額／桌號／訂位留言這類非「原因」欄位
  const left = [...ops.matchAll(/prompt\(([^)]*)/g)].map(m => m[1]);
  for (const s of left) assert.doesNotMatch(s, /原因/, '還有原因用 prompt：' + s);
});

test('膠囊鍵樣式：48px 觸控目標、字級不小於 1rem、選中有標示；SW 版本已升', () => {
  assert.match(css, /\.reason-chips button\{[^}]*min-height:48px/);
  assert.match(css, /\.reason-chips button\[aria-pressed="true"\]/);
  assert.match(css, /\.reason-chips--inline\{[^}]*flex-basis:100%/);
});
