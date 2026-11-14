/* 書本條碼正規化（約書旅書冊後台，KK 11/11 要「常用書本條碼都能掃」）
 * 瀏覽器：window.BarcodeNormalize；Node：require('./public/barcode-normalize.js')
 *
 * normalizeBarcode(raw, { format }) → { format, raw, code, valid, error?, isbn?, isbn10?, addon?, price? }
 *   format：isbn_13｜isbn_10｜ean_13｜ean_8｜upc_a｜code_128｜code_39｜itf｜qr_code｜unknown
 *     ─ 傳入 format（BarcodeDetector 的 'ean_13'、zxing 的 'EAN-13'／'Code39Std'…都可）時以它為準；
 *       掃描槍只送文字時依長度與檢查碼推斷。
 *   raw：原始字串（去頭尾空白）；code：主條碼的正規化值（EAN／UPC 只留數字，不含附碼）
 *   isbn：有效 ISBN 時的 13 碼（ISBN-10 會轉 13 碼；978／979 開頭，9790 是樂譜 ISMN 不算書號）
 *   addon：EAN／UPC 的 2 或 5 位附碼；price：附碼或日本書價碼（192／191）解得出的價格
 *     { currency: 'USD'|'GBP'|'AUD'|'NZD'|'CAD'|'JPY', amount, source: 'ean5'|'jp_price' }
 *     （EAN-5 沒有臺幣代碼；2 位附碼是期刊期數，不是價格）
 *   valid=false 時 error：empty｜too_long｜checksum｜charset
 */
