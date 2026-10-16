// scripts/test-pos-register.mjs — 開關帳純邏輯：兩品牌各記一本但共用抽屜帳（同一時間只能一本開著）、零用金承接留存金、臨時收支、面額點鈔、短溢、關帳後擋結帳
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../lib/pos-register');

test('開帳：店別必填且子帳號只能開自己的；同品牌同日只能開一本；零用金 0 以上整數', () => {
  assert.equal(R.registerVenue('cafe', null), 'CAFE');
  assert.equal(R.registerVenue('BAR', ['BAR']), 'BAR');
  assert.throws(() => R.registerVenue('', null), /店別/);
  assert.throws(() => R.registerVenue('BAR', ['CAFE']), e => e.status === 403);
  assert.deepEqual(R.openRegister({ opening_cash: 3000, note: ' 早班 ' }, { venue: 'CAFE', open: null }), { venue: 'CAFE', opening_cash: 3000, denominations: null, note: '早班' });
  assert.throws(() => R.openRegister({ opening_cash: 3000 }, { venue: 'CAFE', open: { venue: 'CAFE', opened_by: 'a@x' } }), e => e.status === 409 && /已經開了/.test(e.message));
  assert.throws(() => R.openRegister({ opening_cash: -1 }, { venue: 'CAFE', open: null }), /零用金/);
  assert.throws(() => R.openRegister({ opening_cash: '12.5' }, { venue: 'CAFE', open: null }), /零用金/);
});

test('共用抽屜帳：在咖啡還開著時三點水不能開帳（409，訊息說要先關誰）；反過來也一樣', () => {
  assert.throws(() => R.openRegister({ opening_cash: 3000 }, { venue: 'BAR', open: { venue: 'CAFE', opened_by: 'a@x' } }),
    e => e.status === 409 && /在咖啡的帳還開著/.test(e.message) && /共用同一個抽屜帳/.test(e.message) && /先把在咖啡關帳，再開三點水/.test(e.message));
  assert.throws(() => R.openRegister({ opening_cash: 3000 }, { venue: 'CAFE', open: { venue: 'BAR', opened_by: 'b@x' } }), /三點水的帳還開著/);
  // 在咖啡關了（open=null）→ 三點水可以開
  assert.equal(R.openRegister({ opening_cash: 3000 }, { venue: 'BAR', open: null }).venue, 'BAR');
});

test('開帳零用金沒填時承接上一本關帳的留存金；有填（總額或面額）就以填的為準；沒上一本又沒填才擋', () => {
  const handover = { id: 'r0', venue: 'CAFE', keep_cash: 3000 };
  assert.equal(R.openRegister({}, { venue: 'BAR', open: null, handover }).opening_cash, 3000);
  assert.equal(R.openRegister({ opening_cash: '' }, { venue: 'BAR', open: null, handover }).opening_cash, 3000);
  assert.equal(R.openRegister({ opening_cash: 2500 }, { venue: 'BAR', open: null, handover }).opening_cash, 2500);
  assert.equal(R.openRegister({ opening_cash: 0 }, { venue: 'BAR', open: null, handover }).opening_cash, 0, '明確填 0 不當成沒填');
  assert.equal(R.openRegister({ denominations: { 1000: 1 } }, { venue: 'BAR', open: null, handover }).opening_cash, 1000);
  assert.throws(() => R.openRegister({}, { venue: 'BAR', open: null, handover: null }), /零用金/);
});

