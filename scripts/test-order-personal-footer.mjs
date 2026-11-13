import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');

test('桌邊點餐：底欄只顯示自己未結帳的金額與件數，送單仍只送自己待送品項', () => {
  assert.match(html, /var u=unpaid\(\),p=pending\(\),myUnpaid=u\.filter\(function\(l\)\{return l\.mine;\}\),myPendingLines=p\.filter\(function\(l\)\{return l\.mine;\}\);/);
  assert.match(html, /\$\('#bar-total'\)\.textContent=money\(sum\(myUnpaid\)\)/);
  assert.match(html, /myPendingLines\.length\?tr\('pending_items',\{count:myPendingLines\.length\}\):myUnpaid\.length\?tr\('unpaid_items',\{count:myUnpaid\.length\}\):tr\('empty'\)/);
  assert.match(html, /var mp=myPending\(\);\$\('#bar'\)\.classList\.toggle\('has-place',mp\.length>0\);\$\('#bar-place'\)\.hidden=!mp\.length;/);
});
