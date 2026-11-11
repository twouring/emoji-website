// 約書旅書籍造冊（KK 11/11）：restbook.emoji.tw/admin 掃 ISBN → 國圖查書目與定價 → 約書旅 POS 品項（REST／BOOK）
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;
const books = require('../lib/book-catalog.js');
const tableOrders = require('../lib/table-orders.js');
const kitchen = require('../lib/pos-kitchen-print.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('ISBN 正規化：13 碼驗檢查碼、10 碼轉 13 碼、去連字號', () => {
  assert.equal(MenuLib.normalizeIsbn('978-986-175-526-7'), '9789861755267');
  assert.equal(MenuLib.normalizeIsbn('9789861755260'), '');            // 檢查碼錯
  assert.equal(MenuLib.normalizeIsbn('0262033844'), '9780262033848');  // ISBN-10 → 13
  assert.equal(MenuLib.normalizeIsbn('4710000000001'), '');            // 一般商品條碼不是書
  assert.equal(MenuLib.normalizeIsbn(''), '');
});

test('國圖明細頁解析：書名、作者、出版社、定價、出版年月', () => {
  const html = `<td aria-label="書名">書名</td>\n<td>原子習慣: 細微改變帶來巨大成就的實證法則&nbsp;</td>
    <td aria-label="作者">作者</td><td>詹姆斯.克利爾(James Clear)著; 蔡世偉譯&nbsp;</td>
    <td aria-label="出版機構">出版機構</td><td>方智&nbsp;</td>
    <td aria-label="ISBN(裝訂方式)" data-th="ISBN(裝訂方式)">&nbsp;9789861755267 (平裝)</td>
    <td aria-label="定價"           data-th="定價"          >NT$330</td>
    <td aria-label="出版年月"       data-th="出版年月"      >108/06</td>`;
  const r = books.parseNclRecord(html, '9789861755267');
  assert.equal(r.title, '原子習慣: 細微改變帶來巨大成就的實證法則');
  assert.equal(r.publisher, '方智');
  assert.equal(r.list_price, 330);
  assert.equal(r.pub_date, '2019-06');
  assert.equal(r.binding, '平裝');
  assert.equal(books.parseNclRecord(html, '9789570000003'), null, 'ISBN 不符不能誤用別本書');
});

test('日本 openBD：以 ISBN 帶入題名、作者、出版社、日圓定價', () => {
  const payload = [{
    summary: { isbn: '9784101050089', title: '吾輩は猫である', publisher: '新潮社', pubdate: '2003-01-01', cover: 'https://example.test/cover.jpg' },
    onix: { DescriptiveDetail: { Contributor: [{ PersonName: '夏目漱石' }] }, PublishingDetail: { Imprint: [{ ImprintName: '新潮社' }], PublishingDate: [{ Date: '20030101' }] }, ProductSupply: { SupplyDetail: { Price: [{ PriceAmount: '500' }] } } },
  }];
  const r = books.parseOpenBdRecord(payload, '9784101050089');
  assert.equal(r.title, '吾輩は猫である');
  assert.equal(r.author, '夏目漱石');
  assert.equal(r.publisher, '新潮社');
  assert.equal(r.list_price, 0, '日圓定價不可直接當成臺幣 POS 售價');
  assert.equal(r.reference_price, 500);
  assert.equal(r.reference_currency, 'JPY');
});

test('書目查詢：國圖未命中時依序改查 openBD、NDL、Google', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('isbn.ncl.edu.tw')) return { status: 200, headers: { getSetCookie: () => [], get: () => null }, text: async () => '<input id="csrftoken" name="csrftoken" value="x">' };
    if (url.includes('api.openbd.jp')) return { ok: true, json: async () => [{ summary: { title: '日文書', publisher: '出版社' }, onix: { ProductSupply: { SupplyDetail: { Price: [{ PriceAmount: '880' }] } } } }] };
    throw Error('不應查到後續來源');
  };
  const r = await books.lookupIsbn('9784101050089', { fetchImpl });
  assert.equal(r.title, '日文書');
  assert.equal(r.source, 'openbd');
  assert.ok(calls.some(x => x.includes('api.openbd.jp')));
  assert.ok(!calls.some(x => x.includes('ndlsearch.ndl.go.jp')));
});

