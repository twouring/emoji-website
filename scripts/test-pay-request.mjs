// 客人手機「通知櫃檯我要結帳」→ POS 桌號畫面一點就勾好那幾項（不走付款碼／掃描）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const items = [
  { line: 'a1', item_id: 'x', zh: '拿鐵', price: 100, qty: 2, guest: 'g1', by: '阿明', placed_at: '2026-10-16T03:00:00Z' },
  { line: 'b2', item_id: 'y', zh: '司康', price: 50, qty: 1, guest: 'g2', by: '小美', placed_at: '2026-10-16T03:00:00Z' },
  { line: 'c3', item_id: 'z', zh: '貝果', price: 80, qty: 1, guest: 'g1', by: '阿明', placed_at: '2026-10-16T03:01:00Z' },
];

test('addPayRequest：各付各的＝指定行；全部付款＝全部未付；同一 guest 再送覆蓋', () => {
  let rs = T.addPayRequest([], items, { guest: 'g1', name: '阿明', scope: 'mine', lines: ['a1', 'c3'] });
  assert.equal(rs.length, 1);
  assert.deepEqual(rs[0].lines, ['a1', 'c3']); assert.equal(rs[0].scope, 'mine'); assert.equal(rs[0].name, '阿明');
  assert.match(rs[0].id, /^pr_[a-f0-9]{12}$/);
  rs = T.addPayRequest(rs, items, { guest: 'g2', name: '小美', scope: 'all' });
  assert.equal(rs.length, 2); assert.deepEqual(rs[1].lines, ['a1', 'b2', 'c3']); assert.equal(rs[1].scope, 'all');
  rs = T.addPayRequest(rs, items, { guest: 'g1', name: '阿明', scope: 'mine', lines: ['a1'] });
  assert.equal(rs.length, 2, '同一 guest 覆蓋不新增'); assert.deepEqual(rs.find(r => r.guest === 'g1').lines, ['a1']);
});

test('addPayRequest：缺 guest 400、沒送出的品項 409、已付的行 409、空桌 400', () => {
  assert.throws(() => T.addPayRequest([], items, { name: 'x' }), e => e.status === 400);
  const notPlaced = items.map(l => l.line === 'a1' ? { ...l, placed_at: undefined } : l);
  assert.throws(() => T.addPayRequest([], notPlaced, { guest: 'g1', lines: ['a1'] }), e => e.status === 409);
  const paid = items.map(l => l.line === 'a1' ? { ...l, order_id: 'to_1' } : l);
  assert.throws(() => T.addPayRequest([], paid, { guest: 'g1', lines: ['a1'] }), e => e.status === 409);
  assert.throws(() => T.addPayRequest([], paid.map(l => ({ ...l, order_id: 'to_1' })), { guest: 'g1' }), e => e.status === 400);
});

test('每桌最多 PAY_REQUEST_MAX 筆，超過丟最舊的', () => {
  let rs = [];
  for (let i = 0; i < T.PAY_REQUEST_MAX + 5; i++) rs = T.addPayRequest(rs, items, { guest: 'g' + i, name: 'n' + i });
  assert.equal(rs.length, T.PAY_REQUEST_MAX);
  assert.equal(rs[0].guest, 'g5');
});

test('prunePayRequests：結掉的行剔除、空了整筆消失；壞資料不炸', () => {
  const rs = T.addPayRequest([], items, { guest: 'g1', lines: ['a1', 'c3'] });
  const afterPay = items.map(l => l.line === 'a1' ? { ...l, order_id: 'to_1' } : l);
  assert.deepEqual(T.prunePayRequests(rs, afterPay)[0].lines, ['c3']);
  assert.equal(T.prunePayRequests(rs, afterPay.map(l => ({ ...l, order_id: 'to_1' }))).length, 0);
  assert.deepEqual(T.prunePayRequests(null, items), []);
  assert.deepEqual(T.prunePayRequests([null, {}, { lines: 'x' }], items), []);
});

test('payRequestsView：帶金額、項數；不外露 guest', () => {
  const rs = T.addPayRequest([], items, { guest: 'g1', name: '阿明', scope: 'mine', lines: ['a1', 'c3'] });
  const v = T.payRequestsView(rs, items);
  assert.equal(v.length, 1); assert.equal(v[0].amount, 280); assert.equal(v[0].count, 2); assert.equal(v[0].name, '阿明');
  assert.ok(!('guest' in v[0]));
});

