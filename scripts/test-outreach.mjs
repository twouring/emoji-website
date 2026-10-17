import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { normalizeLead, register, STAGES, importSeedFile } = createRequire(import.meta.url)('../lib/outreach.js');

test('normalizeLead 驗證與預設值', () => {
  const v = normalizeLead({ name: ' 某旅店 ', category: '商旅' });
  assert.equal(v.name, '某旅店'); assert.equal(v.stage, '待開發'); assert.equal(v.priority, 2);
  assert.throws(() => normalizeLead({ name: '' }), /店家名稱/);
  assert.throws(() => normalizeLead({ name: 'a', stage: '亂填' }), /階段/);
  assert.throws(() => normalizeLead({ name: 'a', category: 'x' }), /類別/);
  assert.throws(() => normalizeLead({ name: 'a', next_action_date: '10/20' }), /日期/);
  assert.throws(() => normalizeLead({ name: 'a', coupon_qty: -1 }), /數量/);
  assert.equal(normalizeLead({ stage: STAGES[2] }, { name: 'x' }).stage, '洽談中');
});

test('權限閘：未授權管理員、品牌子帳號被擋，超管與授權者通過', async () => {
  const routes = [];
  const app = { get: (p, ...h) => routes.push([p, h]), post: (p, ...h) => routes.push([p, h]), delete: (p, ...h) => routes.push([p, h]) };
  const pass = (_r, _s, n) => n();
  register(app, { auth: pass, adminOnly: pass, requireDb: pass, wrap: f => f, q: async () => ({ rows: [] }), uid: () => 'x', actorOf: () => 'a', superOnly: pass });
  const gate = routes.find(r => r[0] === '/api/admin/outreach')[1][3];
  const run = auth => { let code = 0, nexted = false; gate({ auth }, { status: c => ({ json: () => { code = c; } }) }, () => { nexted = true; }); return { code, nexted }; };
  assert.equal(run({ role: 'admin', super: false, outreach_access: false, brands: null }).code, 403);
  assert.equal(run({ role: 'admin', super: false, outreach_access: true, brands: ['CAFE'] }).code, 403);
  assert.ok(run({ role: 'admin', super: true, brands: null }).nexted);
  assert.ok(run({ role: 'admin', super: false, outreach_access: true, brands: null }).nexted);
});

test('周邊名單：超過 300 筆、只匯入一次、同名不重複', async () => {
  const seed = createRequire(import.meta.url)('../lib/outreach-seed.json');
  assert.ok(seed.length >= 300);
  assert.ok(seed.every(r => r.ref && r.name && ['商旅', '按摩養生', '補習班'].includes(r.category) && [1, 2, 3].includes(r.priority)));
  const leads = [{ name: '988養生會館（重慶館）', seed_ref: null }], meta = new Set();
  const q = async (sql, args = []) => {
    if (sql.startsWith('SELECT name,seed_ref')) return { rows: leads };
    if (sql.includes('FROM outreach_meta')) return { rows: meta.has('seed_osm_20261018') ? [1] : [] };
    if (sql.startsWith('INSERT INTO outreach_meta')) { meta.add('seed_osm_20261018'); return { rows: [] }; }
    if (sql.startsWith('INSERT INTO outreach_leads')) { leads.push({ name: args[1], seed_ref: args[8] }); return { rows: [] }; }
    return { rows: [] };
  };
  let i = 0; const uid = p => p + (i++);
  const added = await importSeedFile(q, uid);
  assert.ok(added >= 300);
  assert.equal(leads.filter(l => l.name.startsWith('988養生會館')).length, 1);
  assert.equal(await importSeedFile(q, uid), 0);
});
