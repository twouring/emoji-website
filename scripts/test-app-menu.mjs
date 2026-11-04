// 會員 App：登入與訪客都能直接瀏覽目前公開菜單，不把商店品混進餐飲菜單
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('App：首頁有菜單入口，菜單畫面可在兩個店別切換並讀公開菜單', () => {
  const m = read('public/m.html');
  assert.match(m, /if\(a==='menu'\)\{APP_MENU_VENUE=b\.v;go\('menu'\);\}/, '菜單入口在品牌頁（看菜單直接切到該店）');
  assert.match(m, /if\(sub==='menu'\)return bookMenu\(\)/);
  assert.match(m, /function bookMenu\(\)/);
  assert.match(m, /MenuLib\.publishedOnly\(MENU\)/);
  assert.match(m, /data-menu-venue="CAFE"/);
  assert.match(m, /data-menu-venue="BAR"/);
  assert.match(m, /loadMenu\(\)\.then\(renderAppMenu\)/);
});

test('App：菜單入口與狀態文字有中英日三語，改版升 Service Worker', () => {
  const m = read('public/m.html');
  for (const k of [',menuTitle:', ',menuCafe:', ',menuBar:', ',menuEmpty:']) {
    assert.equal(m.split(k).length - 1, 3, k + ' 要有中英日三語');
  }
  assert.doesNotMatch(read('public/m-sw.js'), /m-v4[789]'/);
});
