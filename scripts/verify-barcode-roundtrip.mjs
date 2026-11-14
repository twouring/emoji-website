// 端對端：bwip-js 產生各格式條碼圖 → zxing-wasm（與後台同 API、同參數）解碼 → BarcodeNormalize 正規化
// 用法：node roundtrip.mjs <bcverify 安裝目錄> <barcode-normalize.js 路徑>
import { createRequire } from 'node:module';
import path from 'node:path';
const [, , depDir, normPath] = process.argv;
const require = createRequire(path.join(depDir, 'package.json'));
const bwip = require('bwip-js');
const zx = await import(require.resolve('zxing-wasm/reader'));
const B = createRequire(import.meta.url)(normPath);
// 用站上 public/vendor/zxing_reader.wasm（與後台相同的解碼器二進位）
const fs = await import('node:fs');
const wasmPath = path.join(path.dirname(normPath), 'vendor', 'zxing_reader.wasm');
const wasmBinary = fs.readFileSync(wasmPath);
await zx.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
console.log('wasm:', wasmPath, wasmBinary.length, 'bytes');

const cases = [
  ['ISBN-13', 'isbn', '978-986-175-526-7', 'isbn_13', { isbn: '9789861755267' }],
  ['ISBN-10 文字（掃描槍）', null, '0306406152', 'isbn_10', { isbn: '9780306406157' }],
  // 相機圖：主碼必須正確解出（zxing-wasm 3.1.x 實測不回附碼 → 附碼只在掃描槍文字路徑驗）
  ['EAN-13 + 5 附碼（相機）', 'ean13', '9780306406157 51299', 'isbn_13', { isbn: '9780306406157' }],
  ['EAN-13 + 2 附碼（相機）', 'ean13', '4710088432018 05', 'ean_13', {}],
  ['EAN-13 + 5 附碼（掃描槍文字）', null, '9780306406157 51299', 'isbn_13', { isbn: '9780306406157', addon: '51299', price: 12.99 }],
  ['EAN-13 + 2 附碼（掃描槍文字）', null, '471008843201805', 'ean_13', { addon: '05' }],
  ['EAN-13 一般', 'ean13', '4710088432018', 'ean_13', {}],
  ['UPC-A', 'upca', '036000291452', 'upc_a', {}],
  ['EAN-8', 'ean8', '96385074', 'ean_8', {}],
  ['Code 128', 'code128', 'RB-SHELF-0042', 'code_128', {}],
  ['Code 39', 'code39', 'LIB-000123', 'code_39', {}],
  ['ITF-14', 'itf14', '10012345678902', 'itf', {}],
  ['ITF', 'interleaved2of5', '12345678', 'itf', {}],
  ['QR（ISBN 網址）', 'qrcode', 'https://restbook.emoji.tw/b?isbn=9789861755267', 'qr_code', { isbn: '9789861755267' }],
  ['QR（文字）', 'qrcode', 'BOOK-CLUB-2026', 'qr_code', {}],
];
let fail = 0;
for (const [name, bcid, text, wantFmt, want] of cases) {
  let rawValue = text, fmt;
  if (bcid) {
    const png = await bwip.toBuffer({ bcid, text, scale: 3, height: 12, includetext: false, paddingwidth: 20, paddingheight: 20, backgroundcolor: 'FFFFFF' });
    const out = await zx.readBarcodes(new Blob([png], { type: 'image/png' }), { formats: B.ZXING_FORMATS, eanAddOnSymbol: 'Read', textMode: 'Plain', maxNumberOfSymbols: 1 });
    if (!out.length) { console.log('FAIL', name, '解不出'); fail++; continue; }
    rawValue = out[0].text; fmt = out[0].format;
  }
  const r = B.normalizeBarcode(rawValue, { format: fmt });
  const ok = r.valid && r.format === wantFmt && (!want.isbn || r.isbn === want.isbn) && (!want.addon || r.addon === want.addon) && (!want.price || r.price?.amount === want.price);
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(18), JSON.stringify({ zxing: fmt, rawValue }), '→', JSON.stringify(r));
}
// 檢查碼錯：掃描槍送錯碼
for (const bad of ['9789861755260', '0306406153', '036000291453', '96385075']) {
  const r = B.normalizeBarcode(bad); const ok = !r.valid && r.error === 'checksum'; if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', ('檢查碼錯 ' + bad).padEnd(18), JSON.stringify(r));
}
console.log(fail ? `FAILED ${fail}` : 'ALL OK');
process.exit(fail ? 1 : 0);
