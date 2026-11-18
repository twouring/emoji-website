// 付款依法人分開（KK 11/11 D2）：言文字＝在咖啡＋三點水、遊遊＝等等空間＋約書旅；金流商店、發票賣方、對帳歸屬都以法人為準
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../lib/entities.js');
const L = require('../lib/linepay.js');
const C = require('../lib/ctbc.js');
const Z = require('../lib/ezpay-invoice.js');
const P = require('../lib/pos-payment-methods.js');
const S = require('../lib/system-settings.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const env = {
  LINEPAY_MERCHANT_ID: 'tth-lp', LINEPAY_MERCHANT_PW: 'x',
  CTBC_MPOS_MERCHANT_ID: '0100000001', CTBC_MPOS_USER: 'u', CTBC_MPOS_PASSWORD: 'p',
  EZPAY_INVOICE_MERCHANT_ID: 'TTH1', EZPAY_INVOICE_HASH_KEY: 'k'.repeat(32), EZPAY_INVOICE_HASH_IV: 'i'.repeat(16),
};

test('法人對照：唯一來源；未知品牌／法人回 400', () => {
  assert.deepEqual(E.venuesOf('TTH'), ['CAFE', 'BAR']);
  assert.deepEqual(E.venuesOf('TWOURING'), ['STAY', 'REST']);
  assert.equal(E.entityOf('rest'), 'TWOURING');
  assert.throws(() => E.entityOf('XX'), e => e.status === 400);
  assert.equal(E.txEntity({}), 'TTH', '舊交易沒有 entity 欄＝言文字');
  assert.deepEqual(P.GROUP_OF, { CAFE: 'FNB', BAR: 'FNB', STAY: 'SPACE', REST: 'SPACE' });
});

test('金流設定依法人取，遊遊沒填絕不借用言文字的商店', () => {
  assert.equal(L.config(env).merchantId, 'tth-lp');
  assert.equal(L.config(env, 'TWOURING'), null);
  assert.equal(C.configured(env, 'TWOURING'), false);
  assert.equal(Z.config(env, 'TWOURING'), null);
  assert.equal(Z.config({ EZPAY_MERCHANT_ID: 'old', EZPAY_HASH_KEY: 'k'.repeat(32), EZPAY_HASH_IV: 'i'.repeat(16) }, 'TWOURING'), null, '舊別名只算言文字');
  const tw = { ...env, 'LINEPAY_MERCHANT_ID:TWOURING': 'tw-lp', 'LINEPAY_MERCHANT_PW:TWOURING': 'y' };
  assert.equal(L.config(tw, 'TWOURING').merchantId, 'tw-lp');
  assert.equal(L.config(tw, 'TTH').merchantId, 'tth-lp');
});

test('POS 付款方式：LINE Pay／信用卡只在該法人有商店時列出；現金等各品牌都有', () => {
  assert.equal(P.builtinEnabled('linepay', 'CAFE', env), true);
  assert.equal(P.builtinEnabled('linepay', 'STAY', env), false);
  assert.equal(P.builtinEnabled('ctbc', 'REST', env), false);
  assert.equal(P.builtinEnabled('cash', 'REST', env), true);
  assert.match(server, /async function paymentMethodsList\(groups=null,venues=null\)/);
  assert.match(server, /payment_methods:await paymentMethodsList\(posPaymentMethods\.groupsOf\(posScope\(req\)\),posScope\(req\)\)/);
});

test('系統設定：每個金流鍵各法人一組，言文字沿用原本鍵名（免搬密文），遊遊 <KEY>:TWOURING', () => {
  for (const k of E.PAYMENT_KEYS) if (S.byKey.has(k)) assert.ok(S.byKey.has(k + ':TWOURING'), k + ':TWOURING');
  for (const k of ['LINEPAY_MERCHANT_ID', 'CTBC_MPOS_PASSWORD', 'EZPAY_INVOICE_HASH_IV']) assert.ok(S.byKey.has(k) && S.byKey.has(k + ':TWOURING'), k);
  assert.match(S.byKey.get('LINEPAY_MERCHANT_PW:TWOURING').label, /遊遊股份有限公司/);
  assert.equal(S.byKey.get('LINEPAY_MERCHANT_PW:TWOURING').secret, true);
  assert.ok(S.isLive('EZPAY_INVOICE_HASH_KEY:TWOURING'));
  assert.throws(() => S.validate('EZPAY_INVOICE_HASH_KEY:TWOURING', 'k'), /32 碼/);
});

