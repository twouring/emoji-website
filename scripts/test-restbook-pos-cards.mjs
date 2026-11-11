import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('約書旅兩種超時卡有不同主色與圖示', () => {
  const js = read('public/pos-ops.js');
  const css = read('public/pos-ops.css');
  assert.match(js, /overtime&&quiet.*M19 10h26M19 54h26/, '靜讀室超時要用沙漏圖示');
  assert.match(js, /overtime\?'<svg.*<circle cx="32" cy="34" r="20"/, '交誼廳超時要用時鐘圖示');
  assert.match(js, /const title=quiet\?'靜讀室':'交誼廳'/, '品項只用交誼廳與靜讀室分類');
  assert.doesNotMatch(js, /title=.*貴賓室/, '貴賓室是場域，不是品項類別');
  assert.match(js, /rest-plan-art--'\+kind\+'-overtime/, '超時卡要保留空間類型');
  assert.match(css, /\.rest-plan-art--lounge-overtime\{background:#bd5b22!important\}/);
  assert.match(css, /\.rest-plan-art--quiet-overtime\{background:#63416f!important\}/);
});

test('約書旅方案分成交誼廳與靜讀室兩類，且都不出餐、不收服務費', () => {
  require('../public/menu-lib.js');
  const { MenuLib } = globalThis;
  assert.equal(MenuLib.CAT_LABEL.LOUNGE.zh, '交誼廳');
  assert.equal(MenuLib.CAT_LABEL.QUIET.zh, '靜讀室');
  assert.ok(MenuLib.CATS.includes('BOOK'), '書籍分類保留');
  for (const cat of ['LOUNGE', 'QUIET', 'SPACE']) assert.equal(MenuLib.isShop({ cat }), true, cat);
  assert.match(read('public/pos-ops.js'), /MenuLib\.SPACE_CATS\.includes\(it\.cat\)\)return restPlanThumb/);
  const server = read('server.js');
  assert.match(server, /menu_restbook_plan_cats_v1/);
  assert.match(server, /if \(cat && it\.cat === 'SPACE'\) \{ it\.cat = cat; n\+\+; \}/, '只改仍是舊分類的品項');
});
