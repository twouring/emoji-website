// 活動報名結果頁：獨立網址（非彈窗），每種結果各一條路徑，方便追蹤轉換
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js'), events = read('public/events.html'), result = read('public/event-result.html');

async function boot(t) {
  const run = async () => ({ rows: [], rowCount: 0 });
  const localRequire = name => {
    if (name === 'pg') return { Pool: class { query = run; async connect() { return { query: run, release() {} }; } } };
    if (name === 'stripe') return class { constructor() { return {}; } };
    return createRequire(path.join(root, 'server.js'))(name);
  };
  const module = { exports: {} };
  const context = vm.createContext({ require: localRequire, module, __dirname: root,
    process: { env: { NODE_ENV: 'test', APP_SECRET: 'local-test-secret-not-used-in-production', DATABASE_URL: 'unused', STRIPE_SECRET_KEY: 'stub', STRIPE_WEBHOOK_SECRET: 'stub',
      GOOGLE_CLIENT_ID: 'stub', PUBLIC_ORIGIN: 'https://www.emoji.tw', ACCESS_QR_SECRET: 'x', ACCESS_DOOR_SECRET: 'x' } },
    Buffer, URL, URLSearchParams, AbortSignal, Date, setTimeout,
    fetch: () => { throw new Error('External network forbidden in test'); },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(server + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const base = `http://127.0.0.1:${http.address().port}`;
  return url => new Promise((resolve, reject) => {
    const req = httpRequest(base + url, { headers: { host: 'www.emoji.tw' } }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body, headers: new Map(Object.entries(res.headers)) })); });
    req.on('error', reject); req.end();
  });
}

test('結果頁三語可開、noindex、含站台頁首頁尾；未知狀態不回結果頁', async t => {
  const get = await boot(t);
  for (const status of ['registered', 'pending_approval', 'waitlisted', 'failed', 'paid', 'canceled']) {
    for (const pre of ['', '/en', '/ja']) {
      const res = await get(`${pre}/events/result/${status}?event=demo`);
      assert.equal(res.status, 200, pre + status);
      assert.equal(res.headers.get('x-robots-tag'), 'noindex');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.doesNotMatch(res.body, /<!--SITE_HEADER-->/, '頁首應已組裝');
      assert.match(res.body, /id="er-actions"/);
    }
  }
  const bad = await get('/events/result/whatever');
  assert.notEqual(bad.status, 200);
});

test('Stripe 付款成功／取消導回獨立結果頁，不再帶 ?paid=1 回活動頁', () => {
  assert.match(server, /success_url: `\$\{SITE_BASE\}\$\{langPrefix\}\/events\/result\/paid\?event=\$\{encodeURIComponent\(ev\.slug\)\}&s=\{CHECKOUT_SESSION_ID\}`/);
  assert.match(server, /cancel_url: `\$\{SITE_BASE\}\$\{langPrefix\}\/events\/result\/canceled\?event=\$\{encodeURIComponent\(ev\.slug\)\}`/);
  assert.match(server, /'\/events\/result\/paid\?event='\+encodeURIComponent\(event\.slug\)\+'&s=\{CHECKOUT_SESSION_ID\}'/);
  assert.doesNotMatch(server, /\?paid=1&s=\{CHECKOUT_SESSION_ID\}/);
  assert.doesNotMatch(events, /showResult\(|ev-result\{/, '活動頁不再有彈窗');
  assert.match(events, /function goResult\(status,e,extra\)/);
});

test('結果頁依路徑渲染對應文案、推 dataLayer 事件、失敗頁顯示原因', () => {
  const code = result.slice(result.lastIndexOf('<script>') + 8, result.lastIndexOf('</script>'));
  for (const [pathname, status, guest, expectTitle] of [
    ['/events/result/registered', 'registered', '1', '報名成功'],
    ['/en/events/result/failed', 'failed', '', 'Registration failed'],
    ['/ja/events/result/waitlisted', 'waitlisted', '', 'キャンセル待ちに登録しました'],
    ['/events/result/canceled', 'canceled', '', '付款未完成'],
  ]) {
    const nodes = {}, el = id => nodes[id] ||= { set textContent(v) { this.text = v; }, get textContent() { return this.text; }, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; }, querySelector() { return { set textContent(v) {} }; } };
    const search = `?event=demo-night${guest ? '&guest=1' : ''}${status === 'failed' ? '&reason=' + encodeURIComponent('Sold out') : ''}`;
    const context = vm.createContext({ location: { pathname, search }, URLSearchParams, document: { getElementById: el, title: '', body: { dataset: {} } }, localStorage: { getItem: () => '' }, sessionStorage: { setItem() {} }, window: {}, fetch: () => assert.fail('不應呼叫付款驗證'), decodeURIComponent, encodeURIComponent, JSON });
    vm.runInContext(code, context);
    assert.equal(nodes['er-title'].text, expectTitle, pathname);
    assert.equal(nodes['er-note'].hidden, !guest);
    assert.equal(nodes['er-reason'].hidden, status !== 'failed');
    if (status === 'failed') assert.equal(nodes['er-reason'].text, 'Sold out');
    assert.match(nodes['er-actions'].html, /href="\/(en\/|ja\/)?events\/demo-night"/);
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.dataLayer.at(-1))), { event: 'event_registration_result', result: status, event_slug: 'demo-night', lang: pathname.startsWith('/en') ? 'en' : pathname.startsWith('/ja') ? 'ja' : 'zh' });
    assert.equal(context.document.body.dataset.eventResult, status);
  }
});
