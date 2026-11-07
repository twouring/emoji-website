// 日結臨時收支可修改／刪除（KK 11/7）：字串接線＋（有 PGLITE_MODULE_PATH 時）切出路由跑真 SQL
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8');
const posLog = require('../lib/pos-log.js');
const posRegister = require('../lib/pos-register.js');

test('接線：路由、文件、操作紀錄、前端按鈕', () => {
  assert.match(server, /app\.patch\('\/api\/admin\/registers\/:id\/cash\/:moveId'/);
  assert.match(server, /app\.delete\('\/api\/admin\/registers\/:id\/cash\/:moveId'/);
  assert.ok(api.includes('### PATCH /api/admin/registers/:id/cash/:moveId'));
  assert.ok(api.includes('### DELETE /api/admin/registers/:id/cash/:moveId'));
  assert.equal(posLog.describe('PATCH', '/registers/rg_1/cash/cm_1'), '修改臨時收支');
  assert.equal(posLog.describe('DELETE', '/registers/rg_1/cash/cm_1'), '刪除臨時收支');
  for (const s of ['data-cash-edit=', 'data-cash-del=', "method:'PATCH'", "method:'DELETE'", 'REG_CASH_EDIT', '儲存修改', "m.locked==='tip'"]) assert.ok(ops.includes(s), s);
  // 刪除要先確認；已關帳不出按鈕
  assert.match(ops, /data-cash-del[\s\S]{0,400}posConfirm\(/);
  assert.match(ops, /const editable=st!=='done'/);
  // 改前改後寫進 POS 紀錄
  assert.match(server, /recordPosLog\(req, posAction, payload, req\.posLogDetail/);
});

const PG = process.env.PGLITE_MODULE_PATH;
test('真 SQL：修改、刪除、已關帳擋、打賞支付擋、跨帳本擋', { skip: !PG && '需 PGLITE_MODULE_PATH' }, async () => {
  const { PGlite } = require(PG);
  const db = new PGlite();
  await db.exec(`CREATE TABLE pos_registers(id TEXT PRIMARY KEY, day DATE, venue TEXT, closed_at TIMESTAMPTZ);
    CREATE TABLE pos_cash_moves(id TEXT PRIMARY KEY, register_id TEXT NOT NULL REFERENCES pos_registers(id), type TEXT NOT NULL CHECK (type IN ('in','out')), amount INT NOT NULL, reason TEXT NOT NULL, staff TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE site_content(key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO pos_registers VALUES('rg_open','2026-11-07','CAFE',NULL),('rg_done','2026-11-07','BAR',now()),('rg_other','2026-11-07','CAFE',NULL);
    INSERT INTO pos_cash_moves(id,register_id,type,amount,reason,staff) VALUES('cm_a','rg_open','out',250,'買檸檬','小明'),('cm_tip','rg_open','out',500,'支付打賞給 歌手','店長'),('cm_d','rg_done','out',100,'冰塊',''),('cm_o','rg_other','in',50,'找零','');
    INSERT INTO site_content VALUES('tip_payouts','{"payouts":[{"cash_move":"cm_tip"}]}');`);
  const q = (s, a) => db.query(s, a);
  const pool = { connect: async () => ({ query: q, release() {} }) };
  const start = server.indexOf('/* 打賞支付（現金）寫進 pos_cash_moves');
  const end = server.indexOf('/* 小結：不關帳', start);
  assert.ok(start > 0 && end > start);
  const routes = {};
  const app = { patch: (p, ...h) => { routes['PATCH ' + p] = h.at(-1); }, delete: (p, ...h) => { routes['DELETE ' + p] = h.at(-1); } };
  const ctx = vm.createContext({ app, q, pool, posRegister, auth: 0, adminOnly: 0, requireDb: 0, wrap: f => f, Set, JSON, String,
    loadOpenRegister: async (req, res) => { const r = (await q('SELECT * FROM pos_registers WHERE id=$1', [req.params.id])).rows[0]; if (!r) { res.status(404).json({ error: 'x' }); return null; } return r; },
    registerSummary: async r => ({ summary: { expected: 1000 + (await q("SELECT COALESCE(SUM(CASE WHEN type='in' THEN amount ELSE -amount END),0)::int AS n FROM pos_cash_moves WHERE register_id=$1", [r.id])).rows[0].n } }) });
  vm.runInContext(server.slice(start, end), ctx);
  const call = async (key, params, body = {}) => {
    const req = { params, body }, res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await routes[key](req, res); return { ...res, req };
  };
  const P = 'PATCH /api/admin/registers/:id/cash/:moveId', D = 'DELETE /api/admin/registers/:id/cash/:moveId';

  let r = await call(P, { id: 'rg_open', moveId: 'cm_a' }, { amount: 300, reason: '買檸檬＋萊姆' });
  assert.equal(r.code, 200); assert.equal(r.body.amount, 300); assert.equal(r.body.type, 'out'); assert.equal(r.body.before.amount, 250);
  assert.equal(r.body.expected_cash, 1000 - 300 - 500);
  assert.match(r.req.posLogDetail, /支出 250 買檸檬 → 支出 300 買檸檬＋萊姆/);
  const row = (await q("SELECT * FROM pos_cash_moves WHERE id='cm_a'")).rows[0];
  assert.equal(row.amount, 300); assert.equal(row.staff, '小明', '記錄人不變');

  assert.equal((await call(P, { id: 'rg_open', moveId: 'cm_a' }, { amount: 0 })).code, 400);
  assert.equal((await call(P, { id: 'rg_open', moveId: 'cm_a' }, { type: 'x' })).code, 400);
  assert.equal((await call(P, { id: 'rg_open', moveId: 'cm_tip' }, { amount: 1 })).code, 409, '打賞支付不能改');
  assert.equal((await call(D, { id: 'rg_open', moveId: 'cm_tip' })).code, 409, '打賞支付不能刪');
  assert.equal((await call(D, { id: 'rg_done', moveId: 'cm_d' })).code, 409, '已關帳不能刪');
  assert.equal((await call(D, { id: 'rg_open', moveId: 'cm_o' })).code, 404, '別本帳的不能刪');
  assert.equal((await call(D, { id: 'rg_open', moveId: 'bad id' })).code, 404);

  r = await call(D, { id: 'rg_open', moveId: 'cm_a' });
  assert.equal(r.code, 200); assert.equal(r.body.deleted.amount, 300); assert.equal(r.body.expected_cash, 500);
  assert.match(r.req.posLogDetail, /刪除 支出 300/);
  assert.equal((await q("SELECT count(*)::int n FROM pos_cash_moves WHERE id='cm_a'")).rows[0].n, 0);
  assert.equal((await call(D, { id: 'rg_open', moveId: 'cm_a' })).code, 404);
  await db.close();
});
