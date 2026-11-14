'use strict';
/* 約書旅書籍造冊（KK 11/11）：後台／POS 掃書背 ISBN → 查書目與定價 → 寫成菜單品項（venue REST、cat BOOK），
   約書旅 POS 直接列出、客人買得到。書目來源依序：國家圖書館 ISBN 書號中心（臺灣出版品，有定價）→ Google Books（外文書，無定價）。
   純函式與查詢放這裡，DB 與路由在 server.js。 */
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;

const NCL = 'https://isbn.ncl.edu.tw/NEW_ISBNNet/';
const UA = 'Mozilla/5.0 (emoji.tw Rest Book catalog)';
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const decode = s => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, ' ').trim();

/* ---- 國圖書號中心：簡易查詢 → 結果清單 → 第一筆明細頁（同一組 cookie） ---- */
function cookieJar() {
  const jar = new Map();
  return {
    take(res) { for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); } },
    header() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); },
  };
}
async function nclFetch(fetchImpl, jar, url, init = {}) {
  let res, target = url;
  for (let hop = 0; hop < 5; hop++) {   // 自己跟轉址，才能把每一跳的 cookie 帶上
    res = await fetchImpl(target, { ...init, redirect: 'manual', headers: { 'user-agent': UA, cookie: jar.header(), ...(init.headers || {}) }, signal: AbortSignal.timeout(12000) });
    jar.take(res);
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { target = new URL(loc, target).toString(); init = { method: 'GET' }; continue; }
    break;
  }
  return await res.text();
}
/* 明細頁 → 書目欄位。表格是「<td aria-label=欄名>欄名</td><td>值</td>」與「<td aria-label=定價 ...>NT$330</td>」兩種 */
function parseNclRecord(html, isbn) {
  const field = name => { const m = new RegExp(`<td[^>]*aria-label="${name}"[^>]*>\\s*${name}\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`).exec(html); return m ? decode(m[1]) : ''; };
  const cell = name => { const m = new RegExp(`<td[^>]*aria-label="${name}"[^>]*data-th[^>]*>([\\s\\S]*?)</td>`).exec(html); return m ? decode(m[1]) : ''; };
  const title = field('書名');
  if (!title) return null;
  const priceText = cell('定價');
  const pm = /NT\$\s*([\d,]+)/i.exec(priceText) || /([\d,]+)\s*元/.exec(priceText);
  const isbnCell = cell('ISBN\\(裝訂方式\\)');
  if (isbn && isbnCell && !isbnCell.replace(/-/g, '').includes(isbn)) return null;   // 結果不是這本（多版本時第一筆可能是別的 ISBN）
  const roc = /^(\d{2,3})\/(\d{1,2})$/.exec(cell('出版年月'));
  return {
    isbn, title: title.replace(/\s*=\s*.+$/, '').slice(0, 120), title_full: title.slice(0, 300),
    author: field('作者').slice(0, 200), publisher: field('出版機構').slice(0, 120),
    list_price: pm ? Number(pm[1].replace(/,/g, '')) : 0,
    pub_date: roc ? `${Number(roc[1]) + 1911}-${String(roc[2]).padStart(2, '0')}` : '',
    binding: (/\(([^)]+)\)/.exec(isbnCell) || [])[1] || '',
    source: 'ncl',
  };
}
async function lookupNcl(isbn, fetchImpl = fetch) {
  const jar = cookieJar();
  const home = await nclFetch(fetchImpl, jar, NCL);
  const token = (/id="csrftoken" name="csrftoken" value="([^"]+)"/.exec(home) || [])[1];
  if (!token) throw bad('國圖書號中心暫時無法查詢。', 502);
  const body = new URLSearchParams({ FO_SchRe1ation0: 'Null', FB_clicked: 'FB_開始查詢', FB_pageSID: 'Simple', FO_Match: '2', 'FO_每頁筆數': '10', 'FO_目前頁數': '1', 'FO_資料排序': 'PubMonth_Pre DESC', FB_ListOri: '', FO_SearchField0: 'ISBN', FO_SearchValue0: isbn, csrftoken: token });
  const list = await nclFetch(fetchImpl, jar, NCL + 'H30_SearchBooks.php?Pact=DisplayAll4Simple', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const n = /找到\s*(\d+)\s*筆/.exec(decode(list));
  if (!n || n[1] === '0') return null;
  for (let i = 1; i <= Math.min(5, Number(n[1])); i++) {
    const rec = parseNclRecord(await nclFetch(fetchImpl, jar, `${NCL}main_DisplayRecord.php?&Pact=init&Pstart=${i}`), isbn);
    if (rec) return rec;
  }
  return null;
}
/* ---- openBD：日本出版流通書誌，公開 ISBN JSON API，常含日圓定價 ---- */
function parseOpenBdRecord(payload, isbn) {
  const r = Array.isArray(payload) ? payload.find(Boolean) : null;
  if (!r) return null;
  const summary = r.summary || {}, onix = r.onix || {};
  const detail = onix.DescriptiveDetail || {}, publishing = onix.PublishingDetail || {}, supply = onix.ProductSupply?.SupplyDetail || {};
  const contributors = Array.isArray(detail.Contributor) ? detail.Contributor : [];
  const author = contributors.map(x => x.PersonName || x.PersonNameInverted || x.CorporateName || '').filter(Boolean).join('、');
  const imprint = Array.isArray(publishing.Imprint) ? publishing.Imprint[0]?.ImprintName : publishing.Imprint?.ImprintName;
  const prices = Array.isArray(supply.Price) ? supply.Price : supply.Price ? [supply.Price] : [];
  const price = prices.map(x => Number(x.PriceAmount)).find(x => Number.isFinite(x) && x >= 0) || 0;
  const dates = Array.isArray(publishing.PublishingDate) ? publishing.PublishingDate : [];
  const date = summary.pubdate || dates[0]?.Date || '';
  const title = summary.title || detail.TitleDetail?.TitleElement?.TitleText || '';
  if (!title) return null;
  return {
    isbn, title: String(title).slice(0, 120), title_full: String(title).slice(0, 300),
    author: String(author).slice(0, 200), publisher: String(summary.publisher || imprint || '').slice(0, 120),
    list_price: 0, reference_price: price, reference_currency: price ? 'JPY' : '', pub_date: String(date).replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3').slice(0, 10), binding: '', source: 'openbd',
    image: String(summary.cover || '').replace(/^http:/, 'https:'),
  };
}
async function lookupOpenBd(isbn, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return parseOpenBdRecord(await res.json(), isbn);
}
/* ---- 國立國會圖書館 NDL Search：日本 ISBN 補查，官方 SRU 介面回傳 XML ---- */
function xmlText(xml, tag) {
  const m = new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)</[^>]*:?${tag}>`, 'i').exec(xml);
  return m ? decode(m[1]) : '';
}
function parseNdlRecord(xml, isbn) {
  const title = xmlText(xml, 'title');
  if (!title) return null;
  const rawPrice = xmlText(xml, 'price') || xmlText(xml, 'description');
  const pm = /(?:¥|￥|\\\\|円)\\s*([\\d,]+)/.exec(rawPrice);
  return {
    isbn, title: title.slice(0, 120), title_full: title.slice(0, 300),
    author: xmlText(xml, 'creator').slice(0, 200), publisher: xmlText(xml, 'publisher').slice(0, 120),
    list_price: pm ? Number(pm[1].replace(/,/g, '')) : 0, pub_date: xmlText(xml, 'date').slice(0, 10), binding: '', source: 'ndl',
  };
}
async function lookupNdl(isbn, fetchImpl = fetch) {
  const query = encodeURIComponent(`isbn=${isbn}`);
  const res = await fetchImpl(`https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&version=1.2&recordSchema=dcndl_v3&maximumRecords=1&query=${query}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  return parseNdlRecord(await res.text(), isbn);
}
/* ---- Google Books（跨國最後補查）：沒有臺灣定價，只帶書名作者出版社 ---- */
async function lookupGoogle(isbn, fetchImpl = fetch, key = process.env.GOOGLE_BOOKS_API_KEY) {
  const res = await fetchImpl(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${key ? '&key=' + encodeURIComponent(key) : ''}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const v = (await res.json()).items?.[0]?.volumeInfo;
  if (!v || !v.title) return null;
  return {
    isbn, title: [v.title, v.subtitle].filter(Boolean).join('：').slice(0, 120), title_full: v.title,
    author: (v.authors || []).join('、').slice(0, 200), publisher: String(v.publisher || '').slice(0, 120),
    list_price: 0, pub_date: String(v.publishedDate || '').slice(0, 7), binding: '', source: 'google',
    image: String(v.imageLinks?.thumbnail || '').replace(/^http:/, 'https:'),
  };
}
async function lookupIsbn(raw, { fetchImpl = fetch } = {}) {
  const isbn = MenuLib.normalizeIsbn(raw);
  if (!isbn) throw bad('ISBN 格式不正確（要 13 碼 978／979 開頭，或 10 碼）。');
  const errors = [];
  for (const fn of [lookupNcl, lookupOpenBd, lookupNdl, lookupGoogle]) {
    try { const r = await fn(isbn, fetchImpl); if (r) return r; } catch (e) { errors.push(e.message); }
  }
  return { isbn, found: false, errors };
}

/* ---- 條碼（t_96b973b8）：ISBN 以外的書本條碼也能造冊；條碼值（BookBarcode.code）是書冊索引 ---- */
require('../public/book-barcode.js');
const BookBarcode = globalThis.BookBarcode;
/* 送來的 barcode／isbn → 解析結果；格式錯（含檢查碼錯）丟 400 */
function parseBarcode(body = {}) {
  const value = body.barcode != null && String(body.barcode).trim() !== '' ? body.barcode : body.isbn;
  const p = BookBarcode.parse(value, body.barcode_format || body.format);
  if (!p.ok) throw bad(p.error);
  return p;
}
const barcodeOf = b => b.barcode || b.isbn || '';
/* 依條碼找已在冊的書：條碼相同，或同一個 ISBN（舊資料只有 isbn） */
function findBook(menuJson, p) {
  return listBooks(menuJson).find(b => barcodeOf(b) === p.code || (p.isbn && b.isbn === p.isbn)) || null;
}

/* ---- 造冊：同條碼已在冊就加本數（可改價），否則新增一筆約書旅書籍品項 ---- */
const uidBook = () => 'bk_' + Math.random().toString(36).slice(2, 10);
const clean = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);
function upsertBook(menuJson, body = {}) {
  const bc = parseBarcode(body);
  const isbn = bc.isbn;
  const rawPrice = body.price;
  if (rawPrice === undefined || rawPrice === null || String(rawPrice).trim() === '') throw bad('請填售價。');
  if (!/^\d+(\.0+)?$/.test(String(rawPrice).trim())) throw bad('售價只能填 0–100000 的整數。');
  const price = Math.floor(Number(rawPrice));
  if (!(price >= 0 && price <= 100000)) throw bad('售價請填 0–100000。');
  const qty = body.qty === undefined || body.qty === '' ? 1 : Math.floor(Number(body.qty));
  if (!(qty >= 0 && qty <= 999)) throw bad('本數請填 0–999。');
  if (body.list_price !== undefined && body.list_price !== '' && !(Number(body.list_price) >= 0 && Number(body.list_price) <= 100000)) throw bad('定價請填 0–100000。');
  const doc = MenuLib.parseMenuDoc(menuJson || '');
  // 編輯（mode=set）帶 id：允許改條碼，但不能改成別本書已用的條碼
  let it = body.id ? doc.items.find(x => MenuLib.isBook(x) && x.id === body.id) : null;
  if (body.id && !it) throw bad('找不到這本書。', 404);
  const clash = doc.items.find(x => MenuLib.isBook(x) && x !== it && (barcodeOf(x) === bc.code || (isbn && x.isbn === isbn)));
  if (it && clash) throw bad(`條碼 ${bc.code} 已是《${clash.zh}》的條碼。`, 409);
  if (!it) it = clash || null;
  const created = !it;
  if (it) {
    const mode = body.mode === 'set' ? 'set' : 'add';   // add＝再掃一本（加本數）；set＝編輯時直接改成這個本數
    it.stock_left = Math.min(MenuLib.STOCK_MAX, (mode === 'set' ? 0 : (it.stock_left || 0)) + qty);
    it.price = price;
    for (const k of ['author', 'publisher']) if (body[k] !== undefined) it[k] = clean(body[k], k === 'author' ? 200 : 120);
    if (body.title) it.zh = clean(body.title, 120);
    if (body.list_price !== undefined) it.list_price = Math.max(0, Math.floor(Number(body.list_price)) || 0);
    if (body.published !== undefined) it.published = body.published !== false;
    if (!it.barcode || body.id) { it.barcode = bc.code; it.barcode_format = bc.format; if (isbn) it.isbn = isbn; else if (body.id) it.isbn = ''; }   // 舊資料補上條碼索引；編輯可改條碼
  } else {
    const zh = clean(body.title, 120);
    if (!zh) throw bad('請填書名。');
    it = MenuLib.normalizeItem({
      id: uidBook(), venue: 'REST', cat: 'BOOK', zh, price, emo: 0, published: body.published !== false,
      isbn, barcode: bc.code, barcode_format: bc.format, author: clean(body.author, 200), publisher: clean(body.publisher, 120),
      list_price: Math.max(0, Math.floor(Number(body.list_price)) || 0), pub_date: clean(body.pub_date, 20),
      image: /^https:\/\//.test(String(body.image || '')) ? String(body.image) : '',
      stock_left: Math.min(MenuLib.STOCK_MAX, qty),
      sort: (doc.items.filter(MenuLib.isBook).reduce((a, x) => Math.max(a, x.sort || 0), 0)) + 10,
    });
    doc.items.push(it);
  }
  const v = MenuLib.validateDoc(doc);
  if (!v.ok) throw bad(v.error);
  return { json: MenuLib.stringifyDoc(MenuLib.touch(doc)), item: it, created };
}
function removeBook(menuJson, id) {
  const doc = MenuLib.parseMenuDoc(menuJson || '');
  const i = doc.items.findIndex(x => x.id === id && MenuLib.isBook(x));
  if (i < 0) throw bad('找不到這本書。', 404);
  doc.items.splice(i, 1);
  return MenuLib.stringifyDoc(MenuLib.touch(doc));
}
function listBooks(menuJson) {
  return MenuLib.sortItems(MenuLib.parseMenuDoc(menuJson || '').items.filter(MenuLib.isBook));
}
/* 書冊匯出（CSV 列） */
function booksCsv(books) {
  return [['條碼', '條碼格式', 'ISBN', '書名', '作者', '出版社', '定價', '售價', '庫存', '上架']]
    .concat(books.map(b => [barcodeOf(b), BookBarcode.LABEL[b.barcode_format] || b.barcode_format || '', b.isbn, b.zh, b.author, b.publisher, b.list_price, b.price, b.stock_left ?? '', b.published ? '是' : '否']));
}

module.exports = { parseBarcode, findBook, BookBarcode, lookupIsbn, lookupNcl, lookupOpenBd, lookupNdl, lookupGoogle, parseNclRecord, parseOpenBdRecord, parseNdlRecord, upsertBook, removeBook, listBooks, booksCsv };
