// 會計對帳報表（KK 11/15）：區間依法人→品牌→營業日彙總，給會計核對營收、稅額、收款、發票
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../lib/accounting-report.js');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');

const line = (venue, price, extra = {}) => ({ zh: '品項', qty: 1, price, venue, ...extra });
const order = (id, venue, amount, o = {}) => ({ id, table_no: 'A1', items: [line(venue, amount)], amount, payer: { method: 'cash' }, invoice: {}, status: 'done', paid_at: '2026-11-10T04:00:00Z', ledger_day: '2026-11-10', ...o });

test('區間：預設本月 1 日～今天；超過 93 天、倒置、格式錯回 400', () => {
  const r = R.range({}, Date.parse('2026-11-15T04:00:00Z'));
  assert.equal(r.from, '2026-11-01'); assert.equal(r.to, '2026-11-15'); assert.equal(r.days.length, 15);
  assert.equal(r.start.toISOString(), '2026-10-31T19:00:00.000Z');
  assert.throws(() => R.range({ from: '2026-01-01', to: '2026-11-15' }), /93/);
  assert.throws(() => R.range({ from: '2026-11-15', to: '2026-11-01' }), /區間/);
  assert.throws(() => R.range({ from: '2026-11-31', to: '2026-12-01' }), /區間/);
});

test('法人分組：言文字＝在咖啡＋三點水，遊遊＝等等空間＋約書旅', () => {
  assert.equal(R.entityOf('CAFE'), 'FNB'); assert.equal(R.entityOf('BAR'), 'FNB');
  assert.equal(R.entityOf('STAY'), 'SPACE'); assert.equal(R.entityOf('REST'), 'SPACE');
  assert.equal(R.ENTITY_LABEL.FNB, '言文字股份有限公司'); assert.equal(R.ENTITY_LABEL.SPACE, '遊遊股份有限公司');
});

