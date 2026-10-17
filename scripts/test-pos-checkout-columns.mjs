import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../public/pos-ops.css',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/pos-ops.js',import.meta.url),'utf8');
test('iPad 橫向結帳：左欄菜單、右欄會員，三欄寬度與右欄不壓縮', () => {
  assert.match(css, /grid-template-columns:minmax\(290px,1fr\) minmax\(0,1\.1fr\) minmax\(320px,\.95fr\)/, '左欄菜單至少 290px');
  assert.match(css, /\.pos-panel-scroll>\.pos-pay\{grid-auto-rows:max-content\}/, '右欄區塊依內容高度排列，會員列不被壓成 0 高');
  assert.match(js, /id="pos-yan-phone"/, '會員手機輸入框在結帳右欄');
  assert.match(js, /data-add="/, '菜單品項可點選加點');
});
test('iPad 橫向優先：會員列在右欄最上面、菜單橫式小卡、中欄卡片列不溢出', () => {
  assert.match(js, /<div class="pos-pay">\s*<div class="pos-member-bar"><input id="pos-yan-phone"/, '會員列是右欄第一個區塊');
  assert.match(css, /\.pos-panel-scroll>\.pos-pay\{grid-template-columns:minmax\(0,1fr\)\}/, '右欄內容不可撐破欄寬');
  assert.match(css, /\.pos-menu-box \.pos-item\{display:grid;grid-template-columns:52px/, '菜單橫式小卡');
  assert.match(css, /\.pos-mid \.a-tbl\.pos-lines tr\{display:grid/, '中欄品項卡片列');
});
test('POS 紀錄分頁：pos.html 引用的 tabLogs／loadLogs 在 pos-ops.js 有定義', () => {
  assert.match(js, /function tabLogs\(\)/);
  assert.match(js, /async function loadLogs\(\)/);
});
