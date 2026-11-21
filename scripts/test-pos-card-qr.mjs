// POS 線上刷卡 QR（KK 11/17）：等等空間／約書旅可選線上刷卡、印付款 QR 給客人掃碼付款
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../lib/pos-card-qr.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const server = read('server.js'), ops = read('public/pos-ops.js'), api = read('docs/API.md');
const L = (line, venue, price, qty = 1, extra = {}) => ({ line, venue, price, qty, zh: line, ...extra });

test('只開放等等空間、約書旅', () => {
  assert.equal(C.enabledFor(['STAY']), true);
  assert.equal(C.enabledFor(['REST']), true);
  assert.equal(C.enabledFor(['CAFE']), false);
  assert.equal(C.enabledFor(null), false, '不帶品牌（管理員看全部）不開');
  assert.equal(C.enabledFor(['REST', 'CAFE']), false);
});

test('金額由未付品項原價重算，排除抵扣與取消行；含其他品牌品項擋下', () => {
  const q = C.quote([L('a', 'REST', 450), L('b', 'REST', 100, 2), L('c', 'REST', -100, 1, { credit_of: 'to_x' }), L('d', 'REST', 999, 1, { cancelled: true })], ['REST']);
  assert.equal(q.amount, 650); assert.deepEqual(q.lines.map(l => l.line), ['a', 'b']); assert.equal(q.venue, 'REST');
  assert.throws(() => C.quote([L('a', 'REST', 100), L('x', 'CAFE', 100)], ['REST']), /只適用/);
  assert.throws(() => C.quote([], ['REST']), /沒有未付款/);
  assert.throws(() => C.quote([L('z', 'STAY', 0)], ['STAY']), /金額為 0/);
});

test('入帳核對：桌開著、品項一行不少、幣別與金額一致', () => {
  const s = { status: 'open' }, unpaid = [L('a', 'REST', 450), L('b', 'REST', 100, 2)];
  const cs = { currency: 'twd', amount_total: 65000 };
  assert.equal(C.matches(s, { lines: 'a,b', amount: '650' }, unpaid, cs).ok, true);
  assert.equal(C.matches({ status: 'closed' }, { lines: 'a,b', amount: '650' }, unpaid, cs).ok, false);
  assert.equal(C.matches(s, { lines: 'a,b,c', amount: '650' }, unpaid, cs).ok, false, '少一行');
  assert.equal(C.matches(s, { lines: 'a,b', amount: '650' }, unpaid, { ...cs, currency: 'usd' }).ok, false);
  assert.equal(C.matches(s, { lines: 'a,b', amount: '650' }, unpaid, { ...cs, amount_total: 60000 }).ok, false);
  assert.equal(C.matches(s, { lines: '', amount: '650' }, unpaid, cs).ok, false);
});

test('server：三支路由、webhook 共用入帳、付款中擋櫃檯結帳、桌況回 card_qr', () => {
  for (const r of ['/card-qr\'', '/card-qr/check\'', '/card-qr/complete\'', '/card-qr/cancel\'']) assert.ok(server.includes("app.post('/api/admin/orders/sessions/:id" + r), r);
  assert.match(server, /await markPosCardQrPaid\(event\.data\.object\);/);
  const co = server.slice(server.indexOf("app.post('/api/admin/orders/sessions/:id/checkout'"), server.indexOf("app.post('/api/admin/orders/:id/invoice/issue'"));
  assert.match(co, /'card_qr:'\+s\.id/); assert.match(co, /status\(423\)/);
  const create = server.slice(server.indexOf("app.post('/api/admin/orders/sessions/:id/card-qr'"), server.indexOf("app.post('/api/admin/orders/sessions/:id/card-qr/check'"));
  assert.match(create, /posCardQr\.enabledFor\(venues\)/); assert.match(create, /posScope\(req\)/);
  assert.match(create, /posCardQr\.quote\(tableOrders\.unpaid/); assert.doesNotMatch(create, /req\.body\?\.amount/, '金額不信任前端');
  assert.match(server, /s\.card_qr=\{id:v\.cs/);
  const ful = server.slice(server.indexOf('async function fulfillPosCardCheckout('), server.indexOf('const cardQrView='));
  assert.match(ful, /payer->>'stripe_session'=\$1/); assert.ok(ful.indexOf('inventoryConsume') < ful.lastIndexOf("'COMMIT'"));
});

test('POS 前端：只在等等空間／約書旅顯示，開視窗不自動列印（KK 11/17）、輪詢入帳、可取消', () => {
  assert.match(ops, /const CARD_QR_VENUES=\['STAY','REST'\]/);
  assert.match(ops, /value="card_qr" aria-label="線上刷卡"/, '支付方式多一個「線上刷卡」');
  assert.match(ops, /\$\{cardQrOn\(cur\)\?`<label class="pos-method"/);
  assert.match(ops, /if\(POS_METHOD==='card_qr'&&!cardQrOn\(cur\)\)POS_METHOD='';/, '餐飲品牌退回未選');
  assert.doesNotMatch(ops, /_cqPrinted/, '開 QR 視窗不自動列印，只按「列印」才印');
  assert.match(ops, /if\(method==='card_qr'\)\{/);
  assert.match(ops, /async function printCardQr\(a\)/); assert.match(ops, /starSend\(\{canvas:out\}\)/);
  assert.match(ops, /api\(path\+'\/check'/); assert.match(ops, /\/card-qr\/cancel/);
  assert.match(ops, /if\(r\.state==='paid'\).*POS_METHOD='card_qr'/, '付款確認後回結帳頁時保留線上刷卡為已選付款方式');
  assert.match(ops, /cardQrComplete\(cur,host\)/, '櫃檯按收款才完成入帳');
  assert.match(server, /card-qr\/complete/, '付款確認與完成入帳分成兩步');
  assert.match(ops, /if\(cur\.card_qr\)host\.querySelector\('#pos-checkout'\)\.disabled=true;/);
  assert.equal((ops.match(/ensureOperator\(\(\)=>runCheckoutOnce\(cur\.id,\(\)=>cardQrCheckout\(cur,host\)\)\)/g) || []).length, 2, '收款鍵與重印鍵都要先認人');
});

test('API 文件', () => {
  for (const r of ['card-qr', 'card-qr/check', 'card-qr/cancel']) assert.ok(api.includes('### POST /api/admin/orders/sessions/:id/' + r + '\n'), r);
});

test('桌況回 card_qr 帶 state，已付款自動選回線上刷卡（11/21 E08/E09 卡待收款）', () => {
  assert.match(server, /s\.card_qr=\{id:v\.cs,url:v\.url,amount:v\.amount,expires_at:v\.expires_at,state:v\.state\|\|'open'\}/);
  assert.match(ops, /if\(cur\.card_qr\?\.state==='paid'&&cardQrOn\(cur\)\)POS_METHOD='card_qr';/);
});
