// 掃 QR 只代表桌位：沒開桌就不能點；舊 QR／截圖在結帳關桌後失效
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const route = server.slice(server.indexOf("app.get('/api/orders/table'"), server.indexOf("app.get('/api/orders/:id'"));

test('掃 QR 找不到開著的場 → 409 needs_open，不自動 INSERT（除非 TABLE_SELF_OPEN=1）', () => {
  assert.match(route, /TABLE_SELF_OPEN!=='1'/);
  assert.match(route, /status\(409\)[\s\S]*needs_open:true/);
  assert.ok(route.indexOf('needs_open') < route.indexOf('INSERT INTO table_sessions'), '拒絕判斷須在自動開桌之前');
});
test('結帳關桌後的場，加菜／送單／結帳都回「這桌已結束」', () => {
  const m = server.slice(server.indexOf('async function mutateItems('), server.indexOf("app.post('/api/orders/:id/items'"));
  assert.match(m, /s\.status!=='open'[\s\S]*這桌已結束/);
});
test('加菜與送單有 rate limit；客人端遇 409 顯示請洽櫃台', () => {
  assert.match(server, /app\.post\('\/api\/orders\/:id\/items',rateLimit/);
  assert.match(server, /app\.post\('\/api\/orders\/:id\/place',rateLimit/);
  assert.match(html, /e\.status===409&&S/);
});
