// 訂位按「已到」→ 跳桌位選擇帶位開桌（KK 11/7）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('async function seatReservation'), src.indexOf('async function openManyTables'));

test('已到鍵改走帶位流程（看板與清單共用同一個 handler）', () => {
  assert.match(src, /if\(status==='arrived'\)return seatReservation\(/);
});
test('選桌：使用中停用、已排桌預選、可只標已到', () => {
  const pick = src.slice(src.indexOf('function pickSeatTables'), src.indexOf('async function seatReservation'));
  assert.match(pick, /busy\[t\]\?' disabled'/);
  assert.match(pick, /preset\.filter/);
  assert.match(pick, /data-arrive/);
  assert.match(css, /\.pos-seat-grid \.pos-move-opt:disabled/);
});
test('帶位：選人數→PIN→開桌→標已到記桌號、不寄信→印 QR', () => {
  assert.match(fn, /pickParty\(/);
  assert.match(fn, /ensureOperator\(/);
  assert.match(fn, /\/admin\/orders\/sessions/);
  assert.match(fn, /status:'arrived',table_no/);
  assert.match(fn, /notify:false/);
  assert.match(fn, /printTableQr\(/);
  assert.ok(fn.indexOf('/admin/orders/sessions') < fn.indexOf('markArrived(opened'), '先開桌成功才標已到');
});
