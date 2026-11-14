// 約書旅書冊：非 ISBN 條碼掃入 → 手動補書名與價格 → 以條碼為索引存檔，再掃帶出（t_96b973b8）
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../public/menu-lib.js');
require('../public/book-barcode.js');
const MenuLib = globalThis.MenuLib;
const B = globalThis.BookBarcode;
const books = require('../lib/book-catalog.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('條碼解析：各格式的 format／code／isbn', () => {
  const cases = [
    ['9789861755267', undefined, 'isbn13', '9789861755267', '9789861755267'],
    ['978-986-175-526-7', undefined, 'isbn13', '9789861755267', '9789861755267'],
    ['0262033844', undefined, 'isbn10', '9780262033848', '9780262033848'],
    ['4710088410016', 'ean_13', 'ean13', '4710088410016', ''],
    ['036000291452', 'upc_a', 'upca', '036000291452', ''],
    // zxing／掃描槍把 UPC-A 送成 0 開頭 13 碼 EAN-13：索引要與 12 碼相同（t_9894d048 驗收發現）
    ['0036000291452', 'ean_13', 'upca', '036000291452', ''],
    ['0036000291452', undefined, 'upca', '036000291452', ''],
    ['47100886', 'ean_8', 'ean8', '47100886', ''],
    ['10012345678902', 'itf', 'itf', '10012345678902', ''],
    ['12345678', 'itf', 'itf', '12345678', ''],
    ['RB-0001', 'code_128', 'code128', 'RB-0001', ''],
    ['book-123', 'code_39', 'code39', 'BOOK-123', ''],
    ['https://example.tw/b?isbn=9789861755267', 'qr_code', 'qr', '9789861755267', '9789861755267'],
    ['約書旅 自製手帳 A5', 'qr_code', 'qr', '約書旅 自製手帳 A5', ''],
    ['店內-0007', undefined, 'text', '店內-0007', ''],
  ];
  for (const [raw, hint, format, code, isbn] of cases) {
    const p = B.parse(raw, hint);
    assert.ok(p.ok, `${raw}: ${p.error}`);
    assert.equal(p.format, format, raw); assert.equal(p.code, code, raw); assert.equal(p.isbn, isbn, raw);
    assert.equal(p.raw, raw.trim(), '保留原始條碼值');
  }
});

test('條碼解析：檢查碼錯、空值、過長、格式不符要擋', () => {
  for (const [raw, hint, re] of [
    ['9789861755260', undefined, /檢查碼/], ['4710088410012', undefined, /檢查碼/], ['036000291453', undefined, /檢查碼/],
    ['47100887', 'ean_8', /檢查碼/], ['026203384X', undefined, /檢查碼/], ['10012345678903', 'itf', /檢查碼/],
    ['12345', 'itf', /偶數/], ['AB#C', 'code_39', /Code 39/], ['', undefined, /請掃描/], ['   ', undefined, /請掃描/],
    [null, undefined, /請掃描/], ['x'.repeat(201), undefined, /太長/], ['AB', 'code_128', /太短/],
  ]) {
    const p = B.parse(raw, hint);
    assert.equal(p.ok, false, String(raw)); assert.match(p.error, re, String(raw)); assert.equal(p.code, '');
  }
  // 掃描槍送來的控制字元（GS、換行）要去掉
  assert.equal(B.parse('\x1d9789861755267\r\n').code, '9789861755267');
});

