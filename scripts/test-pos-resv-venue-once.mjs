import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('POS 訂位列只顯示一次店別（period 與店名同字）', () => {
  const src = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(src, /\$\{esc\(BRAND_LABEL\[r\.venue\]\|\|r\.period\)\}/);
  assert.doesNotMatch(src, /BRAND_LABEL\[r\.venue\]\|\|''\)\} · \$\{esc\(r\.period\)/);
});
