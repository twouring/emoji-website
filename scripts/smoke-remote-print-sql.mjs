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
