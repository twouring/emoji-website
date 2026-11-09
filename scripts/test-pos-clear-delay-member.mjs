// KK 11/7：結帳清桌前停 1 秒；會員彈窗輸入手機後按完成／點背景也要帶入主畫面
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
test('結帳後自動清桌延遲 1 秒才重繪', () => {
  assert.match(src, /const POS_CLEAR_DELAY_MS=1000;/);
  assert.match(src, /return out\?\.closed\?new Promise\(r=>setTimeout\(r,POS_CLEAR_DELAY_MS\)\)\.then\(repaint\):repaint\(\);/);
});
test('結帳後重繪不被 CHECKOUT_BUSY 擋住：reload 後自己 paintPos，整桌結清回桌況（KK 11/9）', () => {
  assert.match(src, /const repaint=\(\)=>reload\(\)\.then\(\(\)=>\{if\(out\?\.closed\)POS_TABLE='';paintPos\(\);\}\);/);
});
test('會員彈窗：完成鍵先查手機再關、手機變更重繪主畫面、點背景走完成', () => {
  const dlg = src.slice(src.indexOf('function openMemberDialog'), src.indexOf('render();\n}', src.indexOf('function openMemberDialog')));
  assert.match(dlg, /\[data-done\]'\)\.onclick=async\(\)=>\{const p=\(phone\.value\|\|''\)\.trim\(\);if\(p&&!POS_YAN\.id&&!POS_YAN\.name&&!POS_YAN\.created\)await lookup\(\);close\(\);paintPos\(\);\}/);
  assert.match(dlg, /POS_MEMBER=false;paintPos\(\);\};/);
  assert.match(dlg, /if\(e\.target===ov\)box\.querySelector\('\[data-done\]'\)\?\.click\(\)/);
});
