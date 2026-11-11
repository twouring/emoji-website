// 約書旅書店比價（KK 11/12）：同一個 ISBN 查臺灣各書店的售價與庫存，統一格式回給後台（lib/book-stores.js）
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../lib/book-stores.js');
const fx = f => fs.readFileSync(new URL('./fixtures/book-stores/' + f, import.meta.url), 'utf8');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const ISBN = '9789861755267';

test('誠品 JSON：紙本與電子書各一筆，定價／售價／庫存／出版日，ISBN 不符的不收', () => {
  const r = S.parseEslite(JSON.parse(fx('eslite-9789861755267.json')), ISBN);
  assert.equal(r.length, 2);
  const paper = r.find(x => x.format === 'paper'), ebook = r.find(x => x.format === 'ebook');
  assert.equal(paper.list_price, 330); assert.equal(paper.price, 260); assert.equal(paper.in_stock, true);
  assert.equal(paper.publisher, '方智出版社股份有限公司'); assert.equal(paper.author, '詹姆斯．克利爾'); assert.equal(paper.pub_date, '2019-06-01');
  assert.match(paper.url, /^https:\/\/www\.eslite\.com\/product\/\d+$/);
  assert.equal(ebook.price, 203);
  assert.equal(S.parseEslite(JSON.parse(fx('eslite-9789861755267.json')), '9789861371955').length, 0);
  assert.deepEqual(S.parseEslite({}, ISBN), []);
});

test('金石堂 HTML：紙本特價 260、兩本電子書 231，作者／出版社不帶「著／出版」', () => {
  const r = S.parseKingstone(fx('kingstone-9789861755267.html'));
  assert.equal(r.length, 3);
  const paper = r.find(x => x.format === 'paper');
  assert.equal(paper.title, '原子習慣：細微改變帶來巨大成就的實證法則');
  assert.equal(paper.price, 260); assert.equal(paper.in_stock, true);
  assert.equal(paper.author, '詹姆斯．克利爾'); assert.equal(paper.publisher, '方智');
  assert.equal(paper.url, 'https://www.kingstone.com.tw/basic/2011760319040/');
  assert.deepEqual(r.filter(x => x.format === 'ebook').map(x => x.price), [231, 231]);
  assert.deepEqual(S.parseKingstone('<html></html>'), []);
});

test('三民 HTML：優惠價 260（79 折）、庫存 > 10、平裝、出版日；電子書定價 231', () => {
  const r = S.parseSanmin(fx('sanmin-9789861755267.html'));
  assert.equal(r.length, 2);
  const paper = r.find(x => x.format === 'paper'), ebook = r.find(x => x.format === 'ebook');
  assert.equal(paper.price, 260); assert.equal(paper.in_stock, true); assert.equal(paper.binding, '平裝'); assert.equal(paper.pub_date, '2019-06-01');
  assert.equal(paper.author, '詹姆斯‧克利爾'); assert.equal(paper.publisher, '方智');
  assert.equal(paper.url, 'https://www.sanmin.com.tw/product/index/007221735');
  assert.equal(ebook.price, 231); assert.equal(ebook.list_price, 231);
});

test('讀冊 HTML：新書／電子書／二手書分開，二手書用最低價並連到 usedList，缺貨旗標', () => {
  const r = S.parseTaaze(fx('taaze-9789861755267.html'));
  assert.equal(r.length, 5);
  const paper = r.find(x => x.format === 'paper' && x.title === '原子習慣：細微改變帶來巨大成就的實證法則');
  assert.equal(paper.list_price, 330); assert.equal(paper.price, 260); assert.equal(paper.in_stock, false, 'STK_SELL_FLG=N 是缺貨');
  assert.equal(paper.url, 'https://www.taaze.tw/products/11100876604.html'); assert.equal(paper.publisher, '方智出版'); assert.equal(paper.pub_date, '2019-06-01');
  const used = r.find(x => x.format === 'used' && /^原子習慣：細微改變帶來巨大成就的實證法則 \(二手書\)/.test(x.title));
  assert.equal(used.price, 231); assert.equal(used.in_stock, true); assert.equal(used.url, 'https://www.taaze.tw/usedList.html?oid=11100876604');
  assert.equal(r.find(x => x.format === 'ebook').binding, 'ePub');
});

