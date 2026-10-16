// 桌邊點餐即時同步（SSE）：hub 依訂閱者各自的 guest 推 mine 標記不同的快照；斷線移除；觸發器涵蓋兩張表；客人端 SSE 失敗退回輪詢
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const live = require('../lib/table-live.js');
const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

function fakeRes() {
  const res = { chunks: [], headers: null, writeHead(code, h) { res.code = code; res.headers = h; }, write(c) { if (res.dead) throw new Error('closed'); res.chunks.push(c); } };
  return res;
}
const events = res => res.chunks.filter(c => c.startsWith('event:')).map(c => JSON.parse(c.split('\ndata: ')[1]));

test('hub：連上先寫 retry＋SSE 標頭；notify 依各自 guest 載入快照、每位訂閱者拿到自己的 mine', async () => {
  const items = [{ line: 'a', guest: 'g1', zh: '拿鐵' }, { line: 'b', guest: 'g2', zh: '司康' }];
  const hub = live.createHub({ load: async id => guest => ({ id, items: items.map(({ guest: g, ...l }) => ({ ...l, mine: g === guest })) }) });
  const req1 = new EventEmitter(), req2 = new EventEmitter(), r1 = fakeRes(), r2 = fakeRes();
  hub.subscribe('s1', 'g1', req1, r1); hub.subscribe('s1', 'g2', req2, r2);
  assert.equal(r1.code, 200); assert.match(r1.headers['Content-Type'], /text\/event-stream/);
  assert.match(r1.chunks[0], /^retry: \d+\n\n$/);
  assert.equal(hub.size('s1'), 2);
  assert.equal(await hub.notify('s1'), 2);
  assert.deepEqual(events(r1)[0].items.map(l => l.mine), [true, false]);
  assert.deepEqual(events(r2)[0].items.map(l => l.mine), [false, true]);
  assert.equal(await hub.notify('nobody'), 0, '沒人訂閱的桌不查 DB');
  req1.emit('close');
  assert.equal(hub.size('s1'), 1, '斷線即移除');
  r2.dead = true; hub.heartbeat();
  assert.equal(hub.size(), 0, '心跳寫失敗的連線也移除');
});

test('hub：桌已不存在時推 gone，客人端會重新掃碼開桌', async () => {
  const hub = live.createHub({ load: async () => null });
  const res = fakeRes(); hub.subscribe('s9', 'g', new EventEmitter(), res);
  await hub.notify('s9');
  assert.deepEqual(events(res)[0], { id: 's9', status: 'gone' });
});

test('觸發器 SQL 涵蓋 table_sessions 與 table_orders 的新增／修改／刪除，payload 都是 session id', () => {
  const sql = live.TRIGGER_SQL;
  assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE ON table_sessions/);
  assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE ON table_orders/);
  assert.match(sql, /pg_notify\('table_session', COALESCE\(NEW\.id, OLD\.id\)\)/);
  assert.match(sql, /pg_notify\('table_session', COALESCE\(NEW\.session_id, OLD\.session_id\)\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION/, '重跑 migrate 不會失敗');
  assert.match(server, /await q\(tableLive\.TRIGGER_SQL\)/, 'migrate 會建觸發器');
  assert.match(server, /liveHub\.start\(\); tableLive\.startListener\(pool, liveHub\)/, '開機後才 LISTEN');
  assert.match(server, /app\.get\('\/api\/orders\/:id\/live',requireDb/);
});

test('listener：LISTEN 失敗會重連、stop 後不再重連', async () => {
  let connects = 0; const released = [];
  const pool = { connect: async () => { connects++; if (connects === 1) throw new Error('boom'); const c = new EventEmitter(); c.query = async () => {}; c.release = f => released.push(f); return c; } };
  const hub = live.createHub({ load: async () => null });
  const l = live.startListener(pool, hub, { log() {} });
  await new Promise(r => setTimeout(r, 1100));
  assert.equal(connects, 2, '第一次失敗後 1 秒重連');
  l.stop();
  assert.deepEqual(released, [true]);
});