(function (global) {
  'use strict';
  const MAX_LEN = 512;

  // GTIN 系列（EAN-8／UPC-A／EAN-13／ITF-14）共用 mod-10：由右往左（不含檢查碼）權重 3,1,3,1…
  function gtinCheckDigit(body) {
    let sum = 0;
    for (let i = body.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += Number(body[i]) * w;
    return (10 - (sum % 10)) % 10;
  }
  const gtinValid = d => /^\d{8,14}$/.test(d) && gtinCheckDigit(d.slice(0, -1)) === Number(d.at(-1));

  function isbn10Valid(s) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
    return sum % 11 === 0;
  }
  /* ISBN-10 → ISBN-13（不驗 ISBN-10 檢查碼的話傳 {check:false}） */
  function isbn10To13(s, { check = true } = {}) {
    s = String(s || '').replace(/[\s-]/g, '').toUpperCase();
    if (check ? !isbn10Valid(s) : !/^\d{9}[\dX]$/.test(s)) return '';
    const body = '978' + s.slice(0, 9);
    return body + gtinCheckDigit(body);
  }
  function isbn13To10(s) {
    if (!/^978\d{10}$/.test(s)) return '';   // 979 開頭沒有對應的 ISBN-10
    const body = s.slice(3, 12);
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(body[i]) * (10 - i);
    const c = (11 - (sum % 11)) % 11;
    return body + (c === 10 ? 'X' : String(c));
  }
  const isIsbnPrefix = d => /^97[89]/.test(d) && !d.startsWith('9790');

  /* EAN-5 書價附碼：首碼為幣別（GS1／Bookland 慣例），後四碼為金額（百分位） */
  const EAN5_CURRENCY = { 0: 'GBP', 1: 'GBP', 3: 'AUD', 4: 'NZD', 5: 'USD', 6: 'CAD' };
  function priceFromAddon(addon) {
    if (!addon || addon.length !== 5) return undefined;
    const currency = EAN5_CURRENCY[addon[0]];
    if (!currency) return undefined;        // 9xxxx：90000 無定價、99xxx 內部用；其他首碼沒有通用定義
    const amount = Number(addon.slice(1)) / 100;
    if (currency === 'USD' && amount === 99.99) return undefined; // 59999＝定價高於 99.98，未標示
    return { currency, amount, source: 'ean5' };
  }
  /* 日本書籍第二段條碼（書籍 JAN）：192 + Cコード 4 碼 + 本体價格 5 碼 + 檢查碼；191 為舊格式 */
  function priceFromJpBookCode(d) {
    if (!/^19[12]\d{10}$/.test(d)) return undefined;
    return { currency: 'JPY', amount: Number(d.slice(7, 12)), source: 'jp_price', c_code: d.slice(3, 7) };
  }

  /* 把各種 format 名稱（BarcodeDetector、zxing key／label）統一 */
  const FORMAT_ALIASES = {
    ean13: 'ean_13', ean8: 'ean_8', upca: 'upc_a', isbn: 'ean_13',
    code128: 'code_128', code39: 'code_39', code39std: 'code_39', code39standard: 'code_39', code39ext: 'code_39', code39extended: 'code_39',
    itf: 'itf', itf14: 'itf', qrcode: 'qr_code', qr: 'qr_code',
  };
  function canonicalFormat(f) {
    if (!f) return '';
    const k = String(f).toLowerCase().replace(/[^a-z0-9]/g, '');
    return FORMAT_ALIASES[k] || '';
  }

  function result(format, raw, code, extra = {}) {
    const r = { format, raw, code, valid: true };
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') r[k] = v;
    if (r.error) r.valid = false;
    return r;
  }

  /* EAN-13／UPC-A／EAN-8 主碼＋選用附碼（空白、-、+ 分隔或直接接在後面） */
  function splitAddon(digits, mainLen) {
    const m = digits.match(new RegExp('^(\\d{' + mainLen + '})(?:[\\s+-]*(\\d{2}|\\d{5}))?$'));
    return m ? { main: m[1], addon: m[2] || '' } : null;
  }
  function fromEan13(raw, main, addon) {
    // 0 開頭的 EAN-13 就是 UPC-A（zxing-wasm 同時開 EAN13／UPCA 時會回 13 碼 EAN13）
    if (main[0] === '0') return fromUpcA(raw, main.slice(1), addon);
    if (!gtinValid(main)) return result(isIsbnPrefix(main) ? 'isbn_13' : 'ean_13', raw, main, { addon, error: 'checksum' });
    const price = priceFromAddon(addon) || priceFromJpBookCode(main);
    if (isIsbnPrefix(main)) return result('isbn_13', raw, main, { isbn: main, isbn10: isbn13To10(main), addon, price });
    return result('ean_13', raw, main, { addon, price });
  }
  function fromUpcA(raw, main, addon) {
    if (!gtinValid(main)) return result('upc_a', raw, main, { addon, error: 'checksum' });
    return result('upc_a', raw, main, { addon, price: priceFromAddon(addon) });
  }
  function fromEan8(raw, main) {
    return result('ean_8', raw, main, gtinValid(main) ? {} : { error: 'checksum' });
  }

  /* Code 128／39／QR／未知文字裡夾帶的 ISBN（例如「ISBN 978-986-175-526-7」、網址參數 isbn=…）：有效才採用 */
  function embeddedIsbn(text) {
    const t = text.toUpperCase();
    for (const m of t.matchAll(/(?:^|[^0-9])(97[89](?:[\s-]?\d){10})(?![0-9])/g)) {
      const d = m[1].replace(/[\s-]/g, '');
      if (gtinValid(d) && isIsbnPrefix(d)) return d;
    }
    for (const m of t.matchAll(/ISBN(?:-?10)?[:\s]*((?:\d[\s-]?){9}[\dX])(?![0-9X])/g)) {
      const s = m[1].replace(/[\s-]/g, '');
      if (isbn10Valid(s)) return isbn10To13(s);
    }
    return '';
  }

  const CODE39_RE = /^[0-9A-Z \-.$/+%]+$/;

  function normalizeBarcode(input, { format } = {}) {
    const raw = String(input ?? '').replace(/[\r\n]+$/g, '').trim();
    const hint = canonicalFormat(format);
    if (!raw) return result(hint || 'unknown', raw, '', { error: 'empty' });
    if (raw.length > MAX_LEN) return result(hint || 'unknown', raw, '', { error: 'too_long' });
    const compact = raw.replace(/[\s-]/g, '').toUpperCase();

    if (hint === 'ean_13' || hint === 'upc_a' || hint === 'ean_8') {
      const digits = raw.replace(/[^\d+\s-]/g, '').trim();
      if (!/^[\d\s+-]+$/.test(raw)) return result(hint, raw, '', { error: 'charset' });
      const len = hint === 'ean_13' ? 13 : hint === 'upc_a' ? 12 : 8;
      const parts = splitAddon(digits.replace(/^[\s+-]+/, ''), len);
      if (!parts) return result(hint, raw, digits.replace(/\D/g, ''), { error: 'checksum' });
      if (hint === 'ean_13') return fromEan13(raw, parts.main, parts.addon);
      if (hint === 'upc_a') return fromUpcA(raw, parts.main, parts.addon);
      return fromEan8(raw, parts.main);
    }

    if (hint === 'itf') {
      const d = raw.replace(/\s/g, '');
      if (!/^\d+$/.test(d) || d.length % 2) return result('itf', raw, d, { error: 'charset' });  // ITF 一定是偶數位數字
      if (d.length === 14 && !gtinValid(d)) return result('itf', raw, d, { error: 'checksum' }); // ITF-14＝GTIN-14
      return result('itf', raw, d);
    }

    if (hint === 'code_39') {
      const v = raw.replace(/^\*|\*$/g, '').toUpperCase();   // 有些掃描槍會連起止字元 * 一起送
      if (!CODE39_RE.test(v)) return result('code_39', raw, v, { error: 'charset' });
      return result('code_39', raw, v, { isbn: embeddedIsbn(v) });
    }

    if (hint === 'code_128' || hint === 'qr_code') {
      const v = raw.replace(/[\x00-\x1f\x7f]/g, ' ').trim();   // FNC1／GS 等控制字元換成空白
      const isbn = embeddedIsbn(v) || (isbn10Valid(compact) ? isbn10To13(compact) : '');
      return result(hint, raw, v, { isbn });
    }

    /* 沒有格式提示（掃描槍鍵盤輸入、手動輸入）：依內容推斷 */
    if (/^\d{9}[\dX]$/.test(compact)) {                        // ISBN-10
      if (isbn10Valid(compact)) return result('isbn_10', raw, compact, { isbn: isbn10To13(compact), isbn10: compact });
      return result('isbn_10', raw, compact, { error: 'checksum' });
    }
    if (/^\d+(?:[\s+-]+\d+)*$/.test(raw)) {
      const groups = raw.split(/[\s+-]+/), d = groups.join('');
      const byMain = (main, addon) => main.length === 13 ? fromEan13(raw, main, addon) : main.length === 12 ? fromUpcA(raw, main, addon) : fromEan8(raw, main);
      // 明確分隔的附碼：最後一段 2／5 碼、前面合起來 8／12／13 碼（例「9789861755267 51200」「978-986-175-526-7+51200」）
      const last = groups.at(-1), head = groups.slice(0, -1).join('');
      if (groups.length > 1 && (last.length === 2 || last.length === 5) && [12, 13].includes(head.length)) return byMain(head, last);
      // 沒分隔：依總長度
      if (d.length === 13 || d.length === 12 || d.length === 8) return byMain(d, '');
      if (d.length === 15 || d.length === 18) return fromEan13(raw, d.slice(0, 13), d.slice(13));
      if (d.length === 17) return fromUpcA(raw, d.slice(0, 12), d.slice(12));
      if (d.length === 14) {                                     // ITF-14（GTIN-14）或 UPC-A + 2 位附碼
        if (gtinValid(d)) return result('itf', raw, d);
        if (gtinValid(d.slice(0, 12))) return fromUpcA(raw, d.slice(0, 12), d.slice(12));
        return result('itf', raw, d, { error: 'checksum' });
      }
      if (d.length % 2 === 0) return result('itf', raw, d);     // 其他偶數位純數字：ITF（非 14 碼不帶檢查碼）
    }
    const v = raw.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
    return result('unknown', raw, v, { isbn: embeddedIsbn(v) });
  }

  const api = { normalizeBarcode, canonicalFormat, gtinCheckDigit, gtinValid, isbn10Valid, isbn10To13, isbn13To10, priceFromAddon, priceFromJpBookCode,
    // 相機要開的格式（BarcodeDetector 名稱／zxing-wasm 名稱）
    DETECTOR_FORMATS: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'code_39', 'itf', 'qr_code'],
    ZXING_FORMATS: ['EAN13', 'EAN8', 'UPCA', 'Code128', 'Code39Std', 'ITF', 'QRCode'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BarcodeNormalize = api;
})(typeof window !== 'undefined' ? window : globalThis);
