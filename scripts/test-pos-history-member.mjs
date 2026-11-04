// 查單補入會員（KK 11/5）：已結帳單事後綁會員、補累點，不改金額／發票
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const log = require('../lib/pos-log.js');
const root = new URL('..', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
const server = read('server.js'), ops = read('public/pos-ops.js'), api = read('docs/API.md');
const route = sig => { const i = server.indexOf(sig); assert.ok(i >= 0, sig); return server.slice(i, server.indexOf('\n}));', i)); };
const now = Date.parse('2026-11-05T12:00:00+08:00');
const base = { id: 'ord_abc123', status: 'paid', amount: 500, payer: { method: 'cash' }, paid_at: '2026-11-05T10:00:00+08:00' };

test('attachMemberCheck：可補的單通過', () => {
  assert.equal(T.attachMemberCheck(base, now), true);
});
test('attachMemberCheck：作廢／預收／已有會員／超過 7 天擋下', () => {
  assert.throws(() => T.attachMemberCheck({ ...base, status: 'void' }, now), /作廢/);
  assert.throws(() => T.attachMemberCheck({ ...base, payer: { prepay: true } }, now), /預收/);
  assert.throws(() => T.attachMemberCheck({ ...base, payer: { member_id: 'u_1' } }, now), /已經有會員/);
  assert.throws(() => T.attachMemberCheck({ ...base, user_id: 'u_1' }, now), /已經有會員/);
  assert.throws(() => T.attachMemberCheck({ ...base, paid_at: '2026-10-28T10:00:00+08:00' }, now), /7 天/);
  assert.throws(() => T.attachMemberCheck(null, now), /找不到/);
});
test('server：路由分品牌、鎖單、補累點扣打賞、寫 user_id', () => {
  const r = route("app.post('/api/admin/orders/:id/member'");
  assert.match(r, /posScope\(req\)/);
  assert.match(r, /FOR UPDATE/);
  assert.match(r, /attachMemberCheck/);
  assert.match(r, /applyYanForCheckout/);
  assert.match(r, /orderTip\(o\)/);
  assert.match(r, /SET user_id=\$2,payer=\$3/);
  assert.doesNotMatch(r, /SET[^']*amount=/);
  assert.match(route("app.get('/api/admin/orders/history'"), /voided_by,user_id'/);
  assert.match(route("app.get('/api/admin/orders/history'"), /o\.table_members=/);
  assert.match(r, /memberId/);
});
test('文件與操作紀錄', () => {
  assert.match(api, /### POST \/api\/admin\/orders\/:id\/member/);
  assert.equal(log.describe('POST', '/orders/ord_abc123/member'), '查單補入會員');
  assert.match(read('lib/pos-log.js'), /查單補入會員/);
});
test('POS 查單：入會員鈕＋手機／掃碼＋顯示會員', () => {
  assert.match(ops, /data-hist-member=/);
  assert.match(ops, /const canAttachMember=/);
  assert.match(ops, /api\('\/admin\/orders\/'\+o\.id\+'\/member'/);
  assert.match(ops, /pickMemberCard\(\)/);
  assert.match(ops, /o\.table_members\|\|\[\]/);
  assert.match(ops, /api\('\/admin\/yan\/members\?q='/, '從會員列表搜尋');
  assert.match(ops, /done\(\{member_id:b\.dataset\.hmPick\}\)/);
  assert.match(ops, /data-hm-new=/, '查不到可直接用手機新增');
  assert.match(ops, /p\.member_added\?'・補登'/);
});
