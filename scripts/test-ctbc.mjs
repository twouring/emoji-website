// scripts/test-ctbc.mjs — 中信行動刷卡對帳：設定、結果表正規化、區間切月、日結對帳、驗證碼辨識、server/前端接線；並確認台新手機付已移除
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../lib/ctbc');
const T = require('../lib/table-orders');
const R = require('../lib/pos-register');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

// 中信「交易資料查詢」結果表一列（表頭文字為 key；TxDate／TxEjfNo／TxExtend 是表頭上的隱藏欄）
const row = (o = {}) => ({ TxDate: '20261029', TxEjfNo: '000123', TxExtend: '0', '業務別': '01 - 一般', '交易日期': '2026/10/29 14:23:05', '卡號': '411111******1234', '交易金額': '1,280', '交易類別': '0 - 銷售', '授權碼': 'A1B2C3', '交易進度': '交易成功', '結帳方式': '0 - 未結帳', '結帳日期': '', '預計請款日期': '2026/10/31', TID: '80012345', '行動裝置使用者': 'A01', '商品備註': '', ...o });

test('config：商店代號、使用者、密碼都有才啟用；CTBC_PROXY 選填', () => {
  assert.equal(C.config({}), null);
  assert.equal(C.config({ CTBC_MPOS_MERCHANT_ID: '0106906445', CTBC_MPOS_USER: 'u' }), null);
  assert.deepEqual(C.config({ CTBC_MPOS_MERCHANT_ID: ' 0106906445 ', CTBC_MPOS_USER: ' mPOSAdmin ', CTBC_MPOS_PASSWORD: 'p' }), { merchantId: '0106906445', user: 'mPOSAdmin', password: 'p', proxy: null });
  assert.equal(C.config({ CTBC_MPOS_MERCHANT_ID: '1', CTBC_MPOS_USER: 'u', CTBC_MPOS_PASSWORD: 'p', CTBC_PROXY: 'http://x:3128' }).proxy, 'http://x:3128');
  assert.equal(C.configured({}), false);
});

test('normalize：台北時間補時區、千分位金額、取消／退貨記負數、卡號末四碼、id 穩定', () => {
  const n = C.normalize(row());
  assert.equal(n.paid_at, '2026-10-29T06:23:05.000Z', '14:23 台北＝06:23 UTC');
  assert.equal(n.amount, 1280); assert.equal(n.type, 'SALE'); assert.equal(n.card_last4, '1234'); assert.equal(n.auth_code, 'A1B2C3');
  assert.equal(n.id, '20261029-000123-0'); assert.equal(n.device_user, 'A01');
  assert.equal(C.normalize(row()).id, n.id, '同一列每次查 id 相同（upsert 不重複）');
  assert.equal(C.normalize(row({ '交易類別': '3 - 銷售取消', TxExtend: '3' })).amount, -1280);
  assert.equal(C.normalize(row({ '交易類別': '11 - 退貨', TxExtend: '11' })).type, 'REFUND');
  assert.equal(C.normalize(row({ '交易類別': '11 - 退貨' })).amount, -1280);
  assert.equal(C.normalize(row({ '交易類別': '13 - 退貨取消' })).type, 'REFUND_CANCEL');
  assert.equal(C.normalize(row({ '交易類別': '13 - 退貨取消' })).amount, 1280);
  assert.equal(C.normalize(row({ '交易日期': '115/10/29 14:23:05' })).paid_at, n.paid_at, '民國年也接受');
  assert.match(C.normalize(row({ TxEjfNo: '' })).id, /^h[0-9a-f]{20}$/, '缺序號時以內容雜湊當 id');
  assert.equal(C.normalize(row({ '交易日期': '' })), null);
  assert.equal(C.normalize(row({ '交易金額': 'abc' })), null);
});

test('monthChunks 切自然月（中信單次上限 6 個月）；syncWindow 回最近 N 天到今天營業日', () => {
  assert.deepEqual(C.monthChunks('2026-09-20', '2026-11-02'), [['2026-09-20', '2026-09-30'], ['2026-10-01', '2026-10-31'], ['2026-11-01', '2026-11-02']]);
  assert.deepEqual(C.syncWindow(new Date('2026-10-29T04:40:00+08:00'), 7), ['2026-10-22', '2026-10-29']);
  assert.deepEqual(C.syncWindow(new Date('2026-10-30T02:00:00+08:00'), 1), ['2026-10-28', '2026-10-29'], '凌晨 03:00 前算前一營業日');
});

