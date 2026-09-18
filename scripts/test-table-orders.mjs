// scripts/test-table-orders.mjs — 桌邊 QR 點餐純邏輯：簽章、共桌購物車、結帳選行、TapPay 回應判定
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders');

const SECRET = 'test-secret';
const menuJson = JSON.stringify({ version: 1, items: [
  { id: 'm_latte', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 180, published: true },
  { id: 'm_off', venue: 'CAFE', cat: 'COFFEE', zh: '下架', price: 100, published: false },
] });

test('桌號簽章：正確通過、竄改拒絕、桌號正規化為大寫', () => {
  const k = T.tableKey('a3', SECRET);
  assert.equal(T.verifyTable('A3', k, SECRET), 'A3');
  assert.equal(T.verifyTable('A4', k, SECRET), null);
  assert.equal(T.verifyTable('A3', k.slice(0, 15) + 'x', SECRET), null);
  assert.equal(T.verifyTable('A3', k, 'other'), null);
  assert.equal(T.verifyTable('A3;DROP', k, SECRET), null);
  assert.match(T.tableUrl('https://www.emoji.tw', 'a3', SECRET), /^https:\/\/www\.emoji\.tw\/order\?t=A3&k=[A-Za-z0-9_-]{16}$/);
});

test('共桌購物車：只加已發布品項、價格快照、只能刪自己的、已付不可刪', () => {
  const menu = T.menuIndex(menuJson);
  let items = T.addLine([], menu, { item_id: 'm_latte', qty: 2, by: 'KK', guest: 'guest0000001' });
  assert.equal(items[0].price, 180); assert.equal(items[0].order_id, null);
  assert.throws(() => T.addLine(items, menu, { item_id: 'm_off', qty: 1, guest: 'guest0000001' }), /下架/);
  assert.throws(() => T.addLine(items, menu, { item_id: 'm_latte', qty: 0, guest: 'guest0000001' }), /數量/);
  assert.throws(() => T.removeLine(items, items[0].line, 'guest0000002'), /自己/);
  assert.throws(() => T.removeLine(items.map(l => ({ ...l, order_id: 'to_x' })), items[0].line, 'guest0000001'), /已付款/);
  assert.equal(T.removeLine(items, items[0].line, 'guest0000001').length, 0);
  const merged = T.addLine(items, menu, { item_id: 'm_latte', qty: 1, by: 'KK', guest: 'guest0000001' });
  assert.equal(merged.length, 1); assert.equal(merged[0].qty, 3);
  assert.equal(T.addLine(items, menu, { item_id: 'm_latte', qty: 1, by: 'KK', guest: 'guest0000001', note: '去冰' }).length, 2);
});

test('結帳選行：空＝全桌未付；指定含已付或不存在的行回 409', () => {
  const menu = T.menuIndex(menuJson);
  let items = T.addLine([], menu, { item_id: 'm_latte', qty: 1, by: 'A', guest: 'guestaaaaaaa' });
  items = T.addLine(items, menu, { item_id: 'm_latte', qty: 3, by: 'B', guest: 'guestbbbbbbb' });
  assert.equal(T.sum(T.selectLines(items, [])), 720);
  assert.equal(T.sum(T.selectLines(items, [items[1].line])), 540);
  assert.throws(() => T.selectLines(items, ['nope']), e => e.status === 409);
  items[0].order_id = 'to_1';
  assert.throws(() => T.selectLines(items, [items[0].line]), e => e.status === 409);
  assert.equal(T.sessionFinished(items, [{ status: 'done' }]), false);
  items[1].order_id = 'to_2';
  assert.equal(T.sessionFinished(items, [{ status: 'done' }, { status: 'ready' }]), false);
  assert.equal(T.sessionFinished(items, [{ status: 'done' }, { status: 'done' }]), true);
  assert.equal(T.sessionFinished([], []), false);
});

test('TapPay pay-by-prime：status 0 才成功，其餘 402 並帶原始訊息；金額與 partner key 正確送出', async () => {
  const cfg = { mode: 'sandbox', partnerKey: 'pk', merchantId: 'mid', appId: '1', appKey: 'ak' };
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), key: init.headers['x-api-key'] }); return { ok: true, json: async () => ({ status: 0, rec_trade_id: 'R1' }) }; };
  const out = await T.payByPrime(cfg, { prime: 'a'.repeat(32), amount: 360, orderNumber: 'to_1', details: '桌號 A3', cardholder: { name: 'KK' } }, ok);
  assert.equal(out.rec_trade_id, 'R1');
  assert.equal(calls[0].url, T.TAPPAY_API.sandbox); assert.equal(calls[0].key, 'pk');
  assert.equal(calls[0].body.amount, 360); assert.equal(calls[0].body.merchant_id, 'mid'); assert.equal(calls[0].body.remember, false);
  const bad = async () => ({ ok: true, json: async () => ({ status: 10003, msg: 'Invalid prime' }) });
  await assert.rejects(T.payByPrime(cfg, { prime: 'a'.repeat(32), amount: 1, orderNumber: 'x', details: '', cardholder: { name: 'A' } }, bad), e => e.status === 402 && /Invalid prime/.test(e.message));
  await assert.rejects(T.payByPrime(cfg, { prime: 'short', amount: 1, orderNumber: 'x', details: '', cardholder: { name: 'A' } }, ok), /卡號/);
  assert.equal(T.tappayConfig({}), null);
  assert.equal(T.tappayConfig({ TAPPAY_APP_ID: '1', TAPPAY_APP_KEY: 'k', TAPPAY_PARTNER_KEY: 'p', TAPPAY_MERCHANT_ID: 'm', TAPPAY_ENV: 'production' }).mode, 'production');
});

test('持卡人欄位：姓名必填、Email／電話格式', () => {
  assert.throws(() => T.payer({}), /姓名/);
  assert.throws(() => T.payer({ name: 'A', email: 'x' }), /Email/);
  assert.deepEqual(T.payer({ name: ' KK ', phone: '0912345678', email: 'KK@EMOJI.TW' }), { name: 'KK', phone: '0912345678', email: 'kk@emoji.tw' });
});

test('menuIndex 給 venue 只留該品牌；null＝非營業時段無品項', () => {
  const doc = JSON.stringify({ items: [
    { id: 'm_cafe0001', venue: 'CAFE', cat: 'COFFEE', zh: '拿鐵', price: 150, published: true },
    { id: 'm_bar00001', venue: 'BAR', cat: 'MAIN', zh: '炒麵', price: 220, published: true },
  ] });
  assert.deepEqual([...T.menuIndex(doc, 'BAR').keys()], ['m_bar00001']);
  assert.equal(T.menuIndex(doc, null).size, 0);
  assert.equal(T.menuIndex(doc).size, 2);
});