test('對帳歸屬只在同法人內：遊遊交易不會被時間歸到言文字的店，言文字交易不出現在遊遊 POS', () => {
  const regs = [{ venue: 'CAFE', opened_at: '2026-11-15T08:00:00+08:00', closed_at: '2026-11-15T17:00:00+08:00' },
    { venue: 'REST', opened_at: '2026-11-15T09:00:00+08:00', closed_at: '2026-11-15T21:00:00+08:00' }];
  const txs = [{ id: 'a', type: 'PAYMENT', amount: 100, paid_at: '2026-11-15T12:00:00+08:00', method: 'CREDIT_CARD' },
    { id: 'TWOURING:b', type: 'PAYMENT', amount: 200, paid_at: '2026-11-15T12:00:00+08:00', method: 'CREDIT_CARD', entity: 'TWOURING' }];
  const r = L.reconcile([], txs, { registers: regs });
  assert.equal(r.by_venue.CAFE.linepay.amount, 100);
  assert.equal(r.by_venue.REST.linepay.amount, 200, '遊遊交易看遊遊的帳本：約書旅開著');
  assert.deepEqual(L.reconcile([], txs, { venues: ['STAY'], registers: regs }).others.map(t => t.id), ['TWOURING:b'], '同法人別店時段可改歸');
  assert.deepEqual(L.reconcile([], txs, { venues: ['BAR'], registers: regs }).others.map(t => t.id), ['a']);
  assert.equal(L.attribute({ paid_at: '2026-11-15T23:00:00+08:00', entity: 'TWOURING' }, []).venue, 'STAY', '遊遊沒開帳先算等等空間');
  assert.throws(() => L.claimRule('2026-11-15T12:00:00+08:00', regs, 'XX'), e => e.status === 400);
});

test('server 接線：交易表 entity 欄、遊遊 id 加前綴、同步狀態分列、各法人各自同步與排程、發票依訂單法人', () => {
  assert.match(server, /ALTER TABLE linepay_transactions ADD COLUMN IF NOT EXISTS entity TEXT/);
  assert.match(server, /ALTER TABLE ctbc_transactions ADD COLUMN IF NOT EXISTS entity TEXT/);
  assert.match(server, /const t=entity==='TTH'\?t0:\{\.\.\.t0,id:`\$\{entity\}:\$\{t0\.id\}`\}/);
  assert.match(server, /const SYNC_ROW=\{TTH:1,TWOURING:2\}/);
  assert.match(server, /\.\.\.entities\.ENTITIES\.flatMap\(en=>\[/);
  assert.match(server, /const invoiceCfg=o=>ezpayInvoice\.config\(process\.env,invoiceEntity\(o\)\)/);
  assert.match(server, /e==='TWOURING'&&String\(process\.env\.EZPAY_SPACE_INVOICE_ENTITY/, '空間品牌可暫由言文字代開（KK 11/18）');
  assert.match(server, /entity:invoiceEntity\(order\)/, '開立時記住法人，之後作廢用原法人');
  assert.doesNotMatch(server, /ezpayInvoice\.config\(\)/, '發票一律依訂單法人取商店');
  assert.doesNotMatch(server, /linepay\.config\(\)|ctbc\.config\(\)/, '金流一律依法人取商店');
});

test('空間品牌發票暫由言文字代開（KK 11/18）：設定切換、已開立沿用原法人', () => {
  const src = server.slice(server.indexOf('const orderEntity=o=>'), server.indexOf('const invoiceCfg=o=>'));
  const env = {};
  const invoiceEntity = new Function('entities', 'process', src + 'return invoiceEntity;')(E, { env });
  const rest = { items: [{ venue: 'REST' }] }, cafe = { items: [{ venue: 'CAFE' }] };
  assert.equal(invoiceEntity(rest), 'TWOURING', '沒設定＝遊遊');
  env.EZPAY_SPACE_INVOICE_ENTITY = 'TTH';
  assert.equal(invoiceEntity(rest), 'TTH');
  assert.equal(invoiceEntity({ items: [{ venue: 'STAY' }] }), 'TTH');
  assert.equal(invoiceEntity(cafe), 'TTH');
  assert.equal(invoiceEntity({ ...rest, invoice: { status: 'issued', number: 'AB12345678', entity: 'TWOURING' } }), 'TWOURING', '遊遊開的票仍由遊遊作廢');
  delete env.EZPAY_SPACE_INVOICE_ENTITY;
  assert.equal(invoiceEntity({ ...rest, invoice: { status: 'issued', number: 'AB12345678', entity: 'TTH' } }), 'TTH', '切回後言文字代開的票仍由言文字作廢');
  assert.equal(invoiceEntity({ ...rest, invoice: { status: 'failed', entity: 'TTH' } }), 'TWOURING', '開失敗的單依現行設定');
});
