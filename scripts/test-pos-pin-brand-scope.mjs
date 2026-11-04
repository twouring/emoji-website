// 員工識別碼以品牌為範圍（KK 11/4）：同品牌不可重複、跨品牌可以重複；查人一定要帶品牌
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../lib/pos-staff.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const staff = [
  { id: 'a', pin: '1111', venues: 'CAFE' },
  { id: 'b', pin: '1111', venues: 'BAR' },
  { id: 'c', pin: '2222', venues: null },        // 所有品牌
  { id: 'd', pin: '3333', venues: 'REST', active: false },
];
test('四個品牌：在咖啡、三點水、等等空間、約書旅', () => {
  assert.deepEqual(S.VENUES, ['CAFE', 'BAR', 'STAY', 'REST']);
  assert.deepEqual(S.staffBrands(null), ['CAFE', 'BAR', 'STAY', 'REST']);
  assert.deepEqual(S.staffBrands('rest,SPACE'), ['REST']);
});
test('同品牌撞碼擋、跨品牌同碼放行；所有品牌員工佔用每個品牌；停用的不佔', () => {
  assert.equal(S.pinTaken('1111', ['CAFE'], staff), true);
  assert.equal(S.pinTaken('1111', ['STAY'], staff), false, '跨品牌可重複');
  assert.equal(S.pinTaken('2222', ['REST'], staff), true, 'venues 空＝所有品牌都佔');
  assert.equal(S.pinTaken('1111', null, staff), true, '新員工所有品牌要避開每一店');
  assert.equal(S.pinTaken('3333', ['REST'], staff), false, '停用員工釋出識別碼');
  assert.equal(S.pinTaken('1111', ['CAFE'], staff, 'a'), false, '編輯自己不算撞');
});
test('pinMatch：依品牌找到對的人；不帶品牌時同碼多人就不認', () => {
  assert.equal(S.pinMatch(staff.filter(s => s.pin === '1111'), 'BAR').id, 'b');
  assert.equal(S.pinMatch(staff.filter(s => s.pin === '1111'), 'CAFE').id, 'a');
  assert.equal(S.pinMatch(staff.filter(s => s.pin === '1111'), 'STAY'), null);
  assert.equal(S.pinMatch(staff.filter(s => s.pin === '1111'), ''), null, '同碼兩人、沒品牌＝不認');
  assert.equal(S.pinMatch(staff.filter(s => s.pin === '2222'), 'REST').id, 'c');
});
test('server：拿掉全域唯一索引；所有用識別碼查人的地方都走 staffByPin／pinMatch', () => {
  assert.match(server, /DROP INDEX IF EXISTS pos_staff_pin_idx/);
  assert.doesNotMatch(server, /CREATE UNIQUE INDEX IF NOT EXISTS pos_staff_pin_idx/);
  assert.equal((server.match(/FROM pos_staff WHERE pin=\$1 AND active/g) || []).length, 2, '只剩 staffByPin 與 pin-login 兩處直接查');
  assert.match(server, /posStaff\.pinTaken\(s\.pin,s\.venues,others\)/);
});
test('POS 網址：沒有 /pos；四個品牌網址都回 POS 頁', () => {
  assert.match(server, /\/\^\\\/\(atcafe\|3am\|staysquare\|restbook\)\(\\\/\|\$\)\/\.test\(req\.path\)\) return sendPosPage\(res\)/);
  assert.doesNotMatch(server, /app\.get\(\['\/pos', '\/pos\/\*'\], \(_req, res\) => sendPosPage/);
});
