// Local-only SQL acceptance（not in CI: needs PGLITE_MODULE_PATH）：遠端列印佇列在真 Postgres 上的領取／去重／品牌隔離／取消／逾時
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const R = require('../lib/pos-remote-print.js');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('遠端列印佇列：真 SQL', async () => {
  const db = new PGlite(), q = (s, a) => db.query(s, a);
  await db.exec(`CREATE TABLE pos_kitchen_print_jobs (id TEXT PRIMARY KEY, job JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), claimed_at TIMESTAMPTZ, actor TEXT, operator_id TEXT);
    INSERT INTO pos_kitchen_print_jobs(id,job) VALUES('tk_kitchen1','{"id":"tk_kitchen1","items":[]}');`);
  await R.enqueue(q, 'rp_0000000000000001', R.clean({ image: PNG, label: '收據' }, 'CAFE', 'a').job);
  await R.enqueue(q, 'rp_0000000000000002', R.clean({ drawer: true }, 'BAR', 'b').job);
  // 出餐單輪詢的 SQL 不會拿到 rp_
  const kitchen = (await q("SELECT id FROM pos_kitchen_print_jobs WHERE claimed_at IS NULL AND id NOT LIKE 'rp\\_%' ORDER BY created_at,id")).rows.map(r => r.id);
  assert.deepEqual(kitchen, ['tk_kitchen1']);
  // 品牌隔離
  assert.deepEqual((await R.pending(q, 'CAFE')).map(j => j.id), ['rp_0000000000000001']);
  assert.equal((await R.claim(q, 'rp_0000000000000002', 'CAFE', 'x')).claimed, false);
  assert.equal(await R.status(q, 'rp_0000000000000002', 'CAFE'), null);
  // 領取只一次
  const c1 = await R.claim(q, 'rp_0000000000000001', 'CAFE', 'station');
  assert.equal(c1.claimed, true); assert.equal(c1.job.image, PNG);
  assert.equal((await R.claim(q, 'rp_0000000000000001', 'CAFE', 'station2')).claimed, false);
  assert.equal((await R.status(q, 'rp_0000000000000001', 'CAFE')).state, 'claimed');
  assert.equal(await R.cancel(q, 'rp_0000000000000001', 'CAFE'), false, '已領取不可取消');
  // 回報一次、清圖檔
  assert.equal(await R.report(q, 'rp_0000000000000001', 'CAFE', true, ''), true);
  assert.equal(await R.report(q, 'rp_0000000000000001', 'CAFE', false, 'x'), false);
  const row = (await q("SELECT job FROM pos_kitchen_print_jobs WHERE id='rp_0000000000000001'")).rows[0].job;
  assert.equal(row.result, 'printed'); assert.equal(row.image, null);
  // 取消未領取
  assert.equal(await R.cancel(q, 'rp_0000000000000002', 'BAR'), true);
  assert.equal((await R.status(q, 'rp_0000000000000002', 'BAR')).state, 'cancelled');
  assert.deepEqual(await R.pending(q, 'BAR'), []);
  // 逾 10 分鐘失效
  await R.enqueue(q, 'rp_0000000000000003', R.clean({ image: PNG }, 'CAFE', 'a').job);
  await q("UPDATE pos_kitchen_print_jobs SET created_at=now()-interval '11 minutes' WHERE id='rp_0000000000000003'");
  assert.deepEqual(await R.pending(q, 'CAFE'), []);
  assert.equal((await R.claim(q, 'rp_0000000000000003', 'CAFE', 's')).claimed, false);
  await db.close();
});

test('列印站：同品牌只一台、別台不能自動搶、force 才換台、兩台同時自動接手只有一台成功', async () => {
  const db = new PGlite(), q = (s, a) => db.query(s, a);
  await db.exec(`CREATE TABLE site_content(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ DEFAULT now());`);
  // 沒接上 mPOP 不會自動成為列印站
  assert.equal((await R.beat(q, 'CAFE', { device: 'A', name: '櫃台', link: false })).station, null);
  // 兩台同時、都接上：只有一台成功
  const [x, y] = await Promise.all([R.beat(q, 'CAFE', { device: 'A', name: '櫃台', link: true }), R.beat(q, 'CAFE', { device: 'B', name: '吧台', link: true })]);
  assert.equal([x.mine, y.mine].filter(Boolean).length, 1);
  const owner = x.mine ? 'A' : 'B', other = owner === 'A' ? 'B' : 'A';
  assert.equal((await R.getStation(q, 'CAFE')).device, owner);
  // 別台心跳不會改到列印站
  const o = await R.beat(q, 'CAFE', { device: other, link: true });
  assert.equal(o.mine, false); assert.equal(o.station.device, owner);
  // 列印站回報 mPOP 斷線：仍是它，只是 link=false
  const d1 = await R.beat(q, 'CAFE', { device: owner, link: false, reason: 'mPOP 沒紙了' });
  assert.equal(d1.station.device, owner); assert.equal(d1.station.link, false); assert.equal(d1.station.reason, 'mPOP 沒紙了');
  // 品牌隔離
  assert.equal(await R.getStation(q, 'BAR'), null);
  // 換台
  const t = await R.beat(q, 'CAFE', { device: other, name: '新櫃台', link: true, force: true });
  assert.equal(t.mine, true); assert.equal(t.station.name, '新櫃台');
  assert.equal((await R.beat(q, 'CAFE', { device: owner, link: true })).mine, false, '舊列印站不會搶回來');
  // 心跳逾時顯示離線，但不自動換人
  assert.equal(R.stationView(JSON.stringify({ device: 'A', at: new Date(Date.now() - 30000).toISOString() })).online, false);
  await db.close();
});
