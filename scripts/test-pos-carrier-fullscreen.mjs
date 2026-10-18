import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');

test('手機載具用全螢幕彈窗掃描：結帳點選手機載具／掃描鈕、補開發票都走 scanMobileCarrier', () => {
  assert.match(ops, /function scanMobileCarrier\(initial=''\)/);
  assert.match(ops, /className='pos-scan-full'/);
  assert.match(ops, /input\[name=pos-invoice\]\[value=mobile\]/);
  assert.match(ops, /if\(invScan\)invScan\.onclick=openCarrierScan;/);
  assert.match(ops, /kind==='mobile'\?await scanMobileCarrier\(\):await pickCarrier\(kind\)/);
  assert.match(ops, /startInvoiceScan\(video,v=>done\(v\),\{accept:v=>MOBILE_CARRIER_RE\.test\(v\)\}\)/, '只接受 / 開頭 8 碼，其他條碼繼續掃');
  assert.match(ops, /if\(!document\.querySelector\?\.\('\.pos-scan-full'\)\)stopPosInvoiceScanner\(\);/, '背景重繪不關相機');
  assert.match(css, /\.pos-scan-full\{position:fixed;inset:0/);
});

test('發票證明聯只印紙本與統編，手機載具／自然人憑證／捐贈不印', () => {
  const m = ops.match(/const invoicePrintable=[^\n]+/);
  assert.ok(m);
  const c = vm.createContext({});
  vm.runInContext(m[0] + ';this.f=invoicePrintable;', c);
  assert.equal(c.f({ status: 'issued', mode: 'paper' }), true);
  assert.equal(c.f({ status: 'issued', mode: 'company' }), true);
  assert.equal(c.f({ status: 'issued' }), true);
  for (const mode of ['mobile', 'citizen', 'donate']) assert.equal(c.f({ status: 'issued', mode }), false, mode);
  assert.equal(c.f({ status: 'void', mode: 'paper' }), false);
  assert.match(ops, /if\(invoicePrintable\(order\.invoice\)\)await printInvoiceProof\(order,\{auto:true\}\)/);
  assert.match(ops, /if\(invoicePrintable\(out\.invoice\)\)await printInvoiceProof/);
  assert.doesNotMatch(ops, /o\.invoice\?\.status==='issued'\?`<button[^`]*data-invoice-print/);
});

test('發票欄位重畫不清空：值存在 POS_INV_VALS，重畫時寫回 value；結帳成功／換桌／返回才清', () => {
  assert.match(ops, /let POS_INV_VALS=\{\};/);
  for (const n of ['buyer_ubn', 'carrier_num', 'love_code', 'comment']) assert.match(ops, new RegExp(`name="${n}"[^>]*value="\\$\\{esc\\(POS_INV_VALS\\.${n}\\|\\|''\\)\\}"`), n);
  assert.match(ops, /forEach\(i=>i\.addEventListener\?\.\('input',\(\)=>\{POS_INV_VALS\[i\.name\]=i\.value;\}\)\)/);
  assert.match(ops, /if\(raw!==null\)\{POS_INV_VALS\.carrier_num=raw;/);
  assert.ok((ops.match(/POS_INV_VALS=\{\};/g) || []).length >= 5, '宣告＋兩種結帳成功＋點桌＋返回');
});