test('彙總：營收不含打賞、作廢另列、稅額 ÷1.05、發票金額與未開發票', () => {
  const days = ['2026-11-10', '2026-11-11'];
  const orders = [
    order('o1', 'CAFE', 1050, { invoice: { status: 'issued', number: 'AB12345678', requested: true } }),
    order('o2', 'CAFE', 600, { items: [line('CAFE', 500), line('CAFE', 100, { tip: true })], payer: { method: 'linepay', tip_amount: 100 } }),
    order('o3', 'CAFE', 300, { status: 'void', void_reason: '測試' }),
    order('o4', 'BAR', 2200, { payer: { method: 'ctbc', service_charge: { amount: 200 } }, invoice: { status: 'failed', requested: true }, ledger_day: '2026-11-11', paid_at: '2026-11-11T12:00:00Z' }),
    order('o5', 'STAY', 400, { payer: { method: 'transfer' } }),
    order('x', 'CAFE', 999, { ledger_day: '2026-11-09' }),   // 區間外不計
  ];
  const registers = [
    { id: 'r1', day: '2026-11-10', venue: 'CAFE', opened_at: '2026-11-10T00:00:00Z', closed_at: '2026-11-10T09:00:00Z', diff: -20 },
    { id: 'r2', day: '2026-11-11', venue: 'BAR', opened_at: '2026-11-11T09:00:00Z', closed_at: null, diff: null },
  ];
  const linepayTxs = [{ id: 'L1', type: 'PAYMENT', amount: 600, paid_at: '2026-11-10T04:00:00Z', method: 'CREDIT_CARD' }];
  const ctbcTxs = [{ id: 'C1', type: 'SALE', amount: 2000, paid_at: '2026-11-11T12:00:00Z', progress: '成功' }];
  const d = R.build({ from: days[0], to: days[1], days, orders, registers, linepayTxs, ctbcTxs, methodLabels: { transfer: '轉帳' } });

  const cafe = d.rows.find(r => r.venue === 'CAFE' && r.day === '2026-11-10');
  assert.equal(cafe.amount, 1550, '1050＋(600−打賞100)');
  assert.equal(cafe.collected, 1650);
  assert.equal(cafe.tip, 100);
  assert.equal(cafe.voided, 1); assert.equal(cafe.void_amount, 300);
  assert.equal(cafe.invoice_count, 1); assert.equal(cafe.invoice_amount, 1050); assert.equal(cafe.invoice_tax, 50);
  assert.equal(cafe.uninvoiced, 500);
  assert.equal(cafe.cash_diff, -20); assert.equal(cafe.register, 'closed');
  assert.equal(cafe.linepay_pos, 600); assert.equal(cafe.linepay_actual, 600);

  const bar = d.rows.find(r => r.venue === 'BAR');
  assert.equal(bar.register, 'open'); assert.equal(bar.service, 200); assert.equal(bar.invoice_failed, 1);
  assert.equal(bar.ctbc_pos, 2200); assert.equal(bar.ctbc_actual, 2000);

  const stay = d.rows.find(r => r.venue === 'STAY');
  assert.equal(stay.register, 'none'); assert.equal(stay.entity, 'SPACE');

  assert.equal(d.by_entity.FNB.amount, 3750); assert.equal(d.by_entity.SPACE.amount, 400);
  assert.equal(d.total.amount, 4150);
  assert.deepEqual(d.by_entity.FNB.venues.sort(), ['BAR', 'CAFE']);
  assert.ok(!d.rows.some(r => r.day === '2026-11-09'));

  const texts = d.issues.map(i => i.text).join('\n');
  assert.match(texts, /三點水：帳本未關帳/);
  assert.match(texts, /在咖啡：現金短溢 -20/);
  assert.match(texts, /中信刷卡實收 2000／POS 登記 2200，差 -200/);
  assert.match(texts, /發票開立失敗 1 張/);
  assert.match(texts, /等等空間：有 1 張單但沒有開帳紀錄/);
  assert.doesNotMatch(texts, /在咖啡：LINE Pay/, 'LINE Pay 對得上不列');

  // CSV
  const [h, ...rows] = d.csv.daily;
  assert.equal(h[0], '法人'); assert.ok(h.includes('稅額')); assert.ok(h.includes('收款：轉帳'));
  const cafeRow = rows.find(r => r[1] === '在咖啡' && r[2] === '2026-11-10');
  assert.equal(cafeRow[h.indexOf('營收（含稅，不含打賞）')], 1550);
  assert.equal(cafeRow[h.indexOf('未稅')] + cafeRow[h.indexOf('稅額')], 1550);
  assert.ok(rows.some(r => r[0] === '言文字股份有限公司' && r[1] === '（法人合計）' && r[5] === 3750));
  const [ih, ...inv] = d.csv.invoices;
  assert.equal(inv.length, 5, '區間內 5 張（含作廢）');
  const o2 = inv.find(r => r[ih.indexOf('單號')] === 'o2');
  assert.equal(o2[ih.indexOf('打賞代收')], 100); assert.equal(o2[ih.indexOf('營收（含稅）')], 500);
  const o3 = inv.find(r => r[ih.indexOf('單號')] === 'o3');
  assert.equal(o3[ih.indexOf('營收（含稅）')], 0); assert.equal(o3[ih.indexOf('狀態')], '作廢');
  assert.equal(inv.find(r => r[ih.indexOf('單號')] === 'o1')[ih.indexOf('發票號碼')], 'AB12345678');
  assert.equal(d.csv.linepay.length, 2); assert.equal(d.csv.ctbc.length, 2);
});

test('伺服器：端點只給言文字管理員、依開帳日認列', () => {
  const i = server.indexOf("app.get('/api/admin/accounting',"); assert.ok(i > 0);
  const body = server.slice(i, server.indexOf('}));', i));
  assert.match(body, /ordersOfLedgerRange\(r\.from,r\.to/);
  assert.match(body, /accountingReport\.build/);
  assert.doesNotMatch(server.match(/^const FOOD_API = .*$/m)[0], /accounting/, '不開給品牌子帳號');
  const f = server.slice(server.indexOf('async function ordersOfLedgerRange('), server.indexOf("app.get('/api/admin/accounting',"));
  assert.match(f, /r\.day>=floor&&r\.day<=bd/, '沒關的舊帳只延到隔一個營業日，同 ordersOfDay');
});

test('admin：會計對帳分頁、四種 CSV', () => {
  assert.match(admin, /\{ id:'accounting',  label:'會計對帳', render:tabAccounting \}/);
  assert.match(admin, /\['營運', \['overview','sales','accounting','staff'\]\]/);
  assert.match(admin, /if \(tab === 'accounting'\) \{ loadAccounting\(\); return; \}/);
  for (const k of ['daily', 'invoices', 'linepay', 'ctbc']) assert.match(admin, new RegExp(`data-acct-csv="${k}"`));
});
