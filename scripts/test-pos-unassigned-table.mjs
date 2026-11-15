// POS 加開桌號可選「未指定桌號」：保留給尚未分配實體桌位的內用單。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('加開桌號提供未指定桌號，並由桌號驗證明確接受', async () => {
  const pos = read('public/pos-ops.js');
  const orders = read('lib/table-orders.js');

  assert.match(pos, /data-unspecified-table/, '加開桌號面板要有未指定桌號選項');
  assert.match(pos, /done\('未指定桌號'\)/, '選項要回傳固定桌號代碼');
  assert.match(orders, /未指定桌號/, '桌號驗證要明確允許此代碼');
  const { TABLE_RE } = await import('../lib/table-orders.js');
  assert.equal(TABLE_RE.test('未指定桌號'), true, '固定代碼必須可通過桌號驗證');
  assert.equal(TABLE_RE.test('未指定'), false, '不可放寬為任意中文桌號');
});

test('未指定桌號可同時開多組：首組原名，後續取最小可用流水號', async () => {
  const { TABLE_RE, isUnassignedTable, nextUnassignedTable } = await import('../lib/table-orders.js');
  assert.equal(nextUnassignedTable(new Set()), '未指定桌號');
  assert.equal(nextUnassignedTable(new Set(['未指定桌號'])), '未指定桌號-2');
  assert.equal(nextUnassignedTable(new Set(['未指定桌號', '未指定桌號-2', '未指定桌號-4'])), '未指定桌號-3');
  assert.equal(TABLE_RE.test('未指定桌號-2'), true, '系統生成的後續組別必須可通過驗證');
  assert.equal(TABLE_RE.test('未指定桌號-99'), true);
  for (const bad of ['未指定', '未指定桌號-0', '未指定桌號-1', '未指定桌號-01', '未指定桌號-100', '未指定桌號-A', '未指定桌號-二']) {
    assert.equal(TABLE_RE.test(bad), false, bad);
    assert.equal(isUnassignedTable(bad), false, bad);
  }
  assert.equal(isUnassignedTable('未指定桌號'), true);
  assert.equal(isUnassignedTable('未指定桌號-2'), true);
  const full = new Set(['未指定桌號', ...Array.from({ length: 98 }, (_, i) => `未指定桌號-${i + 2}`)]);
  assert.equal(nextUnassignedTable(full), null, '99 組全開時不可重複分配');

  const server = read('server.js');
  const open = server.slice(server.indexOf("app.post('/api/admin/orders/sessions',"), server.indexOf('async function issueEzpayForOrder'));
  assert.match(open, /isUnassignedTable\(table\)&&table!==tableOrders\.UNSPECIFIED_TABLE/, 'API 不可直接指定流水號跳號');
  assert.match(open, /請選「未指定桌號」，系統會自動編號/);
  assert.match(open, /nextUnassignedTable\(used\)/, '開桌端點要為未指定桌號自動分配下一組');
  assert.match(open, /venue IS NOT DISTINCT FROM \$3/, '已用號碼只看同一品牌，與鎖範圍一致');
  assert.match(open, /tableLock\(unassigned\?tableOrders\.UNSPECIFIED_TABLE:table,venue\)/, '同品牌未指定桌開桌共用一把鎖');
  assert.match(open, /let s=\(takeout\|\|unassigned\)\?null:pickVenueSession/, '未指定桌每次開新場，不併進已開的桌');
});
