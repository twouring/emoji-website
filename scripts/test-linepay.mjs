// scripts/test-linepay.mjs — LINE Pay 對帳：後台交易正規化、區間切月、同步視窗、日結對帳、server/前端接線
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../lib/linepay');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

// LINE Pay 商家後台 /mrc/merchant/payment/transactions 回的一筆（欄位依實際回應）
const raw = { transactionSequence: '2025103123312092910', originTransactionSequence: '2025103123312092910', transactionType: 'PAYMENT', payStatusType: 'CAPTURE', transactionYmdt: '2025-10-31T20:15:35', totalPayAmount: 220.0, payAmount: 220.0, paymentMethodType: 'CREDIT_CARD', payProviderType: 'TSP', merchantOrderNo: 'Z8334_QRCODE_202510311364369657', cardNumber: '************7411', confirmNo: 'Z8334' };
const rawRefund = { ...raw, transactionSequence: '2025101513598559211', originTransactionSequence: '2025101513597425210', transactionType: 'PAYMENT_CANCEL', transactionYmdt: '2025-10-15T13:05:32', totalPayAmount: 180, paymentMethodType: 'IPASS', payProviderType: 'IPASS', cardNumber: '', confirmNo: 'Q4264' };

test('config：帳密都有才啟用；版本 header 可覆寫', () => {
  assert.equal(L.config({}), null);
  assert.equal(L.config({ LINEPAY_MERCHANT_ID: 'CR.1' }), null);
  const c = L.config({ LINEPAY_MERCHANT_ID: ' CR.1 ', LINEPAY_MERCHANT_PW: 'x' });
  assert.deepEqual(c, { merchantId: 'CR.1', password: 'x', apiVersion: L.API_VERSION });
  assert.equal(L.config({ LINEPAY_MERCHANT_ID: 'a', LINEPAY_MERCHANT_PW: 'b', LINEPAY_API_VERSION: '260101_R' }).apiVersion, '260101_R');
  assert.equal(L.configured({}), false);
});

test('normalize：台北時間補時區、退款記負數、卡號只留末四碼、壞資料回 null', () => {
  const n = L.normalize(raw);
  assert.equal(n.id, '2025103123312092910');
  assert.equal(n.paid_at, '2025-10-31T12:15:35.000Z', '20:15 台北 = 12:15 UTC');
  assert.equal(n.amount, 220); assert.equal(n.method, 'CREDIT_CARD'); assert.equal(n.card_last4, '7411'); assert.equal(n.confirm_no, 'Z8334');
  const r = L.normalize(rawRefund);
  assert.equal(r.amount, -180); assert.equal(r.type, 'PAYMENT_CANCEL'); assert.equal(r.origin_id, '2025101513597425210'); assert.equal(r.card_last4, '');
  assert.equal(L.normalize({ ...raw, transactionSequence: 'abc' }), null);
  assert.equal(L.normalize({ ...raw, transactionYmdt: 'nope' }), null);
  assert.equal(L.normalize({ ...raw, transactionType: 'PARTIAL_CANCEL', totalPayAmount: 50 }).amount, -50);
});

test('monthChunks：整年切成自然月（後台整段查會 500）；syncWindow 回最近 N 天到今天營業日', () => {
  const c = L.monthChunks('2025-10-12', '2026-01-05');
  assert.deepEqual(c, [['2025-10-12', '2025-10-31'], ['2025-11-01', '2025-11-30'], ['2025-12-01', '2025-12-31'], ['2026-01-01', '2026-01-05']]);
  assert.deepEqual(L.monthChunks('2026-03-03', '2026-03-03'), [['2026-03-03', '2026-03-03']]);
  assert.deepEqual(L.syncWindow(new Date('2026-10-12T04:30:00+08:00'), 7), ['2026-10-05', '2026-10-12']);
  assert.deepEqual(L.syncWindow(new Date('2026-10-12T02:30:00+08:00'), 7), ['2026-10-04', '2026-10-11'], '凌晨 03:00 前仍是前一個營業日');
  assert.deepEqual(L.syncWindow(new Date('2026-10-12T17:35:00+08:00'), 1), ['2026-10-11', '2026-10-12'], '5 分鐘背景同步抓昨今兩天');
});

