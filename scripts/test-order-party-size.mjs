import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const pos = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('來客人數：每支手機一票，重選覆蓋自己那票', () => {
  let v = T.partyVote({}, 'g1', 2);
  v = T.partyVote(v, 'g1', 3);
  assert.deepEqual(v, { g1: 3 });
  v = T.partyVote(v, 'g2', 4);
  assert.deepEqual(v, { g1: 3, g2: 4 });
});

test('來客人數：多人選了不同人數，取平均四捨五入', () => {
  assert.equal(T.partySize({}), null);
  assert.equal(T.partySize(null), null);
  assert.equal(T.partySize({ a: 4 }), 4);
  assert.equal(T.partySize({ a: 3, b: 4 }), 4);       // 3.5 → 4
  assert.equal(T.partySize({ a: 2, b: 2, c: 3 }), 2);  // 2.33 → 2
  assert.equal(T.partySize({ a: 2, b: 3, c: 3 }), 3);  // 2.67 → 3
});

test('來客人數：超出範圍或沒有 guest 拒收', () => {
  for (const n of [0, -1, 21, 'x', null]) assert.throws(() => T.partyVote({}, 'g', n), /請選擇/);
  assert.throws(() => T.partyVote({}, '', 2), /請選擇/);
});

test('伺服器：加點時順帶記票（格式錯誤不擋加點），桌況與客人端都回 party_size', () => {
  assert.match(server, /ADD COLUMN IF NOT EXISTS party_votes JSONB NOT NULL DEFAULT '\{\}'/);
  assert.match(server, /if\(req\.body\?\.party_size!=null\)\{try\{votes=tableOrders\.partyVote\(votes,req\.body\.guest,req\.body\.party_size\);\}catch\{\}\}/);
  assert.match(server, /const publicSession=[^\n]*party_size:tableOrders\.partySize\(s\.party_votes\)/);
  assert.match(server, /operator:s\.opened_by_staff_name\|\|null,party_size:tableOrders\.partySize\(s\.party_votes\)/);
  assert.match(server, /pickup_placed_at,party_votes FROM/);
});

test('客人端：稱呼關卡攤開人數按鈕；同桌已有人數就不再出現；加點時帶上', () => {
  const gate = html.slice(html.indexOf('id="name-gate"'), html.indexOf('id="order-content"'));
  assert.match(gate, /id="party-pick"/);
  assert.match(html, /\[1,2,3,4,5,6,7,8,9,10\]\.map/);
  assert.match(html, /\$\('#party-pick'\)\.hidden=!!\(S&&S\.party_size\);/);
  assert.match(html, /PARTY\?\{party_size:PARTY\}:\{\}/);
  assert.doesNotMatch(html, /localStorage\.setItem\('order_party/);
  for (const t of ["party_title: '幾位用餐？'", "party_title: 'How many in your party?'", "party_title: '何名様ですか？'"]) assert.ok(lib.includes(t), t);
});

test('POS：桌況卡與明細顯示來客人數', () => {
  assert.match(pos, /<span class="tk-party">\$\{Number\(s\.party_size\)\} 位<\/span>/);
  assert.match(pos, /來客 \$\{Number\(s\.party_size\)\} 位/);
});
