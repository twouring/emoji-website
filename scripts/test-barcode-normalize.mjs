// 書本條碼正規化（public/barcode-normalize.js）：ISBN-10／13、EAN-13（+2／+5 附碼）、UPC-A、EAN-8、Code 128、Code 39、ITF、QR
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const B = require('../public/barcode-normalize.js');
const N = (raw, format) => B.normalizeBarcode(raw, { format });

test('檢查碼工具：GTIN mod-10、ISBN-10 mod-11、10↔13 轉換', () => {
  assert.equal(B.gtinCheckDigit('978986175526'), 7);
  assert.equal(B.gtinCheckDigit('03600029145'), 2);   // UPC-A 036000291452
  assert.equal(B.gtinCheckDigit('9638507'), 4);       // EAN-8 96385074
  assert.ok(B.isbn10Valid('0306406152'));
  assert.ok(B.isbn10Valid('080442957X'));
  assert.ok(!B.isbn10Valid('0306406153'));
  assert.equal(B.isbn10To13('0-306-40615-2'), '9780306406157');
  assert.equal(B.isbn10To13('080442957X'), '9780804429573');
  assert.equal(B.isbn10To13('0306406153'), '');
  assert.equal(B.isbn13To10('9780306406157'), '0306406152');
  assert.equal(B.isbn13To10('9791234567896'), '', '979 沒有 ISBN-10');
});

test('ISBN-13：連字號／空白、相機格式提示、檢查碼錯', () => {
  assert.deepEqual(N('978-986-175-526-7'), { format: 'isbn_13', raw: '978-986-175-526-7', code: '9789861755267', valid: true, isbn: '9789861755267', isbn10: '9861755268' });
  assert.equal(N('9789861755267', 'ean_13').isbn, '9789861755267');   // BarcodeDetector
  assert.equal(N('9789861755267', 'EAN-13').isbn, '9789861755267');   // zxing-wasm label
  assert.equal(N('9789861755267', 'ISBN').format, 'isbn_13');
  const bad = N('9789861755260');
  assert.equal(bad.valid, false); assert.equal(bad.error, 'checksum'); assert.equal(bad.format, 'isbn_13'); assert.equal(bad.isbn, undefined);
  assert.equal(N('9790000000001').format, 'ean_13', '9790 是樂譜 ISMN，不當書號');
});

test('ISBN-10：轉 13 碼、X 檢查碼、檢查碼錯', () => {
  const r = N('0-306-40615-2');
  assert.equal(r.format, 'isbn_10'); assert.equal(r.isbn, '9780306406157'); assert.equal(r.isbn10, '0306406152');
  assert.equal(N('080442957x').isbn, '9780804429573');
  assert.deepEqual([N('0306406153').valid, N('0306406153').error], [false, 'checksum']);
});

test('EAN-13 + 5 位價格附碼：978／979 書號拆出附碼與幣別價格', () => {
  for (const raw of ['9780306406157 51299', '978-0-306-40615-7+51299', '978030640615751299']) {
    const r = N(raw);
    assert.equal(r.format, 'isbn_13', raw); assert.equal(r.code, '9780306406157', raw); assert.equal(r.isbn, '9780306406157');
    assert.equal(r.addon, '51299'); assert.deepEqual(r.price, { currency: 'USD', amount: 12.99, source: 'ean5' });
  }
  assert.deepEqual(N('9780306406157 50795', 'EAN-13').price, { currency: 'USD', amount: 7.95, source: 'ean5' });   // zxing eanAddOnSymbol:Read
  assert.deepEqual(N('9780306406157 00799').price, { currency: 'GBP', amount: 7.99, source: 'ean5' });
  assert.deepEqual(N('9780306406157 61500').price, { currency: 'CAD', amount: 15, source: 'ean5' });
  assert.equal(N('9780306406157 90000').price, undefined, '90000＝無定價');
  assert.equal(N('9780306406157 59999').price, undefined, '59999＝定價未標示');
  assert.equal(N('9780306406150 51299').error, 'checksum', '主碼檢查碼錯，附碼再對也不收');
});