test('reconcile：只算 POS 登記 linepay 的成立單；LINE Pay 實收扣退款；差額方向；店別只限 POS 側', () => {
  const orders = [
    { status: 'paid', amount: 220, payer: { method: 'linepay' }, items: [{ venue: 'CAFE' }] },
    { status: 'paid', amount: 180, payer: { method: 'linepay' }, items: [{ venue: 'BAR' }] },
    { status: 'void', amount: 999, payer: { method: 'linepay' }, items: [{ venue: 'CAFE' }] },
    { status: 'paid', amount: 500, payer: { method: 'cash' }, items: [{ venue: 'CAFE' }] },
  ];
  const txs = [L.normalize(raw), L.normalize({ ...raw, transactionSequence: '2025103123312092911', totalPayAmount: 180, paymentMethodType: 'IPASS' }), L.normalize(rawRefund)];
  const all = L.reconcile(orders, txs);
  assert.deepEqual(all.pos, { count: 2, amount: 400 });
  assert.equal(all.linepay.count, 2); assert.equal(all.linepay.amount, 220, '220+180-180');
  assert.equal(all.linepay.refunds, 1); assert.equal(all.linepay.refund_amount, 180);
  assert.deepEqual(all.linepay.by_method, { CREDIT_CARD: 220, IPASS: 0 });
  assert.equal(all.diff, -180, '實收 220 − POS 400');
  assert.equal(all.rows[0].type_label, '退款'); assert.equal(all.rows[0].paid_at < all.rows[1].paid_at, true, '依時間排序');
  assert.equal(all.rows[1].method_label, '信用卡');
  // pg 回的 paid_at 是 Date 物件（正式環境曾因此 500）：要能排序且輸出 ISO 字串
  const fromDb = L.reconcile(orders, txs.map(t => ({ ...t, paid_at: new Date(t.paid_at) })));
  assert.equal(fromDb.rows[0].paid_at, '2025-10-15T05:05:32.000Z'); assert.equal(fromDb.diff, -180);
  assert.equal(L.csvRows(fromDb.rows)[1][0], '2025-10-15');
  // 店別：交易時間 08–17 歸在咖啡、17 點後到凌晨歸三點水；兩側都依店別範圍過濾
  assert.equal(L.venueOfTime('2026-10-16T01:00:00+08:00'), 'BAR'); assert.equal(L.venueOfTime('2026-10-16T08:00:00+08:00'), 'CAFE');
  assert.equal(L.venueOfTime('2026-10-16T16:59:00+08:00'), 'CAFE'); assert.equal(L.venueOfTime('2026-10-16T17:00:00+08:00'), 'BAR');
  assert.equal(L.venueOfTime('2026-10-17T02:30:00+08:00'), 'BAR');
  // 有開關帳紀錄時以開帳～關帳時間為準（pg 回 Date 物件）；關帳後到下一店開帳前算下一本帳（提早付款）；最後一本帳關帳後算輪到的另一店；還沒關帳的視為開到現在
  const regs = [
    { venue: 'BAR', opened_at: new Date('2026-10-16T18:10:00+08:00'), closed_at: null },
    { venue: 'CAFE', opened_at: new Date('2026-10-16T09:30:00+08:00'), closed_at: new Date('2026-10-16T17:40:00+08:00') },
  ];
  assert.equal(L.venueOfTime('2026-10-16T09:00:00+08:00', regs), 'CAFE', '開帳前');
  assert.equal(L.venueOfTime('2026-10-16T17:20:00+08:00', regs), 'CAFE', '在咖啡 17:00 後還沒關帳');
  assert.equal(L.venueOfTime('2026-10-16T17:50:00+08:00', regs), 'BAR', '關帳後、三點水開帳前：算下一本帳');
  assert.equal(L.venueOfTime('2026-10-16T18:30:00+08:00', [regs[1]]), 'BAR', '最後一本帳（在咖啡）關帳後：算下一本帳＝三點水');
  assert.equal(L.venueOfTime('2026-10-17T02:58:00+08:00', [{ venue: 'BAR', opened_at: '2026-10-16T17:30:00+08:00', closed_at: '2026-10-17T02:50:00+08:00' }]), 'CAFE', '三點水關帳後：算下一本帳＝在咖啡');
  assert.equal(L.venueOfTime('2026-10-16T18:10:00+08:00', regs), 'BAR');
  assert.equal(L.venueOfTime('2026-10-17T02:50:00+08:00', regs), 'BAR', '還沒關帳');
  assert.equal(L.venueOfTime('2026-10-16T12:00:00+08:00', [{ venue: 'BAR', opened_at: '2026-10-16T11:00:00+08:00', closed_at: null }]), 'BAR', '只開過三點水就全歸三點水');
  assert.equal(L.reconcile(orders, txs, { registers: [{ venue: 'CAFE', opened_at: '2025-10-15T00:00:00+08:00', closed_at: null }] }).by_venue.CAFE.linepay.amount, 220, 'reconcile 帶 registers');
  const cafe = L.reconcile(orders, txs, { venues: ['CAFE'] });
  assert.deepEqual(cafe.pos, { count: 1, amount: 220 }); assert.equal(cafe.linepay.amount, -180, '在咖啡只含 13:05 的退款'); assert.equal(cafe.diff, -400);
  const bar = L.reconcile(orders, txs, { venues: ['BAR'] });
  assert.deepEqual(bar.pos, { count: 1, amount: 180 }); assert.equal(bar.linepay.amount, 400); assert.equal(bar.diff, 220);
  assert.equal(all.by_venue.CAFE.label, '在咖啡'); assert.equal(all.by_venue.BAR.linepay.amount, 400); assert.equal(all.by_venue.CAFE.pos.amount, 220);
  assert.equal(all.rows[0].venue_label, '在咖啡'); assert.equal(L.csvRows(all.rows)[1][1], '在咖啡');
  const empty = L.reconcile([], []); assert.deepEqual([empty.pos, empty.linepay.amount, empty.diff, empty.rows], [{ count: 0, amount: 0 }, 0, 0, []]);
  const csv = L.csvRows(all.rows);
  assert.equal(csv[0][0], '營業日'); assert.equal(csv.length, 4); assert.equal(csv[1][3], '2025101513598559211'); assert.equal(csv[1][5], -180);
});

