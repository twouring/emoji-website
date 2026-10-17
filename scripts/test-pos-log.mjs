import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { describe, summarize } = createRequire(import.meta.url)('../lib/pos-log.js');
test('POS 動作對應中文，非 POS 路徑不記', () => {
  assert.equal(describe('POST', '/orders/sessions/abc/checkout'), '結帳收款');
  assert.equal(describe('POST', '/orders/o1/void'), '作廢整張單');
  assert.equal(describe('POST', '/menu/sold-out'), '估清／恢復供應');
  assert.equal(describe('POST', '/yan/grant'), '手動給點');
  assert.equal(describe('POST', '/events'), null);
  assert.equal(describe('POST', '/content'), null);
});
test('摘要不含識別碼與敏感欄位', () => {
  const s = summarize({ pin: '1234', operator_id: 'st_1', reason: '點錯', operator_pin: '9999' });
  assert.equal(s, 'reason=點錯');
});
