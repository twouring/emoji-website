// scripts/test-reservation-delete.mjs — 訂位新增刪除功能：DELETE /api/admin/reservations/:id（軟刪除）＋前端刪除按鈕。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js');
const ops = read('public/pos-ops.js');
const docs = read('docs/API.md');

test('dining_reservations 新增 deleted_at 欄位（CREATE TABLE 與既有庫 ALTER 都要有，軟刪除才不丟歷史紀錄）', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS dining_reservations \(\n[\s\S]*?deleted_at TIMESTAMPTZ\n\);/);
  assert.match(server, /ALTER TABLE dining_reservations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ/);
});

test('GET /api/admin/reservations 排除已刪除的紀錄', () => {
  const section = server.split("app.get('/api/admin/reservations'")[1].split('}));')[0];
  assert.match(section, /AND deleted_at IS NULL/);
});

test('DELETE /api/admin/reservations/:id：軟刪除、品牌子帳號只能刪自己店別時段的（404）', () => {
  assert.match(server, /app\.delete\('\/api\/admin\/reservations\/:id',auth,adminOnly,requireDb,wrap/);
  const section = server.split("app.delete('/api/admin/reservations/:id'")[1].split(/\}\)\);/)[0];
  assert.match(section, /deleted_at IS NULL/);
  assert.match(section, /找不到這筆訂位。/);
  assert.match(section, /UPDATE dining_reservations SET deleted_at=now\(\) WHERE id=\$1/);
  assert.match(section, /tableOrders\.reservationVenue\(r\.reserve_time\)/, '要檢查品牌子帳號的店別權限');
});

test('docs/API.md 記錄 DELETE /api/admin/reservations/:id', () => {
  assert.match(docs, /### DELETE \/api\/admin\/reservations\/:id/);
  const section = docs.split('### DELETE /api/admin/reservations/:id')[1].split(/\n### /)[0];
  assert.match(section, /軟刪除/);
  assert.match(section, /404/);
});

test('POS「訂位」分頁：每筆（含已取消）都有「刪除」按鈕，按下先 posConfirm 再送 DELETE', () => {
  assert.match(ops, /data-resv-delete="\$\{esc\(r\.id\)\}">刪除<\/button>/);
  assert.match(ops, /host\.querySelectorAll\('\[data-resv-delete\]'\)\.forEach\(b=>b\.onclick=async\(\)=>\{/);
  assert.match(ops, /if\(!await posConfirm\(`刪除 /);
  assert.match(ops, /api\('\/admin\/reservations\/'\+r\.id,\{method:'DELETE'\}\)/);
});
