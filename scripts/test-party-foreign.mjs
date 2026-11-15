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
  assert.match(server, /visitors:tableOrders\.visitorSummary\(sess,\{venues,from,to\}\),foreign:tableOrders\.foreignSummary\(sess,orders,\{venues,from,to\}\)/);
  assert.match(server, /SELECT id,session_id,table_no,items,amount,payer,tappay,status,paid_at FROM table_orders/);
  assert.match(server, /SELECT id,table_no,party_votes,created_at FROM table_sessions/);
  assert.match(pos, /function pickPartyForeign\(/);
  assert.match(pos, /partyGrid\('foreign',0,PARTY_FOREIGN,f,max\)/);
  assert.doesNotMatch(pos.slice(pos.indexOf('function pickPartySize('),pos.indexOf('// 第二步：其中外國人')), /data-foreign|其中外國人/, '外國人改獨立彈窗，不放在大人小孩那頁');
  assert.match(pos, /return \{party_size:a\+k,kids:k,foreign:f\}/);
  assert.match(pos, /body:\{party_size:p\.party_size,kids:p\.kids,foreign:p\.foreign\}/);
  assert.match(pos, /來客受眾（開桌人數）/);
});

test('星期分析：by_weekday 帶營業日數與時段，凌晨單算前一天', () => {
  const o = (id, iso, amount) => ({ id, paid_at: new Date(iso), status: 'paid', table_no: 'A1', amount, payer: {}, items: [{ item_id: 'i', zh: '茶', venue: 'BAR', qty: 1, price: amount }] });
  const d = T.analyticsSummary([o('1', '2026-11-13T20:00:00+08:00', 300), o('2', '2026-11-14T01:00:00+08:00', 200), o('3', '2026-11-06T20:00:00+08:00', 100)], { from: '2026-11-01', to: '2026-11-14' });
  assert.equal(d.by_weekday[5].amount, 600); assert.equal(d.by_weekday[5].orders, 3); assert.equal(d.by_weekday[5].days, 2);   // 11/14 01:00＝11/13（五）營業日
  assert.equal(d.by_weekday[5].by_hour['01'].amount, 200);
  assert.equal(d.by_weekday[6], undefined);
  const at = (day, hh) => new Date(`${day}T${hh}:00:00+08:00`).toISOString();
  const v = T.visitorSummary([{ table_no: 'A1', created_at: at('2026-11-15', '10'), party_votes: { __pos: 3, __foreign: 1 } }], {});
  assert.equal(v.by_weekday[0].guests, 3); assert.equal(v.by_weekday[0].foreign_rate, 33.3);
});

test('外國客分析：外國客桌 vs 本國桌，依 session_id 對單、不算舊桌次與打賞', () => {
  const at = (day, hh) => new Date(`${day}T${hh}:00:00+08:00`).toISOString();
  const S = [
    { id: 's1', table_no: 'A1', created_at: at('2026-11-14', '10'), party_votes: { __pos: 2, __foreign: 2 } },
    { id: 's2', table_no: 'A2', created_at: at('2026-11-14', '11'), party_votes: { __pos: 4, __foreign: 0 } },
    { id: 's3', table_no: 'A3', created_at: at('2026-11-14', '12'), party_votes: { __pos: 2 } },                 // 沒記
    { id: 's4', table_no: 'W01', created_at: at('2026-11-14', '12'), party_votes: { __pos: 1, __foreign: 1 } }, // 外帶
    { id: 's5', table_no: 'B1', created_at: at('2026-11-14', '20'), party_votes: { __pos: 3, __foreign: 1 } },  // 三點水
  ];
  const L = (zh, price, extra = {}) => ({ item_id: zh, zh, cat: 'DRINK', venue: 'CAFE', qty: 1, price, ...extra });
  const O = [
    { session_id: 's1', status: 'paid', amount: 600, payer: { source: 'google', tip_amount: 100 }, items: [L('拿鐵', 250), L('拿鐵', 250), L('打賞', 100, { tip: true })] },
    { session_id: 's2', status: 'paid', amount: 400, payer: {}, items: [L('美式', 400)] },
    { session_id: 's3', status: 'paid', amount: 999, payer: {}, items: [L('茶', 999)] },
    { session_id: 's1', status: 'void', amount: 999, payer: {}, items: [L('茶', 999)] },
    { session_id: 's5', status: 'paid', amount: 900, payer: { source: 'ig' }, items: [L('啤酒', 900, { venue: 'BAR' })] },
  ];
  const f = T.foreignSummary(S, O, { from: '2026-11-14', to: '2026-11-14' });
  assert.equal(f.recorded_tables, 3); assert.equal(f.unrecorded_tables, 1); assert.equal(f.foreign_tables, 2); assert.equal(f.foreign_guests, 3);
  assert.equal(f.foreign_table_rate, 66.7);
  assert.deepEqual([f.groups.foreign.amount, f.groups.foreign.avg_table, f.groups.foreign.avg_guest], [1400, 700, 280]);
  assert.deepEqual([f.groups.local.amount, f.groups.local.avg_table, f.groups.local.avg_guest], [400, 400, 100]);
  assert.equal(f.items[0].zh, '拿鐵'); assert.equal(f.items[0].qty, 2); assert.ok(!f.items.some(i => i.zh === '打賞'));
  assert.equal(f.sources.google.orders, 1); assert.equal(f.sources.ig.orders, 1);
  assert.equal(f.by_weekday[6].foreign_tables, 2); assert.equal(f.by_hour['10'].foreign_tables, 1);
  const cafe = T.foreignSummary(S, O, { venues: ['CAFE'] });
  assert.equal(cafe.foreign_tables, 1); assert.equal(cafe.groups.foreign.amount, 500);
  assert.equal(T.foreignSummary([], []).foreign_table_rate, null);
});

test('接線：POS 分析有星期、外國客分頁', () => {
  assert.match(pos, /if\(kind==='weekday'\)/); assert.match(pos, /if\(kind==='foreign'\)/);
  assert.match(pos, /外國客桌 vs 本國桌/); assert.match(pos, /每營業日平均營收/);
});
