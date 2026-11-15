// POS 靜態資源版本號（KK 10/18：pos.html 每次抓新版、pos-ops.js 在裝置快取 10 分鐘 → 新舊檔混用卡「載入中」）
// pos.html 內所有本地 JS/CSS 網址都要帶 ?v=<COMMIT>，且 pos.html 本身 no-cache。以隔離的 server.js（無真 DB、無外網）實跑 HTTP。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const COMMIT_FILE = path.join(root, 'COMMIT');

async function server(t) {
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
  new vm.Script(read('server.js') + '\ndbReady = true;').runInContext(context);
  const http = module.exports.app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  const port = http.address().port;
  return (url, host = 'pos.emoji.tw') => new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: url, headers: { host, 'accept-language': 'zh-TW' } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}

// 測試期間暫時寫入 COMMIT（CI 的 Write COMMIT 步驟會產生同一個檔），結束後還原
function withCommit(t, value) {
  const before = existsSync(COMMIT_FILE) ? readFileSync(COMMIT_FILE, 'utf8') : null;
  writeFileSync(COMMIT_FILE, value + '\n');
  t.after(() => { if (before === null) rmSync(COMMIT_FILE, { force: true }); else writeFileSync(COMMIT_FILE, before); });
}

const localAssets = html => [...html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)=["'](\/(?!\/)[^"']+\.(?:m?js|css)(?:\?[^"']*)?)["']/gi)].map(m => m[1]);

test('pos.html 內所有本地 JS/CSS 都帶當次 commit 的 ?v=，外部網址不動；pos.html 本身 no-cache', async t => {
  withCommit(t, 'abc1234def56');
  const get = await server(t);
  const source = read('public/pos.html');
  const expected = localAssets(source);
  assert.ok(expected.includes('/pos-ops.js') && expected.includes('/pos-ops.css'), '原始 pos.html 應引用 pos-ops.js／pos-ops.css');
  for (const url of ['/', '/atcafe', '/3am/sales']) {
    const res = await get(url);
    assert.equal(res.status, 200, url);
    assert.match(String(res.headers['cache-control']), /no-cache|no-store/, url + ' 的 pos.html 不可長時間快取');
    const assets = localAssets(res.body);
    assert.equal(assets.length, expected.length, url + ' 資源數量要與原始檔一致');
    for (const a of assets) assert.match(a, /\?(?:[^"']*&)?v=abc1234def56$/, url + '：' + a + ' 未帶版本號');
    assert.ok(assets.includes('/pos-ops.js?v=abc1234def56'), url + ' 應引用 /pos-ops.js?v=<commit>');
    assert.match(res.body, /href="https:\/\/fonts\.googleapis\.com\/css2\?family=[^"]*display=swap"/, '外部字型網址不可被改寫');
    assert.doesNotMatch(res.body, /fonts\.googleapis\.com[^"]*v=abc/, '外部網址不可被加版本號');
  }
});

test('帶本次版本號的 JS/CSS 照常快取；舊／錯的版本號不快取（新舊 instance 切換期間不會把舊內容記在新網址下）', async t => {
  withCommit(t, 'abc1234def56');
  const get = await server(t);
  const ok = await get('/pos-ops.js?v=abc1234def56', 'www.emoji.tw');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['cache-control'], 'public, max-age=600');
  const stale = await get('/pos-ops.js?v=0000000old00', 'www.emoji.tw');
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['cache-control'], 'no-store');
  const css = await get('/pos-ops.css?v=abc1234def56', 'www.emoji.tw');
  assert.equal(css.headers['cache-control'], 'public, max-age=600');
  const version = JSON.parse((await get('/api/version', 'www.emoji.tw')).body);
  assert.equal(version.commit, 'abc1234def56', '/api/version 應回報當次 commit，供部署後核對');
});

test('沒有 COMMIT（本機、CLI 直傳）時仍加版本號，不會沿用舊網址', async t => {
  const before = existsSync(COMMIT_FILE) ? readFileSync(COMMIT_FILE, 'utf8') : null;
  rmSync(COMMIT_FILE, { force: true });
  t.after(() => { if (before !== null) writeFileSync(COMMIT_FILE, before); });
  const get = await server(t);
  const res = await get('/atcafe');
  for (const a of localAssets(res.body)) assert.match(a, /[?&]v=dev[0-9a-z]+$/, a);
});

test('CI 部署流程在 build 前寫入 COMMIT（commit 短 hash），且 COMMIT 不入版控', () => {
  const wf = read('.github/workflows/deploy.yml');
  const write = wf.indexOf('git rev-parse --short=12 HEAD > COMMIT');
  assert.ok(write > 0, 'deploy.yml 應寫入 COMMIT');
  assert.ok(write < wf.indexOf('docker build'), 'COMMIT 要在 docker build 之前寫入，才會被 COPY 進 image');
  assert.match(read('.gitignore'), /^COMMIT$/m);
  assert.doesNotMatch(read('.dockerignore'), /^COMMIT$/m, 'COMMIT 不可被 .dockerignore 排除');
});
