// 品牌 POS 的訂位只顯示該品牌時段（KK 11/5）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('..', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');

test('GET /api/admin/reservations 依 ?venue= 過濾清單與待確認數', () => {
  const s = read('server.js');
  const i = s.indexOf("app.get('/api/admin/reservations',");
  const block = s.slice(i, s.indexOf('}));', i));
  assert.match(block, /pinVenue\(req,req\.query\.venue\)/);
  assert.doesNotMatch(block, /const venues=null/);
  assert.match(block, /pending=.*venues\.includes\(tableOrders\.reservationVenue/);
});

test('POS 訂位清單與頂欄紅點都帶 SCOPE', () => {
  assert.match(read('public/pos-ops.js'), /admin\/reservations\?from=.*SCOPE\?'&venue='\+SCOPE:''/);
  assert.match(read('public/pos.html'), /admin\/reservations\?days=7' \+ \(SCOPE \? '&venue=' \+ SCOPE : ''\)/);
});
