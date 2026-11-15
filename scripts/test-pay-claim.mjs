// scripts/test-pay-claim.mjs — 營業時間外的 LINE Pay／中信交易由品牌 POS 認領（KK 11/15）
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../lib/linepay');
const C = require('../lib/ctbc');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const regs = [{ venue: 'CAFE', opened_at: '2026-11-15T09:00:00+08:00', closed_at: '2026-11-15T17:00:00+08:00' }, { venue: 'BAR', opened_at: '2026-11-15T18:00:00+08:00', closed_at: '2026-11-16T01:00:00+08:00' }];

test('outsideHours：任何一本帳開著就不是營業時間外', () => {
  assert.equal(L.outsideHours('2026-11-15T08:30:00+08:00', regs), true);
  assert.equal(L.outsideHours('2026-11-15T12:00:00+08:00', regs), false);
  assert.equal(L.outsideHours('2026-11-15T17:30:00+08:00', regs), true);
  assert.equal(L.outsideHours('2026-11-16T02:00:00+08:00', regs), true);
  assert.equal(L.outsideHours('2026-11-15T19:00:00+08:00', [{ venue: 'STAY', opened_at: '2026-11-15T10:00:00+08:00', closed_at: null }]), false, '等等空間開著也算營業時間內');
});

test('reconcile：claim_venue 優先；營業時間外未認領列在 outside；開帳中照時間歸屬', () => {
  const txs = [
    { id: 'a', type: 'PAYMENT', amount: 100, paid_at: '2026-11-15T08:30:00+08:00', method: 'CREDIT_CARD' },
    { id: 'b', type: 'PAYMENT', amount: 200, paid_at: '2026-11-15T17:30:00+08:00', method: 'CREDIT_CARD', claim_venue: 'STAY' },
    { id: 'c', type: 'PAYMENT', amount: 300, paid_at: '2026-11-15T12:00:00+08:00', method: 'CREDIT_CARD' },
  ];
  const all = L.reconcile([], txs, { registers: regs });
  assert.deepEqual(all.outside.map(t => t.id), ['a']);
  assert.equal(all.by_venue.STAY.linepay.amount, 200, '認領的算等等空間');
  assert.equal(all.by_venue.CAFE.linepay.amount, 400, 'a 暫歸在咖啡＋c 開帳中');
  const stay = L.reconcile([], txs, { venues: ['STAY'], registers: regs });
  assert.deepEqual(stay.rows.map(t => [t.id, t.claimed]), [['b', true]]);
  assert.deepEqual(stay.outside.map(t => t.id), ['a'], '品牌頁也看得到可認領的');
  assert.equal(stay.linepay.amount, 200);
  assert.equal(L.alertRows(txs, regs, ['STAY']).map(r => r.id).join(), 'b', '彈窗也以認領為準');
});

test('ctbc reconcile 同樣認領規則', () => {
  const txs = [{ id: 'x', type: 'SALE', amount: 500, paid_at: '2026-11-15T17:30:00+08:00', progress: '成功', claim_venue: 'REST' }, { id: 'y', type: 'SALE', amount: 50, paid_at: '2026-11-15T17:40:00+08:00', progress: '成功' }];
  const r = C.reconcile([], txs, { registers: regs });
  assert.equal(r.by_venue.REST.ctbc.amount, 500);
  assert.deepEqual(r.outside.map(t => t.id), ['y']);
  assert.equal(C.reconcile([], txs, { venues: ['REST'], registers: regs }).ctbc.amount, 500);
});

test('接線：claim API、欄位、查詢、POS 日結、操作紀錄', () => {
  const s = read('server.js');
  assert.match(s, /ADD COLUMN IF NOT EXISTS claim_venue TEXT/);
  assert.match(s, /app\.post\('\/api\/admin\/sales\/linepay\/claim'.*payClaim\('linepay'\)/); assert.match(s, /app\.post\('\/api\/admin\/sales\/ctbc\/claim'.*payClaim\('ctbc'\)/);
  assert.match(s, /inside\.some\(r=>r\.venue===venue\)/, '本店開著的時段本來就算本店');
  assert.match(s, /改歸本店要填原因/, '別店開帳時段要原因');
  assert.match(s, /claim_reason=\$4/);
  assert.equal((s.match(/,claim_venue,claim_reason FROM (linepay|ctbc)_transactions/g) || []).length, 4, '日結與彈窗查詢都要帶 claim_venue');
  const p = read('public/pos-ops.js');
  assert.match(p, /營業時間外收款/); assert.match(p, /data-pay-claim/); assert.match(p, /\/admin\/sales\/\$\{gw\}\/claim/);
  assert.equal(require('../lib/pos-log').describe('POST', '/sales/ctbc/claim'), '營業時間外收款歸到本店');
});

test('others：品牌頁列出別店開帳時段、未認領的交易；全店頁不列；認領後移到 rows', () => {
  const txs = [
    { id: 'p', type: 'PAYMENT', amount: 120, paid_at: '2026-11-15T12:00:00+08:00', method: 'CREDIT_CARD' },
    { id: 'q', type: 'PAYMENT', amount: 80, paid_at: '2026-11-15T19:00:00+08:00', method: 'CREDIT_CARD', claim_venue: 'CAFE', claim_reason: '本店客人付款，別店已先開帳' },
    { id: 'o', type: 'PAYMENT', amount: 50, paid_at: '2026-11-15T17:30:00+08:00', method: 'CREDIT_CARD' },
  ];
  const cafe = L.reconcile([], txs, { venues: ['CAFE'], registers: regs });
  assert.deepEqual(cafe.others.map(t => t.id), [], 'p 在本店開帳時段，不算別店');
  const bar = L.reconcile([], txs, { venues: ['BAR'], registers: regs });
  assert.deepEqual(bar.others.map(t => [t.id, t.venue]), [['p', 'CAFE']]);
  assert.deepEqual(cafe.rows.map(t => t.id).sort(), ['p', 'q'], 'q 已改歸在咖啡；o 在咖啡關帳後算下一本帳＝三點水');
  assert.deepEqual(bar.outside.map(t => t.id), ['o']);
  assert.equal(cafe.rows.find(t => t.id === 'q').claim_reason, '本店客人付款，別店已先開帳');
  assert.deepEqual(L.reconcile([], txs, { registers: regs }).others, []);
  const ct = C.reconcile([], [{ id: 'z', type: 'SALE', amount: 300, paid_at: '2026-11-15T12:00:00+08:00', progress: '成功' }], { venues: ['STAY'], registers: regs });
  assert.deepEqual(ct.others.map(t => t.id), ['z']);
});

test('POS：別店時段收合在 details，改歸先選原因再送 reason', () => {
  const p = read('public/pos-ops.js');
  assert.match(p, /id="pay-others"/); assert.match(p, /data-from=/);
  assert.match(p, /pickReason\(\{title:`\$\{b\.dataset\.at\}/);
  assert.match(p, /body:\{id:b\.dataset\.id,release,reason\}/);
});
