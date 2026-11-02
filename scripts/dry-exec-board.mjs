// 本機乾跑：用正式站 admin API 的快照餵 lib/exec-board.js，看實際會挑出哪些問題（不碰 DB）
// node scripts/dry-exec-board.mjs <快照目錄>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const board = require('../lib/exec-board.js');
const T = require('../lib/table-orders.js');
const dir = process.argv[2];
const L = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const hist = ['2026-11-02', '2026-11-01', '2026-10-26'].flatMap(d => L(`orders_history_day_${d}.json`).orders);
const o = L('orders.json'), regs = [...L('registers.json').registers, ...L('registers_day_2026-11-01.json').registers];
const att = L('attendance_from_2026-10-27_to_2026-11-02.json'), sh = L('shifts_from_2026-10-27.json');
const s1 = L('sales_day_2026-11-01.json'), s2 = L('sales_day_2026-11-02.json'), ig = L('ig_status.json'), inv = L('inventory.json');
const st = L('state.json'), pub = L('public.json');
const recon = k => ({ configured: true, sync_error: s2[k].sync_error, synced_at: s2[k].synced_at, days: { '2026-11-01': s1[k], '2026-11-02': s2[k] } });
const now = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const out = board.build({
  orders: hist, registers: regs,
  recon: { linepay: recon('linepay'), ctbc: recon('ctbc') },
  sessions: o.sessions.map(s => ({ id: s.id, table_no: s.table, items: s.lines, created_at: s.created_at })),
  print_jobs: { count: 0 }, service_calls: [], pause: o.pause,
  menu_items: JSON.parse(pub.content.menu).items,
  working: att.working, attendance_today: att.rows.filter(r => r.day === '2026-11-02'), shifts: sh.shifts.filter(s => s.day === '2026-11-02'),
  inventory: inv.items, reservations: L('reservations_days_3.json').reservations,
  applications_pending: [], events: st.events.map(e => ({ ...e, starts_at: e.starts_at_iso ? e.starts_at_iso + ':00+08:00' : e.starts_at })),
  ig, feedback: [], bugs_pending: 0,
}, { now, salesSummary: T.salesSummary });
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out));
console.log(JSON.stringify({ counts: out.counts, brands: out.brands.map(b => ({ v: b.venue, active: b.active, today: b.today.amount, orders: b.today.orders, yday: b.yesterday.amount, lw: b.last_week.amount, reg: b.register, tables: b.tables, staff: b.staff, resv: b.reservations, so: b.sold_out.length })), on_duty: out.on_duty }, null, 1));
for (const i of out.issues) console.log(`[${i.level}] ${i.brand_label}｜${i.title} — ${i.detail}`);
console.log('OK:', out.checks.map(c => c.label).join('／'));
