import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