test('EAN-13 + 2 位附碼（期刊期數，不是價格）與一般 EAN-13', () => {
  const r = N('4710088432018 05');
  assert.equal(r.valid, true); assert.equal(r.format, 'ean_13'); assert.equal(r.code, '4710088432018'); assert.equal(r.addon, '05'); assert.equal(r.price, undefined); assert.equal(r.isbn, undefined);
  assert.equal(N('471008843201805').addon, '05');
  assert.deepEqual([N('4710088432017').valid, N('4710088432017').error], [false, 'checksum']);
});

test('日本書籍第二段條碼（192 + Cコード + 本体價格）解出日圓定價', () => {
  const body = '192009301600'; const code = body + B.gtinCheckDigit(body);
  const r = N(code);
  assert.equal(r.format, 'ean_13'); assert.equal(r.isbn, undefined);
  assert.deepEqual(r.price, { currency: 'JPY', amount: 1600, source: 'jp_price', c_code: '0093' });
});

test('UPC-A（含 +5 附碼）與檢查碼錯', () => {
  assert.deepEqual(N('036000291452'), { format: 'upc_a', raw: '036000291452', code: '036000291452', valid: true });
  assert.equal(N('036000291452', 'upc_a').code, '036000291452');
  assert.equal(N('036000291452', 'UPC-A').format, 'upc_a');
  const a = N('036000291452 51499');
  assert.equal(a.format, 'upc_a'); assert.equal(a.addon, '51499'); assert.deepEqual(a.price, { currency: 'USD', amount: 14.99, source: 'ean5' });
  assert.equal(N('03600029145251499').addon, '51499');
  const z = N('0036000291452', 'EAN13');   // zxing-wasm 同時開 EAN13／UPCA 時，UPC-A 會被回報成 0 開頭的 EAN-13
  assert.equal(z.format, 'upc_a'); assert.equal(z.code, '036000291452');
  assert.equal(N('0036000291452').format, 'upc_a');
  assert.deepEqual([N('036000291453').valid, N('036000291453').error], [false, 'checksum']);
});

test('EAN-8 與檢查碼錯', () => {
  assert.deepEqual(N('96385074'), { format: 'ean_8', raw: '96385074', code: '96385074', valid: true });
  assert.equal(N('96385074', 'EAN-8').format, 'ean_8');
  assert.deepEqual([N('96385075').valid, N('96385075').error], [false, 'checksum']);
  assert.equal(N('9638507A', 'ean_8').error, 'charset');
});

test('Code 128：保留完整值、去控制字元、夾帶的 ISBN 會帶出', () => {
  const r = N('RB-SHELF-0042', 'code_128');
  assert.equal(r.format, 'code_128'); assert.equal(r.code, 'RB-SHELF-0042'); assert.equal(r.valid, true); assert.equal(r.isbn, undefined);
  assert.equal(N('ISBN 978-986-175-526-7', 'Code128').isbn, '9789861755267');
  assert.equal(N('ISBN 978-986-175-526-0', 'Code128').isbn, undefined, '夾帶的 ISBN 檢查碼錯就不採用');
  assert.equal(N('ISBN:0306406152', 'code_128').isbn, '9780306406157');
  assert.equal(N('\x1d01ABC', 'code_128').code, '01ABC');
});

test('Code 39：起止字元 *、大寫、字元集錯誤', () => {
  const r = N('*LIB-000123*', 'code_39');
  assert.equal(r.format, 'code_39'); assert.equal(r.code, 'LIB-000123'); assert.equal(r.valid, true);
  assert.equal(N('lib 42', 'Code39Std').code, 'LIB 42');
  assert.deepEqual([N('LIB#42', 'code_39').valid, N('LIB#42', 'code_39').error], [false, 'charset']);
});

