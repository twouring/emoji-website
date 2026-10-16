// 結帳頁現場操作：收款列釘在面板底、直向選桌後只看帳單、發票預設收合、找零大字。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');

test('收款鍵在底部釘住列，不跟送出點餐／清桌同列', () => {
  assert.match(ops, /class="pos-dock"/);
  assert.match(ops, /<div class="pos-dock">[\s\S]*?id="pos-checkout"/);
  assert.match(ops, /id="pos-place"/);
  assert.match(ops, /id="pos-close"/);
  assert.doesNotMatch(ops, /<div class="pos-actions"><button[^>]*id="pos-checkout"/);
  assert.doesNotMatch(ops, /<div class="pos-actions">[\s\S]{0,400}id="pos-checkout"/);
  assert.match(css, /\.pos-dock\{[^}]*flex:none/);
  assert.match(css, /\.pos-panel-scroll\{[^}]*overflow:auto/);
  assert.match(css, /\.pos-dock #pos-checkout\{[^}]*min-height:64px/);
  assert.match(css, /\.pos-layout\.has-panel \.pos-panel\{[^}]*max-height:calc\(100dvh/);
});

test('直向選桌後桌況格收起來，帳單標題有「← 桌況」', () => {
  assert.match(ops, /id="pos-back"/);
  assert.match(ops, /#pos-back'\)\.onclick=/);
  assert.match(css, /@media\(max-width:999px\)\{\.pos-layout\.has-panel \.pos-tables\{display:none\}/);
  assert.match(css, /\.btn\.pos-back\{display:none/);
});

test('發票預設收合；找零字級跟應收同級', () => {
  assert.match(ops, /details class="pos-invoice"><summary>/);
  assert.doesNotMatch(ops, /details class="pos-invoice" open>/);
  assert.match(css, /\.pos-sum \.pos-change b\{font-size:2rem/);
  assert.match(css, /\.pos-dock-change b,\.pos-dock-due b\{font-size:1.75rem/);
});

test('收款只保留「餐點到齊」確認，不再跳出第二道金額確認', () => {
  assert.match(ops, /餐點都到齊了嗎/);
  assert.doesNotMatch(ops, /向\$\{cur\.takeout\?'外帶':'桌號'\} \$\{cur\.table\} 收 NT\$/);
});
