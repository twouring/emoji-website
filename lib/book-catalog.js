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
/* ---- Google Books（外文書）：沒有臺灣定價，只帶書名作者出版社 ---- */
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
  for (const fn of [lookupNcl, lookupGoogle]) {
    try { const r = await fn(isbn, fetchImpl); if (r) return r; } catch (e) { errors.push(e.message); }
  }
  return { isbn, found: false, errors };
}

/* ---- 造冊：同 ISBN 已在冊就加本數（可改價），否則新增一筆約書旅書籍品項 ---- */
const uidBook = () => 'bk_' + Math.random().toString(36).slice(2, 10);
const clean = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').trim().slice(0, max);
function upsertBook(menuJson, body = {}) {
  const isbn = MenuLib.normalizeIsbn(body.isbn);
  if (!isbn) throw bad('ISBN 格式不正確。');
  const price = Math.floor(Number(body.price));
  if (!(price >= 0 && price <= 100000)) throw bad('售價請填 0–100000。');
  const qty = body.qty === undefined || body.qty === '' ? 1 : Math.floor(Number(body.qty));
  if (!(qty >= 0 && qty <= 999)) throw bad('本數請填 0–999。');
  const doc = MenuLib.parseMenuDoc(menuJson || '');
  let it = doc.items.find(x => MenuLib.isBook(x) && x.isbn === isbn);
  const created = !it;
  if (it) {
    const mode = body.mode === 'set' ? 'set' : 'add';   // add＝再掃一本（加本數）；set＝編輯時直接改成這個本數
    it.stock_left = Math.min(MenuLib.STOCK_MAX, (mode === 'set' ? 0 : (it.stock_left || 0)) + qty);
    it.price = price;
    for (const k of ['author', 'publisher']) if (body[k] !== undefined) it[k] = clean(body[k], k === 'author' ? 200 : 120);
    if (body.title) it.zh = clean(body.title, 120);
    if (body.list_price !== undefined) it.list_price = Math.max(0, Math.floor(Number(body.list_price)) || 0);
    if (body.published !== undefined) it.published = body.published !== false;
  } else {
    const zh = clean(body.title, 120);
    if (!zh) throw bad('請填書名。');
    it = MenuLib.normalizeItem({
      id: uidBook(), venue: 'REST', cat: 'BOOK', zh, price, emo: 0, published: body.published !== false,
      isbn, author: clean(body.author, 200), publisher: clean(body.publisher, 120),
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
  return [['ISBN', '書名', '作者', '出版社', '定價', '售價', '庫存', '上架']]
    .concat(books.map(b => [b.isbn, b.zh, b.author, b.publisher, b.list_price, b.price, b.stock_left ?? '', b.published ? '是' : '否']));
}

module.exports = { lookupIsbn, lookupNcl, lookupGoogle, parseNclRecord, upsertBook, removeBook, listBooks, booksCsv };
