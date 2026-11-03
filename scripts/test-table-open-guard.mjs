// 開桌改由外場在 POS 操作（2026-10-26）：QR 綁場次、結帳後失效；客人端不能自己開桌；桌上固定 QR 停用
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const ops = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');
const route = server.slice(server.indexOf("app.get('/api/orders/table'"), server.indexOf("app.get('/api/orders/:id'"));

test('單次 QR 簽章綁場次：別場、改字、換密鑰、舊桌碼格式都不過', () => {
  const id = 'ts_0123456789abcdef', k = T.sessionKey(id, 'sec');
  assert.equal(T.verifySession(id, k, 'sec'), id);
  assert.equal(T.verifySession('ts_0123456789abcdee', k, 'sec'), null);
  assert.equal(T.verifySession(id, k.slice(0, 15) + (k[15] === 'x' ? 'y' : 'x'), 'sec'), null);
  assert.equal(T.verifySession(id, k, 'other'), null);
  assert.equal(T.verifySession('A3', T.tableKey('A3', 'sec'), 'sec'), null);
  assert.notEqual(T.sessionKey(id, 'sec'), T.tableKey(id, 'sec'));
  assert.match(T.sessionUrl('https://www.emoji.tw', id, 'sec'), /^https:\/\/www\.emoji\.tw\/order\?s=ts_0123456789abcdef&k=[A-Za-z0-9_-]{16}$/);
});
test('單次 QR 只讀這一場；桌上固定 QR 只在在咖啡時段（KK 11/3）', () => {
  assert.match(route, /verifySession\(req\.query\.s,req\.query\.k,SECRET\)/);
  assert.match(route, /if\(req\.query\.t&&!req\.query\.s\)return fixedTableQr\(req,res\)/);
  assert.doesNotMatch(route.slice(0, route.indexOf('async function fixedTableQr(')), /INSERT INTO table_sessions/);
  assert.doesNotMatch(server, /app\.post\('\/api\/orders\/table\/items'/);
  const fx = server.slice(server.indexOf('async function fixedTableQr('), server.indexOf("app.get('/api/orders/:id'"));
  assert.match(fx, /if\(!tableOrders\.fixedQrOpen\(\)\)return res\.status\(403\)/);
  assert.match(fx, /k:tableOrders\.sessionKey\(id,SECRET\)/);
  const W = (h, m) => Date.UTC(2026, 10, 3, h - 8, m);
  assert.equal(T.fixedQrOpen(W(8, 0)), true); assert.equal(T.fixedQrOpen(W(16, 29)), true);
  assert.equal(T.fixedQrOpen(W(16, 30)), false); assert.equal(T.fixedQrOpen(W(20, 0)), false); assert.equal(T.fixedQrOpen(W(7, 59)), false);
});
test('固定 QR：同桌併入、上一組結清開新場、久無動靜有未付不讓新客人併入', () => {
  const now = Date.now(), fresh = new Date(now - 60e3).toISOString(), old = new Date(now - 5 * 3600e3).toISOString();
  assert.equal(T.fixedQrDecision(null, [], now), 'renew');
  assert.equal(T.fixedQrDecision({ items: [], updated_at: fresh }, [], now), 'join');
  assert.equal(T.fixedQrDecision({ items: [{ line: 'l1', price: 100, qty: 1 }], updated_at: fresh }, [], now), 'join');
  assert.equal(T.fixedQrDecision({ items: [{ line: 'l1', price: 100, qty: 1, order_id: 'o1' }], updated_at: fresh }, [{ status: 'done' }], now), 'renew');
  assert.equal(T.fixedQrDecision({ items: [{ line: 'l1', price: 100, qty: 1, order_id: 'o1' }], updated_at: fresh }, [{ status: 'ready' }], now), 'join');
  assert.equal(T.fixedQrDecision({ items: [{ line: 'l1', price: 100, qty: 1 }], updated_at: old }, [], now), 'blocked');
  assert.equal(T.fixedQrDecision({ items: [], updated_at: old }, [], now), 'renew');
});
test('POS：在咖啡時段開桌不印 QR 單，三點水照印', () => {
  assert.match(ops, /function cafeFixedQr\(\)\{return [^}]*orderWindow\(\)\.venue==='CAFE'/);
  assert.match(ops, /if\(!url\|\|cafeFixedQr\(\)\)return false;/);
  assert.match(ops, /if\(!cafeFixedQr\(\)\)for\(const o of opened\)/);
});
test('會員兌換只接本場 QR，已結束的場 409，不自動開場', () => {
  const r = server.slice(server.indexOf("app.post('/api/me/redeem'"), server.indexOf("app.get('/api/me/yan'"));
  assert.match(r, /verifySession\(req\.body\?\.s, req\.body\?\.k, SECRET\)/);
  assert.match(r, /s\.status !== 'open'[\s\S]{0,120}409/);
  assert.doesNotMatch(r, /INSERT INTO table_sessions/);
});
test('POS 開桌回 qr_url 並自動印；可一次開多桌；補印只給開著的桌', () => {
  const open = server.slice(server.indexOf("app.post('/api/admin/orders/sessions',"), server.indexOf('async function issueEzpayForOrder'));
  assert.match(open, /qr_url:takeout\?undefined:tableOrders\.sessionUrl\(APP_BASE,s\.id,SECRET\)/);
  const qr = server.slice(server.indexOf("app.get('/api/admin/tables/qr'"));
  assert.match(qr.slice(0, 900), /尚未開桌，請先開桌再印 QR/);
  assert.match(ops, /if\(out\.created&&out\.qr_url\)await printOpenedQr\(out\.table,out\.qr_url,out\)/);
  assert.equal((ops.match(/printOpenedQr\(out\.table,out\.qr_url,out\)/g) || []).length, 2, '點空桌、有訂位的空桌兩條都要印');
  assert.match(ops, /id="pos-open-many"/);
  assert.match(ops, /async function openManyTables\(/);
  assert.match(ops, /await printTableQr\(o\.table,o\.qr_url,o\)/);
});
test('前端：只認 s/k，加點只打 /orders/:id/items；場已結束顯示感謝頁、不能自己重開', () => {
  assert.match(html, /SID=qs\.get\('s'\)/);
  assert.match(html, /api\('\/orders\/table\?'\+\(FIXED\?'t='/);
  assert.match(html, /api\('\/orders\/'\+S\.id\+'\/items'/);
  assert.doesNotMatch(html, /\/orders\/table\/items/);
  assert.match(html, /ENDED_KEY='order_ended_'\+\(FIXED\?'t_':''\)\+\(SID\|\|T\)/);
  assert.match(html, /if\(FIXED\)\{SID=s\.id;K=s\.k;\}/);
  assert.match(html, /if\(s\.status!=='open'\)\{sessionClosed\(s\);return null;\}/);
  assert.match(html, /id="thanks-again"[^>]*hidden/);
  assert.match(html, /\$\('#thanks-again'\)\.hidden=!FIXED/);
  for (const key of ['thanks', 'thanks_hint', 'thanks_again']) assert.equal((lib.match(new RegExp(`\\b${key}: '`, 'g')) || []).length, 3, `${key} 三語都要有`);
  assert.doesNotMatch(lib, /重新掃描桌上的 QR/);
});
test('加菜與送單有 rate limit；結帳關桌後加菜回「這桌已結束」', () => {
  assert.match(server, /app\.post\('\/api\/orders\/:id\/items',rateLimit/);
  assert.match(server, /app\.post\('\/api\/orders\/:id\/place',rateLimit/);
  const m = server.slice(server.indexOf('async function mutateItems('), server.indexOf("app.post('/api/orders/:id/items'"));
  assert.match(m, /s\.status!=='open'[\s\S]*這桌已結束/);
});
