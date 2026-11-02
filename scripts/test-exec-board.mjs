// 高管總覽判斷規則（lib/exec-board.js）：純函式，不需 DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const board = require('../lib/exec-board.js');
const T = require('../lib/table-orders.js');
// 營業日 2026-11-02，台北 20:00（三點水營業中）
const NOW = Date.parse('2026-11-02T20:00:00+08:00');
const run = (src, now = NOW) => board.build(src, { now, salesSummary: T.salesSummary });
const line = (o = {}) => ({ line: Math.random().toString(36).slice(2), item_id: 'm1', zh: '拿鐵', cat: 'COFFEE', price: 150, qty: 1, venue: 'CAFE', ...o });
const titles = r => r.issues.map(i => `[${i.level}] ${i.title}`);

test('沒有資料時不報假問題，兩個品牌都在', () => {
  const r = run({}, Date.parse('2026-11-02T18:30:00+08:00'));
  assert.deepEqual(r.brands.map(b => b.venue), ['CAFE', 'BAR']);
  assert.equal(r.day, '2026-11-02');
  assert.equal(r.brands.find(b => b.venue === 'BAR').active, true);
  assert.deepEqual(r.issues, []);
});

test('營收依品項店別分開；上週同時段只算到同一時間', () => {
  const o = (at, venue, amount) => ({ id: at, items: [line({ venue, price: amount })], amount, payer: { method: 'cash' }, status: 'done', paid_at: at });
  const r = run({ orders: [o('2026-11-02T10:00:00+08:00', 'CAFE', 300), o('2026-11-02T19:00:00+08:00', 'BAR', 500), o('2026-11-01T12:00:00+08:00', 'CAFE', 200),
    o('2026-10-26T19:30:00+08:00', 'BAR', 400), o('2026-10-26T21:00:00+08:00', 'BAR', 999)] });
  const [cafe, bar] = r.brands;
  assert.equal(cafe.today.amount, 300); assert.equal(bar.today.amount, 500);
  assert.equal(cafe.yesterday.amount, 200); assert.equal(bar.last_week.amount, 400, '上週 21:00 那筆在現在時間之後，不算');
});

test('帳本：前幾天沒關帳 high；短溢沒寫原因依金額、有寫原因降為留意；打烊後沒關帳', () => {
  const r = run({ registers: [
    { venue: 'CAFE', day: '2026-10-31', opened_at: '2026-10-31T09:00:00+08:00', closed_at: null },
    { venue: 'CAFE', day: '2026-11-01', opened_at: '2026-11-01T09:00:00+08:00', closed_at: '2026-11-01T17:00:00+08:00', diff: -800, expected_cash: 5000, counted_cash: 4200, close_note: '' },
    { venue: 'BAR', day: '2026-11-01', opened_at: '2026-11-01T17:00:00+08:00', closed_at: '2026-11-02T02:00:00+08:00', diff: -2170, expected_cash: 7567, counted_cash: 5397, close_note: '開錯帳' },
    { venue: 'CAFE', day: '2026-11-02', opened_at: '2026-11-02T08:30:00+08:00', closed_at: null },
  ] });
  const t = titles(r);
  assert.ok(t.includes('[high] 在咖啡 10/31 的帳還沒關'), t);
  assert.ok(t.includes('[high] 在咖啡 昨天關帳現金短少 NT$800'), t);
  assert.ok(t.includes('[low] 三點水 昨天關帳現金短少 NT$2,170'), t);
  assert.ok(t.some(x => x.startsWith('[mid] 在咖啡打烊後還沒關帳')), t);
  assert.equal(r.brands[0].register.state, 'open');
});

