// scripts/test-pos-payment-methods.mjs — 收款帳戶純邏輯：內建付款方式固定，言文字管理員可另外新增自訂收款帳戶
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../lib/pos-payment-methods');
const T = require('../lib/table-orders');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

test('新增收款帳戶：名稱必填、清理控制字元與長度；code 隨機產生、不可撞內建或既有代碼', () => {
  assert.throws(() => P.methodInput({ label: '' }), /請填寫收款帳戶名稱/);
  assert.throws(() => P.methodInput({ label: '   ' }), /請填寫收款帳戶名稱/);
  assert.throws(() => P.methodInput({}), /請填寫收款帳戶名稱/);
  const m = P.methodInput({ label: ' 街口支付\x00 ' });
  assert.equal(m.label, '街口支付');
  assert.match(m.code, /^m[0-9a-f]{8}$/);
  assert.ok(!P.RESERVED_CODES.has(m.code));
  // code 不會跟既有自訂代碼衝突（機率極低，但邏輯要擋）
  const again = P.methodInput({ label: '另一組轉帳' }, [m.code]);
  assert.notEqual(again.code, m.code);
  assert.equal(P.methodInput({ label: '名稱超過二十個字的收款帳戶名稱測試看看會不會被裁切掉' }).label.length, 20);
});

test('編輯收款帳戶：改名清理同新增；沒給名稱要擋', () => {
  assert.equal(P.labelInput(' 悠遊付 '), '悠遊付');
  assert.throws(() => P.labelInput(''), /請填寫收款帳戶名稱/);
});

test('payMethod／posCheckout：內建付款方式照舊；自訂收款帳戶代碼要在啟用清單（extraCodes）才給過；tappay 一律擋（線上刷卡走 webhook，不給手動選）', () => {
  assert.equal(T.payMethod('cash'), 'cash');
  assert.equal(T.payMethod('transfer'), 'transfer');
  assert.throws(() => T.payMethod('tappay'), /付款方式/);
  assert.throws(() => T.payMethod('tappay', new Set(['tappay'])), /付款方式/, 'extraCodes 也不能解禁 tappay');
  assert.throws(() => T.payMethod('jkopay'), /付款方式/, '未知代碼預設擋下');
  assert.equal(T.payMethod('jkopay', new Set(['jkopay'])), 'jkopay', '啟用中的自訂收款帳戶放行');
  assert.equal(T.payMethod('jkopay', ['jkopay']), 'jkopay', 'extraCodes 也接受陣列');
  assert.throws(() => T.payMethod('jkopay', new Set(['other_code'])), /付款方式/, '只有真的在清單裡的代碼才放行');

  const menuJson = JSON.stringify({ version: 1, items: [{ id: 'm_x', venue: 'CAFE', cat: 'FOOD', zh: '測試品項', price: 100, published: true }] });
  const menu = T.menuIndex(menuJson);
  const items = T.addLine([], menu, { item_id: 'm_x', qty: 1, guest: 'guest0000001' });
  const menuAll = T.menuIndex(menuJson, undefined, { all: true });
  assert.throws(() => T.posCheckout(items, { method: 'jkopay' }, menuAll), /付款方式/, '沒傳 extraMethodCodes 時自訂代碼一律擋');
  const out = T.posCheckout(items, { method: 'jkopay' }, menuAll, new Set(['jkopay']));
  assert.equal(out.payer.method, 'jkopay');
});

test('CSV 匯出：自訂收款帳戶用呼叫端傳入的 methodLabels 顯示名稱，沒傳或查不到就退回代碼本身；舊單（沒記 method）視同現金', () => {
  const order = { payer: { method: 'jkopay' }, items: [{ zh: '測試品項', qty: 1, price: 100, line: 'l1' }], paid_at: new Date().toISOString(), table_no: 'A1' };
  const withLabel = T.salesCsvRows([order], { methodLabels: { jkopay: '街口支付' } });
  assert.equal(withLabel[1][7], '街口支付');
  const withoutLabel = T.salesCsvRows([order], {});
  assert.equal(withoutLabel[1][7], 'jkopay', '查不到名稱時退回代碼，不能誤標成現金');
  const legacy = { payer: {}, items: [{ zh: '舊單品項', qty: 1, price: 50, line: 'l1' }], paid_at: new Date().toISOString(), table_no: 'A2' };
  assert.equal(T.salesCsvRows([legacy], {})[1][7], '現金', '啟用付款方式紀錄之前的舊單預設視同現金');
});

test('server.js：收款帳戶表、API 路由、FOOD_API 白名單、/api/state 回傳 payment_methods', () => {
  const server = read('server.js');
  assert.match(server, /CREATE TABLE IF NOT EXISTS pos_payment_methods/);
  assert.match(server, /app\.post\('\/api\/admin\/payment-methods',auth,adminOnly,superOnly,requireDb/, '新增收款帳戶僅超管');
  assert.match(server, /app\.patch\('\/api\/admin\/payment-methods\/:code',auth,adminOnly,superOnly,requireDb/, '改名／停用僅超管');
  assert.match(server, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|tables\|content\|menu\|reservations\|sales\|registers\|staff\|shifts\|attendance\|payment-methods\|pos-devices\)/, '品牌子帳號可讀收款帳戶清單（結帳要用）');
  assert.match(server, /payment_methods: await paymentMethodsList\(\)/, '/api/state 要帶收款帳戶清單給前端畫結帳選項');
  assert.match(server, /tableOrders\.posCheckout\(s\.items,\{[^\n]*?operator\},menuAll,await activePaymentCodes\(\)\)/, '結帳要把啟用中的自訂收款帳戶代碼傳給 posCheckout 驗證');
});

test('docs/API.md 有記錄新端點與 /api/state 新欄位', () => {
  const docs = read('docs/API.md');
  assert.match(docs, /### POST \/api\/admin\/payment-methods/);
  assert.match(docs, /### PATCH \/api\/admin\/payment-methods\/:code/);
  assert.match(docs, /payment_methods\[\]/);
});

test('pos-ops.js：結帳付款方式選項改讀 DATA.payment_methods，不再寫死四個代碼；各處付款方式顯示名稱走 payMethodLabel 以支援自訂收款帳戶', () => {
  const ops = read('public/pos-ops.js');
  assert.match(ops, /const payMethodLabel=code=>/);
  assert.match(ops, /const payMethodsActive=\(\)=>/);
  assert.doesNotMatch(ops, /\['cash','card','linepay','transfer'\]\.map/, '結帳按鈕不該再寫死內建四個付款方式');
  assert.match(ops, /payMethodsActive\(\)\.map\(pm=>/);
});

test('admin.html：系統設定分頁只有超管看得到收款帳戶管理區，可新增／改名／停用自訂收款帳戶', () => {
  const admin = read('public/admin.html');
  assert.match(admin, /function paymentMethodsBlock\(d\)\{/);
  assert.match(admin, /\$\{d\.super\?paymentMethodsBlock\(d\):''\}/, '非超管不應看到收款帳戶管理區');
  assert.match(admin, /data-pm-add|id="pm-add"/);
  assert.match(admin, /on\('pm-add','click'/);
  assert.match(admin, /data-pm-toggle/);
  assert.match(admin, /data-pm-rename/);
  assert.match(admin, /api\('\/admin\/payment-methods',\{method:'POST',body:\{label\}\}\)/);
  assert.match(admin, /api\('\/admin\/payment-methods\/'\+b\.dataset\.pmToggle,\{method:'PATCH'/);
});
