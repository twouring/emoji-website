// scripts/test-pos-drawer-float.mjs — 錢櫃／錢盒／零用金拆開（KK 11/17）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const R = require('../lib/pos-register.js');
const ui = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const acc = { linepay: { actual: 0, confirmed: true }, ctbc: { actual: 0, confirmed: true }, transfer: { actual: 0, confirmed: true } };
const moves = [{ type: 'out', amount: 300, reason: '買食材' }, { type: 'in', amount: 100, reason: '補零錢' }, { id: 'cm_t', type: 'out', amount: 200, reason: '支付打賞', locked: 'tip' }];

test('11/17 起：臨時收支走零用金袋，不算錢櫃；打賞支付仍算錢櫃', () => {
  const s = R.expectedCash({ opening_cash: 3000, cash_sales: 1500, moves, split: true });
  assert.equal(s.expected, 3000 + 1500 - 200);
  assert.equal(s.cash_in, 0); assert.equal(s.cash_out, 200);
  assert.equal(s.petty_in, 100); assert.equal(s.petty_out, 300);
  assert.equal(R.floatOf(s), 3000, '關帳後放回錢盒＝開班 3,000');
  const c = R.closeRegister({ counted_cash: 4300, cash_confirmed: true, accounts: acc }, s);
  assert.equal(c.diff, 0); assert.equal(c.keep_cash, 0); assert.equal(c.take_cash, 4300);
  assert.equal(c.cash_actual, 4300 - 3000 + 200, '現金實收＝點鈔－開班＋打賞支付');
  assert.throws(() => R.closeRegister({ counted_cash: 2900, cash_confirmed: true, note: '短', accounts: acc }, s), /開班現金/);
  const rep = R.registerReport({ venue: 'CAFE', day: '2026-11-17', closed_at: 'x' }, s, {}, moves);
  assert.equal(rep.petty_split, true); assert.equal(rep.float_cash, 3000);
  assert.deepEqual(rep.moves.map(m => m.drawer), [false, false, true]);
});

test('舊帳（11/17 前）照舊：臨時收支算錢櫃，零用金＝開帳＋收－支', () => {
  const s = R.expectedCash({ opening_cash: 3000, cash_sales: 1500, moves });
  assert.equal(s.expected, 3000 + 1500 + 100 - 500);
  assert.equal(s.petty_split, false); assert.equal(R.floatOf(s), 2600);
  assert.equal(R.pettySplit('2026-11-16'), false); assert.equal(R.pettySplit('2026-11-17'), true);
  assert.equal(R.DRAWER_FLOAT, 3000);
});

test('server 依帳本營業日套新規則；前端開帳預設錢盒 3,000、臨時收支不開錢櫃', () => {
  assert.match(srv, /expectedCash\(\{[^}]*split:posRegister\.pettySplit\(regDayStr\)/);
  assert.match(ui, /const DRAWER_FLOAT=3000;/);
  assert.match(ui, /regDefaultCash=v=>Number\(regHandover\(v\)\?\.keep_cash\)>0\?[^:]+:DRAWER_FLOAT/);
  assert.match(ui, /if\(!out\.petty_split\)await manualCashDrawer\('臨時'/);
  assert.match(ui, /function pettyCashOf\(r\)\{return r\.petty_split\?Number\(r\.opening_cash/);
  assert.match(ui, /放回錢盒/);
});

test('零用金袋餘額：底數 5,000＋收－支；打賞支付不算；日結頂端顯示錢櫃與零用金袋', () => {
  assert.equal(R.PETTY_FUND.CAFE, 5000); assert.equal(R.PETTY_FUND.BAR, 5000);
  assert.equal(R.pettyBalance('CAFE', moves), 5000 - 300 + 100);
  assert.equal(R.pettyBalance('STAY', moves), null);
  assert.match(srv, /petty_balance:pettyBy/);
  assert.match(ui, /function cashPotsHtml\(v,r\)/);
  assert.match(ui, /<span>錢櫃<\/span>/); assert.match(ui, /<span>零用金袋<\/span>/);
  assert.match(ui, /待核銷補回/);
  assert.match(ui, /cash_move:\['買食材','核銷補回'/);
});
