import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('POS 品牌帳號（在咖啡／三點水平板）可讀寫可訂位時間', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(server.slice(server.indexOf('const FOOD_API ='), server.indexOf('async function eventEditor(')), ctx);
  for (const brand of ['CAFE', 'BAR']) {
    for (const path of ['/api/admin/reservation-hours', '/api/admin/reservations']) {
      const res = { code: 200, status(n) { this.code = n; return this; }, json() {} };
      let next = false;
      ctx.adminOnly({ path, auth: { role: 'admin', brands: [brand] } }, res, () => { next = true; });
      assert.equal(res.code, 200, `${brand} ${path}`);
      assert.equal(next, true);
    }
  }
});

test('可訂位時間載入失敗要顯示原因，不可整塊默默消失', () => {
  assert.match(ops, /RESV_HOURS_ERR=e\.message/);
  assert.match(ops, /可訂位時間設定載入失敗/);
});
