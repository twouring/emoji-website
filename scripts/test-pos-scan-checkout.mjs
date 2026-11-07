// 桌況頁「掃碼結帳」（KK 11/7）：掃客人桌上的點餐 QR → 直接切到該桌結帳
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');
const icons = fs.readFileSync(new URL('../public/pos-icons.js', import.meta.url), 'utf8');

function fn(name) {
  const i = ops.indexOf(`function ${name}(`);
  assert.ok(i >= 0, name);
  let d = 0, j = ops.indexOf('{', i);
  for (; j < ops.length; j++) { if (ops[j] === '{') d++; else if (ops[j] === '}' && --d === 0) break; }
  return ops.slice(i, j + 1);
}
const ctx = vm.createContext({ URL });
vm.runInContext(fn('tableFromScan') + ';globalThis.tableFromScan=tableFromScan;', ctx);
const sessions = [{ id: 'ts_abc123', table: 'A3' }, { id: 'ts_zz9', table: 'B1' }];
const pick = (v) => JSON.parse(JSON.stringify(ctx.tableFromScan(v, sessions)));

test('點餐 QR 網址解出場次並對到桌', () => {
  assert.equal(pick('https://atcafe.emoji.tw/order?s=ts_abc123&k=deadbeef').table, 'A3');
  assert.equal(pick('https://app.emoji.tw/order?k=x&s=ts_zz9').table, 'B1');
  assert.equal(pick('/order?s=ts_zz9&k=x').table, 'B1');
});

test('已清桌／別店的 QR 回 missing，不亂跳桌', () => {
  assert.equal(pick('https://app.emoji.tw/order?s=ts_gone&k=x').missing, true);
});

test('手動輸入桌號（不分大小寫）', () => {
  assert.equal(pick('a3').table, 'A3');
  assert.equal(pick('C9').missing, true);
  assert.equal(ctx.tableFromScan('', sessions), null);
});

test('桌況底列有掃碼結帳鈕並接上相機掃描', () => {
  assert.match(ops, /id="pos-scan-checkout">掃碼結帳<\/button><\/div>`;/);
  assert.match(ops, /#pos-scan-checkout'\)\.onclick=\(\)=>posScanCheckout\(reload\)/);
  assert.match(fn('pickTableScan'), /startInvoiceScan\(video,v=>done\(v\),\{raw:true,accept:v=>\/\[\?&\]s=\/\.test\(v\)\}\)/);
  assert.match(fn('posScanCheckout'), /posSelectTable\(hit\.table\)/);
  assert.match(icons, /\['#pos-scan-checkout','camera'\]/);
  assert.match(css, /\.pos-open\{display:grid;grid-template-columns:repeat\(4,/);
});
