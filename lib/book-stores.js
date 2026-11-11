'use strict';
/* 約書旅書店比價（KK 11/12）：同一個 ISBN 到臺灣各書店查「這本書現在賣多少、有沒有貨」，統一成一種格式回給後台。
   來源與做法（2026-11 實測）：
   - 誠品 eslite：站內搜尋的 JSON API（athena.eslite.com），有定價、售價、庫存數、紙本／電子書。
   - 金石堂 kingstone：搜尋結果頁 HTML，有特價、紙本／電子書。
   - 三民 sanmin：搜尋結果頁 HTML，有優惠價、折數、庫存、裝訂、出版日。
   - 讀冊 TAAZE：搜尋結果頁 HTML 的 data-* 屬性，有定價、售價、庫存旗標、新書／二手／電子書（伺服器憑證鏈缺中繼憑證，附 PEM）。
   - Yahoo 購物中心：用書名搜尋後，以 ec_filtertags 的「ISBN_<isbn>」比對，有定價、售價、庫存、自營／商城。
   - 博客來、讀墨 Readmoo、樂天 Kobo：Cloudflare／AWS WAF 擋程式查詢，只給站內搜尋連結（status 'blocked'）。
   只讀公開搜尋結果，每家一個請求、10 秒逾時、全部並行；結果快取 10 分鐘。純函式（parse*）可單獨測。 */
const https = require('node:https');
const http = require('node:http');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
require('../public/menu-lib.js');
const MenuLib = globalThis.MenuLib;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 emoji.tw-RestBook/1.0';
const TAAZE_CA = [...tls.rootCertificates, fs.readFileSync(path.join(__dirname, 'book-stores-taaze-ca.pem'), 'utf8')];
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
const unent = s => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const text = s => unent(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const formatOf = (title, binding = '') => /二手/.test(title) ? 'used' : /電子書|e-?book|epub|pdf/i.test(title + ' ' + binding) ? 'ebook' : 'paper';
const offer = o => ({
  title: String(o.title || '').slice(0, 160), format: o.format || 'paper',
  list_price: num(o.list_price), price: num(o.price), in_stock: o.in_stock === true ? true : o.in_stock === false ? false : null,
  url: String(o.url || ''), author: String(o.author || '').slice(0, 120), publisher: String(o.publisher || '').slice(0, 80),
  pub_date: String(o.pub_date || '').slice(0, 10), binding: String(o.binding || '').slice(0, 20), seller: String(o.seller || '').slice(0, 60),
});

/* ---- HTTP：用 node:https（部分站的 WAF 會擋 undici fetch 的指紋），跟轉址 3 次，支援 HTTPS_PROXY（本機測試用） ---- */
function tunnel(host) {
  const p = new URL(process.env.HTTPS_PROXY || process.env.https_proxy);
  return new Promise((res, rej) => {
    const r = http.request({ host: p.hostname, port: p.port || 3128, method: 'CONNECT', path: host + ':443' });
    r.on('connect', (_, socket) => res(socket)); r.on('error', rej); r.end();
  });
}
async function httpGet(url, { ca, timeout = 10000, hops = 0 } = {}) {
  const u = new URL(url);
  const socket = process.env.HTTPS_PROXY || process.env.https_proxy ? await tunnel(u.hostname) : undefined;
  const res = await new Promise((resolve, reject) => {
    const req = https.request({
      host: u.hostname, path: u.pathname + u.search, method: 'GET', servername: u.hostname, timeout,
      headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'zh-TW,zh;q=0.9' },
      ...(ca ? { ca } : {}), ...(socket ? { socket, agent: false } : {}),
    }, r => { let b = ''; r.setEncoding('utf8'); r.on('data', d => { b += d; }); r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: b })); });
    req.on('timeout', () => req.destroy(new Error('逾時'))); req.on('error', reject); req.end();
  });
  if (res.status >= 300 && res.status < 400 && res.headers.location && hops < 3) return httpGet(new URL(res.headers.location, url).toString(), { ca, timeout, hops: hops + 1 });
  return res;
}
const challenged = res => res.status === 403 || res.status === 202 || res.status === 429 || !!res.headers['cf-mitigated'] || !!res.headers['x-amzn-waf-action'];

