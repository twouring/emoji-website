// 遠端列印（KK 11/5）：沒接 mPOP 的品牌 POS 裝置把單據送到櫃台列印站（接 mPOP 的 Star webPRNT Browser）代印
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../lib/pos-remote-print.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const server = read('server.js'), src = read('public/pos-ops.js'), api = read('docs/API.md');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('clean：只收 PNG data URL 或開錢櫃、必須有品牌、圖檔有上限', () => {
  assert.equal(R.clean({ image: PNG }, 'CAFE', 'a').job.image, PNG);
  assert.equal(R.clean({ drawer: true }, 'BAR', 'a').job.drawer, true);
  assert.ok(R.clean({}, 'CAFE').error);
  assert.ok(R.clean({ image: PNG }, null).error);
  assert.ok(R.clean({ image: 'data:image/svg+xml;base64,AAAA' }, 'CAFE').error);
  assert.ok(R.clean({ image: 'https://evil/x.png' }, 'CAFE').error);
  assert.ok(R.clean({ image: 'data:image/png;base64,' + 'A'.repeat(R.MAX_IMAGE) }, 'CAFE').error);
  assert.equal(R.clean({ image: PNG, label: 'a\nb'.repeat(50) }, 'CAFE').job.label.length, 60);
  assert.ok(R.MAX_IMAGE < 256 * 1024, '要在全域 express.json 256kb 上限之內');
});

test('server：路由掛 auth＋adminOnly、依品牌範圍、出餐單佇列不會領到 rp_ 工作', () => {
  for (const sig of ["app.post('/api/admin/orders/remote-print',", "app.get('/api/admin/orders/remote-print',", "app.get('/api/admin/orders/remote-print/:id',",
    "app.post('/api/admin/orders/remote-print/:id/claim',", "app.post('/api/admin/orders/remote-print/:id/result',", "app.post('/api/admin/orders/remote-print/:id/cancel',"]) {
    const i = server.indexOf(sig); assert.ok(i >= 0, sig);
    const body = server.slice(i, server.indexOf('\n}));', i));
    assert.match(body, /auth,adminOnly,requireDb/, sig); assert.match(body, /remoteVenue\(req\)/, sig);
    assert.ok(api.includes('### ' + sig.match(/app\.(\w+)\('([^']+)'/).slice(1).map((x, k) => k ? x : x.toUpperCase()).join(' ')), 'API.md ' + sig);
  }
  assert.match(server, /const remoteVenue=req=>\{const v=posScope\(req\);/);
  const k = server.slice(server.indexOf("app.get('/api/admin/orders/kitchen-print-jobs'"));
  assert.match(k.slice(0, 600), /id NOT LIKE 'rp\\\\_%'/);
  assert.ok(server.indexOf("app.get('/api/admin/orders/remote-print/:id'") < server.indexOf("app.get('/api/admin/orders',"), '要在 /api/admin/orders 之前');
  assert.ok(server.includes('const FOOD_API = /^\\/api\\/admin\\/(orders|'), 'FOOD_API 涵蓋 orders 前綴（品牌帳號與 MCP 可用）');
});

/* 前端：送出端（沒接 mPOP）與列印站（Star Browser）各一個 vm 環境，共用一個假伺服器 */
function fakeServer() {
  const jobs = new Map(); let n = 0;
  return { jobs, async api(path, opt = {}) {
    const m = path.match(/^\/admin\/orders\/remote-print(?:\/(rp_\w+))?(?:\/(claim|result|cancel))?$/);
    if (!m) throw Error('unexpected ' + path);
    const [, id, act] = m;
    if (!id && opt.method === 'POST') { const nid = 'rp_' + String(++n).padStart(16, '0'); jobs.set(nid, { ...opt.body, state: 'queued' }); return { ok: true, id: nid }; }
    if (!id) return { jobs: [...jobs].filter(([, j]) => j.state === 'queued').map(([id, j]) => ({ id, label: j.label, drawer: j.drawer, from: 'staff:1' })) };
    const j = jobs.get(id);
    if (act === 'claim') { if (j.state !== 'queued') return { claimed: false }; j.state = 'claimed'; return { claimed: true, job: { id, ...j } }; }
    if (act === 'result') { j.state = opt.body.ok ? 'printed' : 'failed'; j.error = opt.body.error; return { ok: true }; }
    if (act === 'cancel') { if (j.state !== 'queued') return { cancelled: false }; j.state = 'cancelled'; return { cancelled: true }; }
    return { id, state: j.state, error: j.error || '' };
  } };
}
function env({ star, srv, path = '/atcafe', scope = 'CAFE', clock }) {
  const toasts = [], sent = [];
  const c = vm.createContext({ console, Promise, Date: clock ? { now: () => clock.t } : Date, setTimeout: (f, ms) => { if (clock) { clock.t += ms; Promise.resolve().then(f); } else setTimeout(f, 0); return 1; }, clearTimeout() {},
    location: { pathname: path }, navigator: { userAgent: star ? 'StarWebPRNTBrowser' : 'Safari' }, DATA: {}, OPERATOR: { id: 's1' }, SCOPE: scope,
    toast: m => toasts.push(m), api: (p, o) => srv.api(p, o),
    Image: class { set src(v) { this.naturalWidth = 384; this.naturalHeight = 100; this._v = v; Promise.resolve().then(() => this.onload()); } },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(v) {} }), toDataURL: () => PNG }), getElementById: () => null } });
  vm.runInContext(src, c);
  if (star) vm.runInContext('StarWebPrintBuilder=function(){};StarWebPrintTrader=function(){};starCheckLink=async()=>true;', c);
  c.sent = sent; vm.runInContext('starSendNow=async j=>{sent.push(j);return true;}', c);
  return { c, toasts };
}

