// LINE Pay 收款彈窗（KK 11/5）：POS 收到 LINE Pay 要跳彈窗、顯示完整資訊、只能手動關閉
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lp = require('../lib/linepay.js');
const root = new URL('..', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');

test('alertRows：完整欄位、店別依開關帳歸屬、退款為負', () => {
  const regs = [{ day: '2026-11-05', venue: 'CAFE', opened_at: '2026-11-05T00:00:00Z', closed_at: '2026-11-05T09:00:00Z' }, { day: '2026-11-05', venue: 'BAR', opened_at: '2026-11-05T09:30:00Z', closed_at: null }];
  const txs = [
    { id: '2026110500000000001', type: 'PAYMENT', amount: 380, paid_at: '2026-11-05T04:12:00Z', method: 'CREDIT_CARD', card_last4: '1234', confirm_no: 'A1B2', order_no: '', origin_id: '2026110500000000001', synced_at: '2026-11-05T04:15:00Z' },
    { id: '2026110500000000002', type: 'PAYMENT_CANCEL', amount: -200, paid_at: '2026-11-05T11:00:00Z', method: 'BALANCE', origin_id: '2026110500000000009' },
  ];
  const all = lp.alertRows(txs, regs);
  assert.equal(all.length, 2);
  assert.deepEqual([all[0].venue, all[0].venue_label, all[0].method_label, all[0].card_last4, all[0].confirm_no, all[0].amount], ['CAFE', '在咖啡', '信用卡', '1234', 'A1B2', 380]);
  assert.match(all[0].time, /12:12/);
  assert.deepEqual([all[1].venue, all[1].type_label, all[1].amount], ['BAR', '退款', -200]);
  assert.deepEqual(lp.alertRows(txs, regs, ['BAR']).map(r => r.id), ['2026110500000000002']);
  assert.deepEqual(lp.alertRows(txs, regs, ['STAY']), []);
});

test('server：路由分品牌、文件與 FOOD_API 範圍', () => {
  const server = read('server.js');
  const i = server.indexOf("app.get('/api/admin/orders/linepay-alerts',");
  assert.ok(i > 0);
  const r = server.slice(i, server.indexOf('\n}));', i));
  assert.match(r, /auth,adminOnly,requireDb/);
  assert.match(r, /posScope\(req\)/);
  assert.match(r, /linepay\.alertRows\(/);
  assert.match(read('docs/API.md'), /### GET \/api\/admin\/orders\/linepay-alerts/);
});

test('POS：彈窗顯示完整資訊、只能按鈕關閉、響鈴', () => {
  const js = read('public/pos-linepay-alert.js'), pos = read('public/pos.html');
  assert.match(pos, /pos-linepay-alert\.js/);
  assert.match(pos, /linepayAlertBoot\(\)/);
  for (const k of ['店別', '交易時間', '付款方式', '卡號末四碼', '驗證碼', '交易號碼', '訂單號碼']) assert.ok(js.includes(`'${k}'`), k);
  assert.match(js, /data-lpa-ok/);
  assert.match(js, /role', 'alertdialog'/);
  assert.match(js, /e\.key === 'Escape'\) \{ e\.preventDefault\(\)/);
  assert.doesNotMatch(js, /e\.target ?=== ?ov/, '點背景不可關閉');
  assert.doesNotMatch(js, /setTimeout\([^)]*lpaAck/, '不可自動關閉');
  assert.match(js, /newTicketChime\(\)/);
  assert.match(js, /POS_URL_VENUE/, '已讀 key 依品牌分開');
});
