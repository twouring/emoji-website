// POS 通知客人（KK 11/7）：店員在 POS 該桌按「通知」→ 客人點餐頁即時跳出
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const N = require('../lib/guest-notices.js');
const root = new URL('..', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
const server = read('server.js'), order = read('public/order.html'), ops = read('public/pos-ops.js');
const route = sig => { const i = server.indexOf(sig); assert.ok(i >= 0, sig); return server.slice(i, server.indexOf('\n}));', i)); };
const T0 = Date.parse('2026-11-07T12:00:00Z');

test('add：驗證種類、分鐘、自訂文字', () => {
  assert.throws(() => N.add([], { id: 'a', kind: 'nope' }), /請選擇/);
  assert.throws(() => N.add([], { id: 'a', kind: 'wait' }), /分鐘/);
  assert.throws(() => N.add([], { id: 'a', kind: 'wait', minutes: 0 }), /分鐘/);
  assert.throws(() => N.add([], { id: 'a', kind: 'custom', text: '   ' }), /內容/);
  const r = N.add([], { id: 'a', kind: 'wait', minutes: 15, by: '小明' }, T0);
  assert.equal(r.notice.minutes, 15);
  assert.equal(N.textOf(r.notice), '不好意思，餐點需要再等約 15 分鐘，請稍候。');
  assert.equal(N.textOf(r.notice, 'en'), 'Sorry, your order will take about 15 more minutes.');
  const c = N.add([], { id: 'b', kind: 'custom', text: '  熱飲\n請稍候 '.padEnd(200, '!') }, T0);
  assert.ok(c.notice.text.length <= N.TEXT_MAX && !/\n/.test(c.notice.text));
  assert.equal(N.add([], { id: 'c', kind: 'pickup', minutes: 9 }, T0).notice.minutes, undefined);
});

test('每桌保留最近 20 則；客人只看 3 小時內、不含店員名', () => {
  let list = [];
  for (let i = 0; i < 25; i++) list = N.add(list, { id: 'n' + i, kind: 'delay', by: '小明' }, T0 + i * 60e3).list;
  assert.equal(list.length, N.MAX_KEEP);
  assert.equal(list[0].id, 'n5');
  const v = N.publicView(list, T0 + 30 * 60e3);
  assert.ok(v.every(n => !('by' in n)));
  assert.equal(N.publicView(list, T0 + 4 * 3600e3).length, 0);
  assert.deepEqual(N.normalize('壞掉'), []);
});

test('四語字串一致：客人端 OrderLib、POS 預覽與 lib 相同', () => {
  const c = { window: {} }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(read('public/menu-lib.js'), c); vm.runInContext(read('public/order-lib.js'), c);
  const O = c.OrderLib || c.window.OrderLib;
  for (const k of N.KIND_IDS.filter(k => k !== 'custom'))
    for (const l of ['zh', 'en', 'ja', 'ko']) assert.equal(O.text(l, 'notice_' + k, { n: 10 }), N.textOf({ kind: k, minutes: 10 }, l), k + l);
  for (const k of N.KIND_IDS.filter(k => k !== 'custom')) assert.ok(ops.includes(`{id:'${k}',label:'${N.LABEL[k]}',zh:'${N.KINDS[k].zh}'}`), 'POS 預覽 ' + k);
});

test('server：欄位、路由分品牌、客人端回 notices、桌況回 last_notice', () => {
  assert.match(server, /ADD COLUMN IF NOT EXISTS notices JSONB NOT NULL DEFAULT '\[\]'/);
  const r = route("app.post('/api/admin/orders/sessions/:id/notice'");
  assert.match(r, /auth,adminOnly,requireDb/);
  assert.match(r, /orderVisibleToVenues\(s,posScope\(req\)\)/);
  assert.match(r, /status='open'/);
  assert.match(r, /UPDATE table_sessions SET notices=/);
  assert.match(server, /const publicSession=[^\n]*notices:guestNotices\.publicView\(s\.notices\)/);
  assert.match(server, /last_notice:/);
  assert.match(read('docs/API.md'), /### POST \/api\/admin\/orders\/sessions\/:id\/notice/);
});

test('POS：左欄「通知」兩字鍵＋彈窗；客人端常駐列＋跳出＋換語言重畫', () => {
  assert.match(ops, /id="pos-notice"[^>]*aria-label="通知客人"><span>通知<\/span>/);
  assert.match(ops, /pickGuestNotice\(cur\)[\s\S]{0,200}\/notice'/);
  assert.doesNotMatch(ops.slice(ops.indexOf('function pickGuestNotice'), ops.indexOf('// 表單內嵌')), /prompt\(/);
  assert.match(read('public/pos-icons.js'), /\['#pos-notice','bell'\]/);
  assert.match(order, /id="notice-bar"[^>]*aria-live="polite"/);
  assert.match(order, /id="notice-pop" role="alertdialog"/);
  assert.match(order, /function applyState\(s\)\{[^\n]*renderNotices\(\)/);
  assert.match(order, /renderMember\(\);renderNotices\(\);\}/);
  assert.match(order, /n\.kind==='custom'\?\(n\.text\|\|''\):tr\('notice_'\+n\.kind/);
});