test('沒接 mPOP 的品牌 POS：starSend 改送櫃台，列印站領取列印並回報，送出端拿到成功', async () => {
  const srv = fakeServer();
  const phone = env({ star: false, srv }), station = env({ star: true, srv });
  assert.equal(vm.runInContext('canPrint()', phone.c), true);
  const p = vm.runInContext("starSend({canvas:document.createElement('canvas'),label:'收據明細'})", phone.c);
  await new Promise(r => setTimeout(r, 5));
  assert.equal([...srv.jobs.values()][0].state, 'queued');
  await vm.runInContext('pollRemotePrinting()', station.c);
  assert.equal(station.c.sent.length, 1); assert.ok(station.c.sent[0].canvas); assert.equal(station.c.sent[0].drawer, false);
  assert.equal(await p, true);
  assert.equal([...srv.jobs.values()][0].state, 'printed');
  await vm.runInContext('pollRemotePrinting()', station.c);
  assert.equal(station.c.sent.length, 1, '不重印');
});

test('遠端開錢櫃：列印站送 drawer 指令', async () => {
  const srv = fakeServer();
  const phone = env({ star: false, srv }), station = env({ star: true, srv });
  const p = vm.runInContext('openCashDrawer({auto:true})', phone.c);
  await new Promise(r => setTimeout(r, 5));
  await vm.runInContext('pollRemotePrinting()', station.c);
  assert.equal(station.c.sent[0].drawer, true); assert.equal(station.c.sent[0].canvas, null);
  assert.equal(await p, true);
});

test('列印站沒開：20 秒沒人領就取消並提示，之後列印站上線也不會補印；60 秒內不再等', async () => {
  const srv = fakeServer(), clock = { t: 1e12 };
  const phone = env({ star: false, srv, clock });
  assert.equal(await vm.runInContext("starSend({canvas:document.createElement('canvas')})", phone.c), false);
  assert.equal([...srv.jobs.values()][0].state, 'cancelled');
  assert.ok(phone.toasts.some(m => m.includes('列印站沒有回應')));
  const station = env({ star: true, srv });
  await vm.runInContext('pollRemotePrinting()', station.c); assert.equal(station.c.sent.length, 0);
  assert.equal(await vm.runInContext("starSend({canvas:document.createElement('canvas')})", phone.c), false);
  assert.equal(srv.jobs.size, 1, '60 秒內不再送新工作');
});

test('列印失敗回報給送出端；/admin 與一般瀏覽器非品牌頁不走遠端；Star Browser 本機照舊直送', async () => {
  const srv = fakeServer();
  const phone = env({ star: false, srv }), station = env({ star: true, srv });
  vm.runInContext('starSendNow=async()=>false', station.c);
  const p = vm.runInContext("starSend({canvas:document.createElement('canvas')})", phone.c);
  await new Promise(r => setTimeout(r, 5)); await vm.runInContext('pollRemotePrinting()', station.c);
  assert.equal(await p, false); assert.ok(phone.toasts.some(m => m.includes('列印失敗')));
  const admin = env({ star: false, srv, path: '/admin/orders', scope: '' });
  assert.equal(vm.runInContext('canPrint()', admin.c), false);
  assert.equal(vm.runInContext('remoteOn()', station.c), false, 'Star Browser 自己就是列印站，不送遠端');
  assert.match(src, /try\{await pollKitchenPrinting\(\);await pollRemotePrinting\(\);\}/);
});

test('所有列印入口都改用 canPrint()（有接 mPOP 或可送櫃台）', () => {
  for (const fn of ['openCashDrawer', 'printInvoiceProof', 'printOrder', 'printReceipt', 'printTableQr', 'printRegisterReport', 'printTestTicket']) {
    const i = src.indexOf('async function ' + fn + '('); assert.ok(i >= 0, fn);
    const body = src.slice(i, src.indexOf('\n}', i));
    assert.match(body, /canPrint\(\)/, fn); assert.doesNotMatch(body, /starReady\(\)/, fn);
  }
});