test('客人端：EventSource 連 /live、收到 session 就 applyState；SSE 不通時 5 秒輪詢、通了 30 秒保險；回前景補拉並重連', () => {
  assert.match(html, /new EventSource\('\/api\/orders\/'\+encodeURIComponent\(S\.id\)\+'\/live\?g='/);
  assert.match(html, /ES\.addEventListener\('session'/);
  assert.match(html, /LIVE_OK\?30000:5000/);
  assert.match(html, /visibilitychange[\s\S]*?refresh\(\);if\(!ES\|\|ES\.readyState===2\)live\(\);/);
  assert.match(html, /function applyState\(s\)\{var prev=S&&S\.items;S=s;diffOthers\(prev,s\.items\|\|\[\]\);renderState\(\);\}/);
  assert.doesNotMatch(html, /S=s;renderState\(\);btn\.textContent/, '加點後也走 applyState');
});

test('客人端：別人加／移除品項吐司提示並閃該行；送出鍵寫明件數與含他人幾項；含他人未送出時先確認', () => {
  assert.match(html, /someone_added/); assert.match(html, /someone_removed/);
  assert.match(html, /\.line\.fresh\{animation:line-in/);
  assert.match(html, /\.line\.others-pending\{background:#fff6c2/);
  assert.match(html, /!l\.mine&&!l\.placed_at\?' others-pending'/);
  assert.match(html, /tr\('place_with_others',\{count:p\.length,others:othersSummary\(op\)\}\):tr\('place_n',\{count:p\.length\}\)/);
  assert.match(html, /var op=othersPending\(\);if\(op\.length&&!confirm\(tr\('place_confirm',\{others:joinItems\(op\)\}\)\)\)return;/);
  assert.match(html, /id="place-hint"/);
  for (const key of ['place_n', 'place_with_others', 'place_confirm', 'someone_added', 'someone_removed', 'others_pending_hint', 'n_items']) {
    assert.equal((lib.match(new RegExp(`\\b${key}: '`, 'g')) || []).length, 3, `${key} 三語都要有`);
  }
  assert.match(lib, /place_with_others: '送出 \{count\} 項（含\{others\}）'/);
  assert.match(lib, /place_confirm: 'This will also send items others at your table have not sent yet/);
});

// 整條路徑：server.js 開在 vm 內（pg 存根回一桌資料）→ GET /live 先收第一則 session → 模擬 pg_notify（直接呼叫 liveHub.notify）→ 收到第二則
import vm from 'node:vm';
import path from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
test('端到端：/api/orders/:id/live 先推目前狀態，桌有異動再推一次；每位客人 mine 各自正確', async t => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const read = f => readFileSync(path.join(root, f), 'utf8');
  let items = [{ line: 'a1', item_id: 'x', zh: '拿鐵', price: 100, qty: 1, guest: 'g1', by: '阿明' }];
  const session = () => ({ id: 'sess01', table_no: 'A1', status: 'open', items, pay_requests: [] });
  const run = async (sql) => {
    if (/FROM table_sessions WHERE id=\$1/.test(sql)) return { rows: [session()], rowCount: 1 };
    if (/FROM table_orders WHERE session_id/.test(sql)) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  };
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {}, on() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: 'local-test-secret-not-used-in-production', DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub',
      GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x' } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(read('server.js') + '\ndbReady = true; module.exports.liveHub = liveHub;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  const open = guest => new Promise((resolve, reject) => {
    const req = httpRequest(base + '/api/orders/sess01/live?g=' + guest, res => {
      const got = []; let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const frame = buf.slice(0, i); buf = buf.slice(i + 2); const m = frame.match(/^event: session\ndata: (.*)$/m); if (m) got.push(JSON.parse(m[1])); } });
      resolve({ res, got, headers: res.headers });
    });
    req.on('error', reject); req.end();
  });
  const c1 = await open('g1'), c2 = await open('g2');
  await new Promise(r => setTimeout(r, 50));
  assert.match(c1.headers['content-type'], /text\/event-stream/);
  assert.equal(c1.got.length, 1); assert.equal(c1.got[0].items[0].mine, true);
  assert.equal(c2.got[0].items[0].mine, false);
  assert.equal(c1.got[0].items[0].guest, undefined, '不外露 guest');
  // 第二位客人加了一項 → 觸發器會 pg_notify('table_session','sess01')，listener 轉呼叫 hub.notify
  items = items.concat([{ line: 'b2', item_id: 'y', zh: '司康', price: 50, qty: 1, guest: 'g2', by: '小美' }]);
  assert.equal(await module.exports.liveHub.notify('sess01'), 2);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(c1.got.length, 2); assert.deepEqual(c1.got[1].items.map(l => l.mine), [true, false]);
  assert.deepEqual(c2.got[1].items.map(l => l.mine), [false, true]);
  const bad = await new Promise((resolve, reject) => { const req = httpRequest(base + '/api/orders/BAD!/live', res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(bad, 404);
  c1.res.destroy(); c2.res.destroy();
});
