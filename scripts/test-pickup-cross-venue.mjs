// 預約取餐跨店顯示（t_e489acc0）：會員 App 預約後，取餐那家店的 POS 桌況看得到、可操作；另一家店只在外帶欄看到唯讀提醒。
// 隔離 server.js（假 DB、無外網）實跑 POST /api/me/pickups 與 GET /api/admin/orders，兩家店別各測一次。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const SECRET = 'local-test-secret-not-used-in-production';
const pickup = require('../lib/pickup.js');
const { signToken } = require('../lib/security.js');

const MENU = JSON.stringify({ version: 1, items: [
  { id: 'latte', zh: '拿鐵', venue: 'CAFE', cat: 'COFFEE', price: 140, published: true },
  { id: 'beer', zh: '啤酒', venue: 'BAR', cat: 'BEER', price: 200, published: true },
] });
const USERS = {
  u_member: { id: 'u_member', name: '測試會員', email: 'member@example.test', is_admin: false, admin_brand: null },
  u_cafe: { id: 'u_cafe', name: '在咖啡 POS', email: 'cafe@example.test', is_admin: true, admin_brand: 'CAFE' },
  u_bar: { id: 'u_bar', name: '三點水 POS', email: 'bar@example.test', is_admin: true, admin_brand: 'BAR' },
};

function fakeDb() {
  const sessions = [], notices = [];
  const run = async (sql, p = []) => {
    const s = String(sql);
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s) || /pg_advisory_xact_lock/.test(s)) return { rows: [] };
    if (/FROM users WHERE id=\$1/.test(s)) { const u = USERS[p[0]]; return { rows: u ? [u] : [] }; }
    if (/EXISTS\(SELECT 1 FROM events WHERE owner_id/.test(s)) return { rows: [{ allowed: false }] };
    if (/SELECT key,value FROM site_content WHERE key=ANY/.test(s)) return { rows: [{ key: 'menu', value: MENU }] };
    if (/SELECT value FROM site_content WHERE key=\$1/.test(s)) return { rows: [] };
    if (/COUNT\(\*\)::int AS n FROM table_sessions WHERE user_id=\$1/.test(s)) return { rows: [{ n: sessions.filter(x => x.user_id === p[0] && x.status === 'open' && x.pickup_at).length }] };
    if (/SELECT table_no FROM table_sessions WHERE status='open' AND table_no ~/.test(s)) return { rows: sessions.filter(x => x.status === 'open').map(x => ({ table_no: x.table_no })) };
    if (/^INSERT INTO table_sessions\(id,table_no,items,user_id,pickup_at,pickup_note,opened_by_staff_name,venue\)/.test(s)) {
      const row = { id: p[0], table_no: p[1], items: JSON.parse(p[2]), user_id: p[3], pickup_at: p[4].toISOString(), pickup_note: p[5], opened_by_staff_name: p[6], venue: p[7], status: 'open', pickup_placed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), pay_requests: [], party_votes: {}, members: [], notices: [] };
      sessions.push(row); return { rows: [row] };
    }
    if (/^INSERT INTO table_sessions/.test(s)) throw new Error('pickup INSERT 沒寫 venue：' + s.slice(0, 120));
    if (/FROM table_sessions WHERE status='open' ORDER BY table_no/.test(s)) return { rows: sessions.filter(x => x.status === 'open').map(x => ({ ...x })) };
    return { rows: [], rowCount: 0 };
  };
  return { run, sessions, notices };
}

