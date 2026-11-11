import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const pos = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('外國人數：存在 __foreign，不帶就保留、超過總人數擋下或收斂，舊桌次為 null', () => {
  let v = T.partySetByPos({}, 4, 1, 2);
  assert.equal(T.partyForeign(v), 2);
  v = T.partySetByPos(v, 5);                 // 只改人數，外國人保留
  assert.equal(T.partyForeign(v), 2);
  v = T.partySetByPos(v, 1);                 // 縮到 1 位，外國人收斂
  assert.equal(T.partyForeign(v), 1);
  assert.throws(() => T.partySetByPos({}, 2, 0, 3), /外國人數不能超過總人數/);
  assert.equal(T.partyForeign(T.partySetByPos({}, 3, 0)), null);   // 沒記過
  assert.equal(T.partyForeign(T.partySetByPos({}, 3, 0, 0)), 0);
});

test('來客受眾：依開桌時間分店別、外帶不算、占比只用有記錄的桌次', () => {
  const at = (day, hh) => new Date(`${day}T${hh}:00:00+08:00`).toISOString();
  const S = [
    { table_no: 'A1', created_at: at('2026-11-03', '10'), party_votes: { __pos: 4, __kids: 1, __foreign: 2 } },
    { table_no: 'A2', created_at: at('2026-11-03', '20'), party_votes: { __pos: 2, __foreign: 2 } },
    { table_no: 'A3', created_at: at('2026-11-03', '21'), party_votes: { __pos: 3 } },                // 舊桌次：沒記外國人
    { table_no: 'W01', created_at: at('2026-11-03', '12'), party_votes: { __pos: 2, __foreign: 2 } }, // 外帶不算
    { table_no: 'B1', created_at: at('2026-11-04', '01'), party_votes: { __pos: 2, __foreign: 0 } },  // 凌晨＝前一營業日三點水
  ];
  const r = T.visitorSummary(S, { from: '2026-11-03', to: '2026-11-03' });
  assert.equal(r.tables, 4); assert.equal(r.guests, 11); assert.equal(r.kids, 1);
  assert.equal(r.foreign, 4); assert.equal(r.recorded_tables, 3); assert.equal(r.recorded_guests, 8);
  assert.equal(r.foreign_rate, 50);
  assert.equal(r.by_venue.CAFE.foreign_rate, 50);
  assert.equal(r.by_venue.BAR.tables, 3); assert.equal(r.by_venue.BAR.foreign, 2);
  assert.equal(T.visitorSummary(S, { venues: ['CAFE'] }).tables, 1);
  assert.equal(T.visitorSummary([], {}).foreign_rate, null);
});

test('接線：開桌與改人數都帶 foreign，分析回 visitors，POS 開桌視窗有外國人列', () => {
  assert.match(server, /partySetByPos\(\{\},req\.body\.party_size,req\.body\.kids,req\.body\.foreign\)/);
  assert.match(server, /partySetByPos\(s\.party_votes,req\.body\?\.party_size,req\.body\?\.kids,req\.body\?\.foreign\)/);
  assert.match(server, /visitors:tableOrders\.visitorSummary\(sess,\{venues,from,to\}\)/);
  assert.match(pos, /function pickPartyForeign\(/);
  assert.match(pos, /partyGrid\('foreign',0,PARTY_FOREIGN,f,max\)/);
  assert.doesNotMatch(pos.slice(pos.indexOf('function pickPartySize('),pos.indexOf('// 第二步：其中外國人')), /data-foreign|其中外國人/, '外國人改獨立彈窗，不放在大人小孩那頁');
  assert.match(pos, /return \{party_size:a\+k,kids:k,foreign:f\}/);
  assert.match(pos, /body:\{party_size:p\.party_size,kids:p\.kids,foreign:p\.foreign\}/);
  assert.match(pos, /來客受眾（開桌人數）/);
});
