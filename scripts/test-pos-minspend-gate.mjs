// scripts/test-pos-minspend-gate.mjs — POS 按「結帳」時先核對低消（KK 11/7）
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../lib/table-orders').MenuLib;
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ops = read('public/pos-ops.js'), server = read('server.js');

function load(confirmAnswer = true) {
  const asked = [];
  const ctx = vm.createContext({ MenuLib: M, num: n => Number(n).toLocaleString('en-US'), posConfirm: async (msg, opt) => { asked.push({ msg, opt }); return confirmAnswer; } });
  vm.runInContext(ops.slice(ops.indexOf('function minSpendState('), ops.indexOf('function minSpendHtml(')), ctx);
  return { ctx, asked, state: vm.runInContext('minSpendState', ctx), text: vm.runInContext('minSpendCheckText', ctx), gate: vm.runInContext('minSpendGate', ctx) };
}
const bar = (price, qty = 1, extra = {}) => ({ line: 'b' + Math.random().toString(36).slice(2, 7), venue: 'BAR', cat: 'MAIN', price, qty, ...extra });

test('未達低消：結帳前跳確認，按「返回補點」就不結帳', async () => {
  const L = load(false);
  const ms = L.state({ party_size: 2, lines: [bar(100)] });
  assert.ok(ms.short > 0);
  assert.equal(await L.gate({ party_size: 2, lines: [bar(100)] }, '桌號 A1'), false);
  assert.equal(L.asked.length, 1);
  assert.match(L.asked[0].msg, /未達低消/);
  assert.match(L.asked[0].msg, /還差 NT\$/);
  assert.equal(L.asked[0].opt.ok, '仍要結帳');
  assert.equal(L.asked[0].opt.cancel, '返回補點');
});

test('已達低消、外帶、沒有低消店別：不跳確認', async () => {
  const L = load(false);
  assert.equal(await L.gate({ party_size: 1, lines: [bar(5000)] }, 'x'), true);
  assert.equal(await L.gate({ takeout: true, party_size: 1, lines: [bar(10)] }, 'x'), true);
  assert.equal(await L.gate({ party_size: 1, lines: [{ line: 'c', venue: 'STAY', cat: 'MAIN', price: 10, qty: 1 }] }, 'x'), true);
  assert.equal(L.asked.length, 0);
});

test('沒設人數：提醒無法核對低消', async () => {
  const L = load(true);
  assert.equal(await L.gate({ party_size: 0, lines: [bar(100)] }, '桌號 A1'), true);
  assert.match(L.asked[0].msg, /還沒設定人數/);
});

test('分組結帳：這桌已結帳的品項也算進低消', () => {
  const L = load();
  const cur = { party_size: 1, lines: [bar(100)], paid_lines: [bar(5000)] };
  assert.equal(L.state(cur).short, 0);
  assert.ok(L.state({ ...cur, paid_lines: [] }).short > 0);
});

test('接線：結帳鍵先過低消把關，再問餐點到齊；平均分攤只在第 1 人問', () => {
  const i = ops.indexOf("host.querySelector('#pos-checkout').onclick=");
  const body = ops.slice(i, ops.indexOf('const unserved=', i) + 400);
  assert.ok(body.indexOf('minSpendGate(cur,') < body.indexOf('餐點都到齊了嗎'));
  assert.match(body, /aa\.index===1&&!await minSpendGate/);
  assert.match(body, /!\(aa&&aa\.index>1\)&&!await minSpendGate/);
  assert.match(server, /paid_lines=s\.items\.filter\(l=>l\.order_id/);
});

test('提示日別：三點水日–四顯示「日–四」、五六顯示「週五六」，在咖啡金額低消顯示「週六日」（KK 11/8）', () => {
  const L = load();
  const base = { per: 300, people: 2, total: 600, spent: 100, short: 500 };
  assert.match(L.text({ ...base, venue: 'BAR', weekend: false }), /未達低消：日–四每人 NT\$300/);
  assert.match(L.text({ ...base, per: 600, total: 1200, short: 1100, venue: 'BAR', weekend: true }), /未達低消：週五六每人 NT\$600/);
  assert.match(L.text({ ...base, venue: 'CAFE', type: 'amount', weekend: true }), /未達低消：週六日每人 NT\$300/);
  assert.match(ops, /const day=minDayLabel\(ms\);/);
});
