// 掃 QR 自動開桌；這支手機結帳後鎖定，舊分頁不再開新場
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');
const route = server.slice(server.indexOf("app.get('/api/orders/table'"), server.indexOf("app.get('/api/orders/:id'"));

test('掃 QR 找不到開著的場 → 自動 INSERT 開桌（不再擋 needs_open）', () => {
  assert.doesNotMatch(route, /TABLE_SELF_OPEN/);
  assert.doesNotMatch(route, /needs_open/);
  assert.match(route, /INSERT INTO table_sessions\(id,table_no\)/);
});
test('結帳關桌後的場，加菜／送單都回「這桌已結束」', () => {
  const m = server.slice(server.indexOf('async function mutateItems('), server.indexOf("app.post('/api/orders/:id/items'"));
  assert.match(m, /s\.status!=='open'[\s\S]*這桌已結束/);
});
test('加菜與送單有 rate limit', () => {
  assert.match(server, /app\.post\('\/api\/orders\/:id\/items',rateLimit/);
  assert.match(server, /app\.post\('\/api\/orders\/:id\/place',rateLimit/);
});
test('同裝置鎖定：場結束寫 localStorage，不再打 /orders/table；感謝頁可重新點餐', () => {
  assert.match(html, /id="thanks"/);
  assert.match(html, /id="thanks-again"/);
  assert.match(html, /ENDED_KEY='order_ended_'\+T/);
  assert.match(html, /function sessionClosed\(s\)\{setEnded/);
  assert.match(html, /if\(endedId\(\)\)\{showThanks\(\);return Promise\.resolve\(null\);\}/);
  assert.match(html, /s\.status!=='open'[\s\S]{0,80}sessionClosed\(s\)/);
  assert.match(html, /\$\('#thanks-again'\)\.onclick=function\(\)\{\s*clearEnded\(\)/);
  assert.doesNotMatch(html, /if\(s\.status!=='open'\)\{return load\(\);\}/);
  for (const key of ['thanks', 'thanks_hint', 'thanks_again']) {
    assert.equal((lib.match(new RegExp(`\\b${key}: '`, 'g')) || []).length, 3, `${key} 三語都要有`);
  }
});
