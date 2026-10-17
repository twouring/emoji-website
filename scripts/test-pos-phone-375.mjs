// POS 手機（375 寬）版面：頂欄兩行、桌況兩欄、結帳品項／已結帳單／訂位改卡片列、結帳面板整頁捲動
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/pos.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const phone = css.slice(css.lastIndexOf('@media(max-width:600px){'));

test('手機頂欄：錢櫃／登出只留 44px 圖示，和店別同一行，不用 font-size:0', () => {
  assert.match(html, /@media\(max-width:600px\)\{\.p-brand\{display:none\}[^}]*\}\.p-tools button:not\(\.p-net\)\{[^}]*width:44px[^}]*overflow:hidden/);
  assert.doesNotMatch(html, /\.p-tools button[^{]*\{[^}]*font-size:0/);
});

test('手機桌況兩欄', () => {
  assert.match(phone, /\.pos-grid,\.pos-layout\.has-panel \.pos-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('手機結帳面板不再固定高度內捲動，收款列仍 sticky 在底部且按鈕不換行', () => {
  assert.match(phone, /\.pos-layout\.has-panel \.pos-panel\{height:auto;overflow:visible\}/);
  assert.match(phone, /\.pos-dock #pos-checkout\{[^}]*white-space:nowrap/);
  assert.match(css, /\.pos-dock\{flex:none;position:sticky;bottom:0/);
});

test('手機品項／已結帳單／訂位表改卡片列（隱藏表頭、grid 排版），金額不必橫向滑', () => {
  assert.match(phone, /\.a-tbl\.pos-lines thead\{display:none\}/);
  assert.match(phone, /\.a-tbl\.pos-lines tr\{display:grid;grid-template-columns:32px minmax\(0,1fr\) auto 48px/);
  assert.match(phone, /\.a-tbl\.pos-paid thead,\.a-tbl\.resv-tbl thead\{display:none\}/);
  assert.match(js, /<table class="a-tbl resv-tbl"><thead><tr><th>時間<\/th><th>客人<\/th>/);
});