/* ---- 誠品：JSON ---- */
function parseEslite(payload, isbn) {
  const hits = payload?.hits?.hit;
  if (!Array.isArray(hits)) return [];
  return hits.map(h => h.fields || {}).filter(f => f.isbn === isbn || f.ean === isbn).map(f => offer({
    title: f.name, format: f.is_ebook ? 'ebook' : 'paper', list_price: f.mprice, price: f.final_price,
    in_stock: f.status === 'add_to_shopping_cart' && Number(f.stock) > 0 ? true : Number(f.stock) === 0 || /sold_out|out_of_stock/.test(String(f.status)) ? false : null,
    url: f.url, author: (f.author || []).join('、'), publisher: (f.manufacturer || [])[0],
    pub_date: String(f.manufacturer_date || '').replace(/^(\d{2})\/(\d{2})\/(\d{4}).*$/, '$3-$1-$2'),
  }));
}
async function lookupEslite(isbn, get) {
  const res = await get(`https://athena.eslite.com/api/v2/search?q=${isbn}&size=10&start=0`);
  if (challenged(res)) throw Object.assign(new Error('被阻擋'), { blocked: true });
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  return parseEslite(JSON.parse(res.body), isbn);
}
/* ---- 金石堂：搜尋結果 HTML，每本一個 <li class="displayunit"> ---- */
function parseKingstone(html) {
  return html.split('<li class="displayunit">').slice(1).map(u => {
    const a = /class="pdnamebox"><a href="([^"]+)"[^>]*>([^<]+)</.exec(u);
    if (!a) return null;
    const kind = (/class="classbox">\s*<span class="book">([^<]*)</.exec(u) || [])[1] || '';
    const title = text(a[2]);
    return offer({
      title, format: formatOf(title, kind), price: (/<span>特價<b>([\d,]+)<\/b>/.exec(u) || /class="price">([\d,]+)/.exec(u) || [])[1],
      list_price: (/priceThrough">([\d,]+)/.exec(u) || /<span>定價<b>([\d,]+)<\/b>/.exec(u) || [])[1],
      in_stock: /class="btnbuy\b[^"]*"[^>]*>\s*<button/.test(u) ? true : /售完|缺貨|無庫存/.test(text(u)) ? false : null,
      url: 'https://www.kingstone.com.tw' + unent(a[1]).replace(/\?.*$/, ''),
      author: text((/class="author">([\s\S]*?)<\/span>/.exec(u) || [])[1]).replace(/\s*著$/, ''), publisher: text((/class="publish">([\s\S]*?)<\/span>/.exec(u) || [])[1]).replace(/\s*出版$/, ''),
    });
  }).filter(Boolean);
}
async function lookupKingstone(isbn, get) {
  const res = await get(`https://www.kingstone.com.tw/search/key/${isbn}`);
  if (challenged(res)) throw Object.assign(new Error('被阻擋'), { blocked: true });
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  return parseKingstone(res.body);
}
/* ---- 三民：搜尋結果 HTML，每本一個 <div id="ProdNNN" class="sProduct">；中文多半是 &#NNN; 實體 ---- */
function parseSanmin(html) {
  return unent(html).split(/<div id="Prod\d+" class="sProduct">/).slice(1).map(u => {
    const a = /href="(\/product\/index\/\d+)"[^>]*>\d+\.<h3>([^<]+)<\/h3>/.exec(u);
    if (!a) return null;
    const binding = text((/<b>裝訂：<\/b>([^<]*)</.exec(u) || [])[1]);
    const tip = text((/class="PriceCart[^"]*"[^>]*data-tip="([^"]*)"/.exec(u) || /<div class="Stock[^"]*">([^<]*)</.exec(u) || [])[1]);
    const title = text(a[2]);
    return offer({
      title, format: formatOf(title, binding), binding,
      list_price: (/定價：\s*([\d,]+)/.exec(u) || [])[1], price: (/class="Price\s*">\s*([\d,]+)/.exec(u) || /定價：\s*([\d,]+)/.exec(u) || [])[1],
      in_stock: /庫存\s*[>＞：:]?\s*\d/.test(tip) || /閱讀器/.test(tip) ? true : /無庫存|缺貨|絕版|停售|已售完/.test(tip + text(u)) ? false : null,
      url: 'https://www.sanmin.com.tw' + a[1], pub_date: ((/<b>出版日：<\/b>([\d/]+)/.exec(u) || [])[1] || '').replace(/\//g, '-'),
      author: text((/class="Author">([\s\S]*?)<\/span>\s*<\/span>/.exec(u) || [])[1]).replace(/^作者：\s*/, ''), publisher: text((/class="Publisher">([\s\S]*?)<\/span>\s*<\/span>/.exec(u) || [])[1]).replace(/^出版社：\s*/, ''),
    });
  }).filter(Boolean);
}
async function lookupSanmin(isbn, get) {
  const res = await get(`https://www.sanmin.com.tw/search?k=${isbn}`);
  if (challenged(res)) throw Object.assign(new Error('被阻擋'), { blocked: true });
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  return parseSanmin(res.body);
}
/* ---- 讀冊 TAAZE：搜尋結果 HTML，每本一個 <div class="media" rel=… data-…>；二手書連 usedList，其他連 products ---- */
function parseTaaze(html) {
  const starts = [...html.matchAll(/<div class="media"[^>]*>/g)];
  return starts.map((m, i) => {
    const attr = k => { const r = new RegExp(`\\b${k}='([^']*)'`).exec(m[0]); return r ? unent(r[1]) : ''; };
    const seg = html.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : m.index + 12000);
    const title = text(attr('data-TITLE_MAIN'));
    if (!title) return null;
    const format = formatOf(title, attr('data-bindingType'));
    const prodId = attr('rel'), orgId = attr('rel2') || prodId;
    const minPrice = attr('data-min_SALE_PRICE');
    return offer({
      title, format, binding: attr('data-bindingType'), list_price: attr('data-listprice_28'),
      price: format === 'used' && /^\d+$/.test(minPrice) ? minPrice : attr('data-saleprice_28'),
      in_stock: attr('data-STK_SELL_FLG') === 'Y' ? true : attr('data-STK_SELL_FLG') === 'N' ? false : null,
      url: format === 'used' ? `https://www.taaze.tw/usedList.html?oid=${orgId}` : `https://www.taaze.tw/products/${prodId}.html`,
      publisher: attr('data-PUBNM_MAIN'), author: text((/作者：<a[^>]*>([^<]+)</.exec(seg) || [])[1]), pub_date: (/出版日期：\s*([\d-]+)/.exec(seg) || [])[1],
    });
  }).filter(Boolean);
}
async function lookupTaaze(isbn, get) {
  const res = await get(`https://www.taaze.tw/rwd_searchResult.html?keyType%5B%5D=0&keyword%5B%5D=${isbn}`, { ca: TAAZE_CA });
  if (challenged(res)) throw Object.assign(new Error('被阻擋'), { blocked: true });
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  return parseTaaze(res.body);
}
/* ---- Yahoo 購物中心：搜尋頁內嵌 <script id="isoredux-data"> JSON；ISBN 搜不到，要用書名搜再以 ISBN_ 標籤比對 ---- */
function parseYahoo(html, isbn) {
  const m = /<script[^>]*id="isoredux-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return [];
  let hits = [];
  try { hits = JSON.parse(m[1])?.search?.ecsearch?.hits || []; } catch (e) { return []; }
  return hits.filter(x => x && (x.ec_isbn === isbn || (x.ec_filtertags || []).some(t => t?.item === 'ISBN_' + isbn))).map(x => offer({
    title: x.ec_title, format: formatOf(String(x.ec_title || '')), list_price: x.ec_listprice, price: x.ec_price,
    in_stock: x.ec_has_stock === '1' || Number(x.ec_stockcount) > 0 ? true : x.ec_has_stock === '0' ? false : null,
    url: x.ec_item_url || x.pres_data?.producturl || (x.ec_productid ? `https://tw.buy.yahoo.com/gdsale/gdsale.asp?gdid=${x.ec_productid}` : ''),
    publisher: x.ec_publisher, author: x.ec_author, pub_date: /^\d{4}/.test(String(x.ec_pubdate || '')) ? String(x.ec_pubdate).replace(/\//g, '-') : '', seller: x.ec_storename,
  }));
}
async function lookupYahoo(isbn, get, title) {
  const q = String(title || '').replace(/\s*[:：].*$/, '').trim() || isbn;   // 主書名就好，副標會讓搜尋變窄
  const res = await get(`https://tw.buy.yahoo.com/search/product?p=${encodeURIComponent(q)}`);
  if (challenged(res)) throw Object.assign(new Error('被阻擋'), { blocked: true });
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  return parseYahoo(res.body, isbn);
}

/* ---- 平台清單：順序＝後台顯示順序。lookup 為 null 的平台只能另開搜尋頁 ---- */
const STORES = [
  { key: 'books', name: '博客來', search: isbn => `https://search.books.com.tw/search/query/key/${isbn}/cat/all`, lookup: null, note: '博客來以 Cloudflare 阻擋程式查詢，請另開分頁看價格。' },
  { key: 'kingstone', name: '金石堂', search: isbn => `https://www.kingstone.com.tw/search/key/${isbn}`, lookup: lookupKingstone },
  { key: 'eslite', name: '誠品', search: isbn => `https://www.eslite.com/Search?keyword=${isbn}`, lookup: lookupEslite },
  { key: 'taaze', name: '讀冊 TAAZE', search: isbn => `https://www.taaze.tw/rwd_searchResult.html?keyType%5B%5D=0&keyword%5B%5D=${isbn}`, lookup: lookupTaaze },
  { key: 'sanmin', name: '三民', search: isbn => `https://www.sanmin.com.tw/search?k=${isbn}`, lookup: lookupSanmin },
  { key: 'readmoo', name: '讀墨 Readmoo', search: isbn => `https://readmoo.com/search/keyword?q=${isbn}`, lookup: null, note: '讀墨以 AWS WAF 阻擋程式查詢，請另開分頁。' },
  { key: 'kobo', name: '樂天 Kobo', search: isbn => `https://www.kobo.com/tw/zh/search?query=${isbn}`, lookup: null, note: 'Kobo 以 Cloudflare 阻擋程式查詢，請另開分頁。' },
  { key: 'yahoo', name: 'Yahoo 購物中心', search: (isbn, title) => `https://tw.buy.yahoo.com/search/product?p=${encodeURIComponent(title || isbn)}`, lookup: lookupYahoo },
];
const FORMAT_ORDER = { paper: 0, ebook: 1, used: 2 };
/* 每家最多留每種版本最便宜的 2 筆（Yahoo 商城同一本二手書會列幾十筆） */
const PER_FORMAT = 2;
function sortOffers(offers) {
  const sorted = offers.slice().sort((a, b) => (FORMAT_ORDER[a.format] - FORMAT_ORDER[b.format]) || ((a.price || 1e9) - (b.price || 1e9)));
  const seen = {}, dup = new Set();
  return sorted.filter(o => {
    const k = o.format + '|' + o.price + '|' + o.title.replace(/\s+/g, '');   // 同店同版本同價同書名（如金石堂兩個電子書商品）只留一筆
    if (dup.has(k)) return false; dup.add(k);
    return (seen[o.format] = (seen[o.format] || 0) + 1) <= PER_FORMAT;
  });
}

const CACHE = new Map(); const CACHE_TTL = 10 * 60 * 1000; const CACHE_MAX = 500;
/* 統一接口：isbn（已正規化 13 碼）＋ title（Yahoo 用）→ { isbn, stores[], best } */
async function lookupStores(raw, { title = '', fetchImpl = httpGet, timeout = 10000, cache = CACHE } = {}) {
  const isbn = MenuLib.normalizeIsbn(raw);
  if (!isbn) throw Object.assign(new Error('ISBN 格式不正確（要 13 碼 978／979 開頭，或 10 碼）。'), { status: 400 });
  const ck = isbn + '|' + title;
  const hit = cache.get(ck);
  if (hit && hit.at > Date.now() - CACHE_TTL) return { ...hit.data, cached: true };
  const get = (url, opt) => fetchImpl(url, { timeout, ...(opt || {}) });
  const stores = await Promise.all(STORES.map(async s => {
    const base = { key: s.key, name: s.name, url: s.search(isbn, title), offers: [] };
    if (!s.lookup) return { ...base, status: 'blocked', note: s.note || '' };
    const t0 = Date.now();
    try {
      const offers = sortOffers(await Promise.race([s.lookup(isbn, get, title), new Promise((_, rej) => setTimeout(() => rej(new Error('逾時')), timeout + 500))]));
      return { ...base, status: offers.length ? 'ok' : 'none', offers, ms: Date.now() - t0 };
    } catch (e) {
      return { ...base, status: e.blocked ? 'blocked' : 'error', error: String(e.message || e).slice(0, 120), ms: Date.now() - t0, note: e.blocked ? '這家目前阻擋程式查詢，請另開分頁。' : '' };
    }
  }));
  const paper = stores.flatMap(s => s.offers.filter(o => o.format === 'paper' && o.price > 0).map(o => ({ store: s.name, key: s.key, ...o })));
  const inStock = paper.filter(o => o.in_stock !== false);
  const best = (inStock.length ? inStock : paper).sort((a, b) => a.price - b.price)[0] || null;
  const list_price = paper.map(o => o.list_price).filter(Boolean).sort((a, b) => b - a)[0] || 0;
  const data = { isbn, title, stores, best: best ? { store: best.store, key: best.key, price: best.price, in_stock: best.in_stock, url: best.url } : null, list_price, checked_at: new Date().toISOString() };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(ck, { at: Date.now(), data });
  return data;
}

module.exports = { lookupStores, STORES, httpGet, parseEslite, parseKingstone, parseSanmin, parseTaaze, parseYahoo, lookupEslite, lookupKingstone, lookupSanmin, lookupTaaze, lookupYahoo, formatOf, _cache: CACHE };
