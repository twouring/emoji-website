// 呼叫服務：純邏輯（lib/service-calls.js）＋接線靜態檢查（客人頁、POS 通知、操作紀錄、品牌子帳號權限）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sc = require('../lib/service-calls.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const T0 = Date.parse('2026-11-01T12:00:00Z');

test('新增呼叫：項目白名單、備註只留在「其他」', () => {
  const st = sc.normalize('');
  assert.deepEqual(st, { calls: [] });
  assert.throws(() => sc.create(st, { id: 'a', session_id: 's1', table: 'A1', kind: 'pay' }, T0), /服務項目/);
  assert.throws(() => sc.create(st, { id: 'a', session_id: '', table: 'A1', kind: 'water' }, T0), /桌次/);
  const { state, call } = sc.create(st, { id: 'a', session_id: 's1', table: 'A1', kind: 'water', note: '不該留', by: '小明' }, T0);
  assert.equal(call.note, ''); assert.equal(call.by, '小明'); assert.equal(call.done_at, null);
  assert.equal(sc.pending(state).length, 1);
  const o = sc.create({ calls: [] }, { id: 'b', session_id: 's2', table: 'A2', kind: 'other', note: '  要兒童椅\n' }, T0);
  assert.equal(o.call.note, '要兒童椅');
});

test('同桌 60 秒冷卻：429 並回剩餘秒數；別桌不受影響；過時可再叫', () => {
  let { state } = sc.create({ calls: [] }, { id: 'a', session_id: 's1', table: 'A1', kind: 'water' }, T0);
  assert.throws(() => sc.create(state, { id: 'b', session_id: 's1', table: 'A1', kind: 'pack' }, T0 + 20e3), e => e.status === 429 && e.wait === 40);
  ({ state } = sc.create(state, { id: 'c', session_id: 's2', table: 'A2', kind: 'pack' }, T0 + 20e3));
  ({ state } = sc.create(state, { id: 'd', session_id: 's1', table: 'A1', kind: 'pack' }, T0 + 61e3));
  assert.deepEqual(sc.pending(state).map(c => c.id), ['a', 'c', 'd']);
});

test('處理：記人與時間；重複按不報錯；找不到 404', () => {
  let { state } = sc.create({ calls: [] }, { id: 'a', session_id: 's1', table: 'A1', kind: 'clear' }, T0);
  const r = sc.resolve(state, 'a', '阿美', T0 + 90e3);
  assert.equal(r.call.done_by, '阿美'); assert.equal(sc.pending(r.state).length, 0);
  const again = sc.resolve(r.state, 'a', '別人', T0 + 95e3);
  assert.equal(again.call.done_by, '阿美');
  assert.throws(() => sc.resolve(r.state, 'zzz', 'x'), e => e.status === 404);
});

test('清桌：該桌未處理的一起結案；已處理 12 小時後清掉', () => {
  let { state } = sc.create({ calls: [] }, { id: 'a', session_id: 's1', table: 'A1', kind: 'water' }, T0);
  ({ state } = sc.create(state, { id: 'b', session_id: 's2', table: 'A2', kind: 'water' }, T0));
  const c = sc.closeSession(state, 's1', T0 + 1e3);
  assert.equal(c.closed, 1); assert.deepEqual(sc.pending(c.state).map(x => x.id), ['b']);
  assert.equal(sc.prune(c.state, T0 + 13 * 3600e3).calls.length, 1);   // a 已處理超過 12 小時被清掉，b 未處理保留
});

test('客人端只看到自己這桌，含冷卻秒數與 10 分鐘內處理完的', () => {
  let { state } = sc.create({ calls: [] }, { id: 'a', session_id: 's1', table: 'A1', kind: 'water' }, T0);
  ({ state } = sc.create(state, { id: 'b', session_id: 's2', table: 'A2', kind: 'pack', by: '別桌' }, T0));
  let v = sc.publicView(state, 's1', T0 + 10e3);
  assert.equal(v.open.length, 1); assert.equal(v.cooldown, 50); assert.equal(v.kinds.length, 5);
  assert.ok(!JSON.stringify(v).includes('別桌'));
  ({ state } = sc.resolve(state, 'a', 'x', T0 + 60e3));
  v = sc.publicView(state, 's1', T0 + 120e3);
  assert.equal(v.open.length, 0); assert.equal(v.recent_done.length, 1); assert.equal(v.cooldown, 0);
  assert.equal(sc.publicView(state, 's1', T0 + 60e3 + 11 * 60e3).recent_done.length, 0);
});

test('接線：路由、FOOD_API、操作紀錄、文件', () => {
  const server = read('server.js');
  for (const r of ["app.get('/api/service-calls'", "app.post('/api/service-calls'", "app.get('/api/admin/orders/service-calls'", "app.post('/api/admin/orders/service-calls/:id/done'"]) assert.ok(server.includes(r), r);
  // 品牌子帳號（CAFE／BAR）靠 FOOD_API 的 orders 前綴放行
  assert.match(server, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|/);
  assert.equal(require('../lib/pos-log.js').describe('POST', '/orders/service-calls/sc_1/done'), '處理客人呼叫服務');
});

test('客人頁：頁首常駐呼叫鈕、不進購物車、三語文案', () => {
  const html = read('public/order.html'), lib = read('public/order-lib.js');
  assert.ok(html.includes('id="call-open"') && html.includes('id="call"') && html.includes('id="call-status"'));
  assert.ok(html.includes("api('/service-calls'"));
  // 不可走購物車（$0 商品）
  const block = html.slice(html.indexOf('/* ---- 呼叫服務'), html.indexOf('/* ---- 取餐推播'));
  assert.ok(block.length > 100); assert.ok(!/items|addLine|\/orders\/table/.test(block), '呼叫服務不可加進購物車');
  for (const k of ['call_btn', 'call_title', 'call_send', 'call_sent', 'call_waiting', 'call_done', 'call_wait']) assert.equal((lib.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, k);
});

test('POS：任何分頁都看得到通知、響鈴、處理鍵', () => {
  const pos = read('public/pos.html'), js = read('public/pos-service-calls.js');
  assert.ok(pos.includes('<script src="/pos-service-calls.js"></script>') && pos.includes('serviceCallBoot();'));
  assert.ok(pos.includes('#svc-calls{position:fixed'));
  assert.ok(js.includes("api('/admin/orders/service-calls')") && js.includes('svcChime()') && js.includes('data-svc-done'));
  assert.ok(!/innerHTML = `[^`]*\$\{c\.(table|note|by)\}/.test(js), '動態文字要經 esc()');
});
