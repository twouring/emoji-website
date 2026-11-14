/* 約書旅書冊條碼解析（KK 11/11：不只 ISBN，常用書本條碼都要能掃；t_96b973b8）。瀏覽器與 Node 共用（UMD，掛在 globalThis.BookBarcode）。
   parse(raw, hint?) → { ok, format, raw, code, isbn, addon, price, price_currency, reference_price, error }
   - format：isbn13／isbn10／ean13／ean8／upca／itf／code128／code39／qr／text（hint 是相機或掃描槍回報的符號，例 ean_13、Code128、qr_code）
   - code：存檔用的條碼索引。ISBN 一律存 ISBN-13（舊書冊與 ISBN-10 掃到同一本）；EAN／UPC 存主碼（不含附碼）；其餘存原值（去頭尾空白）
   - isbn：是 ISBN 才有（13 碼）；有 isbn 走原本書目查詢，沒有就走手動補書名與價格
   - addon：EAN-13 後面的 2 或 5 碼附碼。2 碼是期數不是價格。5 碼依 GS1 EAN-5 慣例：0／1＝英鎊、3＝澳幣、4＝紐幣、5＝美元、6＝加幣（後四碼為分），
     90000＝無建議售價、99xxx 內部用途。附碼標的都是外幣，只放 reference_price＋price_currency 給後台顯示「參考定價」，
     不直接當成臺幣 POS 售價（與 KK 11/12「售價＝書本臺幣定價」、openBD 日圓定價的處理一致）。
     日本書第二條碼（192／191 開頭 EAN-13：192＋分類 4 碼＋稅前日圓 5 碼＋檢查碼）也拆出參考日圓定價。 */
