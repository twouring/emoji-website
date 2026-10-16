// scripts/test-pos-operator.mjs — 操作人員（疊在品牌帳號之上，4 位數識別碼認人）：結帳／開桌記下是誰經手
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

const menuJson = JSON.stringify({ version: 1, items: [
  { id: 'm_latte', venue: 'CAFE', cat: 'DRINK', zh: '拿鐵', price: 150, published: true },
] });
const cart = () => T.addLine([], T.menuIndex(menuJson), { item_id: 'm_latte', qty: 1, by: 'A', guest: 'guest0000001' });

test('posCheckout：有給 operator 就記進 payer.operator_id/operator_name；沒給就不多這兩個欄位', () => {
  const menuAll = T.menuIndex(menuJson, undefined, { all: true });
  const withOp = T.posCheckout(cart(), { method: 'cash', staff: 'kk@emoji.tw', operator: { id: 'st_1', name: '小美' } }, menuAll);
  assert.equal(withOp.payer.operator_id, 'st_1'); assert.equal(withOp.payer.operator_name, '小美');
  assert.equal(withOp.payer.staff, 'kk@emoji.tw', '品牌帳號仍照舊記在 staff，兩者並存');
  const noOp = T.posCheckout(cart(), { method: 'cash' }, menuAll);
  assert.equal(noOp.payer.operator_id, undefined); assert.equal(noOp.payer.operator_name, undefined);
  // operator 只給名字沒給 id 時不算數（server 一定是先查過 DB 才會給 id+name 一起進來）
  const badOp = T.posCheckout(cart(), { method: 'cash', operator: { name: '小美' } }, menuAll);
  assert.equal(badOp.payer.operator_id, undefined);
});

test('接線：/api/admin/staff/verify 端點存在且限流、開桌與結帳都接 operator_id、table_sessions 有 opened_by 欄位', () => {
  const server = read('server.js'), ops = read('public/pos-ops.js'), pos = read('public/pos.html'), docs = read('docs/API.md'), sw = read('public/pos-sw.js');
  assert.match(server, /app\.post\('\/api\/admin\/staff\/verify',rateLimit\(\{max:12\}\),auth,adminOnly,requireDb/, '認人端點要跟打卡一樣限流防猜碼');
  assert.match(server, /async function resolveOperator\(req, id\)/, '要有共用的 operator 解析函式');
  assert.match(server, /ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS opened_by_staff_id TEXT, ADD COLUMN IF NOT EXISTS opened_by_staff_name TEXT/);
  assert.match(server, /INSERT INTO table_sessions\(id,table_no,opened_by_staff_id,opened_by_staff_name\)/, '開桌要存操作人員');
  assert.match(server, /tableOrders\.posCheckout\(s\.items,\{\.\.\.req\.body,staff:actorOf\(req\.auth\)\|\|'',operator\},menuAll,await activePaymentCodes\(\)\)/, '結帳要把 operator 與啟用中的收款帳戶代碼傳進 posCheckout');
  assert.match(server, /if\(!staff\|\|!posStaff\.staffVisible\(staff,venues\)\)return res\.status\(404\)\.json\(\{error:'識別碼不正確，請再試一次。'\}\);/, '驗 PIN 錯誤不可透露是否存在，同打卡');
  for (const fn of ['ensureOperator', 'openOperatorPad']) assert.match(ops, new RegExp(`function ${fn}\\(`), fn);
  assert.doesNotMatch(ops, /tth_pos_operator/, '人員不再記在裝置上，每次動作輸入 PIN');
  assert.doesNotMatch(ops, /localStorage\.setItem\([^)]*\bOP_PIN\b/, '識別碼本身不可存進 localStorage，只能存認出來的 id/name');
  assert.match(ops, /api\('\/admin\/staff\/verify',\{method:'POST',body:\{pin\}\}\)/);
  assert.match(ops, /ensureOperator\(\(\)=>runCheckoutOnce\(cur\.id,async\(\)=>\{const checkout=[^\n]+return await opsThen\(\(\)=>api\('\/admin\/orders\/sessions\/'\+cur\.id\+'\/checkout'/, '結帳前要先確保有操作人員，並鎖住重複收款');
  assert.match(ops, /operator_id:OPERATOR\?\.id/);
  assert.doesNotMatch(pos, /p-operator/, '導覽列不放選擇人員');
  assert.match(docs, /### POST \/api\/admin\/staff\/verify/);
  assert.match(sw, /VERSION = 'pos-v([5-9]|\d{2,})'/, '改了 pos.html／pos-ops.js 要換快取版本');
});

test('閒置蓋板：3 分鐘鎖定，需 PIN 解鎖，所有登入方式都啟用', () => {
  const pos = read('public/pos.html'), ops = read('public/pos-ops.js');
  assert.match(pos, /const lock = \(\) => lockScreen\(\)/);
  assert.match(pos, /3 \* 60e3/);
  assert.match(pos, /\n    startIdleLock\(\);/);
  assert.match(ops, /function lockScreen\(\)/);
  assert.match(ops, /openOperatorPad\(\(\)=>\{OPERATOR=null;\},true\)/);
});
