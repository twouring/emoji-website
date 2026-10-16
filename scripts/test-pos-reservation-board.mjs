import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tableOrders = require('../lib/table-orders.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// 2026-10-15 20:00 台北
const NOW = '2026-10-15T12:00:00Z';
const rows = [
  { id: 'r1', reserve_date: '2026-10-15', reserve_time: '19:00', party_size: 4, name: '王小姐', status: 'confirmed', table_no: 'a3' },
  { id: 'r2', reserve_date: '2026-10-15', reserve_time: '12:30', party_size: 2, name: '陳先生', status: 'new', table_no: 'A3' },
  { id: 'r3', reserve_date: '2026-10-16', reserve_time: '01:00', party_size: 3, name: '深夜客', status: 'confirmed', table_no: 'B1' }, // 凌晨＝今天營業日
  { id: 'r4', reserve_date: '2026-10-16', reserve_time: '19:00', party_size: 3, name: '明天', status: 'confirmed', table_no: 'B1' },
  { id: 'r5', reserve_date: '2026-10-15', reserve_time: '18:00', party_size: 2, name: '已到', status: 'arrived', table_no: 'C1' },
  { id: 'r6', reserve_date: '2026-10-15', reserve_time: '18:00', party_size: 2, name: '取消', status: 'cancelled', table_no: 'C1' },
  { id: 'r7', reserve_date: '2026-10-15', reserve_time: '18:00', party_size: 2, name: '沒排桌', status: 'confirmed', table_no: '' },
  { id: 'r8', reserve_date: new Date('2026-10-15T00:00:00Z'), reserve_time: '20:00', party_size: 5, name: 'pg Date', status: 'confirmed', table_no: 'C2' },
];

test('reservationsByTable：只留今天營業日、已排桌、new／confirmed，依桌號分組、時間排序', () => {
  const out = tableOrders.reservationsByTable(rows, NOW);
  assert.deepEqual(Object.keys(out).sort(), ['A3', 'B1', 'C2']);
  assert.deepEqual(out.A3.map(r => [r.id, r.time, r.status]), [['r2', '12:30', 'new'], ['r1', '19:00', 'confirmed']]);
  assert.deepEqual(out.B1.map(r => r.id), ['r3'], '凌晨 01:00 的訂位算今天營業日；明天晚上的不列');
  assert.deepEqual(out.C2.map(r => r.name), ['pg Date'], 'pg 回的 DATE 物件也要能比對');
  assert.equal(out.C1, undefined, '已到／已取消不再提示');
  assert.ok(out.A3.every(r => !('sort' in r)));
  assert.deepEqual(out.A3[1], { id: 'r1', time: '19:00', name: '王小姐', party_size: 4, status: 'confirmed' });
});

test('凌晨 02:00 查看：當天凌晨的訂位仍在前一營業日', () => {
  const out = tableOrders.reservationsByTable(rows, '2026-10-15T18:00:00Z'); // 10/16 02:00 台北 → 營業日 10/15
  assert.deepEqual(out.B1.map(r => r.id), ['r3']);
  assert.ok(out.A3.length === 2);
});

test('GET /api/admin/orders 回傳 reservations，且子帳號依時段過濾', () => {
  const src = read('server.js');
  assert.match(src, /FROM dining_reservations WHERE reserve_date BETWEEN CURRENT_DATE-1 AND CURRENT_DATE\+1 AND status IN \('new','confirmed'\) AND table_no<>'' AND deleted_at IS NULL/);
  assert.match(src, /venues\.includes\(tableOrders\.reservationVenue\(r\.reserve_time\)\)\);\s*\n\s*const reservations=tableOrders\.reservationsByTable\(resvRows\)/);
  assert.match(src, /res\.json\(\{orders,tickets,sessions,reservations,pause/);
  assert.match(read('docs/API.md'), /reservations\{\}/);
});

test('桌況格：空桌與使用中都顯示預約提示；開桌只問一次、不自動開桌', () => {
  const src = read('public/pos-ops.js');
  assert.match(src, /const resvOf=t=>\(d\.reservations\|\|\{\}\)\[t\]\|\|\[\]/);
  assert.match(src, /class="pos-resv"><span class="pos-resv-tag">預約<\/span> \$\{esc\(r\.time\)\} \$\{esc\(r\.name\)\} \$\{r\.party_size\} 位\$\{r\.status==='new'\?'（待確認）':''\}/);
  assert.match(src, /class="pos-table empty \$\{resvOf\(s\.table\)\.length\?'reserved':''\}" data-open-table/);
  assert.match(src, /\$\{s\.mixed\?'<small class="pill pill-bad">混桌<\/small>':''\}\$\{resvHtml\(s\.table\)\}<\/button>/, '使用中的桌也要標下一組預約');
  // 輪詢的 sig 要含訂位，否則訂位頁排了桌號、已開著的 POS 不會重畫
  assert.match(src, /Object\.entries\(POS_DATA\.reservations\|\|\{\}\)\.map\(\(\[t,rs\]\)=>\[t,rs\.map\(r=>\[r\.id,r\.time,r\.status\]\)\]\)/);
  // 只有 confirmed 才問「已到」（new → arrived 不在狀態機裡）；取消＝只開桌，不擋
  assert.match(src, /\.find\(x=>x\.status==='confirmed'\)/);
  assert.match(src, /if\(!r\)return openSession\(\{table_no:table\}\)/);
  assert.match(src, /const arrive=await posConfirm\(/);
  assert.match(src, /if\(arrive\)\{try\{await api\('\/admin\/reservations\/'\+r\.id\+'\/status',\{method:'POST',body:\{status:'arrived',notify:false\}\}\)/);
  assert.doesNotMatch(src, /table_sessions.*dining_reservations/, '不自動開桌');
  assert.match(read('public/pos-ops.css'), /\.pos-table\.reserved\{border-style:solid/);
  assert.match(read('public/pos-ops.css'), /\.pos-table \.pos-resv\{[^}]*overflow-wrap:anywhere/, '卡片只有 150px 寬，要換行不要省略號');
  assert.doesNotMatch(read('public/pos-ops.css'), /\.pos-resv\{[^}]*text-overflow:ellipsis/);
});
