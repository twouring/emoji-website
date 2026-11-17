import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
test('點支付方式就動作（KK 11/17）：現金開錢櫃、線上刷卡出 QR', () => {
  assert.match(ops, /input\[name=pos-method\]'\)\.forEach\(r=>r\.onclick=\(\)=>\{[^\n]*payMethodTap\(v,cur,host\)/);
  const fn = ops.slice(ops.indexOf('function payMethodTap('), ops.indexOf('\n}', ops.indexOf('function payMethodTap(')));
  assert.match(fn, /v==='card_qr'[^\n]*ensureOperator\(\(\)=>runCheckoutOnce\(cur\.id,\(\)=>cardQrCheckout\(/);
  assert.match(fn, /v==='cash'[^\n]*drawerPreopened\(cur\.id\)[^\n]*ensureOperator\(async\(\)=>\{const op=OPERATOR;const ok=await manualCashDrawer\(/);
  assert.match(fn, /DRAWER_PREOPEN\.set\(cur\.id,\{op,at:Date\.now\(\)\}\)/);
});
test('先開過櫃的現金收款：沿用同一位員工、不再自動開櫃', () => {
  assert.equal((ops.match(/const pre=method==='cash'\?drawerPreopened\(cur\.id\):null;OPERATOR_PRESET=pre\?\.op\|\|null;return ensureOperator\(/g) || []).length, 2);
  assert.equal((ops.match(/preopened:!!pre\}/g) || []).length, 2);
  assert.match(ops, /async function autoCashDrawer\(\{[^}]*preopened=false\}\)\{\n  if\(preopened\)return null;/);
  assert.match(ops, /async function ensureOperator\(cb\)\{ if\(typeof OPERATOR_PRESET!=='undefined'&&OPERATOR_PRESET\)\{const op=OPERATOR_PRESET;OPERATOR_PRESET=null;OPERATOR=op;try\{return await cb\(\);\}finally\{OPERATOR=null;\}\}/);
});

test('支付方式沒有預設（KK 11/17）：未選不能收款，換桌／結帳後清空', () => {
  assert.match(ops, /POS_INVOICE=\{mode:'paper'\},POS_METHOD='',/);
  assert.doesNotMatch(ops, /POS_METHOD='cash'/);
  assert.match(ops, /id="pos-checkout" \$\{picked\.length&&POS_METHOD\?'':'disabled'\}>\$\{!POS_METHOD\?'請先選支付方式 ':''\}/);
  assert.match(ops, /const method=POS_METHOD;\n    if\(!method\)\{toast\('請先選支付方式'\);return;\}/);
  assert.match(ops, /function posSelectTable\(t\)\{[^\n]*POS_METHOD='';/);
});