test('帳本總覽：有開著的帳 → 兩品牌都不能開、另一品牌要等它關；都關了 → handover 是最後關的那本（含留存金）', () => {
  const none = R.registerOverview([]);
  assert.deepEqual(none, { open_venue: null, handover: null, can_open: { CAFE: true, BAR: true }, wait: { CAFE: '', BAR: '' } });
  const cafeOpen = R.registerOverview([{ id: 'r1', venue: 'CAFE', opened_at: '2026-10-16T00:00:00Z', closed_at: null, keep_cash: null }]);
  assert.equal(cafeOpen.open_venue, 'CAFE'); assert.deepEqual(cafeOpen.can_open, { CAFE: false, BAR: false }); assert.deepEqual(cafeOpen.wait, { CAFE: '', BAR: '在咖啡' });
  const cafeClosed = R.registerOverview([
    { id: 'r0', venue: 'CAFE', opened_at: '2026-10-16T00:00:00Z', closed_at: '2026-10-16T02:00:00Z', keep_cash: 1000 },
    { id: 'r1', venue: 'CAFE', opened_at: '2026-10-16T02:30:00Z', closed_at: '2026-10-16T09:00:00Z', keep_cash: 3000 },
  ]);
  assert.equal(cafeClosed.open_venue, null); assert.deepEqual(cafeClosed.can_open, { CAFE: true, BAR: true });
  assert.deepEqual(cafeClosed.handover, { id: 'r1', venue: 'CAFE', keep_cash: 3000, closed_at: '2026-10-16T09:00:00Z' });
  const barOpen = R.registerOverview([
    { id: 'r1', venue: 'CAFE', opened_at: '2026-10-16T00:00:00Z', closed_at: '2026-10-16T09:00:00Z', keep_cash: 3000 },
    { id: 'r2', venue: 'BAR', opened_at: '2026-10-16T09:10:00Z', closed_at: null, keep_cash: null },
  ]);
  assert.equal(barOpen.open_venue, 'BAR'); assert.equal(barOpen.wait.CAFE, '三點水'); assert.equal(barOpen.wait.BAR, '');
});

test('開帳：零用金也可按面額填張數，不必直接填總額', () => {
  const byDenom = R.openRegister({ denominations: { 1000: 3, 100: 5 } }, { venue: 'BAR', open: null });
  assert.equal(byDenom.opening_cash, 3500); assert.deepEqual(byDenom.denominations, { 1000: 3, 100: 5 });
});

test('現金臨時收支：進／出、正整數、原因必填', () => {
  assert.deepEqual(R.cashMove({ type: 'out', amount: 250, reason: '買檸檬' }), { type: 'out', amount: 250, reason: '買檸檬' });
  assert.throws(() => R.cashMove({ type: 'x', amount: 1, reason: 'a' }), /臨時收入或臨時支出/);
  assert.throws(() => R.cashMove({ type: 'in', amount: 0, reason: 'a' }), /正整數/);
  assert.throws(() => R.cashMove({ type: 'in', amount: 100 }), /原因/);
});

test('面額點鈔：合計正確、無效面額擋下；沒填回 null 改用總額', () => {
  assert.equal(R.denominationTotal({ 1000: 3, 500: 1, 100: 4, 10: 5, 1: 7 }), 3957);
  assert.equal(R.denominationTotal(undefined), null);
  assert.equal(R.denominationTotal({}), null);
  assert.throws(() => R.denominationTotal({ 300: 1 }), /面額 300/);
  assert.throws(() => R.denominationTotal({ 100: -1 }), /張數/);
});

test('應有現金 ＝ 零用金 ＋ 現金營收 ＋ 臨時收入 － 臨時支出', () => {
  const s = R.expectedCash({ opening_cash: 3000, cash_sales: 12850, moves: [{ type: 'in', amount: 500 }, { type: 'out', amount: 250 }, { type: 'out', amount: 120 }] });
  assert.deepEqual(s, { opening_cash: 3000, cash_sales: 12850, cash_in: 500, cash_out: 370, expected: 15980 });
  assert.equal(R.expectedCash({ opening_cash: 0, cash_sales: 0, moves: [] }).expected, 0);
});

test('關帳：點鈔可填總額或面額；差額非 0 要說明；預設留零用金當下一班留存金', () => {
  const s = R.expectedCash({ opening_cash: 3000, cash_sales: 10000, moves: [] });
  const ok = R.closeRegister({ counted_cash: 13000 }, s);
  assert.deepEqual({ ...ok, denominations: undefined }, { counted_cash: 13000, expected_cash: 13000, diff: 0, note: '', keep_cash: 3000, take_cash: 10000, denominations: undefined });
  assert.throws(() => R.closeRegister({ counted_cash: 12950 }, s), /差 -50，請填寫說明/);
  const short = R.closeRegister({ counted_cash: 12950, note: '找零少 50' }, s);
  assert.equal(short.diff, -50);
  const byDenom = R.closeRegister({ denominations: { 1000: 13, 100: 1 }, note: '多 100' }, s);
  assert.equal(byDenom.counted_cash, 13100); assert.equal(byDenom.diff, 100); assert.deepEqual(byDenom.denominations, { 1000: 13, 100: 1 });
  const keep = R.closeRegister({ counted_cash: 13000, keep_cash: 5000 }, s);
  assert.equal(keep.keep_cash, 5000); assert.equal(keep.take_cash, 8000);
  assert.equal(R.closeRegister({ counted_cash: 2000, keep_cash: 5000, note: '短' }, s).keep_cash, 2000, '留存金不能超過點鈔');
  assert.throws(() => R.closeRegister({}, s), /點鈔/);
});

