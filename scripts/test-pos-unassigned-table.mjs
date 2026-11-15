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
