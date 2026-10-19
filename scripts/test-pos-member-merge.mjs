// POS 會員分頁合併會員：純函式（個人資料、阻擋條件）、交易內搬移 SQL、店長識別碼、前端流程
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../lib/member-merge.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../public/pos-members.js', import.meta.url), 'utf8');

test('profile: keep wins, blanks filled from drop, phone-number name replaced by real name', () => {
  const keep = { id: 'g', name: 'KK Shyu', email: 'kk@x.tw', phone: '', phone_e164: null, line_user_id: null };
  const drop = { id: 'p', name: '+886912345678', email: null, phone: '+886912345678', phone_e164: '+886912345678', phone_verified_at: null, line_user_id: 'U1', line_linked_at: 't' };
  const r = M.mergedProfile(keep, drop);
  assert.equal(r.name, 'KK Shyu'); assert.equal(r.email, 'kk@x.tw'); assert.equal(r.phone_e164, '+886912345678'); assert.equal(r.line_user_id, 'U1');
  const r2 = M.mergedProfile({ ...drop, id: 'p' }, { ...keep, line_user_id: null });
  assert.equal(r2.name, 'KK Shyu', 'POS 建的手機會員當保留方時，姓名改用另一方真名');
});
test('blockers: same id, admins, conflicting email / LINE / phone', () => {
  const a = { id: 'a', email: 'a@x', phone_e164: '+886911111111' }, b = { id: 'b' };
  assert.equal(M.mergeBlocker(a, b), null);
  assert.match(M.mergeBlocker(a, a), /不同/);
  assert.match(M.mergeBlocker(a, null), /找不到/);
  assert.match(M.mergeBlocker({ ...a, is_admin: true }, b), /管理員/);
  assert.match(M.mergeBlocker(a, { id: 'b', email: 'b@x' }), /Email/);
  assert.equal(M.mergeBlocker(a, { id: 'b', email: 'A@X' }), null);
  assert.match(M.mergeBlocker({ id: 'a', line_user_id: 'U1' }, { id: 'b', line_user_id: 'U2' }), /LINE/);
  assert.match(M.mergeBlocker(a, { id: 'b', phone_e164: '+886922222222' }), /手機/);
});
test('mergeMembers moves FK + extra + JSON references, clears unique fields, deletes drop', async () => {
  const calls = [];
  const client = { query: async (sql, params) => { calls.push({ sql, params });
    if (/FROM event_regs a JOIN/.test(sql)) return { rows: [] };
    if (/FROM pg_constraint/.test(sql)) return { rows: [{ tbl: 'yan_ledger', col: 'user_id' }, { tbl: 'entitlements', col: 'user_id' }, { tbl: 'events', col: 'owner_id' }] };
    return { rows: [], rowCount: 1 }; } };
  const out = await M.mergeMembers(client, { id: 'k', name: 'A' }, { id: 'd', name: 'B', phone_e164: '+886912345678' });
  const sqls = calls.map(c => c.sql);
  for (const t of ['yan_ledger', 'entitlements', 'events', '"table_orders"', '"table_sessions"', '"dining_reservations"', '"pos_membership_grants"'])
    assert.ok(sqls.some(s => s.startsWith('UPDATE ' + t + ' ')), t);
  assert.ok(sqls.some(s => /payer->>'member_id'=\$2/.test(s)));
  assert.ok(sqls.some(s => /redeem_user/.test(s)));
  const clear = sqls.findIndex(s => /SET phone_e164=NULL,line_user_id=NULL/.test(s)), upd = sqls.findIndex(s => /UPDATE users SET name=\$2/.test(s)), del = sqls.findIndex(s => /DELETE FROM users WHERE id=\$1/.test(s));
  assert.ok(clear >= 0 && clear < upd && upd < del, '先清刪除方唯一欄位，再更新保留方，最後刪除');
  assert.deepEqual(calls[del].params, ['d']);
  assert.equal(out.moved['yan_ledger.user_id'], 1);
  for (const [t] of M.DEDUPE) assert.ok(sqls.some(s => s.startsWith(`DELETE FROM "${t}"`)), t);
});
test('mergeMembers refuses when both registered for the same event', async () => {
  const client = { query: async sql => /FROM event_regs a JOIN/.test(sql) ? { rows: [{ '?column?': 1 }] } : { rows: [] } };
  await assert.rejects(M.mergeMembers(client, { id: 'k' }, { id: 'd' }), /同一場活動/);
});
test('server: preview read-only, merge requires manager PIN, locks, audits', () => {
  const pv = server.slice(server.indexOf("app.get('/api/admin/yan/merge-preview'"), server.indexOf("app.post('/api/admin/yan/merge'"));
  assert.ok(pv.length > 100); assert.doesNotMatch(pv, /INSERT|UPDATE|DELETE/);
  const mg = server.slice(server.indexOf("app.post('/api/admin/yan/merge'"), server.indexOf("app.get('/api/admin/yan/membership-plans'"));
  assert.match(mg, /isManagerRole\(mgr\.role\)/); assert.match(mg, /need_manager_pin/); assert.match(mg, /rateLimit/);
  assert.match(mg, /pg_advisory_xact_lock/); assert.match(mg, /FOR UPDATE/); assert.match(mg, /INSERT INTO pos_member_merges/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS pos_member_merges/);
  assert.doesNotMatch(server, /'\/api\/admin\/yan\/members\/merge/, 'route must not be shadowed by /members/:id');
});
test('UI: merge button, search other account, preview, swap, manager PIN', () => {
  assert.match(ui, /id="members-merge"/);
  assert.match(ui, /\/admin\/yan\/merge-preview\?keep_id=/);
  assert.match(ui, /data-merge-swap/);
  assert.match(ui, /operator_pin:OPERATOR\?\.pin/);
  assert.match(ui, /無法復原/);
  assert.doesNotMatch(ui, /innerHTML=`[^`]*\$\{(?!esc\(|num\()[a-z]+\.(name|phone|email)/, 'dynamic text escaped');
});