test('Yahoo 購物中心：只收 ISBN_ 標籤相符的商品，帶自營／商城賣家', () => {
  const r = S.parseYahoo(fx('yahoo-9789861755267.html'), ISBN);
  assert.equal(r.length, 5, '第 6 筆不是這本書');
  const own = r.find(x => x.price === 281);
  assert.equal(own.list_price, 330); assert.equal(own.seller, '自營'); assert.equal(own.format, 'paper'); assert.equal(own.in_stock, true);
  assert.match(own.url, /^https:\/\/tw\.buy\.yahoo\.com\//);
  assert.equal(r.filter(x => x.format === 'used').length, 3);
  assert.deepEqual(S.parseYahoo('<html></html>', ISBN), []);
  assert.deepEqual(S.parseYahoo(fx('yahoo-9789861755267.html'), '9789861371955'), []);
});

test('統一接口：八家並行、擋程式的三家回 blocked 並給搜尋連結、最便宜現貨紙本、每家每種版本最多 2 筆、快取', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const ok = body => ({ status: 200, headers: {}, body });
    if (url.includes('athena.eslite.com')) return ok(fx('eslite-9789861755267.json'));
    if (url.includes('kingstone.com.tw')) return ok(fx('kingstone-9789861755267.html'));
    if (url.includes('sanmin.com.tw')) return ok(fx('sanmin-9789861755267.html'));
    if (url.includes('taaze.tw')) return ok(fx('taaze-9789861755267.html'));
    if (url.includes('tw.buy.yahoo.com')) { assert.match(decodeURIComponent(url), /p=原子習慣$/, 'Yahoo 用主書名搜（去副標）'); return ok(fx('yahoo-9789861755267.html')); }
    throw Error('不應打到 ' + url);
  };
  const cache = new Map();
  const r = await S.lookupStores(ISBN, { title: '原子習慣：細微改變帶來巨大成就的實證法則', fetchImpl, cache });
  assert.equal(r.stores.length, 8);
  assert.deepEqual(r.stores.map(s => s.name), ['博客來', '金石堂', '誠品', '讀冊 TAAZE', '三民', '讀墨 Readmoo', '樂天 Kobo', 'Yahoo 購物中心']);
  for (const k of ['books', 'readmoo', 'kobo']) { const s = r.stores.find(x => x.key === k); assert.equal(s.status, 'blocked'); assert.ok(s.url.includes(ISBN)); assert.ok(s.note); }
  for (const k of ['kingstone', 'eslite', 'taaze', 'sanmin', 'yahoo']) assert.equal(r.stores.find(x => x.key === k).status, 'ok', k);
  assert.equal(calls.length, 5, '擋程式的平台不發請求');
  assert.equal(r.list_price, 330);
  assert.deepEqual(r.best, { store: '金石堂', key: 'kingstone', price: 260, in_stock: true, url: 'https://www.kingstone.com.tw/basic/2011760319040/' }, '讀冊同價但缺貨；Yahoo 261 比較貴');
  const yahoo = r.stores.find(x => x.key === 'yahoo');
  assert.equal(yahoo.offers.filter(o => o.format === 'used').length, 2, '二手書只留最便宜兩筆');
  assert.deepEqual(yahoo.offers.filter(o => o.format === 'used').map(o => o.price), [224, 237]);
  assert.ok(r.checked_at);
  const again = await S.lookupStores(ISBN, { title: '原子習慣：細微改變帶來巨大成就的實證法則', fetchImpl, cache });
  assert.equal(again.cached, true); assert.equal(calls.length, 5, '10 分鐘內同一本不重查');
});

test('統一接口：單一平台逾時／阻擋／查無，其他照常回；ISBN 格式錯直接 400', async () => {
  const fetchImpl = async url => {
    if (url.includes('athena.eslite.com')) return { status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '' };
    if (url.includes('kingstone.com.tw')) throw new Error('逾時');
    if (url.includes('sanmin.com.tw')) return { status: 200, headers: {}, body: '<html>沒有東西</html>' };
    if (url.includes('taaze.tw')) return { status: 200, headers: {}, body: fx('taaze-9789861755267.html') };
    if (url.includes('tw.buy.yahoo.com')) return { status: 500, headers: {}, body: '' };
    throw Error('不應打到 ' + url);
  };
  const r = await S.lookupStores(ISBN, { fetchImpl, cache: new Map() });
  const by = Object.fromEntries(r.stores.map(s => [s.key, s]));
  assert.equal(by.eslite.status, 'blocked'); assert.ok(by.eslite.note);
  assert.equal(by.kingstone.status, 'error'); assert.match(by.kingstone.error, /逾時/);
  assert.equal(by.sanmin.status, 'none');
  assert.equal(by.yahoo.status, 'error'); assert.match(by.yahoo.error, /500/);
  assert.equal(by.taaze.status, 'ok');
  assert.equal(r.best.key, 'taaze'); assert.equal(r.best.price, 290, '只剩讀冊：260 那本缺貨，取有貨的 290');
  await assert.rejects(S.lookupStores('123', { fetchImpl }), /ISBN/);
  await assert.rejects(S.lookupStores('9789861755260', { fetchImpl }), /ISBN/, '檢查碼錯');
});

test('版本判斷與 Yahoo 搜尋網址', () => {
  assert.equal(S.formatOf('原子習慣 (二手書)'), 'used');
  assert.equal(S.formatOf('【電子書】原子習慣'), 'ebook');
  assert.equal(S.formatOf('原子習慣', 'ePub'), 'ebook');
  assert.equal(S.formatOf('原子習慣', '平裝'), 'paper');
  const yahoo = S.STORES.find(s => s.key === 'yahoo');
  assert.ok(yahoo.search(ISBN, '原子習慣').includes(encodeURIComponent('原子習慣')));
  assert.ok(yahoo.search(ISBN).includes(ISBN));
});

test('接線：API、文件、後台頁用統一接口顯示八家比價', () => {
  const server = read('server.js');
  assert.ok(server.includes("app.get('/api/admin/menu/books/stores'"));
  assert.match(server, /bookStores\.lookupStores\(/);
  assert.match(server, /app\.get\('\/api\/admin\/menu\/books\/stores'[\s\S]*?restBookScope/);
  assert.match(read('docs/API.md'), /^### GET \/api\/admin\/menu\/books\/stores$/m);
  const page = read('public/rest-book-admin.html');
  assert.match(page, /\/admin\/menu\/books\/stores\?isbn=/);
  assert.match(page, /function paintStores/);
  for (const w of ['blocked', 'in_stock', 'best']) assert.ok(page.includes(w), w);
  assert.ok(!page.includes('use-best') && !page.includes('售價用這個'), 'KK 11/12：售價一律採書本定價，不提供帶入店價的按鈕');
  assert.match(page, /約書旅售價＝定價/);
  assert.match(page, /不帶入售價/);
  assert.ok(!page.includes('google.com/search'), '不再丟 Google 站內搜尋，由伺服器統一查');
  const ca = read('lib/book-stores-taaze-ca.pem');
  assert.match(ca, /^-----BEGIN CERTIFICATE-----/);
});
