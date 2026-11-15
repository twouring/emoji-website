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
  assert.match(s, /const rule=linepay\.claimRule\(t\.paid_at,regs,venue\)/, '認領規則走 lib 共用判斷');
  assert.match(s, /if\(!rule\.ok\)throw Object\.assign\(Error\(rule\.error\),\{status:rule\.status\}\)/, '只有本店開著的時段本來就算本店');
  assert.match(s, /if\(rule\.needReason&&!reason\)throw Object\.assign\(Error\(rule\.error\),\{status:400\}\)/, '別店／重疊時段要原因');
  assert.match(read('lib/linepay.js'), /改歸本店要填原因/, '別店開帳時段要原因');
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

/* 兩店同時開帳（2026-11-15 finance 查核 t_faab4bd4／工程卡 t_2d0e8cde）：CAFE 08–18、BAR 16–02，16:00–18:00 重疊 */
const ov = [{ venue: 'CAFE', opened_at: '2026-11-15T08:00:00+08:00', closed_at: '2026-11-15T18:00:00+08:00' }, { venue: 'BAR', opened_at: '2026-11-15T16:00:00+08:00', closed_at: '2026-11-16T02:00:00+08:00' }];

test('重疊時段：attribute 標 ambiguous＋candidates，非重疊不標', () => {
  const a = L.attribute({ paid_at: '2026-11-15T17:00:00+08:00' }, ov);
  assert.equal(a.venue, 'CAFE', '仍暫歸先開帳的店（相容既有對帳）');
  assert.equal(a.ambiguous, true); assert.deepEqual(a.candidates, ['CAFE', 'BAR']); assert.equal(a.outside, false);
  assert.equal(L.attribute({ paid_at: '2026-11-15T12:00:00+08:00' }, ov).ambiguous, false, '只有在咖啡開著');
  assert.equal(L.attribute({ paid_at: '2026-11-15T20:00:00+08:00' }, ov).ambiguous, false, '只有三點水開著');
  assert.equal(L.attribute({ paid_at: '2026-11-15T18:00:00+08:00' }, ov).ambiguous, false, '關帳那一刻已不重疊');
  assert.equal(L.attribute({ paid_at: '2026-11-15T17:00:00+08:00', claim_venue: 'BAR' }, ov).ambiguous, false, '認領後確定');
  assert.equal(L.attribute({ paid_at: '2026-11-15T17:00:00+08:00' }, [ov[0], { venue: 'REST', opened_at: '2026-11-13T15:38:00+08:00', closed_at: null }]).ambiguous, false, '只和約書旅重疊不算（自動歸屬只看在咖啡／三點水）');
});

test('重疊時段：claimRule 兩店都可認領（要原因），只有本店開著才 409', () => {
  for (const v of ['CAFE', 'BAR']) {
    const r = L.claimRule('2026-11-15T17:00:00+08:00', ov, v);
    assert.equal(r.ok, true, v + ' 可認領'); assert.equal(r.needReason, true); assert.equal(r.overlap, true);
    assert.match(r.error, /同時開著帳/);
  }
  const only = L.claimRule('2026-11-15T12:00:00+08:00', ov, 'CAFE');
  assert.equal(only.ok, false); assert.equal(only.status, 409); assert.match(only.error, /只有在咖啡開著帳/);
  const other = L.claimRule('2026-11-15T12:00:00+08:00', ov, 'BAR');
  assert.deepEqual([other.ok, other.needReason, other.overlap, other.from], [true, true, false, '在咖啡'], '別店開帳時段：可改歸、要原因');
  const none = L.claimRule('2026-11-16T02:30:00+08:00', ov, 'BAR');
  assert.deepEqual([none.ok, none.needReason], [true, false], '營業時間外免原因');
  assert.equal(L.claimRule('2026-11-15T19:00:00+08:00', ov, 'BAR').ok, false);
  const stay = [{ venue: 'STAY', opened_at: '2026-11-15T10:00:00+08:00', closed_at: null }];
  assert.deepEqual([L.claimRule('2026-11-15T12:00:00+08:00', stay, 'STAY').ok, L.claimRule('2026-11-15T12:00:00+08:00', stay, 'STAY').needReason], [true, false], '只有等等空間開著：自動歸屬不會給它，本店可直接認領（不回 409）');
});

