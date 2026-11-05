// 開關帳看帳不看時間（KK 11/5）：過了 03:00 營業日換日，還沒關的帳仍算開帳中
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const fn = name => { const i = server.indexOf(name); assert.ok(i >= 0, name); return server.slice(i, server.indexOf('\n}', i)); };

test('結帳判斷開帳：開著的帳不限營業日', () => {
  const body = fn('async function registersOpenMap(');
  assert.match(body, /WHERE closed_at IS NULL AND day>=\$1 ORDER BY opened_at/);
  assert.doesNotMatch(body.split('\n')[1], /day=\$1/);
});
test('日結列帳：看今天時帶入前一天還沒關的帳', () => {
  const i = server.indexOf("app.get('/api/admin/registers',"); const body = server.slice(i, server.indexOf('}));', i));
  assert.match(body, /day=\$1 OR \(\$2 AND closed_at IS NULL AND day>=\$3\)/);
});
test('日期認列依開帳日：日結、小結、歷史單都走 ordersOfDay', () => {
  const body = fn('async function ordersOfDay(');
  assert.match(body, /r\.venue===v&&\+new Date\(r\.opened_at\)<=t&&\(!r\.closed_at\|\|t<\+new Date\(r\.closed_at\)\)/);
  assert.match(body, /r\?r\.day:tableOrders\.MenuLib\.businessDay\(t\)/);
  assert.match(fn('async function registerSummary('), /ordersOfDay\(regDayStr/);
  assert.equal((server.match(/await ordersOfDay\(day,/g) || []).length, 2, 'sales＋history');
});
test('開帳：同品牌還有沒關的帳（不論哪天）就擋', () => {
  assert.match(server, /'register-open:'\+venue/);
});

test('沒關的舊帳只延到隔一個營業日，不吃更晚的單（BOWEN 11/5：10/12 測試帳吃掉 11/3 起在咖啡的單）', () => {
  assert.match(server, /const liveFloor=\(\)=>dayMinus1\(tableOrders\.MenuLib\.businessDay\(\)\)/);
  assert.match(server, /r\.day>=floor&&r\.day<=bd/);
});