test('reconcile：POS 信用卡（ctbc＋歷史 taishin／card）vs 中信實收；作廢、失敗、其他付款方式不計；依開關帳歸屬店別', () => {
  const orders = [
    { status: 'paid', amount: 300, payer: { method: 'ctbc' }, items: [{ venue: 'CAFE' }] },
    { status: 'paid', amount: 200, payer: { method: 'taishin' }, items: [{ venue: 'BAR' }] },
    { status: 'paid', amount: 150, payer: { method: 'card' }, items: [{ venue: 'CAFE' }] },
    { status: 'void', amount: 999, payer: { method: 'ctbc' }, items: [{ venue: 'CAFE' }] },
    { status: 'paid', amount: 80, payer: { method: 'cash' }, items: [{ venue: 'CAFE' }] },
  ];
  const txs = [
    C.normalize(row({ TxEjfNo: '1', '交易日期': '2026/10/29 10:00:00', '交易金額': '300' })),
    C.normalize(row({ TxEjfNo: '2', '交易日期': '2026/10/29 11:00:00', '交易金額': '150' })),
    C.normalize(row({ TxEjfNo: '3', '交易日期': '2026/10/29 20:00:00', '交易金額': '250' })),
    C.normalize(row({ TxEjfNo: '4', '交易日期': '2026/10/29 20:30:00', '交易金額': '50', '交易類別': '3 - 銷售取消' })),
    C.normalize(row({ TxEjfNo: '5', '交易日期': '2026/10/29 21:00:00', '交易金額': '999', '交易進度': '授權失敗' })),
  ];
  const registers = [{ venue: 'CAFE', opened_at: '2026-10-29T00:00:00Z', closed_at: '2026-10-29T09:00:00Z' }, { venue: 'BAR', opened_at: '2026-10-29T09:00:00Z', closed_at: null }];
  const r = C.reconcile(orders, txs, { registers });
  assert.deepEqual(r.pos, { count: 3, amount: 650 });
  assert.equal(r.ctbc.amount, 650, '300+150+250−50，失敗那筆不計');
  assert.equal(r.ctbc.count, 3); assert.equal(r.ctbc.refunds, 1); assert.equal(r.ctbc.refund_amount, 50);
  assert.equal(r.diff, 0);
  assert.equal(r.by_venue.CAFE.ctbc.amount, 450); assert.equal(r.by_venue.BAR.ctbc.amount, 200);
  assert.equal(r.by_venue.CAFE.diff, 0); assert.equal(r.by_venue.BAR.diff, 0);
  assert.ok(r.rows.every(t => !('raw' in t)), '回前端不帶 raw');
  const cafe = C.reconcile(orders, txs, { venues: ['CAFE'], registers });
  assert.equal(cafe.pos.amount, 450); assert.equal(cafe.ctbc.amount, 450);
  const csv = C.csvRows(r.rows);
  assert.equal(csv[0][3], '中信交易序號'); assert.equal(csv.length, 5);
});

test('驗證碼：模板涵蓋 0–9，空白圖不會丟例外', () => {
  const tpl = require('../lib/ctbc-captcha.json');
  assert.deepEqual(Object.keys(tpl).sort(), '0123456789'.split(''));
  for (const v of Object.values(tpl)) assert.equal(v.length, 140);
  const cap = require('../lib/ctbc-captcha');
  const blank = new Uint8ClampedArray(60 * 30 * 4).fill(255);
  assert.equal(cap.solve(blank).length, 4);
});