test('現場：等出餐 20／40 分鐘、開桌過久未結、空桌、出餐單沒印、呼叫沒處理、點餐暫停', () => {
  const at = m => new Date(NOW - m * 60e3).toISOString();
  const r = run({
    sessions: [
      { id: 's1', table_no: 'B2', created_at: at(50), items: [line({ venue: 'BAR', ticket: 'tk1', placed_at: at(45) }), line({ venue: 'BAR', ticket: 'tk2', placed_at: at(25) })] },
      { id: 's2', table_no: 'A1', created_at: at(9 * 60), items: [line({ venue: 'CAFE', placed_at: at(500), served_at: at(480), ticket: 'x' })] },
      { id: 's3', table_no: 'A3', created_at: at(3 * 60), items: [] },
    ],
    print_jobs: { count: 2, oldest: at(6) },
    service_calls: [{ table: 'B5', kind_label: '加水', at: at(5) }, { table: 'B6', kind_label: '餐具', at: at(1) }],
    pause: { CAFE: { paused: false }, BAR: { paused: true, message: '廚房滿單' } },
  });
  const t = titles(r);
  assert.ok(t.includes('[high] B2 桌等出餐 45 分鐘'), t);
  assert.ok(t.includes('[mid] B2 桌等出餐 25 分鐘'), t);
  assert.ok(t.includes('[high] A1 桌開桌 9 小時還有 NT$150 沒結'), t);
  assert.ok(t.includes('[low] A3 桌開桌 3 小時都沒點餐'), t);
  assert.ok(t.includes('[high] 2 張出餐單沒印出來'), t);
  assert.ok(t.some(x => x.startsWith('[mid] B5 桌呼叫加水')), t);
  assert.ok(!t.some(x => x.includes('B6')), '剛呼叫 1 分鐘不報');
  assert.ok(t.includes('[mid] 三點水桌邊點餐暫停中'), t);
  assert.equal(r.brands[1].tables.open, 2, 'B2＋A3（17:00 開的空桌算三點水）'); assert.equal(r.brands[0].tables.unpaid_amount, 150);
  assert.equal(r.issues[0].level, 'high', '依嚴重度排序');
});

test('人力：忘記下班打卡、班表開始 15 分鐘沒打卡；在班名單', () => {
  const r = run({
    working: [{ staff_id: 'a', name: '遊遊', clock_in: '2026-10-31T16:54:00+08:00' }, { staff_id: 'b', name: '敬惟', clock_in: '2026-11-02T16:40:00+08:00' }],
    attendance_today: [{ staff_id: 'b' }],
    shifts: [{ staff_id: 'b', name: '敬惟', day: '2026-11-02', venue: 'BAR', start_time: '16:30', end_time: '03:00' },
      { staff_id: 'c', name: 'Jenny', day: '2026-11-02', venue: 'BAR', start_time: '16:30', end_time: '03:30' },
      { staff_id: 'd', name: '小美', day: '2026-11-02', venue: 'BAR', start_time: '19:50', end_time: '23:00' }],
  });
  const t = titles(r);
  assert.ok(t.some(x => x.startsWith('[mid] 遊遊 從 10/31 16:54 上班後沒打下班卡')), t);
  assert.ok(t.includes('[mid] Jenny 16:30 的班還沒打卡'), t);
  assert.ok(!t.some(x => x.includes('小美')), '開始 10 分鐘內不報');
  assert.deepEqual(r.brands[1].staff.map(s => [s.name, s.in]), [['敬惟', true], ['Jenny', false], ['小美', false]]);
  assert.deepEqual(r.on_duty, ['敬惟']);
});

test('對帳：同步失敗 high、昨天差額 mid、今天差額 low', () => {
  const r = run({ recon: {
    linepay: { configured: true, sync_error: 'Waiting for selector failed', synced_at: '2026-11-02T19:55:00+08:00', days: {} },
    ctbc: { configured: true, synced_at: '2026-11-02T19:50:00+08:00', days: { '2026-11-01': { by_venue: { CAFE: { diff: -400, pos: { amount: 2000 }, ctbc: { amount: 1600 } } } }, '2026-11-02': { by_venue: { BAR: { diff: 120, pos: { amount: 0 }, ctbc: { amount: 120 } } } } } },
  } });
  const t = titles(r);
  assert.ok(t.includes('[high] LINE Pay對帳同步失敗'), t);
  assert.ok(t.includes('[mid] 在咖啡昨天中信刷卡對帳差 −NT$400'), t);
  assert.ok(t.includes('[low] 三點水今天中信刷卡對帳差 +NT$120'), t);
});