async function server(t, db) {
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = db.run; async connect() { return { query: db.run, release() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: SECRET, DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub', GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x' } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: () => { throw new Error('External network forbidden in test'); }, console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  return (method, url, sub, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = httpRequest(base + url, { method, headers: { authorization: 'Bearer ' + signToken({ sub, role: 'participant' }, SECRET), 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, res => {
      let out = ''; res.setEncoding('utf8'); res.on('data', c => out += c); res.on('end', () => { let json = null; try { json = JSON.parse(out); } catch {} resolve({ status: res.statusCode, json, body: out }); });
    });
    req.on('error', reject); req.end(data);
  });
}

const tomorrow = () => pickup.dates(new Date())[1];

for (const [time, item, own, other] of [['12:00', 'latte', 'CAFE', 'BAR'], ['18:00', 'beer', 'BAR', 'CAFE']]) {
  test(`會員 App 預約 ${time}（${pickup.venueLabel(own)}）：${own} POS 桌況看得到，${other} POS 只有外帶欄提醒`, async t => {
    const db = fakeDb(), call = await server(t, db);
    const made = await call('POST', '/api/me/pickups', 'u_member', { date: tomorrow(), time, items: [{ item_id: item, qty: 2 }], note: '少冰' });
    assert.equal(made.status, 201, made.body);
    assert.equal(db.sessions[0].venue, own, '預約單記取餐品牌');
    const table = made.json.pickup.table;

    const mine = await call('GET', `/api/admin/orders?venue=${own}`, own === 'CAFE' ? 'u_cafe' : 'u_bar');
    assert.equal(mine.status, 200, mine.body);
    const s = mine.json.sessions.find(x => x.table === table);
    assert.ok(s, `${own} POS 桌況有 ${table}`);
    assert.equal(s.takeout, true); assert.ok(s.pickup_at); assert.equal(s.mixed, false, '本店可結帳／收單');
    assert.deepEqual(mine.json.pickups_other, [], '本店的單不重複列在跨店提醒');

    const theirs = await call('GET', `/api/admin/orders?venue=${other}`, other === 'CAFE' ? 'u_cafe' : 'u_bar');
    assert.equal(theirs.status, 200, theirs.body);
    assert.ok(!theirs.json.sessions.some(x => x.table === table), `${other} POS 桌況仍看不到（品牌隔離不變）`);
    assert.equal(theirs.json.pickups_other.length, 1);
    const o = theirs.json.pickups_other[0];
    assert.deepEqual(Object.keys(o).sort(), ['pickup_at', 'qty', 'table', 'venue', 'venue_label']);
    assert.equal(o.table, table); assert.equal(o.venue, own); assert.equal(o.venue_label, pickup.venueLabel(own)); assert.equal(o.qty, 2);
    assert.doesNotMatch(JSON.stringify(theirs.json.pickups_other), /測試會員|少冰|u_member|拿鐵|啤酒/, '提醒不帶會員、備註、品項');
  });
}

test('otherVenuePickups：已送單、本店、非預約單都不列；沒指定店別（超管）回空', () => {
  const inV = (s, v) => v.includes(s.venue);
  const rows = [
    { table_no: 'W01', venue: 'CAFE', pickup_at: '2026-11-16T04:00:00Z', items: [{ venue: 'CAFE', qty: 1 }] },
    { table_no: 'W02', venue: 'CAFE', pickup_at: '2026-11-16T03:00:00Z', pickup_placed_at: '2026-11-16T02:40:00Z', items: [{ venue: 'CAFE', qty: 1 }] },
    { table_no: 'W03', venue: 'BAR', pickup_at: '2026-11-16T10:00:00Z', items: [{ venue: 'BAR', qty: 3 }] },
    { table_no: 'W04', venue: 'CAFE', items: [{ venue: 'CAFE', qty: 1 }] },
    { table_no: 'W05', venue: null, pickup_at: '2026-11-16T02:00:00Z', items: [{ venue: 'CAFE', qty: 2 }, { venue: 'CAFE', qty: 9, cancelled: true }] },
  ];
  const legacyIn = (s, v) => s.venue ? v.includes(s.venue) : s.items.some(l => v.includes(l.venue));
  assert.deepEqual(pickup.otherVenuePickups(rows, ['BAR'], legacyIn).map(o => [o.table, o.venue, o.qty]), [['W05', 'CAFE', 2], ['W01', 'CAFE', 1]], '依取餐時間排序；舊單沒記 venue 依品項');
  assert.deepEqual(pickup.otherVenuePickups(rows, ['CAFE'], legacyIn).map(o => o.table), ['W03']);
  assert.deepEqual(pickup.otherVenuePickups(rows, null, inV), []);
});

test('LINE 通知第一行寫取餐店名；POS 外帶欄顯示跨店提醒', () => {
  const msg = pickup.staffNotice({ table: 'W03', venue: 'CAFE', date: '2026-11-16', time: '12:00', name: '王小明', items: [{ zh: '拿鐵', qty: 2 }], note: '' });
  assert.equal(msg.split('\n')[0], '🥡 新預約取餐 W03【在咖啡】（會員 App）');
  assert.match(msg, /請在在咖啡的 POS 外帶欄查看/);
  assert.match(pickup.staffNotice({ table: 'W04', venue: 'BAR', date: '2026-11-16', time: '18:00', items: [] }), /【三點水】/);
  const js = read('public/pos-ops.js');
  assert.match(js, /const otherPickups=Array\.isArray\(d\.pickups_other\)\?d\.pickups_other:\[\]/);
  assert.match(js, /<\/h2><\/div>\$\{otherPickupsHtml\}<div class="pos-takeout-list">/, '提醒放在外帶欄標題下');
  assert.match(js, /POS_DATA\.pause,POS_DATA\.pickups_other,/, '跨店提醒變動要重繪');
});