(function (global) {
  'use strict';
  const HINT = {
    ean_13: 'ean13', ean13: 'ean13', 'ean-13': 'ean13', ean_8: 'ean8', ean8: 'ean8', 'ean-8': 'ean8',
    upc_a: 'upca', upca: 'upca', 'upc-a': 'upca', itf: 'itf', itf14: 'itf', 'itf-14': 'itf',
    code_128: 'code128', code128: 'code128', 'code-128': 'code128', code_39: 'code39', code39: 'code39', 'code-39': 'code39',
    qr_code: 'qr', qrcode: 'qr', qr: 'qr',
  };
  const LABEL = { isbn13: 'ISBN-13', isbn10: 'ISBN-10', ean13: 'EAN-13', ean8: 'EAN-8', upca: 'UPC-A', itf: 'ITF', code128: 'Code 128', code39: 'Code 39', qr: 'QR Code', text: '其他／手動輸入' };
  const FORMATS = Object.keys(LABEL);
  const ADDON_CURRENCY = { 0: 'GBP', 1: 'GBP', 3: 'AUD', 4: 'NZD', 5: 'USD', 6: 'CAD' };
  const MAX_LEN = 200;

  // GS1 mod-10：EAN-13／EAN-8／UPC-A／ITF-14 都是「由右往左、檢查碼左邊那位權重 3」
  function gs1Ok(d) {
    if (!/^\d+$/.test(d) || d.length < 2) return false;
    const body = d.slice(0, -1);
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - sum % 10) % 10 === Number(d[d.length - 1]);
  }
  function isbn10Ok(s) { return /^\d{9}[\dX]$/.test(s) && [...s].reduce((a, c, i) => a + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0; }
  function isbn10to13(s) { const b = '978' + s.slice(0, 9); let sum = 0; for (let i = 0; i < 12; i++) sum += Number(b[i]) * (i % 2 ? 3 : 1); return b + (10 - sum % 10) % 10; }
  function normHint(h) { return HINT[String(h || '').trim().toLowerCase().replace(/\s+/g, '_')] || ''; }

  function addonPrice(addon) {
    if (!/^\d{5}$/.test(addon)) return {};
    const lead = Number(addon[0]), rest = Number(addon.slice(1));
    if (lead === 9 || addon === '00000') return {};   // 90000＝無建議售價，99xxx 為內部用途
    const cur = ADDON_CURRENCY[lead];
    if (!cur) return {};
    return rest > 0 ? { reference_price: rest / 100, price_currency: cur } : {};
  }
  function result(o) { return Object.assign({ ok: true, format: '', raw: '', code: '', isbn: '', addon: '', price: 0, price_currency: '', reference_price: 0, error: '' }, o); }
  function fail(raw, error, format = '') { return result({ ok: false, raw, format, error }); }

  function parse(input, hint) {
    const raw = String(input == null ? '' : input).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim();   // 去控制字元（掃描槍 GS 分隔、換行）
    if (!raw) return fail('', '請掃描或輸入條碼。');
    if (raw.length > MAX_LEN) return fail(raw.slice(0, MAX_LEN), `條碼太長（上限 ${MAX_LEN} 字）。`);
    const sym = normHint(hint);
    const generic = sym === 'code128' || sym === 'code39' || sym === 'qr';

    // 1) EAN-13（可帶 2／5 碼附碼：掃描槍常直接接在後面成 15／18 碼，或用空白／+ 分開）
    const ean = /^(\d{13})(?:[\s+-]*(\d{5}|\d{2}))?$/.exec(raw.replace(/-(?=\d)/g, ''));
    if (ean && (!generic || gs1Ok(ean[1]))) {
      const main = ean[1], addon = ean[2] || '';
      if (!gs1Ok(main)) return fail(raw, `條碼 ${main} 檢查碼不對，請再掃一次或核對號碼。`, /^97[89]/.test(main) ? 'isbn13' : 'ean13');
      if (/^97[89]/.test(main)) return result({ format: 'isbn13', raw, code: main, isbn: main, addon, ...addonPrice(addon) });
      // 0 開頭的 EAN-13 就是 UPC-A（GS1）：掃描槍／zxing 常把 UPC-A 送成 13 碼，索引一律存 12 碼，相機與掃描槍才會對到同一本
      if (main[0] === '0') return result({ format: 'upca', raw, code: main.slice(1), addon, ...addonPrice(addon) });
      const jp = /^19[12]\d{4}(\d{5})\d$/.exec(main);   // 日本書籍 JAN 第二段（價格碼）
      if (jp) return result({ format: 'ean13', raw, code: main, addon, reference_price: Number(jp[1]), price_currency: 'JPY' });
      return result({ format: 'ean13', raw, code: main, addon, ...addonPrice(addon) });
    }
    const compact = raw.replace(/[\s-]/g, '').toUpperCase();
    if (!generic) {
      // 2) ISBN-10（手動輸入或舊書背）
      if (/^\d{9}[\dX]$/.test(compact)) {
        if (!isbn10Ok(compact)) return fail(raw, `ISBN-10 ${compact} 檢查碼不對，請核對號碼。`, 'isbn10');
        const isbn = isbn10to13(compact);
        return result({ format: 'isbn10', raw, code: isbn, isbn });
      }
      // 3) UPC-A 12 碼（美國書常見；Bookland UPC 不含 ISBN，視為一般條碼）
      if (/^\d{12}$/.test(compact) && sym !== 'itf') {
        if (!gs1Ok(compact)) return fail(raw, `UPC-A ${compact} 檢查碼不對，請再掃一次。`, 'upca');
        return result({ format: 'upca', raw, code: compact });
      }
      // 4) EAN-8
      if (/^\d{8}$/.test(compact) && sym !== 'itf' && (sym === 'ean8' || gs1Ok(compact))) {
        if (!gs1Ok(compact)) return fail(raw, `EAN-8 ${compact} 檢查碼不對，請再掃一次。`, 'ean8');
        return result({ format: 'ean8', raw, code: compact });
      }
      // 5) ITF（交錯式 2 of 5：偶數位數字；14 碼為 GTIN-14 要驗檢查碼）
      if (sym === 'itf' || (/^\d{14}$/.test(compact))) {
        if (!/^\d+$/.test(compact) || compact.length % 2) return fail(raw, 'ITF 條碼只能是偶數位數字。', 'itf');
        if (compact.length === 14 && !gs1Ok(compact)) return fail(raw, `ITF-14 ${compact} 檢查碼不對，請再掃一次。`, 'itf');
        return result({ format: 'itf', raw, code: compact });
      }
    }
    // 6) Code 128／Code 39／QR／其他：QR 或文字裡帶 ISBN（例 ISBN:978…、網址 ?isbn=978…）就當 ISBN；否則原值當索引
    const hit = /(?:^|[^\d])(97[89](?:[\s-]?\d){10})(?!\d)/.exec(raw);
    if (hit) { const d = hit[1].replace(/[\s-]/g, ''); if (gs1Ok(d)) return result({ format: sym || 'text', raw, code: d, isbn: d }); }
    if (sym === 'code39' && !/^[0-9A-Z \-.$/+%*]+$/.test(raw.toUpperCase())) return fail(raw, 'Code 39 只能有大寫英數與 - . $ / + % 空白。', 'code39');
    const code = (sym === 'code39' ? raw.toUpperCase() : raw).replace(/\s+/g, ' ');
    if (code.length < 3) return fail(raw, '條碼太短（至少 3 碼）。', sym || 'text');
    return result({ format: sym || 'text', raw, code });
  }
  /* 存檔用：把使用者送來的條碼值正規化成同一個索引（後台送 code，舊資料只有 isbn） */
  function indexKey(value, hint) { const p = parse(value, hint); return p.ok ? p.code : ''; }

  global.BookBarcode = { parse, indexKey, gs1Ok, isbn10Ok, isbn10to13, addonPrice, FORMATS, LABEL, MAX_LEN };
})(typeof window !== 'undefined' ? window : globalThis);