test('fetchRange：帶 x-atom-api-version、翻頁到底；非 SUCCESS 擲錯並標 retry（session 失效）', async () => {
  const calls = [];
  const page = { evaluate: async (fn, [api, body, ver]) => { calls.push({ api, body, ver }); const pageNo = Number(body.pageNo); return pageNo > 2 ? { status: 200, json: { code: 'G_REFRESH_SESSION' } } : { status: 200, json: { code: 'SUCCESS', info: { totalCount: 150, totalPageCount: 2, paymentTransactionList: [{ transactionSequence: String(pageNo) }] } } }; } };
  const cfg = L.config({ LINEPAY_MERCHANT_ID: 'CR.1', LINEPAY_MERCHANT_PW: 'x' });
  const out = await L.fetchRange(page, cfg, '2026-10-01', '2026-10-31');
  assert.equal(out.totalCount, 150); assert.deepEqual(out.rows.map(r => r.transactionSequence), ['1', '2']);
  assert.equal(calls.length, 2); assert.equal(calls[0].api, L.TX_API); assert.equal(calls[0].ver, L.API_VERSION);
  assert.deepEqual(calls[0].body, { merchantId: 'CR.1', startDateTime: '2026-10-01T00:00', endDateTime: '2026-10-31T23:59', perPage: '100', pageNo: '1' });
  const bad = { evaluate: async () => ({ status: 200, json: { code: 'G_REFRESH_SESSION' } }) };
  await assert.rejects(L.fetchRange(bad, cfg, '2026-10-01', '2026-10-31'), e => e.retry === true && /G_REFRESH_SESSION/.test(e.message));
  const dead = { evaluate: async () => ({ status: 404, json: { code: 'NOT_FOUND' } }) };
  await assert.rejects(L.fetchRange(dead, cfg, '2026-10-01', '2026-10-31'), e => !e.retry);
});

test('fetchTransactions：按月抓、去重、session 失效重登；瀏覽器一定關', async () => {
  let launched = 0, closed = 0, logins = 0, fails = 1;
  const pages = [];
  const mkPage = () => ({ evaluate: async (fn, args) => { if (!args) return; const body = args[1]; if (fails-- > 0) return { json: { code: 'G_REFRESH_SESSION' } }; return { json: { code: 'SUCCESS', info: { totalCount: 1, totalPageCount: 1, paymentTransactionList: [{ ...raw, transactionYmdt: body.startDateTime.slice(0, 10) + 'T10:00:00', transactionSequence: '2025' + body.startDateTime.slice(5, 7) + '0000000000' }, raw] } } }; }, close: async () => {}, setViewport: async () => {}, goto: async () => { logins++; }, waitForSelector: async () => {}, type: async () => {}, waitForFunction: async () => {} });
  const puppeteer = { launch: async () => { launched++; return { newPage: async () => { const p = mkPage(); pages.push(p); return p; }, close: async () => { closed++; } }; } };
  const cfg = L.config({ LINEPAY_MERCHANT_ID: 'CR.1', LINEPAY_MERCHANT_PW: 'x' });
  const rows = await L.fetchTransactions(cfg, '2026-01-10', '2026-03-05', { puppeteer });
  assert.equal(launched, 1); assert.equal(closed, 1);
  assert.equal(pages.length, 2, '第一頁 session 失效 → 重登一次');
  assert.deepEqual(rows.map(r => r.id).sort(), ['2025010000000000', '2025020000000000', '2025030000000000', raw.transactionSequence], '每月一筆＋重複的 raw 只留一筆');
});

