import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const reg = require('../lib/pos-register.js');
require('../public/menu-lib.js');
const ML = globalThis.MenuLib;
const at = '2026-11-07T12:00:00+08:00';
const L = (o) => ({ line: Math.random().toString(36).slice(2), qty: 1, venue: 'CAFE', placed_at: at, ...o });

test('當班未結帳：只算本品牌、未結、未取消、非打賞的行，扣預收抵扣', () => {
  const sessions = [
    { table_no: 'A1', created_at: at, items: [L({ price: 150 }), L({ price: 200, qty: 2 }), L({ price: 90, order_id: 'o1' }), L({ price: 80, cancelled: true }), L({ price: 100, tip: true }), L({ price: 120, placed_at: null })] },
    { table_no: 'A2', created_at: at, items: [L({ price: 300 }), L({ price: -100, credit_of: 'o2' })] },
    { table_no: 'A3', created_at: at, items: [L({ price: 50, order_id: 'o3' })] },   // 全結了、還沒清桌：不列
    { table_no: 'B1', created_at: at, items: [L({ price: 400, venue: 'BAR' })] },
  ];
  const out = reg.pendingRevenue(sessions, 'CAFE', { serviceCharge: ML.serviceCharge, now: Date.parse(at) });
  assert.equal(out.tables, 2);
  assert.deepEqual(out.list.map(t => [t.table_no, t.amount]), [['A1', 670], ['A2', 200]]);
  assert.equal(out.amount, 870);
  assert.equal(out.list[0].unsent, true);
  assert.equal(out.list[0].items, 4);
  assert.equal(reg.pendingRevenue(sessions, 'BAR', { now: Date.parse(at) }).amount, 400);
});

test('三點水未結帳含預估服務費；外帶不收', () => {
  const now = Date.parse('2026-11-07T21:00:00+08:00');
  const sessions = [
    { table_no: 'B2', created_at: at, items: [L({ price: 1000, venue: 'BAR' })] },
    { table_no: 'W01', created_at: at, items: [L({ price: 500, venue: 'BAR' })] },
  ];
  const out = reg.pendingRevenue(sessions, 'BAR', { serviceCharge: ML.serviceCharge, now });
  const b2 = out.list.find(t => t.table_no === 'B2'), w = out.list.find(t => t.table_no === 'W01');
  assert.equal(b2.service, 100); assert.equal(b2.amount, 1100);
  assert.equal(w.service, 0); assert.equal(w.amount, 500);
  assert.equal(out.service, 100);
});

test('未送單的預約取餐、未付款 App 商店單不算（同關帳擋桌規則）', () => {
  const sessions = [
    { table_no: 'W02', created_at: at, pickup_at: at, items: [L({ price: 200, placed_at: null })] },
    { table_no: 'W03', created_at: at, shop_at: at, items: [L({ price: 300 })] },
  ];
  assert.equal(reg.pendingRevenue(sessions, 'CAFE').tables, 0);
});

test('接線：GET registers 對開著的帳附 pending、日結帳本卡顯示當班營收', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /pending=r\.closed_at\?null:posRegister\.pendingRevenue\(openSess,r\.venue/);
  const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(ops, /function shiftRevenueHtml\(r\)/);
  assert.match(ops, /\$\{done\?'':shiftRevenueHtml\(r\)\}/);
  assert.match(ops, /當班合計/);
});