test('重疊時段：兩店日結都看得到（others／ambiguous），全店頁列 ambiguous；認領後只歸一店', () => {
  const txs = [
    { id: 'm', type: 'PAYMENT', amount: 500, paid_at: '2026-11-15T17:00:00+08:00', method: 'CREDIT_CARD' },
    { id: 'n', type: 'PAYMENT', amount: 90, paid_at: '2026-11-15T12:00:00+08:00', method: 'CREDIT_CARD' },
  ];
  const cafe = L.reconcile([], txs, { venues: ['CAFE'], registers: ov }), bar = L.reconcile([], txs, { venues: ['BAR'], registers: ov });
  assert.deepEqual(cafe.others.map(t => t.id), ['m'], '在咖啡（暫歸本店）也要列出待確認');
  assert.deepEqual(bar.others.map(t => t.id), ['n', 'm'], '依時間排序：三點水看得到重疊的 m 與別店時段的 n');
  assert.deepEqual(cafe.ambiguous.map(t => [t.id, t.ambiguous, t.candidates.join()]), [['m', true, 'CAFE,BAR']]);
  assert.deepEqual(bar.ambiguous.map(t => t.id), ['m']);
  assert.deepEqual(L.reconcile([], txs, { venues: ['STAY'], registers: ov }).ambiguous, [], '非候選店不列');
  assert.deepEqual(L.reconcile([], txs, { registers: ov }).ambiguous.map(t => t.id), ['m'], '全店頁也列');
  assert.equal(cafe.linepay.amount, 590, '未認領前金額仍暫歸先開帳的店（不重複計）');
  assert.equal(bar.linepay.amount, 0);
  const claimed = txs.map(t => t.id === 'm' ? { ...t, claim_venue: 'BAR', claim_reason: '三點水 A3 客人' } : t);
  const bar2 = L.reconcile([], claimed, { venues: ['BAR'], registers: ov }), cafe2 = L.reconcile([], claimed, { venues: ['CAFE'], registers: ov });
  assert.equal(bar2.linepay.amount, 500); assert.equal(cafe2.linepay.amount, 90);
  assert.deepEqual(cafe2.others, []); assert.deepEqual(cafe2.ambiguous, []); assert.deepEqual(bar2.ambiguous, []);
});

test('重疊時段：收款彈窗兩店都跳；中信同規則', () => {
  const tx = [{ id: 'm', type: 'PAYMENT', amount: 500, paid_at: '2026-11-15T17:00:00+08:00', method: 'CREDIT_CARD' }];
  for (const v of ['CAFE', 'BAR']) {
    const r = L.alertRows(tx, ov, [v]);
    assert.equal(r.length, 1, v + ' 彈窗'); assert.equal(r[0].ambiguous, true); assert.deepEqual(r[0].candidates, ['CAFE', 'BAR']);
  }
  assert.equal(L.alertRows(tx, ov, ['STAY']).length, 0);
  assert.equal(L.alertRows([{ ...tx[0], claim_venue: 'CAFE' }], ov, ['BAR']).length, 0, '認領後只跳認領店');
  const ct = [{ id: 'k', type: 'SALE', amount: 300, paid_at: '2026-11-15T16:30:00+08:00', progress: '成功' }];
  for (const v of ['CAFE', 'BAR']) {
    const r = C.reconcile([], ct, { venues: [v], registers: ov });
    assert.deepEqual(r.ambiguous.map(t => t.id), ['k'], 'ctbc ' + v); assert.deepEqual(r.others.map(t => t.id), ['k']);
    assert.equal(C.alertRows(ct, ov, [v]).length, 1, 'ctbc 彈窗 ' + v);
  }
});

test('POS：重疊時段列標「歸屬不確定」、按鈕帶 data-from 走原因', () => {
  const p = read('public/pos-ops.js');
  assert.match(p, /兩店同時開帳，歸屬不確定/); assert.match(p, /確認是本店/);
  assert.match(p, /筆兩店同時開帳、歸屬不確定/);
});