test('ITF：偶數位數字、ITF-14 驗 GTIN 檢查碼、奇數位錯', () => {
  assert.deepEqual(N('10012345678902', 'itf'), { format: 'itf', raw: '10012345678902', code: '10012345678902', valid: true });
  assert.equal(N('10012345678902').format, 'itf', '掃描槍無格式提示：14 碼且 GTIN 檢查碼對 → ITF-14');
  assert.equal(N('10012345678903', 'ITF').error, 'checksum');
  assert.equal(N('1234567', 'itf').error, 'charset');
  assert.deepEqual(N('123456', 'itf'), { format: 'itf', raw: '123456', code: '123456', valid: true });
  assert.equal(N('123456').format, 'itf');
  assert.equal(N('03600029145205').format, 'upc_a', '14 碼但不是 GTIN-14 → UPC-A + 2');
});

test('QR：網址、ISBN 文字、純文字', () => {
  assert.equal(N('https://restbook.emoji.tw/b?isbn=9789861755267', 'qr_code').isbn, '9789861755267');
  assert.equal(N('urn:isbn:0306406152', 'QRCode').isbn, '9780306406157', 'URN 的 ISBN-10 轉 13 碼');
  const t = N('BOOK-CLUB-2026', 'qr_code');
  assert.equal(t.format, 'qr_code'); assert.equal(t.code, 'BOOK-CLUB-2026'); assert.equal(t.isbn, undefined);
});

test('空值、過長、未知格式', () => {
  assert.deepEqual([N('').valid, N('').error, N('   ').error], [false, 'empty', 'empty']);
  assert.equal(N(null).error, 'empty');
  assert.equal(N('A'.repeat(600)).error, 'too_long');
  const u = N('ABC-123');
  assert.equal(u.format, 'unknown'); assert.equal(u.code, 'ABC-123'); assert.equal(u.valid, true);
  assert.equal(B.canonicalFormat('Code 39 Standard'), 'code_39');
  assert.equal(B.canonicalFormat('pdf_417'), '');
});

test('後台接線：載入模組、相機開所有格式、非 ISBN 走手動補資料', () => {
  const page = fs.readFileSync(new URL('../public/rest-book-admin.html', import.meta.url), 'utf8');
  assert.match(page, /<script src="\/barcode-normalize\.js"><\/script>/);
  assert.match(page, /BarcodeNormalize\.DETECTOR_FORMATS/);
  assert.match(page, /formats: BarcodeNormalize\.ZXING_FORMATS, eanAddOnSymbol: 'Read'/);
  // 合併 t_96b973b8 後：非 ISBN 由 lookup 的 !isbn 分支開手動補資料草稿（manual:true），相機先經 BarcodeNormalize 統一格式再交 BookBarcode
  assert.match(page, /<script src="\/book-barcode\.js"><\/script>/);
  assert.match(page, /\} else if \(!isbn\) \{\s*DRAFT = \{ \.\.\.base, mode: 'new', manual: true/);
  assert.match(page, /BarcodeNormalize\.normalizeBarcode\(c\.rawValue, \{ format: c\.format \}\)/);
  assert.match(page, /lookup\(hit\.val, hit\.fmt\)/);
  assert.doesNotMatch(page, /formats: \['ean_13'\] \}\);\n/, '不再只開 EAN-13');
  for (const f of ['ean_13', 'ean_8', 'upc_a', 'code_128', 'code_39', 'itf', 'qr_code']) assert.ok(B.DETECTOR_FORMATS.includes(f), f);
  const zx = fs.readFileSync(new URL('../public/vendor/zxing-reader.js', import.meta.url), 'utf8').slice(0, 4000);
  for (const f of B.ZXING_FORMATS) assert.ok(zx.includes('[`' + f + '`'), 'zxing-wasm 支援 ' + f);
});
