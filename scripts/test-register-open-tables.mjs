import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('../lib/pos-register.js');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const ops = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('blockingTables：內用、外帶擋；未送單預約取餐、未付款 App 商店單不擋', () => {
  const rows = [
    { table_no: 'A3', items: [] },
    { table_no: 'A10', items: [{ order_id: 'o1' }] },
    { table_no: 'W01', items: [{ id: 'x' }] },
    { table_no: 'W02', items: [], pickup_at: '2026-11-04T10:00:00Z', pickup_placed_at: null },
    { table_no: 'W03', items: [], pickup_at: '2026-11-04T10:00:00Z', pickup_placed_at: '2026-11-04T09:40:00Z' },
    { table_no: 'W04', items: [{ id: 's' }], shop_at: '2026-11-04T09:00:00Z' },
    { table_no: 'W05', items: [{ id: 's', order_id: 'o2' }], shop_at: '2026-11-04T09:00:00Z' },
  ];
  assert.deepEqual(R.blockingTables(rows), ['A3', 'A10', 'W01', 'W03', 'W05']);
  assert.deepEqual(R.blockingTables([]), []);
  assert.deepEqual(R.blockingTables(null), []);
});

test('關帳路由：還有桌沒清回 409，且在寫入前檢查', () => {
  const start = server.indexOf("app.post('/api/admin/registers/:id/close'");
  const close = server.slice(start, server.indexOf("app.post('/api/admin/registers/:id/reopen'"));
  const check = close.indexOf('openTablesBlockingClose()');
  assert.ok(check > 0, '關帳要查開著的桌');
  assert.ok(check < close.indexOf('UPDATE pos_registers'), '檢查要在寫入前');
  assert.match(close, /status\(409\)[^;]*open_tables/);
  assert.match(server, /open_tables:await openTablesBlockingClose\(\)/, 'GET registers 回 open_tables');
});

test('POS 關帳表單：有沒清的桌就列桌號並停用確認鈕', () => {
  assert.ok(ops.includes('reg-close-tables'));
  assert.match(ops, /if\(!c\.allOk\|\|\(REG_DATA\?\.open_tables\|\|\[\]\)\.length\)\{go\.disabled=true/);
});
