// 會員身分標籤（KK 11/19）：員工 8 折、股東 7 折、特約商家 9 折；只有驗證過的會員才套，折數由伺服器決定
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mt = require('../lib/member-tags.js');
const tableOrders = require('../lib/table-orders.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const members = fs.readFileSync(new URL('../public/pos-members.js', import.meta.url), 'utf8');

test('標籤折數：員工 8 折、股東 7 折、特約商家 9 折', () => {
  assert.deepEqual(mt.tagOf('staff'), { key: 'staff', label: '員工', percent: 20 });
  assert.deepEqual(mt.tagOf('shareholder'), { key: 'shareholder', label: '股東', percent: 30 });
  assert.deepEqual(mt.tagOf('partner'), { key: 'partner', label: '特約商家', percent: 10 });
  assert.equal(mt.tagOf('vip'), null);
  assert.equal(mt.parseTag(''), null);
  assert.throws(() => mt.parseTag('boss'), /無效/);
});

test('結帳折扣：沒驗證身分／沒標籤擋，標籤不符 409，前端數值不採用', () => {
  assert.throws(() => mt.tagDiscount('staff', { member_tag: 'staff' }, false), e => e.status === 400);
  assert.throws(() => mt.tagDiscount('staff', { member_tag: null }, true), e => e.status === 400);
  assert.throws(() => mt.tagDiscount('staff', { member_tag: 'partner' }, true), e => e.status === 409);
  const d = mt.tagDiscount('shareholder', { member_tag: 'shareholder' }, true);
  assert.deepEqual(d, { type: 'percent', value: 30, reason: '股東身分', tag: 'shareholder' });
  const out = tableOrders.discountOf({ discount: d }, 1000);
  assert.equal(out.amount, 300);
  assert.equal(out.tag, 'shareholder');
});

test('接線：欄位、設定 API 要店長識別碼、lookup 只對驗證過的回 tag、checkout 由伺服器覆寫折扣且不疊會籍價', () => {
  assert.match(server, /ALTER TABLE users ADD COLUMN IF NOT EXISTS member_tag TEXT/);
  assert.match(server, /app\.post\('\/api\/admin\/yan\/members\/:id\/tag',[^\n]*superOrManagerPin/);
  assert.match(server, /res\.json\(\{ tag: verified \? memberTags\.tagOf\(user\.member_tag\) : null,/);
  assert.match(server, /tagDisc=memberTags\.tagDiscount\(req\.body\.discount\.tag,memberUser,verified\)/);
  assert.match(server, /if\(tagDisc\)\{req\.body\.discount=tagDisc;memberActive=false;\}/);
});

test('POS：帶入會員自動套身分折扣、移除／換會員撤掉；會員頁可設定身分', () => {
  assert.match(ops, /function posApplyTag\(out\)/);
  assert.equal((ops.match(/const tg=typeof posApplyTag==='function'\?posApplyTag\(out\):'';/g) || []).length, 3);
  assert.match(ops, /POS_MEMBER=false;posClearTag\(\);after\(\);/);
  assert.ok(ops.indexOf('function posApplyTag(') > ops.indexOf('function openMemberDialog(') && ops.indexOf('function posApplyTag(') < ops.indexOf('function paintPos(){'), 'helpers 要在 openMemberDialog～paintPos 之間（舊測試 vm 切這段）');
  assert.match(members, /id="members-tag"/);
  assert.match(members, /async function setPosMemberTag\(d\)/);
  assert.match(members, /'X-Manager-Pin':pin/);
});