test('造冊：新增→再掃加本數→set 改本數；只能放約書旅', () => {
  let { json, item, created } = books.upsertBook('', { isbn: '9789861755267', title: '原子習慣', list_price: 330, price: 297, qty: 2 });
  assert.ok(created);
  assert.equal(item.venue, 'REST'); assert.equal(item.cat, 'BOOK'); assert.equal(item.stock_left, 2); assert.equal(item.price, 297);
  ({ json, item, created } = books.upsertBook(json, { isbn: '978-986-175-526-7', price: 297 }));
  assert.ok(!created); assert.equal(item.stock_left, 3);
  ({ json, item } = books.upsertBook(json, { isbn: '9789861755267', price: 330, qty: 5, mode: 'set' }));
  assert.equal(item.stock_left, 5); assert.equal(item.price, 330);
  assert.equal(books.listBooks(json).length, 1);
  assert.throws(() => books.upsertBook(json, { isbn: '123', title: 'x', price: 1 }), /ISBN/);
  assert.throws(() => books.upsertBook(json, { isbn: '9780262033848', title: '', price: 1 }), /書名/);
  const v = MenuLib.validateDoc({ items: [{ ...MenuLib.normalizeItem({ venue: 'CAFE', cat: 'BOOK', zh: 'x', price: 1 }) }] });
  assert.equal(v.ok, false, '書籍不能放在其他店別');
  assert.equal(books.listBooks(books.removeBook(json, item.id)).length, 0);
});

test('書籍庫存不隨營業日歸零；扣到 0 視同售完', () => {
  const it = MenuLib.normalizeItem({ venue: 'REST', cat: 'BOOK', zh: '書', price: 300, published: true, isbn: '9789861755267', stock_left: 1 });
  assert.equal(MenuLib.stockLeft(it, new Date('2030-01-01')), 1);
  const json = JSON.stringify({ items: [it] });
  const after = JSON.parse(tableOrders.applyStock(json, [{ item_id: it.id, qty: 1 }], -1));
  assert.equal(after.items[0].stock_left, 0);
  assert.ok(MenuLib.soldOutToday(MenuLib.normalizeItem(after.items[0])));
  assert.equal(JSON.parse(tableOrders.applyStock(JSON.stringify(after), [{ item_id: it.id, qty: 1 }], 1)).items[0].stock_left, 1, '作廢回補');
  assert.throws(() => tableOrders.setSoldOut(json, it.id, true, null), /書冊/, 'POS 估清不能清掉書籍本數');
});

test('書籍只在 POS：不進桌邊點餐與官網菜單；不上出餐單、不收服務費、不套會員價', () => {
  const book = MenuLib.normalizeItem({ id: 'b1', venue: 'REST', cat: 'BOOK', zh: '書', price: 300, published: true, isbn: '9789861755267', stock_left: 3 });
  const doc = { items: [book] };
  assert.ok(MenuLib.isOrderable(book, new Date(), { posOnly: true }));
  assert.ok(!MenuLib.isOrderable(book, new Date()));
  assert.equal(MenuLib.publishedOnly(doc).length, 0);
  assert.ok(MenuLib.inVenue(book, 'REST')); assert.ok(!MenuLib.inVenue(book, 'CAFE'));
  const menu = tableOrders.menuIndex(JSON.stringify(doc), undefined, { posOnly: true });
  const items = tableOrders.posAddLine([], menu, { item_id: 'b1', qty: 1 });
  assert.equal(items[0].venue, 'REST'); assert.equal(items[0].cat, 'BOOK'); assert.ok(items[0].served_at, '零售品不等出餐');
  assert.equal(kitchen.jobsOf([{ id: 's', table_no: 'W01', status: 'placed', items: items.map(l => ({ ...l, ticket: 'tk', placed_at: l.added_at })) }]).length, 0);
  assert.deepEqual(tableOrders.splitByStation({ items }), { bar: [], kitchen: [] });
  assert.equal(MenuLib.serviceCharge([{ ...items[0], venue: 'BAR' }], { force: true }), null);
});

test('接線：後台頁、API、POS 估清排除書籍、結帳不送出餐單、文件', () => {
  const server = read('server.js');
  assert.match(server, /slug === 'rest-book' && \/\^\\\/admin\\\/\?\$\/\.test\(req\.path\)/);
  for (const r of ["app.get('/api/admin/menu/books'", "app.get('/api/admin/menu/books/lookup'", "app.post('/api/admin/menu/books'", "app.delete('/api/admin/menu/books/:id'"]) assert.ok(server.includes(r), r);
  assert.match(server, /l\.cat!=='SHOP'&&l\.cat!=='BOOK'\?\{\.\.\.l,ticket:tk/);
  assert.match(read('public/pos-ops.js'), /MenuLib\.inVenue\(it,SCOPE\)&&!MenuLib\.isBook\(it\)/);
  const page = read('public/rest-book-admin.html');
  assert.match(page, /\/api'? ?\+ ?path|'\/api' \+ path/);
  assert.match(page, /\/admin\/menu\/books\/lookup\?isbn=/);
  assert.match(page, /formats: \['EAN13'\]/);
  assert.match(page, /noindex/);
  assert.ok(MenuLib.CAT_LABEL.BOOK && ['zh', 'en', 'ja', 'ko'].every(k => MenuLib.CAT_LABEL.BOOK[k]));
  assert.equal(MenuLib.VENUE_LABEL.REST.zh, '約書旅');
});
