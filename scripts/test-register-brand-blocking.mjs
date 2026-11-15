// 關帳只看自家品牌未結桌（KK 11/16）：兩品牌共用座位場域，另一品牌的未結品項不擋本店關帳；自家有未結仍要擋
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('../lib/pos-register.js');

const bar = (zh, price, extra = {}) => ({ venue: 'BAR', zh, price, qty: 1, placed_at: '2026-11-11T09:45:53Z', order_id: null, ...extra });
const cafe = (zh, price, extra = {}) => ({ venue: 'CAFE', zh, price, qty: 1, placed_at: '2026-11-11T03:00:00Z', order_id: null, ...extra });

test('11/11 實例：三點水 A2、A8、C6 未結，不擋在咖啡關帳、仍擋三點水關帳', () => {
  // 正式站 11/11 當時的資料形狀：舊桌次 venue 為 null，品項都是 BAR
  const rows = [
    { table_no: 'A2', venue: null, created_at: '2026-11-11T09:41:48Z', items: [bar('深夜麵食套餐', 360)] },
    { table_no: 'A8', venue: null, created_at: '2026-11-11T10:10:00Z', items: [bar('香草可麗露', 110), bar('雪之松島清酒', 280)] },
    { table_no: 'C6', venue: null, created_at: '2026-11-11T10:20:00Z', items: [bar('太陽蛋番茄雞肉乾咖哩飯', 200)] },
  ];
  assert.deepEqual(R.blockingTables(rows, 'CAFE'), []);
  assert.deepEqual(R.blockingTables(rows, 'BAR'), ['A2', 'A8', 'C6']);
});

test('共用場域混桌：A 品牌（三點水）有未結，不擋 B 品牌（在咖啡）關帳', () => {
  // 在咖啡開的桌，咖啡品項已結；客人留到晚上加點三點水品項還沒結（11/11 C1 的情況）
  const c1 = { table_no: 'C1', venue: 'CAFE', created_at: '2026-11-11T05:00:00Z', items: [cafe('拿鐵', 160, { order_id: 'to_1' }), bar('熱美式咖啡', 150)] };
  assert.deepEqual(R.blockingTables([c1], 'CAFE'), [], '他店未結品項不擋在咖啡');
  assert.deepEqual(R.blockingTables([c1], 'BAR'), ['C1'], '三點水自己的未結品項要擋三點水');
  // 三點水開的桌，桌上有在咖啡的未結甜點（共用品項記當下店別）
  const b3 = { table_no: 'B3', venue: 'BAR', created_at: '2026-11-11T11:00:00Z', items: [bar('調酒', 380, { order_id: 'to_2' }), cafe('可麗露', 110)] };
  assert.deepEqual(R.blockingTables([b3], 'BAR'), []);
  assert.deepEqual(R.blockingTables([b3], 'CAFE'), ['B3']);
});

test('B 自家有未結桌時仍須阻擋（含同桌兩店都有未結）', () => {
  const rows = [
    { table_no: 'A1', venue: 'CAFE', created_at: '2026-11-11T02:00:00Z', items: [cafe('司康', 120)] },
    { table_no: 'A2', venue: 'BAR', created_at: '2026-11-11T10:00:00Z', items: [bar('薯條', 220)] },
    { table_no: 'C2', venue: 'CAFE', created_at: '2026-11-11T05:00:00Z', items: [cafe('拿鐵', 160), bar('啤酒', 200)] },
  ];
  assert.deepEqual(R.blockingTables(rows, 'CAFE'), ['A1', 'C2']);
  assert.deepEqual(R.blockingTables(rows, 'BAR'), ['A2', 'C2']);
});

test('同桌號兩店各開一場：各自只擋自己那場', () => {
  const rows = [
    { table_no: 'D1', venue: 'CAFE', created_at: '2026-11-11T05:00:00Z', items: [cafe('拿鐵', 160)] },
    { table_no: 'D1', venue: 'BAR', created_at: '2026-11-11T10:00:00Z', items: [] },
  ];
  assert.deepEqual(R.blockingTables(rows, 'CAFE'), ['D1']);
  assert.deepEqual(R.blockingTables(rows, 'BAR'), ['D1'], '三點水空桌（剛開、沒點）擋三點水');
  assert.deepEqual(R.blockingTables([rows[1]], 'CAFE'), [], '三點水空桌不擋在咖啡');
});

test('沒有未結品項的桌（空桌、已結清待清桌）只擋開桌品牌；取消的 0 元行不算未結', () => {
  const settled = { table_no: 'A5', venue: 'CAFE', created_at: '2026-11-11T05:00:00Z', items: [cafe('拿鐵', 160, { order_id: 'to_9' }), bar('啤酒', 0, { cancelled: true })] };
  assert.deepEqual(R.blockingTables([settled], 'CAFE'), ['A5'], '待清桌照舊擋開桌品牌');
  assert.deepEqual(R.blockingTables([settled], 'BAR'), [], '已取消的他店品項不擋');
  // 舊資料沒記開桌品牌：空桌依開桌時間（台北 10:00 在咖啡、19:00 三點水）
  assert.deepEqual(R.blockingTables([{ table_no: 'A6', items: [], created_at: '2026-11-11T02:00:00Z' }], 'CAFE'), ['A6']);
  assert.deepEqual(R.blockingTables([{ table_no: 'A6', items: [], created_at: '2026-11-11T02:00:00Z' }], 'BAR'), []);
  assert.deepEqual(R.blockingTables([{ table_no: 'A7', items: [], created_at: '2026-11-11T11:00:00Z' }], 'BAR'), ['A7']);
});

test('不帶品牌（超管視角）＝全部開著的桌都算', () => {
  const rows = [
    { table_no: 'A1', venue: 'CAFE', items: [cafe('司康', 120)] },
    { table_no: 'A2', venue: 'BAR', items: [bar('薯條', 220)] },
  ];
  assert.deepEqual(R.blockingTables(rows), ['A1', 'A2']);
});

test('當班未結營收與關帳擋桌同一套認桌：他店未結不進本店當班營收', () => {
  const c1 = { table_no: 'C1', venue: 'CAFE', created_at: '2026-11-11T05:00:00Z', items: [cafe('拿鐵', 160, { order_id: 'to_1' }), bar('熱美式咖啡', 150)] };
  assert.equal(R.pendingRevenue([c1], 'CAFE').amount, 0);
  assert.deepEqual(R.pendingRevenue([c1], 'BAR').list.map(t => [t.table_no, t.amount]), [['C1', 150]]);
});
