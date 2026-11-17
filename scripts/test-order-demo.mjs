// 金流審核示範連結（KK 11/17）：/order?store=atcafe 不開桌、不寫資料庫，只在手機記憶體模擬購物車與送出。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
const lib = fs.readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8');

test('只認 ?store=atcafe，且帶 s/t 時不啟用', () => {
  assert.match(html, /DEMO=qs\.get\('store'\)==='atcafe'&&!SID&&!T/);
});

test('demo 模式所有 API 走本機模擬，只有 /orders/config 讀伺服器', () => {
  assert.match(html, /var api=function\(path,opt\)\{return DEMO\?demoApi\(path,opt\|\|\{\}\):apiNet\(path,opt\);\};/);
  const block = html.slice(html.indexOf('function demoApi('), html.indexOf('function demoApi(') + 2000);
  assert.match(block, /p==='\/orders\/config'\)return apiNet/);
  assert.equal((block.match(/apiNet\(/g) || []).length, 1, 'demoApi 內不得有其他真實寫入');
});

test('demo 不連即時同步、不帶會員、不受結束鎖影響、非營業時段仍顯示菜單', () => {
  assert.match(html, /!S\|\|DEMO\)return;/);
  assert.match(html, /function token\(\)\{if\(DEMO\)return '';/);
  assert.match(html, /function endedId\(\)\{if\(DEMO\)return '';/);
  assert.match(html, /if\(DEMO\)\{var OW0=MenuLib\.orderWindow;/);
  assert.match(html, /if\(!DEMO&&\(!K\|\|\(!SID&&!T\)\)\)return fail\(/);
});

test('demo_only 提示四語都有', () => {
  assert.equal((lib.match(/demo_only/g) || []).length, 4);
});
