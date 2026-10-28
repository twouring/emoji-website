// 桌邊點餐意見回饋：純邏輯（lib/order-feedback.js）＋接線靜態檢查（客人頁、POS 設定頁、API 文件、品牌子帳號權限）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fb = require('../lib/order-feedback.js');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('驗證：類別白名單、內容 2–500 字、評分 1–5 或省略', () => {
  assert.throws(() => fb.validate({ kind: 'x', text: '好吃' }), e => e.status === 400 && /類別/.test(e.message));
  assert.throws(() => fb.validate({ kind: 'food', text: ' ' }), /意見/);
  assert.throws(() => fb.validate({ kind: 'food', text: '好吃', rating: 6 }), /1–5/);
  assert.throws(() => fb.validate({ kind: 'food', text: '好吃', rating: 2.5 }), /1–5/);
  const v = fb.validate({ kind: 'app', text: '  按鈕太小\u0000\n\n\n\n看不到 ', rating: '4', name: '小明', lang: 'en' });
  assert.deepEqual(v, { kind: 'app', text: '按鈕太小 \n\n看不到', rating: 4, name: '小明', lang: 'en' });
  assert.equal(fb.validate({ kind: 'other', text: 'x'.repeat(900), rating: null, lang: 'fr' }).text.length, 500);
  assert.equal(fb.validate({ kind: 'other', text: 'ok', lang: 'fr' }).lang, 'zh');
  assert.equal(fb.validate({ kind: 'other', text: 'ok', rating: '' }).rating, null);
});

test('客人頁：菜單底部回饋卡＋底部表單，三語字串齊全，不經購物車', () => {
  const h = read('public/order.html'), lib = read('public/order-lib.js');
  assert.match(h, /id="fb-open"/); assert.match(h, /id="fb"[^>]*role="dialog"/);
  assert.match(h, /<symbol id="i-chat"/);
  const block = h.slice(h.indexOf('/* ---- 意見回饋'), h.indexOf("$('#fb-send').onclick"));
  assert.ok(block.length > 0); assert.doesNotMatch(block, /addLine|items/);
  assert.match(h, /api\('\/order-feedback',\{method:'POST'/);
  for (const k of ['fb_title', 'fb_card', 'fb_hint', 'fb_kind', 'fb_rating', 'fb_placeholder', 'fb_send', 'fb_sent', 'fb_pick', 'fb_empty']) {
    assert.equal(lib.split(k + ':').length - 1, 3, k + ' 要有中英日三語');
  }
  for (const id of fb.KIND_IDS) assert.match(h, new RegExp("id:'" + id + "'"), '前台類別要跟 lib 一致：' + id);
});

test('伺服器、API 文件、POS 設定頁與品牌子帳號權限', () => {
  const s = read('server.js'), doc = read('docs/API.md'), pos = read('public/pos.html');
  assert.match(s, /CREATE TABLE IF NOT EXISTS order_feedback/);
  assert.match(s, /app\.post\('\/api\/order-feedback',rateLimit/);
  assert.match(s, /app\.get\('\/api\/admin\/orders\/feedback',auth,adminOnly/);
  assert.match(doc, /### POST \/api\/order-feedback/); assert.match(doc, /### GET \/api\/admin\/orders\/feedback/);
  assert.match(pos, /id:'feedback'[^}]*group:'settings'/); assert.match(pos, /feedback:tabFeedback/); assert.match(pos, /src="\/pos-feedback\.js"/);
  assert.match(read('public/pos-icons.js'), /chat:'/);
  // /api/admin/orders/* 已在 FOOD_API，在咖啡／三點水子帳號可看
  assert.match(s, /FOOD_API = \/\^\\\/api\\\/admin\\\/\(orders\|/);
});
