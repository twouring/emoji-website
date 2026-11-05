// 中信刷卡收款彈窗（KK 11/5）：同 LINE Pay 機制——結帳頁每秒 setTimeout 鏈同步、彈窗只能按鈕關
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../lib/table-orders.js');   // 設好 globalThis.MenuLib
const ct = require('../lib/ctbc.js');
const root = new URL('..', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');

test('alertRows：店別依開關帳、退貨為負、失敗交易不跳、可依品牌過濾', () => {
  const regs = [{ day: '2026-11-05', venue: 'CAFE', opened_at: '2026-11-05T00:00:00Z', closed_at: '2026-11-05T09:00:00Z' }, { day: '2026-11-05', venue: 'BAR', opened_at: '2026-11-05T09:30:00Z', closed_at: null }];
  const txs = [
    { id: 'a', type: 'SALE', amount: 520, paid_at: '2026-11-05T04:12:00Z', card_last4: '4321', auth_code: '123456', terminal_id: 'T1', device_user: 'iPhone', progress: '交易成功' },
    { id: 'b', type: 'REFUND', amount: -200, paid_at: '2026-11-05T11:00:00Z', progress: '' },
    { id: 'c', type: 'SALE', amount: 99, paid_at: '2026-11-05T11:05:00Z', progress: '授權失敗' },
  ];
  const all = ct.alertRows(txs, regs);
  assert.deepEqual(all.map(r => r.id), ['a', 'b']);
  assert.deepEqual([all[0].venue, all[0].venue_label, all[0].card_last4, all[0].auth_code, all[0].type_label, all[0].amount], ['CAFE', '在咖啡', '4321', '123456', '銷售', 520]);
  assert.match(all[0].time, /12:12/);
  assert.deepEqual([all[1].venue, all[1].type_label, all[1].amount], ['BAR', '退貨', -200]);
  assert.deepEqual(ct.alertRows(txs, regs, ['BAR']).map(r => r.id), ['b']);
});

test('server：路由分品牌、常駐登入、節流與退避、文件', () => {
  const server = read('server.js');
  const g = server.indexOf("app.get('/api/admin/orders/ctbc-alerts',");
  const p = server.indexOf("app.post('/api/admin/orders/ctbc-alerts/sync',");
  assert.ok(g > 0 && p > 0);
  const rg = server.slice(g, server.indexOf('\n}));', g)), rp = server.slice(p, server.indexOf('\n}));', p));
  assert.match(rg, /posScope\(req\)/);
  assert.match(rg, /ctbc\.alertRows\(/);
  assert.match(rp, /skipped:'server-loop'/, '同步改伺服器端迴圈，舊版 POS 頁打來不做事');
  const w = server.slice(server.indexOf('const PAY_WATCHERS=['), server.indexOf('async function payWatchLoop'));
  assert.match(w, /ctbc\.fetchWarm\(/);
  assert.match(w, /ctbcSyncing/);
  assert.match(w, /backoff:e=>e\.fatal\?600000:60000/, '登入失敗要退避，避免每秒重登鎖帳號');
  const api = read('docs/API.md');
  assert.match(api, /### GET \/api\/admin\/orders\/ctbc-alerts/);
  assert.match(api, /### POST \/api\/admin\/orders\/ctbc-alerts\/sync/);
});

test('POS：不分頁面背景讀取（讀完 1 秒再讀，不觸發同步）、彈窗只能按鈕關、響鈴、已讀依品牌', () => {
  const js = read('public/pos-ctbc-alert.js'), pos = read('public/pos.html');
  assert.match(pos, /pos-ctbc-alert\.js/);
  assert.match(pos, /ctbcAlertBoot\(\)/);
  assert.match(js, /CTA_GAP_MS = 1000;/);
  assert.doesNotMatch(js, /CTA_TABLE_MS|CTA_POLL_MS|OnTable|POS_TABLE/, '不分頁面（KK 11/5 背景同步）');
  assert.match(js, /finally \{ CTA\.timer = setTimeout\(tick, CTA_GAP_MS\); \}/);
  assert.doesNotMatch(js, /ctbc-alerts\/sync/, 'POS 不得觸發同步');
  assert.match(js, /cashInChime\(\)/, '錢進帳音效');
  assert.doesNotMatch(js, /setInterval|cron/);
    for (const k of ['店別', '交易時間', '卡號末四碼', '授權碼']) assert.ok(js.includes(`'${k}'`), k);
  assert.match(js, /role', 'alertdialog'/);
  assert.match(js, /e\.key === 'Escape'\) \{ e\.preventDefault\(\)/);
  assert.doesNotMatch(js, /e\.target ?=== ?ov/);
  assert.match(js, /newTicketChime\(\)/);
  assert.match(js, /class="lpa-card is-ctbc"/, '中信彈窗用中信色，不用 LINE 綠');
  assert.match(pos, /\.lpa-card\.is-ctbc\{border-top-color:#009944\}/);
  assert.match(js, /tth_ctbc_seen_/);
  // pos.html 先載本檔才定義 POS_URL_VENUE：已讀 key 不可在載入時算成常數字串
  for (const f of ['public/pos-ctbc-alert.js', 'public/pos-linepay-alert.js']) {
    const s = read(f);
    assert.match(s, /_KEY = \(\) => /, f);
    assert.doesNotMatch(s, /localStorage\.(get|set)Item\((CTA|LPA)_KEY[,)]/, f);
  }
  assert.match(js, /POS_URL_VENUE/);
});

test('錢進帳音效（KK 11/5）：cashInChime 播 /sfx/cash-register.mp3，失敗退回 newTicketChime', () => {
  const ops = read('public/pos-ops.js');
  assert.ok(fs.existsSync(new URL('../public/sfx/cash-register.mp3', import.meta.url)));
  assert.match(ops, /function cashInChime\(\)/);
  assert.match(ops, /'\/sfx\/cash-register\.mp3'/);
  assert.match(ops, /catch\(\(\)=>newTicketChime\(\)\)/);
  for (const f of ['public/pos-ctbc-alert.js', 'public/pos-linepay-alert.js']) assert.match(read(f), /cashInChime\(\)/, f);
});