test('付款方式：信用卡＝ctbc；結帳選項不列 card／taishin，歷史單仍可顯示與對帳', () => {
  assert.equal(T.PAY_METHODS.ctbc, '信用卡');
  assert.equal(T.payMethod('ctbc'), 'ctbc');
  assert.equal(T.payMethod('taishin'), 'taishin', '歷史單更正付款方式仍接受舊代碼');
  assert.deepEqual(R.accountsOf({ cash: 50, card: 10, taishin: 20, ctbc: 5, linepay: 2 }), { linepay: 2, ctbc: 35, transfer: 0 });
  assert.ok(require('../lib/pos-payment-methods').RESERVED_CODES.has('ctbc'));
  const server = read('server.js');
  assert.match(server, /MERGED_PAY_LABEL=\{ctbc:'信用卡'\}/);
  assert.match(server, /filter\(\(\[code\]\)=>code!=='tappay'&&!posRegister\.LEGACY_CARD\.includes\(code\)\)/);
  const ops = read('public/pos-ops.js');
  assert.match(ops, /\['ctbc','信用卡'\]/);
  assert.doesNotMatch(ops, /\['taishin','信用卡'\]/);
});

test('server：ctbc 交易表、同步路由、排程、日結回 ctbc 區塊；台新手填對帳已移除', () => {
  const s = read('server.js');
  assert.match(s, /CREATE TABLE IF NOT EXISTS ctbc_transactions/);
  assert.match(s, /CREATE TABLE IF NOT EXISTS ctbc_sync_state/);
  assert.match(s, /app\.post\('\/api\/admin\/sales\/ctbc\/sync',auth,adminOnly,requireDb,wrap/);
  assert.match(s, /ctbc:\{\.\.\.ct,configured:ctbc\.configured\(\)/);
  assert.match(s, /cronRunner\.define\('ctbc-daily'/);
  assert.match(s, /cronRunner\.define\('ctbc-recent', \(\) => \{ if \(ctbcSyncing\) return 'busy';/);
  assert.match(s, /schedule\('\*\/15 \* \* \* \*', \(\) => cronRunner\.run\('ctbc-recent'\)/);
  assert.doesNotMatch(s, /sales\/taishin|taishinManual|pos_taishin_daily WHERE/);
  assert.ok(!fs.existsSync(new URL('lib/taishin-manual.js', root)) && !fs.existsSync(new URL('lib/taishin.js', root)), '台新程式已刪除');
  const cron = require('../lib/cron-jobs');
  assert.ok(cron.SCHEDULE.some(j => j.job === 'ctbc-daily' && j.cron === '40 4 * * *'));
  assert.ok(cron.dueJobs(new Date('2026-10-29T10:15:00+08:00')).includes('ctbc-recent'));
  assert.ok(!cron.dueJobs(new Date('2026-10-29T10:05:00+08:00')).includes('ctbc-recent'));
});

test('前端：日結頁「信用卡對帳（中信）」區塊、同步鈕、CSV；台新手填表單已移除', () => {
  const ops = read('public/pos-ops.js');
  assert.match(ops, /<h3>信用卡對帳（中信）/);
  assert.match(ops, /api\('\/admin\/sales\/ctbc\/sync',\{method:'POST',body:\{start,end\}\}\)/);
  assert.match(ops, /id="ct-csv"/);
  assert.doesNotMatch(ops, /id="ts-form"|sales\/taishin|台新/);
});

test('系統設定可填中信帳密（密碼為機密、live 重載）；pos-log 記錄同步操作；文件有 ctbc', () => {
  const S = require('../lib/system-settings');
  assert.equal(S.byKey.get('CTBC_MPOS_PASSWORD').secret, true);
  for (const k of ['CTBC_MPOS_MERCHANT_ID', 'CTBC_MPOS_USER', 'CTBC_MPOS_PASSWORD']) assert.ok(S.isLive(k), k);
  assert.throws(() => S.validate('CTBC_MPOS_MERCHANT_ID', 'abc'), /數字/);
  assert.equal(S.validate('CTBC_MPOS_MERCHANT_ID', '0106906445'), '0106906445');
  assert.match(read('lib/pos-log.js'), /sales\\\/ctbc\\\/sync/);
  const docs = read('docs/API.md');
  assert.match(docs, /### POST \/api\/admin\/sales\/ctbc\/sync/);
  assert.match(docs, /`ctbc` 為信用卡（中信行動刷卡）對帳/);
  assert.doesNotMatch(docs, /### POST \/api\/admin\/sales\/taishin/);
});
