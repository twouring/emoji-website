// 結帳右欄現金快捷金額不可被截斷（KK 11/15）：一排四顆在 iPad 右欄每顆只剩約 74px，「$12,400」會被裁；鎖 2×2 格線。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
test('cash quick amounts use a 2-column grid in the pay block', () => {
  const m = css.match(/\.pos-blk--pay \.pos-cash-quick\{([^}]*)\}/);
  assert.ok(m, 'missing .pos-blk--pay .pos-cash-quick rule');
  assert.match(m[1], /display:grid/);
  assert.match(m[1], /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