test('EAN-13 附碼：拆出 5 碼價格附碼；外幣只當參考，不帶入臺幣售價', () => {
  let p = B.parse('978026203384851599');   // 掃描槍直接接在後面
  assert.equal(p.code, '9780262033848'); assert.equal(p.addon, '51599');
  assert.equal(p.price_currency, 'USD'); assert.equal(p.reference_price, 15.99); assert.equal(p.price, 0);
  p = B.parse('9780262033848 62495');
  assert.equal(p.price_currency, 'CAD'); assert.equal(p.reference_price, 24.95);
  p = B.parse('9780262033848+90000');      // 90000＝無建議售價
  assert.equal(p.addon, '90000'); assert.equal(p.reference_price, 0); assert.equal(p.price_currency, '');
  p = B.parse('4710088410016 05');         // 2 碼期數附碼不是價格
  assert.equal(p.format, 'ean13'); assert.equal(p.addon, '05'); assert.equal(p.reference_price, 0);
  const jp = '192009501600'; p = B.parse(jp + [...Array(10).keys()].find(c => B.gs1Ok(jp + c)));   // 日本書第二段條碼：192＋分類 0095＋稅前日圓 01600
  assert.equal(p.format, 'ean13'); assert.equal(p.reference_price, 1600); assert.equal(p.price_currency, 'JPY'); assert.equal(p.isbn, '');
});

test('造冊：非 ISBN 條碼需手補書名與價格，存條碼值與格式', () => {
  assert.throws(() => books.upsertBook('', { barcode: '4710088410016', barcode_format: 'ean_13', title: '', price: 120 }), /書名/);
  assert.throws(() => books.upsertBook('', { barcode: '4710088410016', title: '手帳', price: '' }), /售價/);
  assert.throws(() => books.upsertBook('', { barcode: '4710088410016', title: '手帳', price: 'abc' }), /整數/);
  assert.throws(() => books.upsertBook('', { barcode: '4710088410016', title: '手帳', price: -1 }), /整數|0–100000/);
  assert.throws(() => books.upsertBook('', { barcode: '4710088410016', title: '手帳', price: 100001 }), /0–100000/);
  assert.throws(() => books.upsertBook('', { barcode: '4710088410016', title: '手帳', price: 10, list_price: -5 }), /定價/);
  assert.throws(() => books.upsertBook('', { barcode: '4710088410012', title: '手帳', price: 10 }), /檢查碼/);
  assert.throws(() => books.upsertBook('', { barcode: '', isbn: '', title: '手帳', price: 10 }), /請掃描/);

  const { json, item, created } = books.upsertBook('', { barcode: '4710088410016', barcode_format: 'ean_13', title: '約書旅手帳', price: 180, qty: 3 });
  assert.ok(created);
  assert.equal(item.barcode, '4710088410016'); assert.equal(item.barcode_format, 'ean13'); assert.equal(item.isbn, '');
  assert.equal(item.zh, '約書旅手帳'); assert.equal(item.price, 180); assert.equal(item.stock_left, 3);
  // 寫回去的菜單 JSON 重新讀取後欄位還在（normalizeItem 不能吃掉）
  const back = books.listBooks(json)[0];
  assert.equal(back.barcode, '4710088410016'); assert.equal(back.barcode_format, 'ean13');
  assert.deepEqual(books.booksCsv([back])[1].slice(0, 4), ['4710088410016', 'EAN-13', '', '約書旅手帳']);
});

test('再掃同一條碼：直接帶出已存資料、加本數，不重複建立', () => {
  let { json, item } = books.upsertBook('', { barcode: 'RB-0001', barcode_format: 'code_128', title: '店內選書', price: 250, qty: 1 });
  const id = item.id;
  const found = books.findBook(json, books.parseBarcode({ barcode: ' RB-0001 ', format: 'code_128' }));
  assert.equal(found?.id, id); assert.equal(found.zh, '店內選書'); assert.equal(found.price, 250);
  ({ json, item } = books.upsertBook(json, { barcode: 'RB-0001', barcode_format: 'code_128', price: 250 }));   // 再掃：不用再填書名
  assert.equal(item.id, id); assert.equal(item.stock_left, 2); assert.equal(books.listBooks(json).length, 1);
  // ISBN-10 與 ISBN-13 是同一本
  ({ json } = books.upsertBook(json, { barcode: '9780262033848', title: 'Algorithms', price: 900 }));
  ({ json, item } = books.upsertBook(json, { barcode: '0262033844', price: 900 }));
  assert.equal(item.stock_left, 2); assert.equal(books.listBooks(json).length, 2);
  // 附碼不同仍是同一本書（索引不含附碼）
  ({ json, item } = books.upsertBook(json, { barcode: '978026203384851599', price: 900 }));
  assert.equal(item.stock_left, 3); assert.equal(books.listBooks(json).length, 2);
});

