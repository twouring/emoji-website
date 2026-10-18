// 掃 QR 不開桌（第一次加點才開）；這支手機結帳後鎖定，舊分頁不再開新場
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');
const route = server.slice(server.indexOf("app.get('/api/orders/table'"), server.indexOf('async function currentTableSession('));

test('掃 QR 只讀不開桌：沒有開著的場回 id:null 空殼，不 INSERT', () => {
  assert.doesNotMatch(route, /TABLE_SELF_OPEN/);
  assert.doesNotMatch(route, /needs_open/);
  assert.doesNotMatch(route, /INSERT INTO table_sessions/);
  assert.match(route, /emptyTableSession\(table\)/);
  assert.match(server, /const emptyTableSession=table=>\(\{id:null,/);
});
test('第一次加點才開場：POST /api/orders/table/items 在同一筆交易找／開場再加品項', () => {
  const r = server.slice(server.indexOf("app.post('/api/orders/table/items'"), server.indexOf("app.get('/api/orders/:id'"));
  assert.match(r, /verifyTable\(req\.body\?\.t,req\.body\?\.k,SECRET\)/);
  assert.match(r, /assertNotPaused/);
  assert.match(r, /currentTableSession\(client,table\)\)\|\|\(await client\.query\('INSERT INTO table_sessions\(id,table_no\)/);
  assert.match(server, /async function mutateItems\(req,res,fn,resolve\)/);
  assert.ok(server.indexOf("app.post('/api/orders/table/items'") < server.indexOf("app.post('/api/orders/:id/items'"), '要排在 :id 路由前');
});
test('前端：尚未開桌時加點走 /orders/table/items 帶 t/k，開場後接上即時同步', () => {
  assert.match(html, /api\(S\.id\?'\/orders\/'\+S\.id\+'\/items':'\/orders\/table\/items'/);
  assert.match(html, /Object\.assign\(\{item_id:CURRENT_ITEM\.id,t:T,k:K,/);
  assert.match(html, /if\(!S\.id\)return load\(\)/);
  assert.match(html, /\|\|!S\|\|!S\.id\)return;/);
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
