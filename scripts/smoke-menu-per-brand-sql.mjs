// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：菜單分品牌遷移＋讀寫，跑 server.js 切出的真函式＋PGlite
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server.js', import.meta.url));
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const slice = (a, b) => { const i = source.indexOf(a); assert.ok(i >= 0, a); return source.slice(i, source.indexOf(b, i)); };

const legacy = JSON.stringify({ version: 1, items: [
  { id: 'coffee', venue: 'CAFE', cat: 'COFFEE', zh: '美式', price: 100, published: true },
  { id: 'canele', venue: 'CAFE', cat: 'DESSERT', zh: '可麗露', price: 90, published: true, stock_day: '2026-11-17', stock_left: 5 },
  { id: 'beer', venue: 'BAR', cat: 'BEER', zh: '啤酒', price: 200, published: true },
  { id: 'brush', venue: 'CAFE', cat: 'SHOP', zh: '牙刷', price: 60, published: true },
] });

test('PGlite：開機遷移拆五列＋複製賣過的甜點與配方；跑兩次冪等；舊列保留；寫入只動變動的品牌', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE table_orders(id TEXT PRIMARY KEY,items JSONB NOT NULL,status TEXT NOT NULL,paid_at TIMESTAMPTZ NOT NULL DEFAULT now());
      CREATE TABLE pos_menu_recipes(item_id TEXT PRIMARY KEY,lines JSONB NOT NULL DEFAULT '[]',updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    await db.query('INSERT INTO site_content(key,value) VALUES($1,$2)', ['menu', legacy]);
    await db.query(`INSERT INTO table_orders(id,items,status,paid_at) VALUES
      ('o1','[{"item_id":"canele","venue":"BAR","cat":"DESSERT"}]','paid',now()-interval '3 days'),
      ('o2','[{"item_id":"canele","venue":"STAY","cat":"DESSERT"}]','void',now()),
      ('o3','[{"item_id":"canele","venue":"REST","cat":"DESSERT"}]','paid',now()-interval '40 days')`);
    await db.query(`INSERT INTO pos_menu_recipes(item_id,lines) VALUES('canele','[{"inv_id":"butter","qty":10}]')`);
    const client = { query: (s, a) => db.query(s, a), release() {} };
    const pool = { connect: async () => client };
    const ctx = vm.createContext({ require, menuBrands: require('./lib/menu-per-brand'), pool, q: (s, a) => db.query(s, a), snapshotCache: { at: 1 }, console: { log() {}, warn: console.warn }, JSON, Object, Date, Promise, Error });
    vm.runInContext(slice('const MENU_ROWS=', '/* ---------- token') + ';this.f={menuRead,menuWrite,menuLock,menuJson,migrateMenuPerBrand,menuReplace};', ctx);
    const F = ctx.f;
    await F.migrateMenuPerBrand();
    await F.migrateMenuPerBrand();   // 冪等
    const rows = Object.fromEntries((await db.query('SELECT key,value FROM site_content')).rows.map(r => [r.key, r.value]));
    const ids = k => JSON.parse(rows[k]).items.map(i => i.id);
    assert.equal(rows.menu, legacy, '舊列保留不動（回滾用）');
    assert.deepEqual(ids('menu:CAFE'), ['coffee', 'canele']);
    assert.deepEqual(ids('menu:BAR'), ['beer', 'canele_bar'], '只複製近 30 天、未作廢、別的品牌賣過的甜點');
    assert.deepEqual(ids('menu:STAY'), []); assert.deepEqual(ids('menu:REST'), []);
    assert.deepEqual(ids('menu:TTH'), ['brush']);
    const rep = JSON.parse(rows.menu_per_brand_v1);
    assert.equal(rep.source, 4); assert.equal(rep.copies.length, 1);
    assert.deepEqual((await db.query("SELECT lines FROM pos_menu_recipes WHERE item_id='canele_bar'")).rows[0].lines, [{ inv_id: 'butter', qty: 10 }]);
    // 寫：只改三點水啤酒價 → 只有 menu:BAR 的 updated_at 變
    const before = (await db.query("SELECT key,updated_at FROM site_content WHERE key LIKE 'menu:%'")).rows;
    await new Promise(r => setTimeout(r, 20));
    const cur = await F.menuJson(); const doc = JSON.parse(cur); doc.items.find(i => i.id === 'beer').price = 220;
    const written = await F.menuWrite((s, a) => db.query(s, a), cur, JSON.stringify(doc), { brand: true });
    assert.deepEqual([...written], ['menu:BAR']);
    const after = (await db.query("SELECT key,updated_at FROM site_content WHERE key LIKE 'menu:%'")).rows;
    for (const r of after) {
      const b = before.find(x => x.key === r.key);
      if (r.key === 'menu:BAR') assert.notEqual(+r.updated_at, +b.updated_at); else assert.equal(+r.updated_at, +b.updated_at, r.key + ' 不該被寫');
    }
    assert.equal(JSON.parse(await F.menuJson()).items.find(i => i.id === 'beer').price, 220);
  } finally { await db.close(); }
});