test('舊資料（只有 isbn、沒有 barcode）：用 isbn 找得到，存檔時補上條碼索引', () => {
  const legacy = MenuLib.normalizeItem({ id: 'bk_old', venue: 'REST', cat: 'BOOK', zh: '原子習慣', price: 330, published: true, isbn: '9789861755267', stock_left: 1 });
  delete legacy.barcode; delete legacy.barcode_format;
  const json = JSON.stringify({ items: [legacy] });
  assert.equal(books.findBook(json, books.parseBarcode({ isbn: '978-986-175-526-7' })).id, 'bk_old');
  const out = books.upsertBook(json, { isbn: '9789861755267', price: 330 });
  assert.equal(out.created, false); assert.equal(out.item.stock_left, 2);
  assert.equal(out.item.barcode, '9789861755267'); assert.equal(out.item.barcode_format, 'isbn13');
  // 舊 normalizeItem 讀到只有 isbn 的資料也會給 barcode
  assert.equal(MenuLib.normalizeItem({ venue: 'REST', cat: 'BOOK', zh: 'x', isbn: '9789861755267' }).barcode, '9789861755267');
});

test('編輯：可改條碼，但不能改成別本書的條碼', () => {
  let { json } = books.upsertBook('', { barcode: 'RB-0001', barcode_format: 'code_128', title: 'A', price: 100 });
  let b;
  ({ json, item: b } = books.upsertBook(json, { barcode: 'RB-0002', barcode_format: 'code_128', title: 'B', price: 100 }));
  assert.throws(() => books.upsertBook(json, { id: b.id, mode: 'set', barcode: 'RB-0001', barcode_format: 'code128', title: 'B', price: 100, qty: 1 }), /已是《A》/);
  ({ json, item: b } = books.upsertBook(json, { id: b.id, mode: 'set', barcode: 'RB-0003', barcode_format: 'code128', title: 'B2', price: 120, qty: 4 }));
  assert.equal(b.barcode, 'RB-0003'); assert.equal(b.zh, 'B2'); assert.equal(b.stock_left, 4);
  assert.throws(() => books.upsertBook(json, { id: 'bk_nope', mode: 'set', barcode: 'RB-0009', title: 'x', price: 1 }), /找不到/);
});

test('接線：查詢 API 接受 barcode／format，非 ISBN 不查書目；後台有手動補資料表單', () => {
  const server = read('server.js');
  assert.match(server, /bookCatalog\.parseBarcode\(\{barcode:req\.query\.barcode,isbn:req\.query\.isbn,format:req\.query\.format\}\)/);
  assert.match(server, /if\(!bc\.isbn\)return res\.set\('Cache-Control','no-store'\)\.json\(\{isbn:'',barcode,existing,book:existing\?null:\{found:false,manual:true\},retail:null\}\)/);
  const page = read('public/rest-book-admin.html');
  assert.match(page, /<script src="\/book-barcode\.js"><\/script>/);
  assert.match(page, /\/admin\/menu\/books\/lookup\?barcode=/);
  assert.match(page, /name="barcode"/); assert.match(page, /name="barcode_format"/);
  assert.match(page, /書名（必填）<input name="title" required/);
  assert.match(page, /name="price" type="number"/);
  assert.match(page, /請填書名。/); assert.match(page, /請填售價。/);
  assert.match(page, /下次掃同一條碼會直接帶出/);
});