test('小結點驗：點鈔可填總額或面額，只算差額不卡關、說明選填（不像關帳強制要求）', () => {
  const s = R.expectedCash({ opening_cash: 3000, cash_sales: 5000, moves: [] });
  const ok = R.countRegister({ counted_cash: 8000 }, s);
  assert.deepEqual({ ...ok, denominations: undefined }, { counted_cash: 8000, expected_cash: 8000, diff: 0, note: '', denominations: undefined });
  const short = R.countRegister({ counted_cash: 7900 }, s); // 差額不用說明也能過
  assert.equal(short.diff, -100); assert.equal(short.note, '');
  const byDenom = R.countRegister({ denominations: { 1000: 8 }, note: '核對中' }, s);
  assert.equal(byDenom.counted_cash, 8000); assert.equal(byDenom.diff, 0); assert.equal(byDenom.note, '核對中');
  assert.throws(() => R.countRegister({}, s), /點鈔/);
});

test('結帳前檢查：該品牌帳要開著；已關帳一律擋；沒開帳在 strict 擋、非 strict 回警告', () => {
  const lines = [{ venue: 'CAFE' }, { venue: 'CAFE' }];
  assert.deepEqual(R.checkoutAllowed(lines, { CAFE: { id: 'r1' } }), { ok: true, warning: '' });
  assert.throws(() => R.checkoutAllowed(lines, {}), e => e.status === 409 && /在咖啡今天還沒開帳/.test(e.message));
  assert.throws(() => R.checkoutAllowed(lines, { CAFE: { id: 'r1', closed_at: '2026-10-12T09:00:00Z' } }), /已經關帳/);
  assert.match(R.checkoutAllowed(lines, {}, { strict: false }).warning, /尚未開帳/);
  assert.throws(() => R.checkoutAllowed([{ venue: 'CAFE' }, { venue: 'BAR' }], { CAFE: { id: 'r1' } }), /三點水今天還沒開帳/);
  assert.deepEqual(R.checkoutAllowed([], {}), { ok: true, warning: '' });
});

test('關帳單資料：合併帳本、現金摘要、營收摘要與臨時收支', () => {
  const reg = { venue: 'BAR', day: '2026-10-12', opened_at: 'a', opened_by: 'x@y', closed_at: 'b', closed_by: 'z@y', counted_cash: 9000, diff: -10, keep_cash: 3000, take_cash: 6000, note: '短 10' };
  const s = R.expectedCash({ opening_cash: 3000, cash_sales: 6010, moves: [] });
  const rep = R.registerReport(reg, s, { orders: 12, amount: 15000, by_method: { cash: 6010, card: 8990 }, voided: 1, void_amount: 300 }, [{ type: 'out', amount: 100, reason: '冰塊', staff: 'x', created_at: 'c' }]);
  assert.equal(rep.expected_cash, 9010); assert.equal(rep.diff, -10); assert.equal(rep.orders, 12); assert.equal(rep.moves[0].reason, '冰塊'); assert.equal(rep.by_method.card, 8990);
});

test('小結單：還沒關帳時，有點驗過就顯示最近一次點鈔／差額，沒點驗過就沒有', () => {
  const reg = { venue: 'CAFE', day: '2026-10-12', opened_at: 'a', opened_by: 'x@y', closed_at: null, note: '' };
  const s = R.expectedCash({ opening_cash: 3000, cash_sales: 2000, moves: [] });
  const noCount = R.registerReport(reg, s, { orders: 1, amount: 100, by_method: {} }, []);
  assert.equal(noCount.counted_cash, null); assert.equal(noCount.diff, null);
  const count = { counted_cash: 4800, diff: -200, note: '核對中', created_at: 'c' };
  const withCount = R.registerReport(reg, s, { orders: 1, amount: 100, by_method: {} }, [], count);
  assert.equal(withCount.counted_cash, 4800); assert.equal(withCount.diff, -200); assert.equal(withCount.note, '核對中'); assert.equal(withCount.counted_at, 'c');
  assert.equal(withCount.keep_cash, null, '小結不應該有留存金／收走（那是關帳才有）');
});
