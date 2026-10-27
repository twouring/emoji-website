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

test('來客人數：只看 POS 設定，未設定為 null', () => {
  assert.equal(T.partySize({}), null);
  assert.equal(T.partySize(null), null);
  assert.equal(T.partySize({ g1: 4 }), null);   // 舊版客人票不再計入
  let v = T.partySetByPos({ g1: 4 }, 3);
  assert.equal(T.partySize(v), 3);
  v = T.partySetByPos(v, 6);
  assert.equal(T.partySize(v), 6);
  for (const n of [0, -1, 21, 'x', null]) assert.throws(() => T.partySetByPos({}, n), /人數請選/);
});

test('客人端：不顯示、不送出來客人數；伺服器不收客人送的人數', () => {
  assert.doesNotMatch(html, /party-pick|party_size|PARTY/);
  assert.doesNotMatch(lib, /party_title/);
  assert.doesNotMatch(server, /partyVote/);
  assert.doesNotMatch(server, /const publicSession=[^\n]*party_size/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS party_votes JSONB NOT NULL DEFAULT '\{\}'/);
  assert.match(server, /pickup_placed_at,party_votes FROM/);
});

test('POS：設定人數 API、桌位面板按鈕、桌況卡與明細顯示', () => {
  assert.match(server, /app\.post\('\/api\/admin\/orders\/sessions\/:id\/party',auth,adminOnly,requireDb/);
  assert.match(server, /operator:s\.opened_by_staff_name\|\|null,party_size:tableOrders\.partySize\(s\.party_votes\)/);
  assert.match(pos, /id="pos-party"/);
  assert.match(pos, /api\('\/admin\/orders\/sessions\/'\+cur\.id\+'\/party',\{method:'POST',body:\{party_size:p\.party_size,kids:p\.kids\}\}\)/);
  assert.match(pos, /<span class="tk-party">\$\{Number\(s\.party_size\)\} 位<\/span>/);
  assert.match(pos, /來客 \$\{Number\(s\.party_size\)\} 位/);
});

test('小孩人數：存在 __kids，不帶就保留、超過總人數擋下', () => {
  let v = T.partySetByPos({}, 4, 1);
  assert.equal(T.partySize(v), 4); assert.equal(T.partyKids(v), 1);
  v = T.partySetByPos(v, 5);            // 只改總人數，小孩數保留
  assert.equal(T.partyKids(v), 1);
  v = T.partySetByPos(v, 1);            // 總人數縮到 1，小孩自動收斂為 0（至少 1 位大人）
  assert.equal(T.partyKids(v), 0);
  assert.throws(() => T.partySetByPos({}, 2, 2), /小孩人數要小於總人數/);
  assert.equal(T.partyKids({}), null);
  assert.equal(T.sessionNo('ts_0123456789abcdef'), 'ABCDEF');
});

test('開桌就選人數：POS 內用開桌先問大人／小孩，伺服器開桌時寫入並回單號、開桌時間', () => {
  assert.match(pos, /function pickParty\(title/);
  assert.match(pos, /if\(!body\.takeout\)\{const p=await pickParty\(/);
  assert.match(pos, /const p=await pickParty\(`\$\{table\} 開桌（訂位/);
  assert.match(pos, /party\[t\]=p;/, '一次開多桌也要逐桌選人數');
  assert.match(server, /votes=tableOrders\.partySetByPos\(\{\},req\.body\.party_size,req\.body\.kids\)/);
  assert.match(server, /INSERT INTO table_sessions\(id,table_no,opened_by_staff_id,opened_by_staff_name,party_votes\)/);
  assert.match(server, /no:tableOrders\.sessionNo\(s\.id\),opened_at:s\.created_at\|\|null,party_size:tableOrders\.partySize\(s\.party_votes\),kids:tableOrders\.partyKids\(s\.party_votes\)/);
});
