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

test('不可訂位設定載入失敗要顯示原因，不可整塊默默消失', () => {
  assert.match(ops, /RESV_HOURS_ERR=e\.message/);
  assert.match(ops, /不可訂位設定載入失敗/);
});

test('POS 以「不可訂位」呈現：點選的是關閉的時段，儲存時換回開放清單', () => {
  assert.match(ops, /id="resv-hours-toggle"[^>]*>不可訂位設定<\/button>/);
  assert.match(ops, /const l=ALL\.filter\(t=>!off\.has\(t\)\)/);
  assert.doesNotMatch(ops, /亮色＝開放/);
});

test('不可訂位編輯開覆蓋層，不把時段表塞進清單', () => {
  assert.match(ops, /op-overlay rh-ov/);
  assert.match(ops, /rh-chip/);
  assert.match(ops, /data-rh-del/);
  assert.doesNotMatch(ops, /id="rh-editor"/);
});

test('不可訂位時段不用展開就列出；兩顆入口鍵同一列', () => {
  assert.match(ops, /function hoursStrip\(\)/);
  assert.match(ops, /\$\{hoursStrip\(\)\}/);
  assert.match(ops, /<div class="resv-actions"><button[^>]*id="resv-add-toggle"[\s\S]*?id="resv-hours-toggle"/);
});