test('庫存、訂位、場地申請、近期活動、IG、低分回饋；資料來源讀取失敗要列出', () => {
  const r = run({
    inventory: [{ name: '貝果', qty: -12, unit: '個', safety_qty: 0 }, { name: '牛奶', qty: 2, unit: '瓶', safety_qty: 6 }, { name: '豆子', qty: 9, unit: 'kg', safety_qty: 2 }],
    reservations: [{ reserve_date: '2026-11-03', reserve_time: '12:00', party_size: 4, status: 'new', venue: 'CAFE' }, { reserve_date: '2026-11-02', reserve_time: '19:00', party_size: 2, status: 'confirmed', venue: 'BAR' }],
    applications_pending: [{ title: '讀書會', starts_at: '2026-11-10T19:00:00+08:00' }],
    events: [{ id: 'e1', title: '週末市集', starts_at: '2026-11-04T14:00:00+08:00', status: '草稿', reg_count: 0, capacity: 0 }],
    ig: { errors: [{ id: 'p1', title: '天花板' }], stale: [{ title: '舊排程', at: '2026-10-20 19:00' }] },
    feedback: [{ table_no: 'A2', rating: 1, text: '等太久' }, { table_no: 'A3', rating: 5, text: '好' }],
    bugs_pending: 3,
    failed: { '出勤': 'relation does not exist' },
  });
  const t = titles(r);
  for (const want of ['[mid] 1 項庫存是負數', '[mid] 1 項低於安全庫存', '[mid] 1 筆訂位還沒確認', '[mid] 1 件場地申請待審', '[mid] 「週末市集」11/4 就要辦，還是草稿',
    '[mid] IG 貼文發佈失敗：天花板', '[low] 1 篇 IG 排程過期沒發', '[mid] A2 桌給 1 星', '[low] 3 件找碴回報待審', '[low] 出勤讀不到資料']) assert.ok(t.includes(want), want + '\n' + t.join('\n'));
  assert.deepEqual(r.brands[1].reservations, { count: 1, people: 2 });
  assert.equal(r.events.length, 1);
});

test('開店 3 小時沒營收才報；沒開帳但有營收要報', () => {
  const o = { id: 'x', items: [line({ venue: 'BAR', price: 200 })], amount: 200, payer: { method: 'cash' }, status: 'done', paid_at: '2026-11-02T19:00:00+08:00' };
  assert.ok(titles(run({ orders: [o] })).includes('[mid] 三點水今天有營收但沒開帳'));
  assert.ok(titles(run({}, Date.parse('2026-11-02T11:30:00+08:00'))).includes('[mid] 在咖啡開店 3 小時還沒有營收'));
  assert.ok(!titles(run({}, Date.parse('2026-11-02T10:30:00+08:00'))).some(x => x.includes('還沒有營收')));
});

test('跨日：凌晨 01:00 仍算前一個營業日，三點水班表 16:30 不會被當成明天', () => {
  const now = Date.parse('2026-11-03T01:00:00+08:00');
  const r = run({ shifts: [{ staff_id: 'c', name: 'Jenny', day: '2026-11-02', venue: 'BAR', start_time: '16:30', end_time: '03:30' }] }, now);
  assert.equal(r.day, '2026-11-02');
  assert.deepEqual(r.brands[1].staff.map(s => s.name), ['Jenny']);
  assert.equal(board.atBusinessTime('2026-11-02', '01:30'), Date.parse('2026-11-03T01:30:00+08:00'));
});
