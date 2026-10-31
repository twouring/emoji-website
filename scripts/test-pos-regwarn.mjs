import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/pos.html', import.meta.url), 'utf8');
const ops = readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');

test('未開帳警示條在頂欄上方', () => {
  const bar = html.indexOf('id="p-regwarn"'), top = html.indexOf('<header class="p-top">');
  assert.ok(bar > 0 && bar < top, '警示條要在 .p-top 之前');
  assert.match(html, /\.p-regwarn\{[^}]*background:var\(--danger\)/);
});

test('依目前品牌判斷：沒有開著的帳就顯示，開帳後隱藏', () => {
  assert.match(html, /function paintRegWarn\(d\)/);
  assert.match(html, /SCOPE \|\| d\.next_venue \|\| d\.active_venue/);   // 關帳後立刻提醒開另一店，不等時段
  assert.match(html, /!\(r && !r\.closed_at\)/);
  assert.match(html, /api\('\/admin\/registers' \+ scopeQuery\(\)\)/);
  assert.match(html, /setInterval\(\(\) => \{ if \(DATA && !document\.hidden\) refreshRegWarn\(\); \}, 30000\)/);
});

test('切分頁、開帳、關帳、重開帳都會刷新警示；登入畫面不顯示', () => {
  assert.match(html, /function activate\(\)\{\n  startKitchenPrinting\(\);\n  refreshRegWarn\(\);/);
  assert.equal((html.match(/paintRegWarn\(null\);\n  const drawer/g) || []).length, 2);
  assert.ok((ops.match(/typeof refreshRegWarn==='function'\)refreshRegWarn\(\)/g) || []).length >= 3);
});

test('「去開帳」跳到日結並打開開帳表單；等另一品牌關帳時不給按鈕', () => {
  assert.match(html, /data-regwarn-open/);
  assert.match(html, /REG_OPEN_FORM = b\.dataset\.regwarnOpen;[^\n]*go\('sales'\)/);
  assert.match(html, /wait \? '' : `<button/);
});
