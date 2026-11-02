import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../lib/member-history.js');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');

const ledger = [
  { id: 'y1', kind: 'earn', delta: 66, brand: 'BAR', ref_type: 'order', ref_id: 'o1', created_at: '2026-11-02T11:20:00Z', expires_at: '2027-11-02T11:20:00Z' },
  { id: 'y2', kind: 'redeem', delta: -70, brand: '', ref_type: 'order', ref_id: 'o1', created_at: '2026-11-02T11:20:00Z' },
  { id: 'y3', kind: 'grant', delta: 50, ref_type: 'manual', ref_id: 'gr_x', reason: '開幕補點', created_at: '2026-11-01T02:00:00Z', expires_at: '2027-11-01T02:00:00Z' },
  { id: 'y4', kind: 'grant', delta: 5, ref_type: 'review', ref_id: 'rv', reason: '內部備註', created_at: '2026-10-30T02:00:00Z' },
  { id: 'y5', kind: 'void_earn', delta: -15, ref_type: 'order', ref_id: 'o2', created_at: '2026-10-29T02:00:00Z' },
];

test('orderView：店別、排除點歌／打賞／取消行、對應點數', () => {
  const o = H.orderView({ id: 'o1', amount: 660, status: 'paid', paid_at: '2026-11-02T11:20:00Z', payer: {},
    items: [{ zh: '琴通寧', en: 'Gin Tonic', qty: 2, price: 330, venue: 'BAR' }, { zh: '點歌', song: {}, qty: 1 }, { zh: '打賞', tip: {}, qty: 1 }, { zh: '薯條', qty: 1, cancelled: true }] }, ledger);
  assert.equal(o.venue, 'BAR'); assert.equal(o.venue_zh, '三點水');
  assert.deepEqual(o.items.map(i => i.zh), ['琴通寧']);
  assert.equal(o.earned, 66); assert.equal(o.redeemed, 70); assert.equal(o.void, false);
  assert.equal(H.orderView({ id: 'o9', status: 'void', items: [] }, ledger).void, true);
});

test('ledgerView：新的在前、分類、只露手動贈點原因', () => {
  const v = H.ledgerView(ledger);
  assert.equal(v[0].ref, 'o1');
  assert.deepEqual(v.map(r => r.type).sort(), ['earn', 'grant', 'redeem', 'review', 'void'].sort());
  assert.equal(v.find(r => r.type === 'grant').reason, '開幕補點');
  assert.equal(v.find(r => r.type === 'review').reason, '');
  assert.equal(v.at(-1).type, 'void');
});

test('路由只給會員本人、App 有入口與三語字串', () => {
  const i = server.indexOf("app.get('/api/me/history'");
  assert.ok(i > 0);
  const block = server.slice(i, i + 800);
  assert.match(block, /req\.auth\.sub/);
  assert.match(block, /WHERE user_id=\$1/);
  assert.match(app, /id="hist-open"/);
  assert.match(app, /id="hist-open2"/);
  assert.match(app, /get\('\/api\/me\/history'\)/);
  for (const k of ['history', 'histOrders', 'histPoints', 'histNoOrders']) assert.equal(app.split(k + ":'").length - 1, 3, k);
});