test('server：資料欄、客人端 POST/DELETE、POS 關閉端點、輪詢回傳、結帳後 prune、併桌合併', () => {
  const s = read('server.js');
  assert.match(s, /ADD COLUMN IF NOT EXISTS pay_requests JSONB NOT NULL DEFAULT '\[\]'/);
  assert.match(s, /app\.post\('\/api\/orders\/:id\/pay-request',rateLimit/);
  assert.match(s, /app\.delete\('\/api\/orders\/:id\/pay-request'/);
  assert.match(s, /app\.delete\('\/api\/admin\/orders\/sessions\/:id\/pay-requests\/:rid'/);
  assert.match(s, /opened_by_staff_name,pay_requests,pickup_at,pickup_note,pickup_placed_at FROM table_sessions WHERE status='open'/);
  assert.match(s, /pay_requests:tableOrders\.payRequestsView\(s\.pay_requests,s\.items\)/);
  assert.match(s, /SET items=\$2,status=\$3,pay_requests=\$4,updated_at=now\(\) WHERE id=\$1',\[s\.id,JSON\.stringify\(items\),closed\?'closed':'open',JSON\.stringify\(tableOrders\.prunePayRequests\(s\.pay_requests,items\)\)\]/);
  assert.match(s, /SET items=\$2,pay_requests=\$3,updated_at=now\(\) WHERE id=\$1',\[dst\.id/);
  assert.match(s, /pay_request:mine\?\{scope:mine\.scope,lines:mine\.lines,people:mine\.people\|\|undefined,at:mine\.at\}:null/, '客人端只看到自己那筆（含分攤人數）');
});

test('客人端：結帳面板有「通知櫃檯我要結帳」、已送出狀態與取消；三語文案', () => {
  const html = read('public/order.html'), lib = read('public/order-lib.js');
  assert.match(html, /id="pay-notify"/); assert.match(html, /id="pay-sent"/); assert.match(html, /id="pay-cancel"/);
  assert.match(html, /api\('\/orders\/'\+S\.id\+'\/pay-request',\{method:'POST',body:\{guest:GUEST,name:NAME,scope:scope==='mine'\?'mine':scope==='split'\?'split':'all',people:people,lines:/);
  assert.match(html, /api\('\/orders\/'\+S\.id\+'\/pay-request',\{method:'DELETE',body:\{guest:GUEST\}\}\)/);
  assert.match(html, /if\(SHEET_OPEN==='#pay'\)renderPayRequest\(\);/, '輪詢到櫃檯收款後同步');
  for (const k of ['notify_counter', 'notify_done', 'notify_sent', 'notify_cancel']) {
    assert.equal((lib.match(new RegExp(`\\b${k}: '`, 'g')) || []).length, 3, k + ' 要有 zh/en/ja');
  }
  assert.match(lib, /notify_counter: '通知櫃檯我要結帳'/);
});

test('POS：桌況格標記、桌號畫面一鍵勾選、✕ 關閉、新需求響一聲、sig 含需求、快取版本 bump', () => {
  const js = read('public/pos-ops.js'), css = read('public/pos-ops.css');
  assert.match(js, /PAYREQ_SEEN=null,POS_PAYREQ=null/);
  assert.match(js, /\(s\.pay_requests\|\|\[\]\)\.map\(r=>\[r\.id,r\.amount,r\.count\]\)/, '輪詢 sig 要含需求，否則畫面不重繪');
  assert.match(js, /PAYREQ_SEEN&&\[\.\.\.reqIds\]\.some\(id=>!PAYREQ_SEEN\.has\(id\)\)\)ordersBeep\(\)/);
  assert.match(js, /class="pos-table [^"]*\$\{s\.pay_requests\?\.length\?'payreq':''\}/);
  assert.match(js, /pos-payreq-tag">💳 要結帳/);
  assert.match(js, /data-payreq="\$\{esc\(r\.id\)\}"/); assert.match(js, /data-payreq-dismiss="\$\{esc\(r\.id\)\}"/);
  assert.match(js, /POS_PICK=set\.size===cur\.lines\.length\?null:set;POS_QTY=\{\};POS_PAYREQ=r\.id;paintPos\(\)/, '一點就勾好那幾項');
  assert.match(js, /api\('\/admin\/orders\/sessions\/'\+cur\.id\+'\/pay-requests\/'\+b\.dataset\.payreqDismiss,\{method:'DELETE'\}\)/);
  assert.match(js, /POS_TABLE=b\.dataset\.posTable;POS_OPT=null;POS_MENU_SCROLL=0;POS_LEFT_SCROLL=0;POS_PICK=null;POS_QTY=\{\};POS_PAYREQ=null;/, '換桌重置');
  assert.match(css, /\.pos-table\.payreq\{/); assert.match(css, /\.pos-payreq-apply\{/);
});

test('平均分攤：addPayRequest 帶人數（2–20）、view 算每人金額；手機頁三種範圍文案與提示；POS 一點進入分攤模式', () => {
  let rs = T.addPayRequest([], items, { guest: 'g1', name: '阿明', scope: 'split', people: 3 });
  assert.equal(rs[0].scope, 'split'); assert.equal(rs[0].people, 3); assert.deepEqual(rs[0].lines, ['a1', 'b2', 'c3']);
  const v = T.payRequestsView(rs, items)[0];
  assert.equal(v.amount, 330); assert.equal(v.people, 3); assert.equal(v.each, 110);
  for (const bad of [1, 21, 'x', undefined]) assert.throws(() => T.addPayRequest([], items, { guest: 'g1', scope: 'split', people: bad }), e => e.status === 400, String(bad));
  const html = read('public/order.html'), lib = read('public/order-lib.js'), js = read('public/pos-ops.js');
  assert.match(html, /data-i18n="whole_table">全部付款</); assert.match(html, /data-i18n="my_items">各付各的</); assert.match(html, /data-i18n="split_evenly">平均分攤</);
  assert.match(html, /id="pay-scope-hint"/); assert.match(html, /notify_sent_split/);
  for (const k of ['whole_table', 'my_items', 'split_evenly', 'my_items_hint', 'split_hint', 'notify_sent_split']) assert.equal((lib.match(new RegExp(`\\b${k}: '`, 'g')) || []).length, 3, k + ' 要有 zh/en/ja');
  assert.match(js, /r\.scope==='split'\?`平均分攤 \$\{r\.people\} 人 · 每人 NT\$\$\{num\(r\.each\|\|0\)\}`:r\.scope==='mine'\?'各付各的':'全部付款'/);
  assert.match(js, /if\(r\.scope==='split'&&r\.people\)\{startAA\(r\.people\);POS_PAYREQ=r\.id;paintPos\(\);return;\}/, '分攤需求一點就進分攤模式');
});
