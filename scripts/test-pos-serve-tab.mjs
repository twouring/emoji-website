// scripts/test-pos-serve-tab.mjs — POS「出餐」分頁（KK 11/9）：外場點桌出餐，版面同結帳頁桌位
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = read('public/pos-serve.js'), pos = read('public/pos.html'), live = read('public/pos-live.js'), css = read('public/pos-ops.css');

function ctx(extra = {}) {
  const c = { esc: s => String(s ?? ''), isTakeoutNo: t => /^W\d{2}$/.test(String(t || '')), orderLines: o => (o.stations ? [...o.stations.bar, ...o.stations.kitchen] : o.items), Date, JSON, Map, Set, Math, Number, String, ...extra };
  vm.createContext(c); vm.runInContext(src, c); return c;
}

test('掛進 POS：頂欄、PANEL、activate、載入順序、即時刷新', () => {
  assert.match(pos, /\{ id:'serve', icon:'utensils',\s+label:'出餐' \}/);
  assert.match(pos, /serve:tabServe/);
  assert.match(pos, /else if \(TAB === 'serve'\) loadServe\(\)/);
  assert.match(pos, /clearTimeout\(SERVE_TIMER\)/);
  assert.ok(pos.indexOf('<script src="/pos-ops.js">') < pos.indexOf('<script src="/pos-serve.js">'), 'pos-serve.js 依賴 pos-ops.js 的 helper，要排在後面');
  assert.match(live, /TAB === 'serve' && document\.getElementById\('serve-body'\)\) loadServe\(\)/);
});

test('版面沿用結帳頁桌位：同一份 table_layout、平面圖＋格子＋外帶欄', () => {
  assert.match(src, /posTables\(d\)/);
  assert.match(src, /d\.table_layout/);
  for (const k of ['pos-floor', 'pos-floor-slot', 'pos-grid', 'pos-slot', 'pos-takeouts', 'pos-table']) assert.ok(src.includes(k), k);
  assert.match(css, /\.serve-sheet\{/);
});

test('只用既有出餐 API：逐道 serve、整桌依送單分組、先結後做 status ready', () => {
  assert.match(src, /'\/admin\/orders\/sessions\/' \+ b\.dataset\.session \+ '\/tickets\/' \+ b\.dataset\.serveTicket \+ '\/serve', \{ method:'POST', body:\{ lines:\[b\.dataset\.serveLine\] \} \}/);
  assert.match(src, /'\/admin\/orders\/' \+ b\.dataset\.serveOrder \+ '\/status', \{ method:'POST', body:\{ status:'ready' \} \}/);
  assert.match(src, /api\('\/admin\/orders' \+ scopeQuery\(\)\)/, '分品牌：帶 venue');
  assert.doesNotMatch(src, /\bconfirm\(|\bprompt\(/);
});

test('serveByTable：只算未出、未取消的行，加總份數；已結帳 paid 單併入；最久等候時間', () => {
  const c = ctx();
  const d = {
    tickets: [
      { ticket: 'tk_1', session_id: 'ts_a', table_no: 'A1', placed_at: '2026-11-09T04:00:00Z', items: [
        { line: '1', zh: '拿鐵', qty: 2, cat: 'COFFEE', placed_at: '2026-11-09T04:00:00Z' },
        { line: '2', zh: '司康', qty: 1, cat: 'DESSERT', served_at: '2026-11-09T04:05:00Z' },
        { line: '3', zh: '美式', qty: 1, cancelled: true } ] },
      { ticket: 'tk_2', session_id: 'ts_a', table_no: 'A1', placed_at: '2026-11-09T04:10:00Z', items: [{ line: '4', zh: '鬆餅', qty: 1, cat: 'FOOD' }] },
    ],
    orders: [{ id: 'to_1', table_no: 'W01', status: 'paid', paid_at: '2026-11-09T03:50:00Z', items: [{ line: '9', zh: '可頌', qty: 3 }] }, { id: 'to_2', table_no: 'W02', status: 'ready', items: [] }],
  };
  const m = c.serveByTable(d);
  const a = m.get('A1');
  assert.equal(a.count, 3);
  assert.equal(JSON.stringify(a.lines.map(l => l.line)), '["1","4"]');
  assert.equal(a.lines[1].ticket, 'tk_2');
  assert.equal(a.since, '2026-11-09T04:00:00Z');
  assert.equal(m.get('W01').count, 3);
  assert.ok(!m.has('W02'), 'ready（已通知）不再算待出');
});