test('server.js 接線：資料表、日結回 linepay、同步／匯入端點、每日排程', () => {
  const s = read('server.js');
  assert.match(s, /CREATE TABLE IF NOT EXISTS linepay_transactions/);
  assert.match(s, /app\.get\('\/api\/admin\/sales'[\s\S]{0,1500}linepay\.reconcile\(orders,txs,\{venues,registers\}\)/);
  assert.match(s, /app\.post\('\/api\/admin\/sales\/linepay\/sync',auth,adminOnly,requireDb/);
  assert.match(s, /app\.post\('\/api\/admin\/sales\/linepay\/import',auth,adminOnly,superOnly,requireDb/, '歷史匯入只給超管／agent');
  assert.match(s, /ON CONFLICT \(id\) DO UPDATE SET type=EXCLUDED\.type/, '同一筆交易重抓是覆寫不是重複');
  // 帳密可在後台「系統設定」事後填入，排程一律掛上、執行時才檢查 configured()
  assert.match(s, /schedule\('30 4 \* \* \*', \(\) => \{ if \(!linepay\.configured\(\)\) return; syncLinepay\(\.\.\.linepay\.syncWindow\(\)\)/);
  assert.doesNotMatch(s, /subject: '\[POS\] LINE Pay 對帳同步失敗'/, 'LINE Pay 同步失敗不寄信');
  assert.match(s, /INSERT INTO linepay_sync_state\(id,error,failed_at\)/, '同步失敗記錄錯誤');
  assert.match(s, /ON CONFLICT \(id\) DO UPDATE SET error=NULL,failed_at=NULL,ok_at=now\(\)/, '同步成功清除錯誤');
  assert.match(s, /sync_error:syncState\.error\|\|null/, '日結 API 回傳同步錯誤');
  assert.match(s, /schedule\('\*\/5 \* \* \* \*', \(\) => \{ if \(!linepay\.configured\(\) \|\| linepaySyncing\) return; syncLinepay\(\.\.\.linepay\.syncWindow\(Date\.now\(\), 1\)\)/, '背景每 5 分鐘抓昨今兩天，正在同步就跳過');
  assert.match(s, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|tables\|content\|menu\|reservations\|sales\|analytics\|registers\|staff\|shifts\|attendance\|payment-methods\|pos-devices\|yan\|reservation-hours\)/, '餐飲子帳號可用 /api/admin/sales/linepay/sync');
  assert.doesNotMatch(s, /LINEPAY_MERCHANT_PW\s*=\s*['"]/, '密碼不得寫死');
});

test('日結畫面：LINE Pay 對帳區、同步鍵、CSV；lib 不得含帳密', () => {
  const ops = read('public/pos-ops.js'), css = read('public/pos-ops.css'), lib = read('lib/linepay.js');
  assert.match(ops, /LINE Pay 對帳/); assert.match(ops, /id="lp-sync"/); assert.match(ops, /\/admin\/sales\/linepay\/sync/); assert.match(ops, /downloadCSV\(`LINEPay_/);
  assert.match(ops, /lp\.configured===false\?'disabled'/, '未設定帳密時同步鍵停用');
  assert.match(css, /\.lp-diff/);
  assert.doesNotMatch(lib, /Emoji\d|CR\.\d{8}/, 'lib/linepay.js 不得含商店 ID 或密碼');
  assert.match(lib, /'x-atom-api-version'/, '缺這個 header 後台回 404');
});

test('LINE Pay 同步失敗顯示在 POS 畫面', async () => {
  const { readFileSync } = await import('node:fs');
  const ops = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(ops, /LINE Pay 自動同步失敗/);
  assert.match(ops, /\$\{lpSyncErr\(lp\)\}/);
});
