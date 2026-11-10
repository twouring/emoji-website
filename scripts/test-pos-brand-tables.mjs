// POS 開桌頁各品牌獨立（KK 11/10）：桌位擺放／桌號清單各品牌一份；開桌記品牌，同桌號兩店可各開一場、互不併入
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const posRegister = require('../lib/pos-register.js');
const tableOrders = require('../lib/table-orders.js');
const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const route = sig => { const i = srv.indexOf(sig); assert.ok(i >= 0, sig); return srv.slice(i, srv.indexOf('\n}));', i)); };
const fn = name => { const i = srv.indexOf(`function ${name}(`); assert.ok(i >= 0, name); const j = srv.indexOf('\n}', i), k = srv.indexOf('\n', i); const one = srv.slice(i, k); return /\}$/.test(one) && (one.match(/\{/g) || []).length === (one.match(/\}/g) || []).length ? one : srv.slice(i, j + 2); };
const helpers = new Function('posRegister', 'tableOrders', [fn('sessionVenueOf'), fn('sessionInVenues'), fn('pickVenueSession'), 'return {sessionVenueOf,sessionInVenues,pickVenueSession};'].join('\n'))(posRegister, tableOrders);

test('桌位擺放各品牌一份：key＝pos_table_layout:<VENUE>，沒存過沿用共用', () => {
  assert.match(srv, /const tableLayoutKey=v=>v\?'pos_table_layout:'\+v:'pos_table_layout'/);
  assert.match(srv, /contentValue\(tableLayoutKey\(v\)\)\)\|\|await contentValue\('pos_table_layout'\)/);
  const r = route("app.post('/api/admin/orders/table-layout'");
  assert.match(r, /pinVenue\(req,req\.body\?\.venue\|\|req\.query\.venue\)/);
  assert.doesNotMatch(r, /VALUES \('pos_table_layout'/);
  assert.match(route("app.get('/api/admin/orders',"), /table_layout:await tableLayoutOf\(/);
});

test('開桌記品牌、鎖與查場次都分品牌', () => {
  const r = route("app.post('/api/admin/orders/sessions',");
  assert.match(r, /const venue=pinVenue\(req,req\.body\?\.venue\)/);
  assert.match(r, /tableLock\(table,venue\)/);
  assert.match(r, /pickVenueSession\(/);
  assert.match(r, /party_votes,venue\) VALUES\(\$1,\$2,\$3,\$4,\$5,\$6\)/);
  assert.match(srv, /ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS venue TEXT/);
  assert.match(route("app.post('/api/admin/orders/sessions/:id/move'"), /pickVenueSession\(/);
  assert.match(route("app.get('/api/admin/tables/qr'"), /pickVenueSession\(/);
});

test('同桌號兩店各一場：各挑自己的、看不到對方的空桌', () => {
  const cafe = { id: 'a', table_no: 'A1', venue: 'CAFE', items: [], created_at: '2026-11-10T02:00:00Z' };
  const bar = { id: 'b', table_no: 'A1', venue: 'BAR', items: [], created_at: '2026-11-10T11:00:00Z' };
  assert.equal(helpers.pickVenueSession([bar, cafe], 'CAFE').id, 'a');
  assert.equal(helpers.pickVenueSession([bar, cafe], 'BAR').id, 'b');
  assert.equal(helpers.pickVenueSession([cafe], 'BAR'), null);   // 三點水開 A1 不會併進在咖啡那場
  assert.ok(!helpers.sessionInVenues(cafe, ['BAR']));             // 在咖啡空桌不出現在三點水
  assert.ok(helpers.sessionInVenues(cafe, ['CAFE']));
  // 舊資料沒記 venue：照舊依品項／開桌時間
  const legacy = { id: 'c', table_no: 'A2', items: [], created_at: '2026-11-10T02:00:00Z' };
  assert.equal(helpers.sessionVenueOf(legacy), 'CAFE');
  // 在咖啡開的桌、跨時段點了三點水品項：三點水看得到自己的品項
  assert.ok(helpers.sessionInVenues({ ...cafe, items: [{ venue: 'BAR' }] }, ['BAR']));
});

test('關帳擋桌、當班營收認開桌品牌', () => {
  assert.deepEqual(posRegister.sessionVenues({ venue: 'BAR', items: [], created_at: '2026-11-10T02:00:00Z' }), ['BAR']);
  assert.deepEqual(posRegister.blockingTables([{ table_no: 'A1', venue: 'BAR', items: [], created_at: '2026-11-10T02:00:00Z' }], 'CAFE'), []);
});
